import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface Quest {
  id: string;
  label: string;
  done: boolean;
  locked?: boolean;
  unlockHint?: string;
}
export interface Phase {
  id: string;
  name: string;
  index: number;
  quests: Quest[];
  completed: number;
  total: number;
  unlocked: boolean;
}

export function useQuestProgress(userId: string | null) {
  const [phases, setPhases] = useState<Phase[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!userId) { setPhases([]); setLoading(false); return; }
    setLoading(true);

    // Fire all checks in parallel
    const headCount = (q: any) => q.then((r: any) => r.count ?? 0).catch(() => 0);

    const [
      profile,
      entriesAll,
      voice,
      posts,
      signals,
      snaps,
      metrics,
      mirror,
      carousels,
      score,
    ] = await Promise.all([
      supabase.from("diagnostic_profiles").select("first_name, firm, level, sector_focus, brand_assessment_completed_at, brand_pillars").eq("user_id", userId).maybeSingle(),
      supabase.from("entries").select("source_url:content,id", { count: "exact", head: false }).eq("user_id", userId).limit(1000),
      headCount(supabase.from("authority_voice_profiles").select("id", { count: "exact", head: true }).eq("user_id", userId)),
      supabase.from("linkedin_posts").select("id, source_signal_id, tracking_status", { count: "exact" }).eq("user_id", userId),
      supabase.from("strategic_signals" as any).select("id, theme_tags, status", { count: "exact" }).eq("user_id", userId),
      headCount(supabase.from("influence_snapshots").select("id", { count: "exact", head: true }).eq("user_id", userId)),
      supabase.from("linkedin_post_metrics").select("post_id", { count: "exact" }).eq("user_id", userId),
      headCount(supabase.from("market_mirror_cache").select("id", { count: "exact", head: true }).eq("user_id", userId)),
      headCount(supabase.from("content_items").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("type", "carousel")),
      supabase.from("authority_scores").select("authority_score").eq("user_id", userId).order("snapshot_date", { ascending: false }).limit(1).maybeSingle(),
    ]);

    const p: any = profile.data || {};
    const profileFilled = !!(p.first_name && p.firm && p.level && p.sector_focus);
    const assessmentDone = !!p.brand_assessment_completed_at || (Array.isArray(p.brand_pillars) && p.brand_pillars.length > 0);

    const entriesRows: any[] = entriesAll.data || [];
    const entryCount = entriesRows.length;

    // Distinct sources: pull source_url separately
    const { data: srcRows } = await supabase.from("entries").select("account_name, type").eq("user_id", userId).limit(500);
    const distinctSources = new Set((srcRows || []).map((r: any) => (r.account_name || r.type || "").toString().trim().toLowerCase()).filter(Boolean)).size;

    const voiceCount = voice as number;
    const postRows: any[] = posts.data || [];
    const postCount = postRows.length;
    const signalRows: any[] = (signals.data as any[]) || [];
    const activeSignals = signalRows.filter(s => (s.status || "active") === "active");
    const signalCount = activeSignals.length;
    const themeSet = new Set<string>();
    activeSignals.forEach(s => (s.theme_tags || []).forEach((t: string) => themeSet.add(t)));
    const themeCount = themeSet.size;
    const snapsCount = snaps as number;
    const metricsRows: any[] = metrics.data || [];
    const distinctMetricPosts = new Set(metricsRows.map((m: any) => m.post_id)).size;
    const mirrorCount = mirror as number;
    const carouselCount = carousels as number;
    const publishedCount = postRows.filter(p => p.tracking_status === "self_reported_published").length;
    const postsFromSignal = postRows.filter(p => !!p.source_signal_id).length;
    const authorityScore = (score.data as any)?.authority_score ?? 0;

    const phase1: Quest[] = [
      { id: "p1_profile", label: "Complete your profile", done: profileFilled },
      { id: "p1_assessment", label: "Complete brand assessment", done: assessmentDone },
      { id: "p1_first_capture", label: "Capture your first article", done: entryCount >= 1 },
      { id: "p1_three_sources", label: "Capture from 3+ sources", done: distinctSources >= 3 },
      { id: "p1_voice", label: "Teach Aura your voice", done: voiceCount >= 1 },
      { id: "p1_first_post", label: "Generate your first post", done: postCount >= 1 },
    ];
    const p1Done = phase1.every(q => q.done);

    const phase2: Quest[] = [
      { id: "p2_first_signal", label: "Reach your first signal", done: signalCount >= 1 },
      { id: "p2_three_signals", label: "Reach 3 active signals", done: signalCount >= 3 },
      { id: "p2_published", label: "Publish a post on LinkedIn", done: publishedCount >= 1 },
      { id: "p2_analytics", label: "Upload LinkedIn analytics", done: snapsCount >= 1 },
      { id: "p2_strategist", label: "Reach Strategist tier", done: authorityScore >= 35 },
      { id: "p2_rhythm", label: "Maintain 4-week capture rhythm", done: entryCount >= 8 },
    ];
    const p2Done = p1Done && phase2.every(q => q.done);

    const phase3: Quest[] = [
      { id: "p3_five_signal_posts", label: "Publish 5+ posts from signals", done: postsFromSignal >= 5 },
      { id: "p3_authority", label: "Reach Authority tier", done: authorityScore >= 65 },
      { id: "p3_mirror", label: "Complete Market Mirror", done: mirrorCount >= 1 },
      { id: "p3_track", label: "Track 3+ post performances", done: distinctMetricPosts >= 3 },
      { id: "p3_themes", label: "Build 5+ theme coverage", done: themeCount >= 5 },
      { id: "p3_carousel", label: "Generate a carousel", done: carouselCount >= 1 },
    ];

    const make = (id: string, name: string, index: number, quests: Quest[], unlocked: boolean): Phase => ({
      id, name, index, quests,
      completed: quests.filter(q => q.done).length,
      total: quests.length,
      unlocked,
    });

    setPhases([
      make("phase1", "Foundation", 1, phase1, true),
      make("phase2", "Intelligence", 2, phase2, p1Done),
      make("phase3", "Authority", 3, phase3, p2Done),
    ]);
    setLoading(false);
  }, [userId]);

  useEffect(() => { refresh(); }, [refresh]);

  return { phases, loading, refresh };
}

export default useQuestProgress;
