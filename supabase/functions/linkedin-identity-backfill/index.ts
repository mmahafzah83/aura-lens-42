/**
 * The address comes from the token, never from the name.
 *
 * For every active connection with a live token this reads the member's own
 * LinkedIn identity with the member's own access token, and writes the handle,
 * the profile URL and the profile name from that response only. Nothing here
 * derives an address from a display name; a member with no public identifier
 * is recorded as confirmed by identity, not decorated with a plausible guess.
 *
 * It also establishes, once, whether Aura may post for the member. The probe
 * reserves an image upload slot — a real exercise of w_member_social that
 * publishes nothing.
 *
 * Admin-triggered. Tokens never leave this function.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";
import { withObserve, logEfError } from "../_shared/observe.ts";
import { isAdmin } from "../_shared/adminRole.ts";
import { nameFromLinkedIn, vanityFromLinkedIn, profileUrlFor } from "../_shared/identity.ts";
import { isVersionRejection, rememberVersion, versionCandidates } from "../_shared/linkedinVersion.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Outcome = "confirmed" | "confirmed_by_identity" | "token_expired" | "api_error" | "no_connection";

Deno.serve(withObserve("linkedin-identity-backfill", async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const authHeader = req.headers.get("Authorization") ?? "";
  const bearer = authHeader.replace(/^Bearer\s+/i, "").trim();
  // Server-to-server: a service-role key never reaches a browser, so a caller
  // presenting one is the platform itself, not a member. The claim is read
  // from the key rather than string-matched, so a rotated key still works.
  const isService = (() => {
    if (!bearer) return false;
    if (bearer === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) return true;
    try {
      const claims = JSON.parse(atob(bearer.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
      return claims?.role === "service_role" && claims?.ref === Deno.env.get("SUPABASE_PROJECT_REF" ) || claims?.role === "service_role";
    } catch { return false; }
  })();
  const anon = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  if (!isService) {
    const { data: { user } } = await anon.auth.getUser();
    if (!user) return json({ error: "Not authenticated" }, 401);
    if (!(await isAdmin(anon, user.id))) return json({ error: "Admins only" }, 403);
  }

  let body: any = {};
  try { body = await req.json(); } catch { /* empty body */ }
  const onlyUser = typeof body?.user_id === "string" ? body.user_id.trim() : "";
  const checkPosting = body?.check_posting !== false;

  const query = admin
    .from("linkedin_connections")
    .select("id, user_id, access_token, token_expires_at, status, scopes, handle, source_status")
    .eq("status", "active");
  const { data: rows, error: readErr } = onlyUser ? await query.eq("user_id", onlyUser) : await query;
  if (readErr) return json({ error: readErr.message }, 500);

  const nowMs = Date.now();
  const results: Array<Record<string, unknown>> = [];
  let { list: versions, cached } = await versionCandidates(admin);

  for (const row of rows ?? []) {
    const record = async (outcome: Outcome, detail: string, extra: Record<string, unknown> = {}) => {
      results.push({ user_id: row.user_id, outcome, detail, ...extra });
      await logEfError(admin, {
        function_name: "linkedin-identity-backfill",
        error: `${outcome}: ${detail}`,
        severity: outcome === "confirmed" || outcome === "confirmed_by_identity" ? "info" : "high",
        user_id: row.user_id,
        context: { outcome, ...extra },
      });
    };

    const token = row.access_token as string | null;
    if (!token) { await record("no_connection", "no access token on an active row"); continue; }
    if (row.token_expires_at && new Date(row.token_expires_at as string).getTime() <= nowMs) {
      await admin.from("linkedin_connections")
        .update({ status: "needs_reconnect", updated_at: new Date().toISOString() })
        .eq("id", row.id);
      await record("token_expired", `token expired ${row.token_expires_at}`);
      continue;
    }

    // --- identity, from the member's own token ---
    const meRes = await fetch(
      "https://api.linkedin.com/v2/me?projection=(id,localizedFirstName,localizedLastName,vanityName)",
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const meText = await meRes.text();
    if (meRes.status === 401) {
      // A 401 is an answer, not a hiccup. It is never retried.
      await admin.from("linkedin_connections")
        .update({ status: "needs_reconnect", updated_at: new Date().toISOString() })
        .eq("id", row.id);
      await record("token_expired", "LinkedIn rejected the token (401)");
      continue;
    }
    if (!meRes.ok) { await record("api_error", `/v2/me ${meRes.status}: ${meText.slice(0, 300)}`); continue; }

    let me: any = {};
    try { me = JSON.parse(meText); } catch { /* handled below */ }

    let userinfo: any = {};
    try {
      const uiRes = await fetch("https://api.linkedin.com/v2/userinfo", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (uiRes.ok) userinfo = await uiRes.json();
    } catch { /* optional */ }

    const linkedinId = me?.id ?? userinfo?.sub ?? null;
    if (!linkedinId) { await record("api_error", "the identity response carried no member id"); continue; }

    const handle = vanityFromLinkedIn(me) ?? vanityFromLinkedIn(userinfo);
    const name = nameFromLinkedIn(userinfo) ?? nameFromLinkedIn(me);

    const patch: Record<string, unknown> = {
      linkedin_id: linkedinId,
      last_synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    if (name) { patch.display_name = name; patch.profile_name = name; }
    if (handle) {
      patch.handle = handle;
      patch.profile_url = profileUrlFor(handle);
      patch.source_status = "verified_by_read";
    } else {
      // LinkedIn gave us no public identifier. We store the member id and say
      // so plainly rather than inventing a slug from the member's name.
      patch.source_status = "confirmed_by_identity";
    }

    const { error: writeErr } = await admin
      .from("linkedin_connections").update(patch).eq("id", row.id).select("id").single();
    if (writeErr) { await record("api_error", `write failed: ${writeErr.message}`); continue; }

    // --- may we post? one honest, non-publishing probe ---
    let canPost: boolean | null = null;
    if (checkPosting) {
      const author = `urn:li:person:${linkedinId}`;
      let probeStatus = 0;
      let probeText = "";
      let used = "";
      for (const v of versions) {
        const res = await fetch("https://api.linkedin.com/rest/images?action=initializeUpload", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "LinkedIn-Version": v,
            "X-Restli-Protocol-Version": "2.0.0",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ initializeUploadRequest: { owner: author } }),
        });
        probeText = await res.text();
        probeStatus = res.status;
        if (isVersionRejection(res.status, probeText)) continue;
        used = v;
        break;
      }
      if (used) {
        await rememberVersion(admin, used, cached);
        cached = used;
        versions = [used, ...versions.filter((v) => v !== used)];
        canPost = probeStatus >= 200 && probeStatus < 300;
      }
      await admin.from("linkedin_connections").update({
        can_post: canPost,
        post_checked_at: new Date().toISOString(),
        post_check_error: canPost === false ? probeText.slice(0, 400) : null,
      }).eq("id", row.id);
    }

    await record(
      handle ? "confirmed" : "confirmed_by_identity",
      handle ? `address read from the token: ${handle}` : "member id only — no public identifier",
      { handle: handle ?? null, can_post: canPost },
    );

    await sleep(400); // one member at a time, gently
  }

  const tally = results.reduce<Record<string, number>>((acc, r) => {
    const k = String(r.outcome);
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});

  return json({ ok: true, checked: results.length, tally, results });
}));
