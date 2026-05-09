import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/* ── Structured Sync Log ── */

interface SyncLog {
  step: string;
  status: "ok" | "warn" | "error";
  detail?: string;
  timestamp: string;
}

function log(logs: SyncLog[], step: string, status: SyncLog["status"], detail?: string) {
  const entry = { step, status, detail, timestamp: new Date().toISOString() };
  logs.push(entry);
  const prefix = status === "error" ? "❌" : status === "warn" ? "⚠️" : "✅";
  console.log(`[sync] ${prefix} ${step}${detail ? ": " + detail : ""}`);
}

/* ── LinkedIn API helpers ── */

async function fetchLinkedInProfile(accessToken: string) {
  try {
    const res = await fetch("https://api.linkedin.com/v2/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (res.ok) return { data: await res.json(), error: null };
    const body = await res.text();
    return { data: null, error: `HTTP ${res.status}: ${body.slice(0, 200)}` };
  } catch (e: any) {
    return { data: null, error: e.message };
  }
}

async function fetchLinkedInPosts(accessToken: string, linkedinId: string) {
  // Try ugcPosts first
  try {
    const res = await fetch(
      `https://api.linkedin.com/v2/ugcPosts?q=authors&authors=List(urn%3Ali%3Aperson%3A${linkedinId})&count=50`,
      { headers: { Authorization: `Bearer ${accessToken}`, "X-Restli-Protocol-Version": "2.0.0" } }
    );
    if (res.ok) {
      const posts = (await res.json()).elements || [];
      return { data: posts, error: null, source: "ugcPosts" };
    }
    const body = await res.text();
    // Fall through to shares
    console.log(`ugcPosts returned ${res.status}: ${body.slice(0, 200)}`);
  } catch (e: any) {
    console.log("ugcPosts exception:", e.message);
  }

  // Fallback to shares
  try {
    const res = await fetch(
      `https://api.linkedin.com/v2/shares?q=owners&owners=urn%3Ali%3Aperson%3A${linkedinId}&count=50`,
      { headers: { Authorization: `Bearer ${accessToken}`, "X-Restli-Protocol-Version": "2.0.0" } }
    );
    if (res.ok) {
      const posts = (await res.json()).elements || [];
      return { data: posts, error: null, source: "shares" };
    }
    const body = await res.text();
    return { data: [], error: `shares HTTP ${res.status}: ${body.slice(0, 200)}`, source: "shares" };
  } catch (e: any) {
    return { data: [], error: `shares exception: ${e.message}`, source: "shares" };
  }
}

async function fetchPostEngagement(accessToken: string, postUrn: string): Promise<{ likes: number; comments: number; reposts: number; raw: any }> {
  const result = { likes: 0, comments: 0, reposts: 0, raw: null as any };
  try {
    const res = await fetch(
      `https://api.linkedin.com/v2/socialActions/${encodeURIComponent(postUrn)}`,
      { headers: { Authorization: `Bearer ${accessToken}`, "X-Restli-Protocol-Version": "2.0.0" } }
    );
    if (res.ok) {
      const data = await res.json();
      result.raw = data;
      result.likes = data.likesSummary?.totalLikes || data.numLikes || 0;
      result.comments = data.commentsSummary?.totalFirstLevelComments || data.numComments || 0;
      result.reposts = data.numShares || 0;
    }
  } catch { /* socialActions may not be available */ }
  return result;
}

function extractPostData(post: any) {
  const text = post.specificContent?.["com.linkedin.ugc.ShareContent"]?.shareCommentary?.text
    || post.text?.text || "";
  const postUrn = post.id || post.activity || "";
  const mc = post.specificContent?.["com.linkedin.ugc.ShareContent"]?.shareMediaCategory;
  const content = post.content;
  let mediaType = "text";
  if (mc === "IMAGE" || content?.contentEntities?.[0]?.entityLocation?.includes("image")) mediaType = "image";
  else if (mc === "VIDEO") mediaType = "video";
  else if (mc === "ARTICLE" || mc === "RICH") mediaType = "article";
  else if (mc === "CAROUSEL") mediaType = "carousel";

  let publishedAt: string | null = null;
  if (post.created?.time) publishedAt = new Date(post.created.time).toISOString();
  else if (post.createdAt) publishedAt = new Date(post.createdAt).toISOString();

  return { text: text.trim(), postUrn, mediaType, publishedAt };
}

function analyzeFormats(posts: any[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const post of posts) {
    const { mediaType } = extractPostData(post);
    const format = mediaType.charAt(0).toUpperCase() + mediaType.slice(1);
    counts[format] = (counts[format] || 0) + 1;
  }
  return counts;
}

async function fetchFollowerCount(accessToken: string, linkedinId: string): Promise<{ count: number | null; error: string | null }> {
  for (const edgeType of ["CompanyFollowedByMember", "FOLLOW"]) {
    try {
      const res = await fetch(
        `https://api.linkedin.com/v2/networkSizes/urn:li:person:${linkedinId}?edgeType=${edgeType}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (res.ok) {
        const data = await res.json();
        if (typeof data.firstDegreeSize === "number") return { count: data.firstDegreeSize, error: null };
      } else {
        const body = await res.text();
        console.log(`networkSizes (${edgeType}): ${res.status} ${body.slice(0, 100)}`);
      }
    } catch (e: any) {
      console.log(`networkSizes (${edgeType}) exception:`, e.message);
    }
  }
  return { count: null, error: "All follower count endpoints returned non-OK or failed" };
}

/* ── AI Classification ── */

interface AIAnalysis {
  themes: string[];
  tones: { tone: string; score: number; impact: string }[];
  topTopic: string;
  recommendations: string[];
  engagementEstimate: number;
  authorityTrajectory: string;
  writeNextSuggestions: string[];
  postClassifications: { postIndex: number; theme: string; tone: string; format: string }[];
}

async function classifyWithAI(
  postTexts: string[],
  formatBreakdown: Record<string, number>,
  prevSnapshot: any
): Promise<AIAnalysis | null> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY || postTexts.length === 0) return null;

  try {
    const samplePosts = postTexts.slice(0, 20).map((t, i) => `Post ${i + 1}: ${t.slice(0, 500)}`).join("\n\n");
    const contextInfo = prevSnapshot
      ? `Previous snapshot: ${prevSnapshot.followers} followers, engagement ${prevSnapshot.engagement_rate}%, themes: ${JSON.stringify(prevSnapshot.authority_themes)}`
      : "No previous snapshot data.";

    const res = await fetch("https://api.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: `You are a LinkedIn content analyst for a senior professional. Analyze their posts and provide strategic intelligence. Context: ${contextInfo}. Format breakdown: ${JSON.stringify(formatBreakdown)}.` },
          { role: "user", content: `Analyze these ${postTexts.length} LinkedIn posts and classify each one:\n\n${samplePosts}` },
        ],
        tools: [{
          type: "function",
          function: {
            name: "classify_posts",
            description: "Classify LinkedIn posts and generate strategic insights",
            parameters: {
              type: "object",
              properties: {
                themes: { type: "array", items: { type: "string" }, description: "Top 5 authority themes" },
                tones: { type: "array", items: { type: "object", properties: { tone: { type: "string" }, score: { type: "number" }, impact: { type: "string", enum: ["high", "medium", "low"] } }, required: ["tone", "score", "impact"] } },
                topTopic: { type: "string" },
                recommendations: { type: "array", items: { type: "string" } },
                engagementEstimate: { type: "number" },
                authorityTrajectory: { type: "string" },
                writeNextSuggestions: { type: "array", items: { type: "string" } },
                postClassifications: { type: "array", items: { type: "object", properties: { postIndex: { type: "number" }, theme: { type: "string" }, tone: { type: "string" }, format: { type: "string" } }, required: ["postIndex", "theme", "tone", "format"] } },
              },
              required: ["themes", "tones", "topTopic", "recommendations", "engagementEstimate", "authorityTrajectory", "writeNextSuggestions", "postClassifications"],
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "classify_posts" } },
        temperature: 0.3,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
      if (toolCall?.function?.arguments) {
        const parsed = typeof toolCall.function.arguments === "string"
          ? JSON.parse(toolCall.function.arguments) : toolCall.function.arguments;
        return parsed as AIAnalysis;
      }
    } else {
      console.error("AI classification error:", res.status, await res.text());
    }
  } catch (e) {
    console.error("AI classification failed:", e);
  }
  return null;
}

/* ── Main Sync Logic ── */

async function syncUserLinkedIn(userId: string, adminClient: any) {
  const logs: SyncLog[] = [];
  const syncRunStart = new Date().toISOString();

  // Create sync_run record
  const { data: syncRun } = await adminClient
    .from("sync_runs")
    .insert({ user_id: userId, sync_type: "full", started_at: syncRunStart, status: "running" })
    .select("id")
    .single();

  const syncRunId = syncRun?.id || null;

  const fail = async (reason: string, errorType = "sync_failure") => {
    log(logs, "sync_failed", "error", reason);
    // Write sync_errors record
    await adminClient.from("sync_errors").insert({
      user_id: userId,
      sync_run_id: syncRunId,
      error_type: errorType,
      error_message: reason,
      context: { logs },
    });
    // Update sync_run
    if (syncRunId) {
      await adminClient.from("sync_runs").update({
        status: "failed", error_message: reason, completed_at: new Date().toISOString(),
      }).eq("id", syncRunId);
    }
    return { success: false, error: reason, logs };
  };

  // 1. Find connection
  const { data: conn } = await adminClient
    .from("linkedin_connections")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "active")
    .single();

  if (!conn) {
    return await fail("No active LinkedIn connection found", "no_connection");
  }
  log(logs, "connection_found", "ok", `id=${conn.id}, handle=${conn.handle || conn.display_name}`);

  if (syncRunId) {
    await adminClient.from("sync_runs").update({ account_id: conn.id }).eq("id", syncRunId);
  }

  const accessToken = conn.access_token;
  const linkedinId = conn.linkedin_id;

  if (!linkedinId) {
    return await fail("LinkedIn ID is missing on the connection record", "no_linkedin_id");
  }

  // 2. Parallel fetch: profile, posts, followers
  log(logs, "provider_invoked", "ok", "LinkedIn REST API v2");
  log(logs, "fetch_started", "ok", "Fetching profile, posts, followers in parallel");

  const [profileResult, postsResult, followersResult] = await Promise.all([
    fetchLinkedInProfile(accessToken),
    fetchLinkedInPosts(accessToken, linkedinId),
    fetchFollowerCount(accessToken, linkedinId),
  ]);

  // Log profile result
  if (profileResult.error) {
    log(logs, "profile_fetch", "warn", profileResult.error);
  } else {
    log(logs, "profile_fetch", "ok", `name=${profileResult.data?.name || "unknown"}`);
  }

  // Log posts result
  const rawPosts = postsResult.data;
  if (postsResult.error) {
    log(logs, "posts_fetch", "warn", postsResult.error);
  }
  log(logs, "posts_fetch", rawPosts.length > 0 ? "ok" : "warn",
    `${rawPosts.length} posts fetched via ${postsResult.source || "unknown"}`);

  // Log followers result
  const realFollowers = followersResult.count;
  if (followersResult.error) {
    log(logs, "followers_fetch", "warn", followersResult.error);
  } else {
    log(logs, "followers_fetch", "ok", `count=${realFollowers}`);
  }

  // 3. Determine if we have ANY real data
  const hasRealPosts = rawPosts.length > 0;
  const hasRealFollowers = realFollowers !== null;

  if (!hasRealPosts && !hasRealFollowers) {
    // NO real data at all — do NOT write a placeholder zero snapshot
    log(logs, "data_check", "error", "No posts and no follower count returned. LinkedIn API may require Community Management API approval.");
    return await fail(
      "Provider returned no data. LinkedIn API requires Community Management API approval for post and engagement access. Follower count endpoint also returned no data.",
      "no_data_returned"
    );
  }

  log(logs, "data_check", "ok",
    `Real data: ${hasRealPosts ? rawPosts.length + " posts" : "no posts"}, ${hasRealFollowers ? realFollowers + " followers" : "no follower count"}`);

  // 4. Process posts & engagement
  const postDataList = rawPosts.map((p: any) => extractPostData(p));
  const postTexts = postDataList.filter((p: any) => p.text).map((p: any) => p.text);
  const formatBreakdown = analyzeFormats(rawPosts);
  const topFormat = Object.entries(formatBreakdown).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

  // Fetch engagement per post (max 20)
  let totalLikes = 0, totalComments = 0, totalReposts = 0;
  if (hasRealPosts) {
    const engagementPromises = postDataList.slice(0, 20).map(async (pd: any) => {
      if (!pd.postUrn) return { likes: 0, comments: 0, reposts: 0, raw: null };
      return fetchPostEngagement(accessToken, pd.postUrn);
    });
    const engagements = await Promise.all(engagementPromises);
    for (const e of engagements) {
      totalLikes += e.likes;
      totalComments += e.comments;
      totalReposts += e.reposts;
    }
    log(logs, "engagement_fetch", "ok",
      `Fetched for ${engagements.length} posts: ${totalLikes} likes, ${totalComments} comments, ${totalReposts} reposts`);

    // Store individual post records
    const now = new Date().toISOString();
    const prevSnapshotForAI = await adminClient
      .from("influence_snapshots")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const aiAnalysis = await classifyWithAI(postTexts, formatBreakdown, prevSnapshotForAI?.data);
    if (aiAnalysis) {
      log(logs, "ai_classification", "ok", `${aiAnalysis.themes?.length || 0} themes, ${aiAnalysis.postClassifications?.length || 0} posts classified`);
    } else {
      log(logs, "ai_classification", "warn", "No AI classification (no posts text or API issue)");
    }

    const postRecords = postDataList.slice(0, 50).map((pd: any, i: number) => {
      const eng = engagements[i] || { likes: 0, comments: 0, reposts: 0 };
      const classification = aiAnalysis?.postClassifications?.find((c: any) => c.postIndex === i + 1);
      return {
        user_id: userId,
        linkedin_post_id: pd.postUrn || `post-${i}-${Date.now()}`,
        post_text: pd.text.slice(0, 5000) || null,
        published_at: pd.publishedAt || null,
        like_count: eng.likes,
        comment_count: eng.comments,
        repost_count: eng.reposts,
        engagement_score: eng.likes + eng.comments + eng.reposts,
        media_type: pd.mediaType,
        theme: classification?.theme || null,
        tone: classification?.tone || null,
        format_type: classification?.format || null,
        synced_at: now,
      };
    });

    if (postRecords.length > 0) {
      const { error: postsErr } = await adminClient
        .from("linkedin_posts")
        .upsert(postRecords, { onConflict: "user_id,linkedin_post_id" });
      if (postsErr) {
        log(logs, "posts_write", "error", JSON.stringify(postsErr));
      } else {
        log(logs, "posts_write", "ok", `${postRecords.length} posts upserted`);
      }
    }

    // Build snapshot with real data
    const prevSnapshot = prevSnapshotForAI?.data;
    const currentFollowers = realFollowers ?? prevSnapshot?.followers ?? 0;
    const prevFollowers = prevSnapshot?.followers ?? 0;
    const followerGrowth = currentFollowers - prevFollowers;
    const totalEng = totalLikes + totalComments + totalReposts;
    const engagementRate = engagements.length > 0 && currentFollowers > 0
      ? Number(((totalEng / engagements.length / currentFollowers) * 100).toFixed(2))
      : 0;

    const snapshot = {
      user_id: userId,
      snapshot_date: new Date().toISOString().split("T")[0],
      followers: currentFollowers,
      follower_growth: followerGrowth,
      engagement_rate: engagementRate,
      top_topic: aiAnalysis?.topTopic || null,
      top_format: topFormat,
      authority_themes: aiAnalysis?.themes || [],
      audience_breakdown: {},
      recommendations: [
        ...(aiAnalysis?.recommendations || []),
        ...(aiAnalysis?.writeNextSuggestions || []).map((s: string) => `📝 Write next: ${s}`),
      ],
      tone_analysis: aiAnalysis?.tones || [],
      format_breakdown: formatBreakdown,
      post_count: rawPosts.length,
      posts_count: rawPosts.length,
      impressions: 0, // LinkedIn API doesn't expose impressions through these endpoints
      reactions: totalLikes,
      comments: totalComments,
      shares: totalReposts,
      saves: 0,
      authority_trajectory: aiAnalysis?.authorityTrajectory || null,
      source_type: "sync",
    };

    const { error: snapErr } = await adminClient
      .from("influence_snapshots").insert(snapshot);
    if (snapErr) {
      log(logs, "snapshot_write", "error", JSON.stringify(snapErr));
    } else {
      log(logs, "snapshot_write", "ok", `followers=${currentFollowers}, posts=${rawPosts.length}, engagement=${engagementRate}%`);
    }

    // Update connection
    await adminClient.from("linkedin_connections").update({ last_synced_at: now }).eq("id", conn.id);

    // Complete sync_run
    if (syncRunId) {
      await adminClient.from("sync_runs").update({
        status: "completed",
        completed_at: new Date().toISOString(),
        records_fetched: rawPosts.length,
        records_stored: postRecords.length + 1, // posts + snapshot
      }).eq("id", syncRunId);
    }

    log(logs, "sync_complete", "ok", `${rawPosts.length} posts, ${postRecords.length} stored, ${aiAnalysis?.themes?.length || 0} themes`);

    return {
      success: true,
      logs,
      summary: {
        postsAnalyzed: rawPosts.length,
        postsStored: postRecords.length,
        themesDetected: aiAnalysis?.themes?.length || 0,
        followers: currentFollowers,
        followerGrowth,
        engagementRate,
        hasRealFollowerCount: hasRealFollowers,
        hasRealPosts,
      },
      note: `Synced ${rawPosts.length} posts · ${postRecords.length} stored · ${aiAnalysis?.themes?.length || 0} themes.`,
    };
  }

  // Only followers, no posts
  const prevSnapshot = await adminClient
    .from("influence_snapshots")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const currentFollowers = realFollowers!;
  const prevFollowers = prevSnapshot?.data?.followers ?? 0;
  const followerGrowth = currentFollowers - prevFollowers;

  const snapshot = {
    user_id: userId,
    snapshot_date: new Date().toISOString().split("T")[0],
    followers: currentFollowers,
    follower_growth: followerGrowth,
    engagement_rate: 0,
    top_topic: null,
    top_format: null,
    authority_themes: [],
    audience_breakdown: {},
    recommendations: ["LinkedIn post data requires Community Management API approval. Only follower count is currently available."],
    tone_analysis: [],
    format_breakdown: {},
    post_count: 0,
    posts_count: 0,
    impressions: 0,
    reactions: 0,
    comments: 0,
    shares: 0,
    saves: 0,
    authority_trajectory: null,
    source_type: "sync",
  };

  const { error: snapErr } = await adminClient.from("influence_snapshots").insert(snapshot);
  if (snapErr) {
    log(logs, "snapshot_write", "error", JSON.stringify(snapErr));
  } else {
    log(logs, "snapshot_write", "ok", `Follower-only snapshot: ${currentFollowers} followers, growth=${followerGrowth}`);
  }

  const now = new Date().toISOString();
  await adminClient.from("linkedin_connections").update({ last_synced_at: now }).eq("id", conn.id);

  if (syncRunId) {
    await adminClient.from("sync_runs").update({
      status: "completed", completed_at: now, records_fetched: 0, records_stored: 1,
    }).eq("id", syncRunId);
  }

  log(logs, "sync_complete", "warn", "Follower-only sync. Posts not available without Community Management API.");

  return {
    success: true,
    logs,
    summary: {
      postsAnalyzed: 0, postsStored: 0, themesDetected: 0,
      followers: currentFollowers, followerGrowth, engagementRate: 0,
      hasRealFollowerCount: true, hasRealPosts: false,
    },
    note: `Follower count synced (${currentFollowers}). Post analytics require Community Management API approval.`,
  };
}

/* ── HTTP Handler ── */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const adminClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    let body: any = {};
    try { body = await req.json(); } catch { /* empty body */ }
    const isScheduled = body?.scheduled === true;

    if (isScheduled) {
      const { data: allConns } = await adminClient
        .from("linkedin_connections").select("user_id").eq("status", "active");

      if (!allConns || allConns.length === 0) {
        return new Response(JSON.stringify({ success: true, note: "No active connections to sync" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const results: any[] = [];
      for (const c of allConns) {
        try {
          const result = await syncUserLinkedIn(c.user_id, adminClient);
          results.push({ user_id: c.user_id, ...result });
        } catch (e: any) {
          results.push({ user_id: c.user_id, error: e.message });
        }
      }

      return new Response(JSON.stringify({ success: true, scheduled: true, synced: results.length, results }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Manual: authenticate user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await syncUserLinkedIn(user.id, adminClient);
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("LinkedIn sync error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
