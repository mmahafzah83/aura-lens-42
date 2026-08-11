/**
 * Posts the member's reveal card to their own LinkedIn feed.
 * Posting permission is unproven for this app, so a refusal is an expected
 * outcome (200 + reason), never a server fault.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { withObserve, logEfError } from "../_shared/observe.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const LI_HEADERS = (token: string, version: string) => ({
  Authorization: `Bearer ${token}`,
  "LinkedIn-Version": version,
  "X-Restli-Protocol-Version": "2.0.0",
});

function candidateVersions(): string[] {
  const now = new Date();
  const out: string[] = [];
  for (let i = 0; i < 14; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    out.push(`${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

const isVersionRejection = (status: number, body: string) =>
  status === 426 || /NONEXISTENT_VERSION/i.test(body);

const looksLikePermission = (status: number, body: string) =>
  status === 401 || status === 403 ||
  /scope|permission|not authorized|unauthorized|ACCESS_DENIED|unpermitted/i.test(body);

function decodeBase64(input: string): Uint8Array {
  const raw = input.includes(",") ? input.slice(input.indexOf(",") + 1) : input;
  const bin = atob(raw.replace(/\s/g, ""));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

Deno.serve(withObserve("linkedin-share-read", async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "unauthorized" }, 401);

  const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: userError } = await userClient.auth.getUser();
  if (userError || !user) return json({ error: "unauthorized" }, 401);

  const body = await req.json().catch(() => ({}));
  const imageBase64 = typeof body?.imageBase64 === "string" ? body.imageBase64 : "";
  const caption = typeof body?.caption === "string" ? body.caption.slice(0, 2800) : "";
  if (!imageBase64 || !caption) return json({ error: "bad_request" }, 400);

  const admin = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: conn } = await admin
    .from("linkedin_connections")
    .select("id, access_token, linkedin_id")
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();

  const token = conn?.access_token as string | undefined;
  const memberId = conn?.linkedin_id as string | undefined;
  if (!token || !memberId) return json({ error: "not_connected" }, 400);

  const author = memberId.startsWith("urn:") ? memberId : `urn:li:person:${memberId}`;

  const logFailure = (step: string, status: number | null, detail: string) =>
    logEfError(admin, {
      function_name: "linkedin-share-read",
      error: `${step} failed (${status ?? "no status"}): ${detail}`.slice(0, 1000),
      severity: "high",
      user_id: user.id,
      context: { step, status, body: String(detail).slice(0, 2000) },
    });

  const refused = async (detail: string) => {
    await admin.from("linkedin_connections").update({
      can_post: false,
      post_checked_at: new Date().toISOString(),
      post_check_error: detail.slice(0, 400),
    }).eq("id", conn!.id);
    return json({ ok: false, reason: "not_permitted" });
  };

  try {
    // a. reserve an upload slot — discover the active LinkedIn API version
    const { data: cachedRow } = await admin
      .from("admin_settings")
      .select("value")
      .eq("key", "linkedin_api_version")
      .maybeSingle();
    const cachedRaw = (cachedRow as any)?.value;
    const cachedVersion =
      typeof cachedRaw === "string"
        ? cachedRaw.replace(/"/g, "")
        : typeof cachedRaw?.version === "string"
        ? cachedRaw.version
        : null;

    const candidates = [...new Set([cachedVersion, ...candidateVersions()].filter(Boolean) as string[])];

    let apiVersion = "";
    let initRes!: Response;
    let initText = "";
    for (const v of candidates) {
      initRes = await fetch("https://api.linkedin.com/rest/images?action=initializeUpload", {
        method: "POST",
        headers: { ...LI_HEADERS(token, v), "Content-Type": "application/json" },
        body: JSON.stringify({ initializeUploadRequest: { owner: author } }),
      });
      initText = await initRes.text();
      if (isVersionRejection(initRes.status, initText)) continue;
      apiVersion = v;
      break;
    }

    if (!apiVersion) {
      await logFailure("version_discovery", 426, initText);
      return json({ ok: false, reason: "failed", step: "version_discovery", status: 426 });
    }

    if (apiVersion !== cachedVersion) {
      await admin
        .from("admin_settings")
        .upsert({ key: "linkedin_api_version", value: apiVersion }, { onConflict: "key" });
    }

    if (!initRes.ok) {
      console.error("[linkedin-share-read] initializeUpload failed", initRes.status, initText);
      await logFailure("initializeUpload", initRes.status, initText);
      return looksLikePermission(initRes.status, initText)
        ? await refused(initText)
        : json({ ok: false, reason: "failed", step: "initializeUpload", status: initRes.status });
    }
    const init = JSON.parse(initText);
    const uploadUrl: string = init?.value?.uploadUrl;
    const imageUrn: string = init?.value?.image;
    if (!uploadUrl || !imageUrn) {
      await logFailure("initializeUpload", initRes.status, "missing uploadUrl or image urn");
      return json({ ok: false, reason: "failed", step: "initializeUpload", status: initRes.status });
    }

    // b. push the bytes
    const bytes = decodeBase64(imageBase64);
    const putRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/octet-stream" },
      body: bytes,
    });
    if (!putRes.ok) {
      const putText = await putRes.text();
      console.error("[linkedin-share-read] upload failed", putRes.status, putText);
      await logFailure("upload", putRes.status, putText);
      return looksLikePermission(putRes.status, putText)
        ? await refused(putText)
        : json({ ok: false, reason: "failed", step: "upload", status: putRes.status });
    }

    // c. publish
    const postRes = await fetch("https://api.linkedin.com/rest/posts", {
      method: "POST",
      headers: { ...LI_HEADERS(token, apiVersion), "Content-Type": "application/json" },
      body: JSON.stringify({
        author,
        commentary: caption,
        visibility: "PUBLIC",
        distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
        content: { media: { id: imageUrn } },
        lifecycleState: "PUBLISHED",
        isReshareDisabledByAuthor: false,
      }),
    });
    if (!postRes.ok) {
      const postText = await postRes.text();
      console.error("[linkedin-share-read] publish failed", postRes.status, postText);
      await logFailure("publish", postRes.status, postText);
      return looksLikePermission(postRes.status, postText)
        ? await refused(postText)
        : json({ ok: false, reason: "failed", step: "publish", status: postRes.status });
    }
    const postUrn = postRes.headers.get("x-restli-id") ?? postRes.headers.get("x-linkedin-id") ?? null;

    await admin.from("linkedin_connections").update({
      can_post: true,
      post_checked_at: new Date().toISOString(),
      post_check_error: null,
    }).eq("id", conn.id);

    return json({ ok: true, postUrn });
  } catch (err) {
    console.error("[linkedin-share-read] unexpected", err);
    await logFailure("unexpected", null, (err as Error)?.message ?? String(err));
    return json({ ok: false, reason: "failed", step: "unexpected", status: null as unknown as number });
  }
}));