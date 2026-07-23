// linkedin-publish — redeploy 2026-06-25 (image upload support)
import { withObserve } from "../_shared/observe.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { linkedinFetch } from "../_shared/linkedinFetch.ts";

const LINKEDIN_VERSION = "202605";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(withObserve("linkedin-publish", async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;

  let postId: string | undefined;
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) return json({ error: "Unauthorized" }, 401);

    ({ postId } = await req.json().catch(() => ({})));
    if (!postId) return json({ error: "Missing postId" }, 400);

    const adminClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: connection } = await adminClient
      .from("linkedin_connections")
      .select("access_token, linkedin_id, status")
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle();

    if (!connection) return json({ success: false, error: "LinkedIn not connected" });

    const { data: post, error: postErr } = await adminClient
      .from("linkedin_posts")
      .select("id, post_text, published_confirmed_at, source_metadata")
      .eq("id", postId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (postErr || !post) return json({ error: "Post not found" }, 404);
    if (post.published_confirmed_at) return json({ success: false, error: "Already published" });

    const postText: string = post.post_text ?? "";
    if (!postText.trim()) return json({ error: "Empty post_text" }, 400);
    if (postText.length > 3000) {
      return json({ success: false, error: "Post exceeds LinkedIn's 3000-character limit" });
    }

    const { data: claimed, error: claimErr } = await adminClient
      .from("linkedin_posts")
      .update({ tracking_status: "publishing", claimed_at: new Date().toISOString() })
      .eq("id", postId).eq("user_id", user.id)
      .is("published_confirmed_at", null)
      .neq("tracking_status", "publishing")
      .select("id");
    if (claimErr) return json({ success: false, error: "Could not lock post for publishing" });
    if (!claimed || claimed.length === 0)
      return json({ success: false, error: "This post is already publishing or published." });

    const releaseToDraft = async () => {
      await adminClient.from("linkedin_posts").update({ tracking_status: "draft" }).eq("id", postId).eq("user_id", user.id);
    };

    // Optional single image (additive — text-only posts are unaffected)
    const imageUrl: string | undefined = (post as any)?.source_metadata?.image_url;
    let mediaContent: Record<string, unknown> | undefined;

    if (imageUrl) {
      let parsedImg: URL;
      try {
        parsedImg = new URL(imageUrl);
      } catch {
        await releaseToDraft();
        return json({ success: false, error: "Invalid image URL" }, 400);
      }
      if (parsedImg.protocol !== "https:") {
        await releaseToDraft();
        return json({ success: false, error: "Image URL must be https" }, 400);
      }
      const imgHost = parsedImg.hostname.toLowerCase();
      const allowedHost =
        imgHost.endsWith(".supabase.co") ||
        imgHost.endsWith(".supabase.in") ||
        imgHost.endsWith(".lovable.app") ||
        imgHost.endsWith(".lovable.dev");
      if (!allowedHost) {
        await releaseToDraft();
        return json({ success: false, error: "Image must be hosted on approved storage" }, 400);
      }
      const initRes = await linkedinFetch("https://api.linkedin.com/rest/images?action=initializeUpload", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${connection.access_token}`,
          "X-Restli-Protocol-Version": "2.0.0",
          "LinkedIn-Version": LINKEDIN_VERSION,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ initializeUploadRequest: { owner: `urn:li:person:${connection.linkedin_id}` } }),
      }, { userId: user.id, adminClient, purpose: "image-init" });
      if (!initRes.ok) {
        const d = await initRes.text();
        await releaseToDraft();
        return json({ success: false, error: "Image init failed", status: initRes.status, detail: d });
      }
      const initJson = await initRes.json();
      const uploadUrl: string = initJson?.value?.uploadUrl;
      const imageUrn: string = initJson?.value?.image;
      if (!uploadUrl || !imageUrn) {
        await releaseToDraft();
        return json({ success: false, error: "Image init returned no upload URL", detail: JSON.stringify(initJson) });
      }

      const imgRes = await fetch(parsedImg.toString());
      if (!imgRes.ok) {
        await releaseToDraft();
        return json({ success: false, error: "Could not read the stored image", status: imgRes.status });
      }
      const imgBytes = new Uint8Array(await imgRes.arrayBuffer());

      const upRes = await linkedinFetch(uploadUrl, {
        method: "PUT",
        headers: { Authorization: `Bearer ${connection.access_token}` },
        body: imgBytes,
      }, { userId: user.id, adminClient, purpose: "image-upload" });
      if (!(upRes.status === 200 || upRes.status === 201)) {
        const d = await upRes.text();
        await releaseToDraft();
        return json({ success: false, error: "Image upload failed", status: upRes.status, detail: d });
      }

      mediaContent = { media: { id: imageUrn } };
    }

    const body: Record<string, unknown> = {
      author: `urn:li:person:${connection.linkedin_id}`,
      commentary: postText,
      visibility: "PUBLIC",
      distribution: {
        feedDistribution: "MAIN_FEED",
        targetEntities: [],
        thirdPartyDistributionChannels: [],
      },
      lifecycleState: "PUBLISHED",
      isReshareDisabledByAuthor: false,
    };
    if (mediaContent) body.content = mediaContent;

    // Diagnostics — do NOT modify commentary
    try {
      const reservedSet = new Set(["(",")","[","]","{","}","<",">","@","|","~","_","*","#"]);
      const reserved: Array<{ char: string; index: number }> = [];
      for (let i = 0; i < postText.length; i++) {
        const ch = postText[i];
        if (reservedSet.has(ch)) reserved.push({ char: ch, index: i });
      }
      const byteLength = new TextEncoder().encode(postText).length;
      const tail60 = postText.slice(-60);
      await adminClient.from("ef_error_log").insert({
        function_name: "linkedin-publish",
        severity: "info",
        error_message: `pre-publish diagnostics postId=${postId} len=${postText.length} bytes=${byteLength}`,
        user_id: user.id,
        context: {
          stage: "pre_publish",
          postId,
          length: postText.length,
          byte_length: byteLength,
          tail_60: tail60,
          reserved,
          has_media: Boolean(mediaContent),
        },
      });
    } catch (e) {
      console.error("pre-publish diagnostics failed:", e);
    }

    const liRes = await linkedinFetch("https://api.linkedin.com/rest/posts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${connection.access_token}`,
        "X-Restli-Protocol-Version": "2.0.0",
        "LinkedIn-Version": LINKEDIN_VERSION,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }, { userId: user.id, adminClient, purpose: "publish" });

    if (liRes.status === 201) {
      const urn = liRes.headers.get("x-restli-id") ?? "";
      try {
        await adminClient.from("ef_error_log").insert({
          function_name: "linkedin-publish",
          severity: "info",
          error_message: `post-publish 201 postId=${postId} urn=${urn}`,
          user_id: user.id,
          context: { stage: "post_publish", postId, status: 201, x_restli_id: urn },
        });
      } catch (e) { console.error("post-publish diagnostics failed:", e); }
      const postUrl = `https://www.linkedin.com/feed/update/${urn}/`;
      const now = new Date().toISOString();
      await adminClient
        .from("linkedin_posts")
        .update({
          linkedin_post_id: urn,
          post_url: postUrl,
          published_at: now,
          published_confirmed_at: now,
          tracking_status: "published",
          authorship: "aura_drafted",
          acquisition: "published_via_aura",
        })
        .eq("id", postId)
        .eq("user_id", user.id);

      // Fire-and-forget: re-learn voice from the growing published corpus.
      // Never allowed to slow, block, or fail the publish response.
      try {
        const kickVoiceDistill = async () => {
          try {
            const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
            const MIN_CORPUS = 5;
            // Total eligible corpus — floor gate. Prevents distilling
            // confident-looking voice models from tiny (e.g. 2-post) samples.
            const { count: totalCount } = await adminClient
              .from("linkedin_posts")
              .select("id", { count: "exact", head: true })
              .eq("user_id", user.id)
              .eq("source_type", "aura_generated")
              .eq("tracking_status", "published")
              .not("post_text", "is", null);
            const totalCorpus = typeof totalCount === "number" ? totalCount : 0;
            if (totalCorpus < MIN_CORPUS) return;

            // Count eligible posts newer than the user's most recent
            // voice_distill training_logs row, and time since that run.
            const { data: lastLog } = await adminClient
              .from("training_logs")
              .select("created_at")
              .eq("user_id", user.id)
              .eq("pillar", "voice_distill")
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();

            let q = adminClient
              .from("linkedin_posts")
              .select("id", { count: "exact", head: true })
              .eq("user_id", user.id)
              .eq("source_type", "aura_generated")
              .eq("tracking_status", "published")
              .not("post_text", "is", null);
            if (lastLog?.created_at) q = q.gt("published_at", lastLog.created_at);
            const { count } = await q;
            const newSince = typeof count === "number" ? count : 0;
            const daysSinceLastRun = lastLog?.created_at
              ? (Date.now() - Date.parse(lastLog.created_at)) / 86_400_000
              : Number.POSITIVE_INFINITY;

            const shouldRun = !lastLog || newSince >= 3 || daysSinceLastRun >= 30;
            if (!shouldRun) return;

            await fetch(`${SUPABASE_URL}/functions/v1/voice-distill`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${serviceKey}`,
                apikey: serviceKey,
              },
              body: JSON.stringify({ user_id: user.id }),
            });
          } catch (e) {
            console.error("voice-distill kick failed (non-blocking):", e);
          }
        };
        // @ts-ignore EdgeRuntime is provided by Supabase Deno runtime
        if (typeof EdgeRuntime !== "undefined" && (EdgeRuntime as any)?.waitUntil) {
          // @ts-ignore
          EdgeRuntime.waitUntil(kickVoiceDistill());
        } else {
          kickVoiceDistill();
        }
      } catch (e) {
        console.error("voice-distill kick outer failure (non-blocking):", e);
      }

      return json({ success: true, urn, postUrl });
    }

    if (liRes.status === 401) {
      try {
        const bodyText = await liRes.clone().text();
        await adminClient.from("ef_error_log").insert({
          function_name: "linkedin-publish",
          severity: "info",
          error_message: `post-publish 401 postId=${postId}`,
          user_id: user.id,
          context: {
            stage: "post_publish",
            postId,
            status: 401,
            x_restli_id: liRes.headers.get("x-restli-id"),
            body_head_300: bodyText.slice(0, 300),
          },
        });
      } catch (e) { console.error("post-publish 401 diagnostics failed:", e); }
      await adminClient.from("linkedin_posts").update({ tracking_status: "draft" }).eq("id", postId).eq("user_id", user.id);
      return json({ success: false, error: "LinkedIn connection expired — reconnect in Settings" });
    }

    const detail = await liRes.text();
    try {
      await adminClient.from("ef_error_log").insert({
        function_name: "linkedin-publish",
        severity: "info",
        error_message: `post-publish non-201 postId=${postId} status=${liRes.status}`,
        user_id: user.id,
        context: {
          stage: "post_publish",
          postId,
          status: liRes.status,
          x_restli_id: liRes.headers.get("x-restli-id"),
          body_head_300: detail.slice(0, 300),
        },
      });
    } catch (e) { console.error("post-publish non-201 diagnostics failed:", e); }
    await adminClient.from("linkedin_posts").update({ tracking_status: "draft" }).eq("id", postId).eq("user_id", user.id);
    return json({ success: false, error: "LinkedIn rejected the post", status: liRes.status, detail });
  } catch (err) {
    console.error("linkedin-publish error:", err);
    if (typeof postId === "string") {
      try {
        const adminClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
        await adminClient.from("linkedin_posts").update({ tracking_status: "needs_review" }).eq("id", postId);
      } catch {}
    }
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
}));