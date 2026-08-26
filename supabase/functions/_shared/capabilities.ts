// ONE canonical reader for capability data.
//
// `diagnostic_profiles.skill_ratings` was written by three instruments with
// three disjoint key vocabularies and two incompatible scales. The numbers do
// not mean the same thing across instruments, so no reader may present them as
// numbers. This module detects the instrument, normalises the keys, and
// converts every value into a BAND. Historic values are never rewritten.
// Callers run different supabase-js versions; only `.from()` is needed here.
type DbClient = { from: (table: string) => any };

export type Instrument = "v2_sliders" | "ordinal_evidence" | "legacy_sliders" | "unknown";
export type CapabilityBand = "not_assessed" | "developing" | "solid" | "strong";
export type CapabilityConfidence = "measured" | "self_reported" | "default";

/** All band cut-offs live here — never inline a threshold. */
export const BAND_THRESHOLDS = {
  // The ordinal ladder emits only these values, from three booleans.
  ordinal: {
    not_assessed: [0],
    developing: [33],
    solid: [50, 66, 70],
    strong: [100],
  },
  // Continuous 0–100 sliders.
  slider: {
    developing: { min: 1, max: 39 },
    solid: { min: 40, max: 74 },
    strong: { min: 75, max: 100 },
  },
  /** An untouched slider sits exactly here. Not a rating. */
  sliderUntouchedDefault: 50,
} as const;

export const BAND_LABEL: Record<CapabilityBand, string> = {
  not_assessed: "Not yet assessed",
  developing: "Developing",
  solid: "Solid",
  strong: "Strong",
};

/**
 * Alias map — every key vocabulary that has ever been written, collapsed onto
 * one canonical name per construct. v2 dimension names are resolved from
 * `capability_dimensions` at read time and their DB name wins as the label.
 */
export const CAPABILITY_ALIASES: Record<string, { canonical: string; label: string }> = {};
const legacy = (canonical: string, label: string, keys: string[]) => {
  for (const k of [...keys, canonical, label]) {
    CAPABILITY_ALIASES[k.toLowerCase()] = { canonical, label };
  }
};
legacy("strategic_architecture", "Strategic Architecture", []);
legacy("c_suite_stewardship", "C-Suite Stewardship", ["csuite_stewardship", "c-suite stewardship"]);
legacy("sector_foresight", "Sector Foresight", []);
legacy("digital_synthesis", "Digital Synthesis", []);
legacy("executive_presence", "Executive Presence", []);
legacy("commercial_velocity", "Commercial Velocity", []);
legacy("human_centric_leadership", "Human-Centric Leadership", ["human_centered_leadership"]);
legacy("operational_resilience", "Operational Resilience", []);
legacy("geopolitical_fluency", "Geopolitical Fluency", []);
legacy("value_based_pnl", "Value-Based P&L", ["value_based_pl", "value based p&l"]);

const slug = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

export interface CapabilityDimensionRead {
  canonical: string;
  label: string;
  band: CapabilityBand;
  confidence: CapabilityConfidence;
  raw: number | null;
}

export interface CapabilityProfile {
  instrument: Instrument;
  /** The member's seniority band the answers belong to, when known. */
  band: string | null;
  dimensions: CapabilityDimensionRead[];
  unmapped: { key: string; raw: number | null }[];
  assessedCount: number;
  totalCount: number;
  isStale: boolean;
  toPromptBlock: () => string;
}

function bandForOrdinal(v: number): CapabilityBand {
  const t = BAND_THRESHOLDS.ordinal;
  if (t.strong.includes(v as never)) return "strong";
  if ((t.solid as readonly number[]).includes(v)) return "solid";
  if ((t.developing as readonly number[]).includes(v)) return "developing";
  // 0 means "no evidence checked", never a measured zero.
  return "not_assessed";
}

function bandForSlider(v: number, untouched: boolean): CapabilityBand {
  if (untouched) return "not_assessed";
  const t = BAND_THRESHOLDS.slider;
  if (v >= t.strong.min) return "strong";
  if (v >= t.solid.min) return "solid";
  if (v >= t.developing.min) return "developing";
  return "not_assessed";
}

export function toPromptBlock(profile: CapabilityProfile): string {
  if (profile.assessedCount === 0) {
    return "Not yet assessed — this member has not completed a capability read.";
  }
  const suffix = (c: CapabilityConfidence) =>
    c === "measured" ? " (evidence-backed)" : c === "self_reported" ? " (self-reported)" : "";
  return profile.dimensions
    .map((d) =>
      d.band === "not_assessed"
        ? `- ${d.label}: ${BAND_LABEL.not_assessed}`
        : `- ${d.label}: ${BAND_LABEL[d.band]}${suffix(d.confidence)}`,
    )
    .join("\n");
}

