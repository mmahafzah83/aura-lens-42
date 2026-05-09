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
    const token = authHeader.replace("Bearer ", "");
    const { data: { user: authUser }, error: authErr } = await userClient.auth.getUser(token);
    if (authErr || !authUser) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const user = { id: authUser.id };

    const admin = createClient(supabaseUrl, serviceKey);
    const userId = user.id;
    const now = new Date();

    // --- capture_score: consistency — active weeks in the last 12 calendar weeks ---
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const twelveWeeksAgoForCapture = new Date(now.getTime() - 12 * 7 * 24 * 60 * 60 * 1000);
    const { data: captureEntries } = await admin
      .from("entries")
      .select("created_at")
      .eq("user_id", userId)
      .gte("created_at", twelveWeeksAgoForCapture.toISOString());
    let activeWeeksInLast12 = 0;
    for (let i = 0; i < 12; i++) {
      const wkEnd = new Date(now.getTime() - i * 7 * 24 * 60 * 60 * 1000);
      const wkStart = new Date(wkEnd.getTime() - 7 * 24 * 60 * 60 * 1000);
      const active = (captureEntries || []).some((e: any) => {
        const t = new Date(e.created_at).getTime();
        return t >= wkStart.getTime() && t < wkEnd.getTime();
      });
      if (active) activeWeeksInLast12++;
    }
    const captureScore = Math.round((activeWeeksInLast12 / 12) * 100);

    // --- signal_score: active signal count / 10 × 100, cap 100 ---
    const { data: signals } = await admin
      .from("strategic_signals")
      .select("confidence")
      .eq("user_id", userId)
      .eq("status", "active");
    const activeSignalCount = signals?.length ?? 0;
    const signalScore = Math.min(Math.round((activeSignalCount / 10) * 100), 100);

    // --- content_score: linkedin_posts in last 30 days / 10 × 100, cap 100 ---
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { count: contentCount } = await admin
      .from("linkedin_posts")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", thirtyDaysAgo);

    const contentScore = Math.min(Math.round(((contentCount ?? 0) / 10) * 100), 100);

    // --- aura_score: weights 40/40/20 (signal/content/capture) ---
    const auraScore = Math.round(signalScore * 0.40 + contentScore * 0.40 + captureScore * 0.20);

    // --- score_status ---
    let scoreStatus: string;
    if (auraScore >= 85) scoreStatus = "Authority";
    else if (auraScore >= 65) scoreStatus = "Gaining momentum";
    else if (auraScore >= 40) scoreStatus = "Rising";
    else scoreStatus = "Dormant";

    // --- score_description ---
    let scoreDescription: string;
    const range = Math.max(captureScore, signalScore, contentScore) - Math.min(captureScore, signalScore, contentScore);
    if (range <= 10) {
      scoreDescription = "Strong across the board — keep your current pace.";
    } else {
      const minScore = Math.min(captureScore, signalScore, contentScore);
      if (signalScore <= minScore) {
        scoreDescription = "Your signals need more diverse sources — capture from different organisations to strengthen confidence.";
      } else if (captureScore <= minScore) {
        scoreDescription = "Your capture consistency has gaps — capture at least once per week to keep your intelligence fresh.";
      } else {
        scoreDescription = "Signals are strong but you haven't published — draft content to push toward Authority.";
      }
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

    // ── Tier transition detection (O-2a) ──
    const tierFromScore = (s: number): "observer" | "strategist" | "authority" =>
      s < 35 ? "observer" : s < 65 ? "strategist" : "authority";
    const currentTier = tierFromScore(auraScore);

    const { data: lastSnap } = await admin
      .from("score_snapshots")
      .select("score,tier")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1);
    const previousTier: "observer" | "strategist" | "authority" | null =
      lastSnap && lastSnap.length > 0
        ? ((lastSnap[0] as any).tier as any) || tierFromScore((lastSnap[0] as any).score ?? 0)
        : null;

    const tierRank = { observer: 1, strategist: 2, authority: 3 } as const;
    let tier_transition: { from: string; to: string; is_new: boolean } | null = null;
    if (previousTier && previousTier !== currentTier && tierRank[currentTier] > tierRank[previousTier]) {
      const milestoneId = `tier_${currentTier}`;
      const tierLabel = currentTier.charAt(0).toUpperCase() + currentTier.slice(1);
      const { data: existingTierMs } = await admin
        .from("user_milestones")
        .select("id")
        .eq("user_id", userId)
        .eq("milestone_id", milestoneId)
        .maybeSingle();
      const isNew = !existingTierMs;
      if (isNew) {
        const { data: topSig } = await admin
          .from("strategic_signals")
          .select("signal_title")
          .eq("user_id", userId)
          .eq("status", "active")
          .order("confidence", { ascending: false })
          .limit(1)
          .maybeSingle();
        await admin.from("user_milestones").insert({
          user_id: userId,
          milestone_id: milestoneId,
          milestone_name: `Reached ${tierLabel} Tier`,
          context: {
            previous_tier: previousTier,
            new_tier: currentTier,
            score: auraScore,
            top_signal_title: (topSig as any)?.signal_title || null,
            timestamp: new Date().toISOString(),
          },
          acknowledged: false,
          shared: false,
        });
      }
      tier_transition = { from: previousTier, to: currentTier, is_new: isNew };
    }

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
        tier: currentTier,
        components: { capture_score: captureScore, signal_score: signalScore, content_score: contentScore },
      });
    }

    // ── G4 Tiers ──
    let tier_name: string, tier_number: number, next_tier_name: string | null, points_to_next: number | null;
    if (auraScore < 35) {
      tier_name = "Observer"; tier_number = 1; next_tier_name = "Strategist"; points_to_next = 35 - auraScore;
    } else if (auraScore < 65) {
      tier_name = "Strategist"; tier_number = 2; next_tier_name = "Authority"; points_to_next = 65 - auraScore;
    } else {
      tier_name = "Authority"; tier_number = 3; next_tier_name = null; points_to_next = null;
    }

    // ── G4 Personalized nudge ──
    const { data: profile } = await admin
      .from("diagnostic_profiles")
      .select("sector_focus,north_star_goal")
      .eq("user_id", userId)
      .maybeSingle();
    const sectorFocus = (profile as any)?.sector_focus || "your sector";

    const subs = [
      { key: "capture", value: captureScore },
      { key: "signal", value: signalScore },
      { key: "content", value: contentScore },
    ].sort((a, b) => a.value - b.value);
    const weakest = subs[0].key;

    const { data: signalsFull } = await admin
      .from("strategic_signals")
      .select("signal_title,confidence,theme_tags")
      .eq("user_id", userId)
      .eq("status", "active")
      .order("confidence", { ascending: false });
    const topSignal = signalsFull?.[0] as any;
    const topTitle = topSignal?.signal_title || "your top";
    const topConf = topSignal ? Math.round(Number(topSignal.confidence) * 100) : 0;

    let personalized_nudge: string;
    if ((signalsFull?.length || 0) === 0) {
      personalized_nudge = `Your sector is moving. Paste one link about ${sectorFocus} and see what Aura finds that you didn't notice.`;
    } else if (weakest === "capture") {
      personalized_nudge = `Your ${topTitle} signal is strong at ${topConf}%. Reinforce it with a new capture from a different source.`;
    } else if (weakest === "signal") {
      const themes = new Set<string>();
      (signalsFull || []).forEach((s: any) => (s.theme_tags || []).forEach((t: string) => themes.add(t)));
      personalized_nudge = `You have ${signalsFull?.length || 0} signals across ${themes.size} themes. Capture from a new topic area in ${sectorFocus} to broaden coverage.`;
    } else {
      personalized_nudge = `Your ${topTitle} signal (${topConf}%) is ready to publish. Draft a post from this signal to boost your content score.`;
    }

    // ── G4 Weekly rhythm (last 12 weeks) ──
    const twelveWeeksAgo = new Date(now.getTime() - 12 * 7 * 24 * 60 * 60 * 1000);
    const { data: rhythmEntries } = await admin
      .from("entries")
      .select("created_at,has_strategic_insight")
      .eq("user_id", userId)
      .gte("created_at", twelveWeeksAgo.toISOString());
    const weekly_data: boolean[] = [];
    for (let i = 0; i < 12; i++) {
      const wkEnd = new Date(now.getTime() - i * 7 * 24 * 60 * 60 * 1000);
      const wkStart = new Date(wkEnd.getTime() - 7 * 24 * 60 * 60 * 1000);
      const active = (rhythmEntries || []).some((e: any) => {
        const t = new Date(e.created_at).getTime();
        return t >= wkStart.getTime() && t < wkEnd.getTime() && e.has_strategic_insight === true;
      });
      weekly_data.push(active);
    }
    const weekly_rhythm = {
      active_weeks: weekly_data.filter(Boolean).length,
      total_weeks: 12,
      weekly_data,
    };

    // ── G4 Milestones ──
    const activeSignals = signalsFull || [];
    const themeSet = new Set<string>();
    activeSignals.forEach((s: any) => (s.theme_tags || []).forEach((t: string) => themeSet.add(t)));

    const [{ data: voiceProfile }, { data: publishedPost }, { count: lpCount }] = await Promise.all([
      admin.from("authority_voice_profiles").select("tone").eq("user_id", userId).maybeSingle(),
      admin.from("linkedin_posts").select("id").eq("user_id", userId)
        .or("source_type.eq.aura,content_engine_output_type.not.is.null").limit(1),
      admin.from("linkedin_posts").select("id", { count: "exact", head: true }).eq("user_id", userId),
    ]);

    const profileFull = (await admin
      .from("diagnostic_profiles")
      .select("first_name,sector_focus,brand_assessment_results")
      .eq("user_id", userId)
      .maybeSingle()).data as any;

    const checks: { id: string; name: string; earned: boolean; context: any }[] = [
      {
        id: "profile_complete",
        name: "Profile complete",
        earned: !!(profileFull?.first_name && profileFull?.sector_focus),
        context: { first_name: profileFull?.first_name, sector_focus: profileFull?.sector_focus },
      },
      {
        id: "first_signal",
        name: "First signal",
        earned: activeSignals.length >= 1,
        context: { signal_title: activeSignals[0]?.signal_title || null },
      },
      {
        id: "voice_trained",
        name: "Voice trained",
        earned: !!(voiceProfile && (voiceProfile as any).tone),
        context: { tone: (voiceProfile as any)?.tone || null },
      },
      {
        id: "first_publish",
        name: "First publish",
        earned: !!(publishedPost && publishedPost.length > 0),
        context: { post_count: lpCount ?? 0 },
      },
      {
        id: "brand_assessment",
        name: "Brand assessment",
        earned: !!profileFull?.brand_assessment_results && Object.keys(profileFull.brand_assessment_results || {}).length > 0,
        context: {},
      },
      {
        id: "five_signals",
        name: "Five signals",
        earned: activeSignals.length >= 5,
        context: { count: activeSignals.length },
      },
      {
        id: "sector_depth",
        name: "Sector depth",
        earned: themeSet.size >= 5,
        context: { themes: Array.from(themeSet).slice(0, 10) },
      },
      {
        id: "weekly_rhythm_4",
        name: "Weekly rhythm",
        earned: weekly_data.slice(0, 6).filter(Boolean).length >= 4,
        context: { active_in_last_6: weekly_data.slice(0, 6).filter(Boolean).length },
      },
    ];

    const { data: existingMilestones } = await admin
      .from("user_milestones")
      .select("milestone_id,earned_at")
      .eq("user_id", userId);
    const earnedMap = new Map<string, string>();
    (existingMilestones || []).forEach((m: any) => earnedMap.set(m.milestone_id, m.earned_at));

    const newly_earned: string[] = [];
    const milestones: any[] = [];
    for (const c of checks) {
      const alreadyAt = earnedMap.get(c.id) || null;
      let earnedAt: string | null = alreadyAt;
      if (c.earned && !alreadyAt) {
        const { data: ins, error: insErr } = await admin
          .from("user_milestones")
          .insert({ user_id: userId, milestone_id: c.id, milestone_name: c.name, context: c.context })
          .select("earned_at")
          .maybeSingle();
        if (!insErr && ins) {
          earnedAt = (ins as any).earned_at;
          newly_earned.push(c.id);
        }
      }
      milestones.push({
        id: c.id,
        name: c.name,
        earned: c.earned,
        earned_at: earnedAt,
        context: c.earned ? c.context : null,
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
      tier_name,
      tier_number,
      next_tier_name,
      points_to_next,
      personalized_nudge,
      weekly_rhythm,
      milestones,
      newly_earned,
      tier: currentTier,
      tier_transition,
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
