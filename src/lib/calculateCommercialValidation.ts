import { supabase } from "@/integrations/supabase/client";

/**
 * Recompute commercial_validation_score for each strategic_signal that has
 * source-linked LinkedIn posts with engagement data. Score is the ratio of
 * the signal's avg engagement vs the user's overall avg.
 *
 * Engagement = likes + 3×comments + 5×reposts.
 */
export async function calculateCommercialValidation(userId: string): Promise<void> {
  try {
    const { data: signalPosts } = await supabase
      .from("linkedin_posts")
      .select("id, source_signal_id, like_count, comment_count, repost_count")
      .eq("user_id", userId)
      .not("source_signal_id", "is", null)
      .not("like_count", "is", null);

    if (!signalPosts || signalPosts.length === 0) return;

    const { data: allPosts } = await supabase
      .from("linkedin_posts")
      .select("like_count, comment_count, repost_count")
      .eq("user_id", userId)
      .not("like_count", "is", null);

    if (!allPosts || allPosts.length < 3) return;

    const eng = (p: any) =>
      (p.like_count || 0) + (p.comment_count || 0) * 3 + (p.repost_count || 0) * 5;

    const avgEngagement = allPosts.reduce((s, p) => s + eng(p), 0) / allPosts.length;
    if (avgEngagement === 0) return;

    const groups: Record<string, { total: number; count: number }> = {};
    for (const p of signalPosts) {
      const sid = p.source_signal_id as string;
      if (!sid) continue;
      if (!groups[sid]) groups[sid] = { total: 0, count: 0 };
      groups[sid].total += eng(p);
      groups[sid].count += 1;
    }

    for (const [signalId, g] of Object.entries(groups)) {
      const ratio = g.total / g.count / avgEngagement;
      const validationScore = Math.round(ratio * 100) / 100;

      await supabase
        .from("strategic_signals")
        .update({ commercial_validation_score: validationScore } as any)
        .eq("id", signalId);

      if (validationScore > 1.5) {
        const { data: signal } = await supabase
          .from("strategic_signals")
          .select("priority_score")
          .eq("id", signalId)
          .single();
        if (signal) {
          const newPriority = Math.min(100, (signal.priority_score || 50) + 15);
          await supabase
            .from("strategic_signals")
            .update({ priority_score: newPriority })
            .eq("id", signalId);
        }
      }
    }
  } catch (e) {
    console.warn("[calculateCommercialValidation] non-fatal", e);
  }
}