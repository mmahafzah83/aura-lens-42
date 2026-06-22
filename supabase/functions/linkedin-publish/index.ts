import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) return json({ error: "Unauthorized" }, 401);

    const { postId } = await req.json().catch(() => ({}));
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
      .select("id, post_text, published_confirmed_at")
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

    const body = {
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

    const liRes = await fetch("https://api.linkedin.com/rest/posts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${connection.access_token}`,
        "X-Restli-Protocol-Version": "2.0.0",
        "LinkedIn-Version": LINKEDIN_VERSION,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (liRes.status === 201) {
      const urn = liRes.headers.get("x-restli-id") ?? "";
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
        })
        .eq("id", postId)
        .eq("user_id", user.id);

      return json({ success: true, urn, postUrl });
    }

    if (liRes.status === 401) {
      return json({ success: false, error: "LinkedIn connection expired — reconnect in Settings" });
    }

    const detail = await liRes.text();
    return json({ success: false, error: "LinkedIn rejected the post", status: liRes.status, detail });
  } catch (err) {
    console.error("linkedin-publish error:", err);
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});