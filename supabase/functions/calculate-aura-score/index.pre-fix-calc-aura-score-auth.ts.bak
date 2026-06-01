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

    // --- capture_score: blended recent (4-wk) + extended (12-wk) rhythm ---
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const twelveWeeksAgoForCapture = new Date(now.getTime() - 12 * 7 * 24 * 60 * 60 * 1000);
    const { data: captureEntries } = await admin
      .from("entries")
      .select("created_at")
      .eq("user_id", userId)
      .gte("created_at", twelveWeeksAgoForCapture.toISOString());
    const weekly_data: boolean[] = [];
    for (let i = 0; i < 12; i++) {
      const wkEnd = new Date(now.getTime() - i * 7 * 24 * 60 * 60 * 1000);
      const wkStart = new Date(wkEnd.getTime() - 7 * 24 * 60 * 60 * 1000);
      const active = (captureEntries || []).some((e: any) => {
        const t = new Date(e.created_at).getTime();
        return t >= wkStart.getTime() && t < wkEnd.getTime();
      });
      weekly_data.push(active);
    }
    const activeWeeksLast4 = weekly_data.slice(0, 4).filter(Boolean).length;
    const activeWeeksLast12 = weekly_data.filter(Boolean).length;
    const captureScore = Math.round(
      ((activeWeeksLast4 / 4) * 0.60 + (activeWeeksLast12 / 12) * 0.40) * 100
    );

    // --- weekly_rhythm: derived from same 12-week window ---
    const weekly_rhythm = {
      active_weeks: activeWeeksLast12,
      total_weeks: 12,
      weekly_data,
    };

    // --- signal_score: tier-weighted strength + theme breadth + strong-signal bonus ---
    const { data: signalsData } = await admin
      .from("strategic_signals")
      .select("strength_score, lifecycle_tier, theme_tags")
      .eq("user_id", userId)
      .eq("status", "active");
    const activeSignalsForScore = signalsData || [];

    const TIER_WEIGHT: Record<string, number> = { live: 1.0, evergreen: 0.6, emerging: 0.3 };
    const weightedStrengthSum = activeSignalsForScore.reduce((sum: number, s: any) => {
      const w = TIER_WEIGHT[s.lifecycle_tier] ?? 0.6; // default evergreen-equivalent
      return sum + (Number(s.strength_score) || 0) * w;
    }, 0);

    const uniqueThemes = new Set<string>();
    activeSignalsForScore.forEach((s: any) =>
      (s.theme_tags || []).forEach((t: string) => uniqueThemes.add(t)),
    );
    const hasStrongSignal = activeSignalsForScore.some(
      (s: any) => (Number(s.strength_score) || 0) >= 0.7,
    );

    const signalScore = Math.min(
      Math.round(weightedStrengthSum * 11)
      + Math.min(uniqueThemes.size, 5) * 4
      + (hasStrongSignal ? 8 : 0),
      100,
    );

    // --- content_score: split imported (≤15 baseline) vs active published (≤85) ---
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    // Imported = all non-user-published content (history baseline, no date filter)
    const { count: importedCount } = await admin
      .from("linkedin_posts")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .in("source_type", ["linkedin_export", "browser_capture", "search_discovery", "external_reference"]);
    // Aura-published in last 30 days (MUST be published, not just drafted)
    const { count: auraPublishedCount } = await admin
      .from("linkedin_posts")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .in("source_type", ["aura", "aura_generated"])
      .eq("tracking_status", "published")
      .gte("created_at", thirtyDaysAgo);
    // Count posts confirmed on LinkedIn via xlsx import in last 30 days
    const { count: linkedinPublishedCount } = await admin
      .from("linkedin_post_metrics")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("snapshot_date", thirtyDaysAgo);
    // Use max to avoid double-counting posts that exist in both sources
    const totalPublishedCount = Math.max(auraPublishedCount ?? 0, linkedinPublishedCount ?? 0);
    const contentScore = Math.min(
      Math.min(importedCount ?? 0, 15)
      + Math.min(totalPublishedCount * 15, 85)
    , 100);

    // --- aura_score: weights 40/40/20 (signal/content/capture) ---
    const auraScore = Math.round(signalScore * 0.40 + contentScore * 0.40 + captureScore * 0.20);

    // --- score_status ---
    let scoreStatus: string;
    if (auraScore >= 80) scoreStatus = "Commanding presence";
    else if (auraScore >= 60) scoreStatus = "Gaining voice";
    else if (auraScore >= 35) scoreStatus = "Building strategy";
    else if (auraScore >= 15) scoreStatus = "Exploring";
    else scoreStatus = "Starting";

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
        scoreDescription = totalPublishedCount > 0
          ? `You have ${totalPublishedCount} LinkedIn posts in the last 30 days. Publishing from your top signal accelerates your score.`
          : `Your signals are ready — draft a post from your top signal to start building content momentum.`;
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
    type TierKey = "observer" | "explorer" | "strategist" | "voice" | "presence";
    const tierFromScore = (s: number): TierKey =>
      s < 15 ? "observer" : s < 35 ? "explorer" : s < 60 ? "strategist" : s < 80 ? "voice" : "presence";
    const currentTier = tierFromScore(auraScore);

    const { data: lastSnap } = await admin
      .from("score_snapshots")
      .select("score,tier")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1);
    // Re-derive previous tier from score so old 3-tier snapshots map to the new 5-tier system
    const previousTier: TierKey | null =
      lastSnap && lastSnap.length > 0
        ? tierFromScore(Number((lastSnap[0] as any).score ?? 0))
        : null;

    const tierRank: Record<TierKey, number> = {
      observer: 1, explorer: 2, strategist: 3, voice: 4, presence: 5,
    };
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
        components: { capture_score: captureScore, signal_score: signalScore, content_score: contentScore, weekly_rhythm },
      });
    }

    // ── G4 Tiers (5-tier system) ──
    let tier_name: string, tier_number: number, next_tier_name: string | null, points_to_next: number | null;
    if (auraScore < 15) {
      tier_name = "Observer"; tier_number = 1; next_tier_name = "Explorer"; points_to_next = 15 - auraScore;
    } else if (auraScore < 35) {
      tier_name = "Explorer"; tier_number = 2; next_tier_name = "Strategist"; points_to_next = 35 - auraScore;
    } else if (auraScore < 60) {
      tier_name = "Strategist"; tier_number = 3; next_tier_name = "Voice"; points_to_next = 60 - auraScore;
    } else if (auraScore < 80) {
      tier_name = "Voice"; tier_number = 4; next_tier_name = "Presence"; points_to_next = 80 - auraScore;
    } else {
      tier_name = "Presence"; tier_number = 5; next_tier_name = null; points_to_next = null;
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
      imported_count: importedCount ?? 0,
      aura_published_count: auraPublishedCount ?? 0,
      published_count: totalPublishedCount,
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