export async function getCapabilityProfile(
  admin: DbClient,
  userId: string,
): Promise<CapabilityProfile> {
  const [profRes, dimRes] = await Promise.all([
    admin
      .from("diagnostic_profiles")
      .select("skill_ratings, audit_results, instrument_version, audit_method, answered_band, audit_completed_at")
      .eq("user_id", userId)
      .maybeSingle(),
    admin.from("capability_dimensions").select("name, band, active").eq("active", true),
  ]);

  const p: any = (profRes as any).data ?? null;
  const dims: any[] = ((dimRes as any).data ?? []) as any[];
  const v2Names = new Map<string, string>();
  for (const d of dims) {
    const n = String(d?.name ?? "").trim();
    if (n) v2Names.set(n.toLowerCase(), n);
  }

  const ratingsRaw = (p?.skill_ratings && typeof p.skill_ratings === "object" && !Array.isArray(p.skill_ratings))
    ? (p.skill_ratings as Record<string, unknown>)
    : {};
  const auditRaw = (p?.audit_results && typeof p.audit_results === "object" && !Array.isArray(p.audit_results))
    ? (p.audit_results as Record<string, unknown>)
    : {};
  const source = Object.keys(ratingsRaw).length ? ratingsRaw : auditRaw;
  const keys = Object.keys(source);

  // ── DETECT the instrument. Precedence is explicit; inference is a last
  //    resort and is always recorded on the returned object. ──
  let instrument: Instrument;
  if (Number(p?.instrument_version) === 2) instrument = "v2_sliders";
  else if (p?.audit_method === "evidence_audit") instrument = "ordinal_evidence";
  else if (p?.audit_method === "self_calibration") instrument = "legacy_sliders";
  else if (keys.some((k) => v2Names.has(k.toLowerCase()))) instrument = "v2_sliders";
  else if (keys.some((k) => /[A-Z]/.test(k) && /\s/.test(k))) instrument = "ordinal_evidence";
  else if (keys.some((k) => k.includes("_"))) instrument = "legacy_sliders";
  else instrument = "unknown";

  const isOrdinal = instrument === "ordinal_evidence";
  const hasCompletedAt = Boolean(p?.audit_completed_at);

  const dimensions: CapabilityDimensionRead[] = [];
  const unmapped: { key: string; raw: number | null }[] = [];

  for (const key of keys) {
    const rawVal = source[key];
    const raw = typeof rawVal === "number" && Number.isFinite(rawVal) ? rawVal : null;
    const lower = key.toLowerCase();

    let canonical: string | null = null;
    let label: string | null = null;
    if (v2Names.has(lower)) {
      // A v2 dimension name always wins as the display label.
      label = v2Names.get(lower)!;
      canonical = slug(label);
    } else if (CAPABILITY_ALIASES[lower]) {
      canonical = CAPABILITY_ALIASES[lower].canonical;
      label = CAPABILITY_ALIASES[lower].label;
    }

    if (!canonical || !label) {
      unmapped.push({ key, raw });
      continue;
    }

    let band: CapabilityBand;
    let confidence: CapabilityConfidence;
    if (raw === null) {
      band = "not_assessed";
      confidence = "default";
    } else if (isOrdinal) {
      band = bandForOrdinal(raw);
      confidence = band === "not_assessed" ? "default" : "measured";
    } else {
      const untouched = raw === BAND_THRESHOLDS.sliderUntouchedDefault && !hasCompletedAt;
      band = bandForSlider(raw, untouched);
      confidence = band === "not_assessed" ? "default" : "self_reported";
    }

    dimensions.push({ canonical, label, band, confidence, raw });
  }

  const order: Record<CapabilityBand, number> = { strong: 0, solid: 1, developing: 2, not_assessed: 3 };
  dimensions.sort((a, b) => order[a.band] - order[b.band] || a.label.localeCompare(b.label));

  const profile: CapabilityProfile = {
    instrument,
    band: p?.answered_band ?? null,
    dimensions,
    unmapped,
    assessedCount: dimensions.filter((d) => d.band !== "not_assessed").length,
    totalCount: dimensions.length + unmapped.length,
    isStale: instrument !== "v2_sliders",
    toPromptBlock: () => "",
  };
  profile.toPromptBlock = () => toPromptBlock(profile);
  return profile;
}
