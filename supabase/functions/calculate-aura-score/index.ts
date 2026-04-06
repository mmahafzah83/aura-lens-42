import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.99.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey);
    const userId = user.id;
    const now = new Date();

    // --- capture_score: entries in last 7 days / 7 × 100, cap 100 ---
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { count: entryCount } = await admin
      .from("entries")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", sevenDaysAgo);

    const captureScore = Math.min(Math.round(((entryCount ?? 0) / 7) * 100), 100);

    // --- signal_score: AVG(confidence) × 100 from active signals ---
    const { data: signals } = await admin
      .from("strategic_signals")
      .select("confidence")
      .eq("user_id", userId)
      .eq("status", "active");

    let signalScore = 0;
    if (signals && signals.length > 0) {
      const avg = signals.reduce((sum: number, s: any) => sum + Number(s.confidence), 0) / signals.length;
      signalScore = Math.round(avg * 100);
    }

    // --- content_score: linkedin_posts in last 30 days / 10 × 100, cap 100 ---
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { count: contentCount } = await admin
      .from("linkedin_posts")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", thirtyDaysAgo);

    const contentScore = Math.min(Math.round(((contentCount ?? 0) / 10) * 100), 100);

    // --- aura_score ---
    const auraScore = Math.round(captureScore * 0.35 + signalScore * 0.35 + contentScore * 0.30);

    // --- score_status ---
    let scoreStatus: string;
    if (auraScore >= 85) scoreStatus = "Authority";
    else if (auraScore >= 65) scoreStatus = "Gaining momentum";
    else if (auraScore >= 40) scoreStatus = "Building";
    else scoreStatus = "Dormant";

    // --- score_description ---
    let scoreDescription: string;
    const minScore = Math.min(captureScore, signalScore, contentScore);
    if (captureScore === signalScore && signalScore === contentScore) {
      scoreDescription = "Keep going — you're building strong momentum.";
    } else if (contentScore <= minScore) {
      scoreDescription = "Signals are strong. Publishing content will push you toward Authority.";
    } else if (captureScore <= minScore) {
      scoreDescription = "You haven't captured recently. Feed Aura to keep your intelligence fresh.";
    } else {
      scoreDescription = "Capture more sources to strengthen your signals.";
    }

    // --- score_trend: compare to 7 days ago snapshot ---
    const { data: prevSnapshot } = await admin
      .from("score_snapshots")
      .select("score")
      .eq("user_id", userId)
      .lte("created_at", sevenDaysAgo)
      .order("created_at", { ascending: false })
      .limit(1);

    const prevScore = (prevSnapshot && prevSnapshot.length > 0) ? prevSnapshot[0].score : null;
    const scoreTrend = prevScore !== null ? auraScore - prevScore : null;

    // --- Store weekly snapshot (max 1 per day) ---
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const { data: todaySnap } = await admin
      .from("score_snapshots")
      .select("id")
      .eq("user_id", userId)
      .gte("created_at", todayStart)
      .limit(1);

    if (!todaySnap || todaySnap.length === 0) {
      await admin.from("score_snapshots").insert({
        user_id: userId,
        score: auraScore,
        components: { capture_score: captureScore, signal_score: signalScore, content_score: contentScore },
      });
    }

    const result = {
      aura_score: auraScore,
      capture_score: captureScore,
      signal_score: signalScore,
      content_score: contentScore,
      score_status: scoreStatus,
      score_description: scoreDescription,
      score_trend: scoreTrend,
    };

    return new Response(JSON.stringify(result), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("calculate-aura-score error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
