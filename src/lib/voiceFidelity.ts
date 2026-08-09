/**
 * Voice fidelity — arithmetic, not judgement.
 *
 * For every measured, computable trait we measure the sample with the SAME
 * code path the corpus was measured with (`supabase/functions/_shared/
 * voiceMeasure.ts`) and ask one question: is this sample inside the band the
 * member's own posts prove? Nothing here produces a "voice match %": a
 * percentage would imply Aura has judged whether the text SOUNDS like them,
 * which no arithmetic in this file can know.
 */
import { supabase } from "@/integrations/supabase/client";
import { measureOne, scale } from "../../supabase/functions/_shared/voiceMeasure";

export interface FidelityTrait {
  trait_key: string;
  display_name: string;
  /** measured value of the sample, 0–100 */
  sampleValue: number;
  /** the raw measurement, in the trait's own unit (chars, emoji/1k, %) */
  sampleRaw: number;
  bandLow: number;
  bandHigh: number;
  inside: boolean;
  /** 0 when inside; otherwise how far outside, as a share of the band width */
  distance: number;
  /** plain sentence naming the miss, or null when inside */
  miss: string | null;
}

export interface FidelityResult {
  traits: FidelityTrait[];
  inside: number;
  total: number;
  /** traits deliberately left out of the count, with the reason */
  excluded: { trait_key: string; display_name: string; reason: string }[];
  /** the member's measured median length, in characters */
  targetChars: number | null;
  /** true when there is no measured band to judge against */
  unjudgeable: boolean;
}

export interface FidelityTraitInput {
  trait_key: string;
  display_name: string;
  computable: boolean;
  value: number | null;
  band_low: number | null;
  band_high: number | null;
}

/** Turn a scaled 0–100 band edge back into the unit a member recognises. */
function human(trait: string, scaled: number): string {
  switch (trait) {
    case "length":
      return Math.round(800 + (scaled / 100) * 1800).toLocaleString("en-US");
    case "emoji":
      return `${((scaled / 100) * 12).toFixed(1)} per 1,000 chars`;
    case "evidence_density":
      return `${((scaled / 100) * 15).toFixed(1)} figures per 1,000 chars`;
    case "language_mix":
      return `${Math.round(scaled)}% Arabic`;
    default:
      return `${Math.round(scaled)}`;
  }
}

function humanSample(trait: string, raw: number): string {
  switch (trait) {
    case "length":
      return Math.round(raw).toLocaleString("en-US");
    case "emoji":
      return `${raw.toFixed(1)} per 1,000 chars`;
    case "evidence_density":
      return `${raw.toFixed(1)} figures per 1,000 chars`;
    case "language_mix":
      return `${Math.round(raw)}% Arabic`;
    default:
      return `${Math.round(raw)}`;
  }
}

/**
 * The pure core. Give it a sample and the member's traits; it returns the
 * per-trait breakdown and the count. No network, no model.
 */
export function voiceFidelity(sampleText: string, traits: FidelityTraitInput[]): FidelityResult {
  const out: FidelityTrait[] = [];
  const excluded: FidelityResult["excluded"] = [];
  let targetChars: number | null = null;

  for (const t of traits) {
    if (!t.computable) {
      excluded.push({ trait_key: t.trait_key, display_name: t.display_name, reason: "not measurable from text" });
      continue;
    }
    if (t.band_low === null || t.band_high === null || t.value === null) {
      excluded.push({ trait_key: t.trait_key, display_name: t.display_name, reason: "no measured range yet" });
      continue;
    }
    if (t.trait_key === "length") {
      targetChars = Math.round(800 + ((t.value as number) / 100) * 1800);
    }
    const m = measureOne(t.trait_key, sampleText);
    if (!m) {
      excluded.push({ trait_key: t.trait_key, display_name: t.display_name, reason: "no signal in this sample" });
      continue;
    }
    const lo = Math.min(t.band_low, t.band_high);
    const hi = Math.max(t.band_low, t.band_high);
    const inside = m.scaled >= lo && m.scaled <= hi;
    const width = Math.max(hi - lo, 1);
    const distance = inside ? 0 : Number((((m.scaled < lo ? lo - m.scaled : m.scaled - hi) / width)).toFixed(2));
    out.push({
      trait_key: t.trait_key,
      display_name: t.display_name,
      sampleValue: Number(m.scaled.toFixed(1)),
      sampleRaw: Number(m.raw.toFixed(2)),
      bandLow: lo,
      bandHigh: hi,
      inside,
      distance,
      miss: inside
        ? null
        : `${t.display_name} is ${humanSample(t.trait_key, m.raw)} — your range is ${human(t.trait_key, lo)}–${human(t.trait_key, hi)}.`,
    });
  }

  return {
    traits: out,
    inside: out.filter((t) => t.inside).length,
    total: out.length,
    excluded,
    targetChars,
    unjudgeable: out.length === 0,
  };
}

/** Load the member's traits and score a sample. Named for the spec: `voice_fidelity(sample_text, user_id)`. */
export async function voice_fidelity(sample_text: string, user_id: string, profileId?: string | null): Promise<FidelityResult> {
  const { data: registry } = await supabase
    .from("voice_trait_registry")
    .select("trait_key, display_name, computable, sort_order")
    .eq("active", true)
    .order("sort_order");

  let pid = profileId ?? null;
  if (!pid) {
    const { data: p } = await supabase
      .from("authority_voice_profiles")
      .select("id")
      .eq("user_id", user_id)
      .order("is_primary", { ascending: false })
      .limit(1)
      .maybeSingle();
    pid = p?.id ?? null;
  }
  const { data: rows } = pid
    ? await supabase.from("voice_traits").select("trait_key, value, band_low, band_high").eq("profile_id", pid)
    : { data: [] as { trait_key: string; value: number | null; band_low: number | null; band_high: number | null }[] };

  const byKey = new Map((rows ?? []).map((r) => [r.trait_key, r]));
  const inputs: FidelityTraitInput[] = (registry ?? []).map((reg) => {
    const r = byKey.get(reg.trait_key);
    const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
    return {
      trait_key: reg.trait_key,
      display_name: reg.display_name,
      computable: Boolean(reg.computable),
      value: num(r?.value),
      band_low: num(r?.band_low),
      band_high: num(r?.band_high),
    };
  });
  return voiceFidelity(sample_text, inputs);
}

/** Re-exported so callers never reach for a second scaling implementation. */
export { scale };
