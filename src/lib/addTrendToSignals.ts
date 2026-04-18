import { supabase } from "@/integrations/supabase/client";

export interface TrendForSignal {
  id: string;
  headline: string;
  insight?: string | null;
  action_recommendation?: string | null;
  category?: string | null;
  signal_type?: string | null;
  final_score?: number | null;
}

export interface AddTrendResult {
  ok: boolean;
  signalTitle?: string;
  newCount?: number;
  error?: string;
}

/**
 * Wires a trend into the user's strategic signals:
 * 1. Creates an evidence_fragments row for the trend
 * 2. Finds the best-matching strategic_signal by theme overlap (or highest confidence)
 * 3. Appends fragment id, increments fragment_count, bumps confidence
 */
export async function addTrendToSignals(trend: TrendForSignal): Promise<AddTrendResult> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "Not authenticated" };

    // Step 1 — create evidence fragment
    const score = typeof trend.final_score === "number" ? trend.final_score : 70;
    const confidence = Math.max(0, Math.min(1, score / 100));
    const content = `${trend.insight ?? ""} ${trend.action_recommendation ?? ""}`.trim();
    const tags = trend.category ? [trend.category] : [];

    // evidence_fragments requires source_registry_id (NOT NULL). Create a registry row first.
    const { data: registry, error: regErr } = await supabase
      .from("source_registry")
      .insert({
        user_id: user.id,
        source_type: "industry_trend",
        source_id: trend.id,
        title: trend.headline,
        content_preview: content.slice(0, 500),
        processed: true,
        processed_at: new Date().toISOString(),
        fragment_count: 1,
      })
      .select("id")
      .single();
    if (regErr || !registry) {
      console.error("[addTrendToSignals] source_registry insert failed", regErr);
      return { ok: false, error: regErr?.message };
    }

    const { data: fragment, error: fragErr } = await supabase
      .from("evidence_fragments")
      .insert({
        user_id: user.id,
        source_registry_id: registry.id,
        fragment_type: "industry_trend",
        title: trend.headline,
        content: content || trend.headline,
        confidence,
        tags,
        skill_pillars: [],
      })
      .select("id")
      .single();
    if (fragErr || !fragment) {
      console.error("[addTrendToSignals] fragment insert failed", fragErr);
      return { ok: false, error: fragErr?.message };
    }

    // Step 2 — find best matching signal
    const { data: signals, error: sigErr } = await supabase
      .from("strategic_signals")
      .select("id, signal_title, theme_tags, confidence, fragment_count, supporting_evidence_ids")
      .eq("user_id", user.id)
      .eq("status", "active");
    if (sigErr) {
      console.error("[addTrendToSignals] signals fetch failed", sigErr);
      return { ok: false, error: sigErr.message };
    }
    if (!signals || signals.length === 0) {
      return { ok: false, error: "No active signals to attach to" };
    }

    const lookups = [trend.category, trend.signal_type]
      .filter(Boolean)
      .map((s) => String(s).toLowerCase());

    let target = signals[0];
    let bestOverlap = -1;
    let bestConfidence = -1;
    for (const s of signals) {
      const tagSet = (s.theme_tags || []).map((t: string) => String(t).toLowerCase());
      const overlap = lookups.filter((l) => tagSet.includes(l)).length;
      const conf = Number(s.confidence) || 0;
      if (overlap > bestOverlap || (overlap === bestOverlap && conf > bestConfidence)) {
        bestOverlap = overlap;
        bestConfidence = conf;
        target = s;
      }
    }

    // Step 3 — update target signal
    const newEvidence = Array.from(new Set([...(target.supporting_evidence_ids || []), fragment.id]));
    const newCount = (target.fragment_count || 0) + 1;
    const newConfidence = Math.min(1.0, (Number(target.confidence) || 0) + 0.02);

    const { error: updErr } = await supabase
      .from("strategic_signals")
      .update({
        supporting_evidence_ids: newEvidence,
        fragment_count: newCount,
        confidence: newConfidence,
        updated_at: new Date().toISOString(),
      })
      .eq("id", target.id)
      .eq("user_id", user.id);
    if (updErr) {
      console.error("[addTrendToSignals] signal update failed", updErr);
      return { ok: false, error: updErr.message };
    }

    return { ok: true, signalTitle: target.signal_title, newCount };
  } catch (e: any) {
    console.error("[addTrendToSignals] unexpected error", e);
    return { ok: false, error: e?.message || "unexpected" };
  }
}
