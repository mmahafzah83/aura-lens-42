import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const supabase = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsErr } = await supabase.auth.getClaims(token);
    if (claimsErr || !claims?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = claims.claims.sub as string;
    const supabaseAdmin = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Get user's LinkedIn connection
    const { data: conn } = await supabaseAdmin
      .from("linkedin_connections")
      .select("*")
      .eq("user_id", userId)
      .eq("status", "active")
      .single();

    if (!conn) {
      return new Response(JSON.stringify({ error: "No LinkedIn connection found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const accessToken = conn.access_token;

    // Fetch profile info
    let profileData: any = {};
    try {
      const profileRes = await fetch("https://api.linkedin.com/v2/userinfo", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (profileRes.ok) {
        profileData = await profileRes.json();
      } else {
        await profileRes.text();
      }
    } catch (e) {
      console.error("Profile fetch failed:", e);
    }

    // Note: LinkedIn's API for personal post analytics is very limited.
    // The Community Management API requires partner-level access.
    // We generate a simulated snapshot based on the connection being active,
    // and enhance with real data when available through LinkedIn API products.

    // Get previous snapshot for growth calculation
    const { data: prevSnapshot } = await supabaseAdmin
      .from("influence_snapshots")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const prevFollowers = prevSnapshot?.followers || 0;

    // Generate analytics snapshot
    // In production with full LinkedIn API access, these would come from real API calls
    const snapshot = {
      user_id: userId,
      snapshot_date: new Date().toISOString().split("T")[0],
      followers: prevFollowers || 0,
      follower_growth: 0,
      engagement_rate: 0,
      top_topic: null as string | null,
      top_format: null as string | null,
      authority_themes: [] as any[],
      audience_breakdown: {} as any,
      recommendations: [] as any[],
    };

    // Try to fetch posts if we have the right scopes
    try {
      const postsRes = await fetch(
        `https://api.linkedin.com/v2/ugcPosts?q=authors&authors=List(urn%3Ali%3Aperson%3A${conn.linkedin_id})&count=20`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );

      if (postsRes.ok) {
        const postsData = await postsRes.json();
        const posts = postsData.elements || [];

        if (posts.length > 0) {
          // Analyze post topics and formats
          const topicCounts: Record<string, number> = {};
          const formatCounts: Record<string, number> = {};

          for (const post of posts) {
            const content = post.specificContent?.["com.linkedin.ugc.ShareContent"];
            const text = content?.shareCommentary?.text || "";
            const mediaCategory = content?.shareMediaCategory || "NONE";

            const format = mediaCategory === "IMAGE" ? "Image" :
              mediaCategory === "VIDEO" ? "Video" :
              mediaCategory === "ARTICLE" ? "Article" : "Text";
            formatCounts[format] = (formatCounts[format] || 0) + 1;

            // Simple topic extraction
            const words = text.toLowerCase().split(/\s+/).filter((w: string) => w.length > 5);
            for (const w of words.slice(0, 5)) {
              topicCounts[w] = (topicCounts[w] || 0) + 1;
            }
          }

          const topFormat = Object.entries(formatCounts).sort((a, b) => b[1] - a[1])[0];
          snapshot.top_format = topFormat?.[0] || null;
        }
      } else {
        const errText = await postsRes.text();
        console.log("Posts API not available:", postsRes.status, errText);
      }
    } catch (e) {
      console.log("Posts fetch not available:", e);
    }

    // Store snapshot
    const { data: newSnapshot, error: snapErr } = await supabaseAdmin
      .from("influence_snapshots")
      .insert(snapshot)
      .select()
      .single();

    if (snapErr) {
      console.error("Snapshot insert error:", snapErr);
    }

    // Update last_synced_at
    await supabaseAdmin
      .from("linkedin_connections")
      .update({ last_synced_at: new Date().toISOString() })
      .eq("id", conn.id);

    return new Response(JSON.stringify({
      success: true,
      snapshot: newSnapshot,
      profile: {
        name: profileData.name || conn.display_name,
        linkedin_id: conn.linkedin_id,
      },
      note: "Full post analytics require LinkedIn Community Management API approval. Current sync captures available profile data.",
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("LinkedIn sync error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
