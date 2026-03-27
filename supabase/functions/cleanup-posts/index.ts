import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type RejectionReason =
  | "not_authored_by_user"
  | "profile_page"
  | "mention_only"
  | "comment_only"
  | "external_reference"
  | "unsupported_url";

function classifyUrl(url: string, handle: string): { valid: boolean; reason?: RejectionReason } {
  if (!url || !url.includes("linkedin.com")) {
    return { valid: false, reason: "external_reference" };
  }

  const path = url.replace(/https?:\/\/(www\.)?linkedin\.com/, "").split("?")[0].replace(/\/+$/, "");

  // Profile pages
  if (/^\/in\/[^/]+\/?$/.test(path)) {
    return { valid: false, reason: "profile_page" };
  }

  // Company / school / group pages
  if (/^\/(company|school|groups)\//i.test(path)) {
    return { valid: false, reason: "external_reference" };
  }

  // Articles / pulse
  if (/^\/pulse\//i.test(path)) {
    return { valid: false, reason: "external_reference" };
  }

  // Comment threads
  if (/commentUrn|replyUrn/i.test(url)) {
    return { valid: false, reason: "comment_only" };
  }

  // Valid: /feed/update/urn:li:activity
  if (/^\/feed\/update\/urn:li:activity:\d+/.test(path)) {
    return { valid: true };
  }

  // Valid: /posts/{handle}-*
  const postsMatch = path.match(/^\/posts\/([^-]+)/);
  if (postsMatch) {
    if (handle && postsMatch[1].toLowerCase() !== handle.toLowerCase()) {
      return { valid: false, reason: "mention_only" };
    }
    return { valid: true };
  }

  return { valid: false, reason: "unsupported_url" };
}

function checkAuthorship(postText: string, profileName: string, handle: string): boolean {
  if (!profileName && !handle) return true;
  const lower = (postText || "").toLowerCase().slice(0, 1500);

  if (profileName) {
    const parts = profileName.toLowerCase().split(/\s+/);
    if (parts.every((p) => lower.includes(p))) return true;
  }
  if (handle && lower.includes(handle.toLowerCase())) return true;
  return false;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const adminClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const authHeader = req.headers.get("Authorization");
    let userId: string | null = null;

    if (authHeader) {
      const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user } } = await userClient.auth.getUser();
      if (user) userId = user.id;
    }

    if (!userId) {
      return new Response(JSON.stringify({ success: false, error: "Not authenticated" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get profile info
    const { data: conn } = await adminClient
      .from("linkedin_connections")
      .select("handle, profile_name, display_name, profile_url")
      .eq("user_id", userId)
      .eq("status", "active")
      .single();

    const handle = conn?.handle
      || conn?.profile_url?.match(/linkedin\.com\/in\/([^\/?#]+)/)?.[1]
      || "";
    const profileName = conn?.profile_name || conn?.display_name || "";

    // Get all posts
    const { data: posts, error: fetchErr } = await adminClient
      .from("linkedin_posts")
      .select("id, post_url, linkedin_post_id, post_text, tracking_status, rejection_reason")
      .eq("user_id", userId);

    if (fetchErr) throw fetchErr;
    if (!posts || posts.length === 0) {
      return new Response(JSON.stringify({
        success: true, total: 0, kept: 0, rejected: 0, reasons: {},
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const reasons: Record<string, number> = {};
    let kept = 0;
    let rejected = 0;

    for (const post of posts) {
      // Already rejected? skip
      if (post.tracking_status === "rejected") {
        rejected++;
        const r = post.rejection_reason || "unsupported_url";
        reasons[r] = (reasons[r] || 0) + 1;
        continue;
      }

      const url = post.post_url || post.linkedin_post_id || "";
      const urlCheck = classifyUrl(url, handle);

      let reason: RejectionReason | null = null;

      if (!urlCheck.valid) {
        reason = urlCheck.reason!;
      } else if (!checkAuthorship(post.post_text || "", profileName, handle)) {
        reason = "not_authored_by_user";
      }

      if (reason) {
        await adminClient.from("linkedin_posts")
          .update({ tracking_status: "rejected", rejection_reason: reason })
          .eq("id", post.id);
        rejected++;
        reasons[reason] = (reasons[reason] || 0) + 1;
      } else {
        kept++;
      }
    }

    return new Response(JSON.stringify({
      success: true,
      total: posts.length,
      kept,
      rejected,
      reasons,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err: any) {
    console.error("[cleanup-posts] Error:", err);
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
