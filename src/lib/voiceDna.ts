/**
 * Voice DNA — the data layer for the DNA subpage.
 *
 * Nothing here recomputes a window, a diversity figure or a top-style share.
 * Those three facts have exactly one definition each, in the database
 * (`voice_window`, `voice_opener_diversity`, `voice_top_style_share`), and this
 * file reads them. Unknown stays null all the way to the screen: no zero-fill,
 * no interpolation, no default of 50.
 */
import { supabase } from "@/integrations/supabase/client";
import { HOOK_LABEL, repetitionSentence } from "@/lib/voiceOverview";

/* ── vocabulary ──────────────────────────────────────────────────────────── */

/** Sentence-case display names for the seven canonical openers. */
export const HOOK_NAME: Record<string, string> = {
  contrarian_claim: "Contrarian claim",
  number_first: "Number first",
  short_story: "Short story",
  question: "Question",
  experience_led: "Experience led",
  announcement: "Announcement",
  other: "Something else",
};

export const ENDING_NAME: Record<string, string> = {
  question: "Question",
  suspended: "Suspended line",
  reframe: "Reframe",
  equation: "Equation",
  number: "Number",
  cta: "Call to action",
  other: "Something else",
};

export const HOOK_KEYS = Object.keys(HOOK_NAME);
export const ENDING_KEYS = Object.keys(ENDING_NAME);

/* ── modes ───────────────────────────────────────────────────────────────── */

export interface ModeDef {
  key: string;
  label: string;
  blurb: string;
  /** Trait shifts, in points, applied to the member's measured value. */
  shifts: Record<string, number>;
}

export const MODE_DEFS: ModeDef[] = [
  { key: "executive", label: "Executive", blurb: "For board notes and results — shorter, harder on evidence.", shifts: { length: -8, pace: 6, evidence_density: 8 } },
  { key: "thought_leadership", label: "Ideas worth quoting", blurb: "For arguments you want quoted — longer, more claim than data.", shifts: { length: 8, evidence_density: -4 } },
  { key: "educational", label: "Educational", blurb: "For explaining something — slower, more worked detail.", shifts: { pace: -6, evidence_density: 6, length: 5 } },
  { key: "personal", label: "Personal", blurb: "For the story only you can tell — warmer, less data.", shifts: { evidence_density: -8, length: -4 } },
  { key: "contrarian", label: "Contrarian", blurb: "For the position nobody else will take — clipped, evidence up front.", shifts: { pace: 8, length: -6, evidence_density: 4 } },
];

/** A mode may only move a trait inside the range the member's own posts prove. */
export function clampToBand(target: number, bandLow: number | null, bandHigh: number | null): number {
  const lo = bandLow === null ? 0 : bandLow;
  const hi = bandHigh === null ? 100 : bandHigh;
  return Math.max(lo, Math.min(hi, target));
}

/* ── model ───────────────────────────────────────────────────────────────── */

export interface DnaTrait {
  trait_key: string;
  display_name: string;
  pole_low: string;
  pole_high: string;
  group_key: string;
  computable: boolean;
  min_evidence: number;
  sort_order: number;
  /** row id in voice_traits; null when nothing has been measured or set */
  id: string | null;
  value: number | null;
  band_low: number | null;
  band_high: number | null;
  /** the last value Aura learned from the posts, for "Restore Aura's" */
  learned_value: number | null;
  confidence: string | null;
  source: string | null;
  locked: boolean;
  evidence_count: number | null;
  last_confirmed_at: string | null;
}

export interface DnaMode {
  key: string;
  label: string;
  blurb: string;
  profileId: string | null;
  readiness: string | null;
  /** The language of the row behind this card, when the row exists. */
  language: string | null;
  /** A member may only remove a mode they created — never default, never primary. */
  removable: boolean;
  /** true when a preset shift had to be clamped back into the proven band */
  needsEvidence: boolean;
}

export interface DnaRule {
  id: string;
  kind: "always" | "never" | "anchor";
  text: string;
  source: string;
  rank: number;
  /** 'active' rules are the only ones generation ever sees. */
  status?: string;
  /** Where a suggestion came from: post ids, a count and the sentence to show. */
  evidence?: { post_ids?: string[]; count?: number; total?: number; note?: string; derivation?: string } | null;
  check?: { kind: "phrase" | "opening" | "ending" | "marker"; value: string } | null;
  last_applied_at?: string | null;
  times_applied?: number;
}

export interface VoiceDnaModel {
  hasProfile: boolean;
  activeProfileId: string | null;
  /** The language of the active row — a mode is created in the same language. */
  activeLanguage: string;
  traits: DnaTrait[];
  modes: DnaMode[];
  rules: DnaRule[];
  /** Proposals. Not in force until the member accepts one. */
  suggestions: DnaRule[];
  windowSize: number;
  windowClassified: number;
  windowDist: Record<string, number>;
  endingDist: Record<string, number>;
  endingClassified: number;
  diversity: number | null;
  topShare: number | null;
  topStyleKey: string | null;
  topStyleCount: number | null;
}

/** The variation sentence. One generator, shared with the Overview page. */
export function variationSentence(m: VoiceDnaModel): string | null {
  return repetitionSentence({
    topShare: m.topShare,
    topStyleKey: m.topStyleKey,
    topStyleCount: m.topStyleCount,
    windowClassified: m.windowClassified,
    windowSize: m.windowSize,
    windowDist: m.windowDist,
  });
}

export const hookPhrase = (key: string) => HOOK_LABEL[key] ?? key;

export async function loadVoiceDna(userId: string, wantProfileId?: string | null): Promise<VoiceDnaModel> {
  const [{ data: profiles }, { data: registry }, windowRes, diversityRes, topRes, { data: ruleRows }] = await Promise.all([
    supabase
      .from("authority_voice_profiles")
      .select("id, mode_key, mode_label, readiness, updated_at, is_primary, language")
      .eq("user_id", userId)
      // A member can hold more than one row per mode_key, one per language.
      // The primary row is their canonical voice and must win even if another row was written last.
      .order("is_primary", { ascending: false })
      .order("updated_at", { ascending: false })
      .order("id", { ascending: true }),
    supabase
      .from("voice_trait_registry")
      .select("trait_key, display_name, pole_low, pole_high, group_key, computable, min_evidence, sort_order")
      .eq("active", true)
      .order("sort_order"),
    supabase.rpc("voice_window", { p_user_id: userId }),
    supabase.rpc("voice_opener_diversity", { p_user_id: userId }),
    supabase.rpc("voice_top_style_share", { p_user_id: userId }),
    supabase
      .from("voice_rules")
      .select("id, kind, text, source, rank, status, evidence, check, last_applied_at, times_applied")
      .eq("user_id", userId)
      .eq("active", true)
      .in("status", ["active", "suggested"])
      .order("rank"),
  ]);

  const all = profiles ?? [];
  // One row per mode. The database now enforces this, but a client that has
  // not reloaded must still never render two cards for the same mode.
  const byMode = new Map<string, (typeof all)[number]>();
  for (const p of all) {
    if (!p.mode_key) continue;
    if (!byMode.has(p.mode_key)) byMode.set(p.mode_key, p);
  }
  const unique = [...byMode.values()];
  // Every member with a profile has exactly one primary. If a merge or a delete
  // left none, repair it here rather than resolving the member to nothing.
  if (unique.length > 0 && !unique.some((p) => p.is_primary)) {
    const repair = byMode.get("default") ?? unique[0];
    await supabase.from("authority_voice_profiles").update({ is_primary: true }).eq("id", repair.id);
    repair.is_primary = true;
  }
  const active = unique.find((p) => p.id === wantProfileId) ?? byMode.get("default") ?? unique[0] ?? null;

  const windowRows = (windowRes.data as { hook_style: string | null; ending_type: string | null }[] | null) ?? [];
  const windowDist: Record<string, number> = {};
  const endingDist: Record<string, number> = {};
  for (const r of windowRows) {
    if (r.hook_style) windowDist[r.hook_style] = (windowDist[r.hook_style] ?? 0) + 1;
    if (r.ending_type) endingDist[r.ending_type] = (endingDist[r.ending_type] ?? 0) + 1;
  }

  const topRow = (topRes.data as
    { share: number | null; top_style: string | null; top_count: number | null }[] | null)?.[0] ?? null;

  let traits: DnaTrait[] = [];
  if (active) {
    const { data: rows } = await supabase
      .from("voice_traits")
      .select("id, trait_key, value, band_low, band_high, raw_value, confidence, source, locked, evidence_count, last_confirmed_at")
      .eq("profile_id", active.id);
    const byKey = new Map((rows ?? []).map((r) => [r.trait_key, r]));
    traits = (registry ?? []).map((reg) => {
      const r = byKey.get(reg.trait_key);
      const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
      return {
        trait_key: reg.trait_key,
        display_name: reg.display_name,
        pole_low: reg.pole_low ?? "",
        pole_high: reg.pole_high ?? "",
        group_key: reg.group_key ?? "sound",
        computable: Boolean(reg.computable),
        min_evidence: reg.min_evidence ?? 8,
        sort_order: reg.sort_order ?? 0,
        id: r?.id ?? null,
        value: num(r?.value),
        band_low: num(r?.band_low),
        band_high: num(r?.band_high),
        learned_value: r?.source === "learned" ? num(r?.value) : num(r?.raw_value),
        confidence: r?.confidence ?? null,
        source: r?.source ?? null,
        locked: Boolean(r?.locked),
        evidence_count: num(r?.evidence_count),
        last_confirmed_at: r?.last_confirmed_at ?? null,
      };
    });
  }

  // The cards and `activeProfileId` are derived from the same map, so selecting
  // a card can never switch to a row the cards do not know about.
  const existing = byMode;
  const modes: DnaMode[] = [];
  const legacy = existing.get("default");
  if (legacy) {
    modes.push({
      key: "default", label: legacy.mode_label || "Your default voice",
      blurb: "The voice Aura uses when you have not asked for anything else.",
      profileId: legacy.id, readiness: legacy.readiness ?? null, needsEvidence: false,
      language: (legacy as { language?: string | null }).language ?? null, removable: false,
    });
  }
  for (const def of MODE_DEFS) {
    const p = existing.get(def.key);
    modes.push({
      key: def.key, label: def.label, blurb: def.blurb,
      profileId: p?.id ?? null, readiness: p?.readiness ?? null, needsEvidence: false,
      language: (p as { language?: string | null } | undefined)?.language ?? null,
      removable: Boolean(p) && !p?.is_primary,
    });
  }

  return {
    hasProfile: Boolean(active),
    activeProfileId: active?.id ?? null,
    activeLanguage: (active as { language?: string | null } | null)?.language === "ar" ? "ar" : "en",
    traits,
    modes,
    rules: ((ruleRows ?? []) as DnaRule[]).filter((r) => (r.status ?? "active") === "active"),
    suggestions: ((ruleRows ?? []) as DnaRule[]).filter((r) => r.status === "suggested"),
    windowSize: windowRows.length,
    windowClassified: windowRows.filter((r) => r.hook_style).length,
    windowDist,
    endingDist,
    endingClassified: windowRows.filter((r) => r.ending_type).length,
    diversity: diversityRes.data === null || diversityRes.data === undefined ? null : Number(diversityRes.data),
    topShare: topRow?.share === null || topRow?.share === undefined ? null : Number(topRow.share),
    topStyleKey: topRow?.top_style ?? null,
    topStyleCount: topRow?.top_count === null || topRow?.top_count === undefined ? null : Number(topRow.top_count),
  };
}

/* ── mutations ───────────────────────────────────────────────────────────── */

/**
 * A value the member set themselves: theirs, high confidence, no measured band.
 * Upsert, not insert — a stale `trait.id` used to collide with the
 * (profile_id, trait_key) unique constraint and throw 23505.
 */
export async function setTraitValue(userId: string, profileId: string, trait: DnaTrait, value: number) {
  const payload = {
    user_id: userId,
    profile_id: profileId,
    trait_key: trait.trait_key,
    value,
    source: "user",
    confidence: "high",
    last_confirmed_at: new Date().toISOString(),
    ...(trait.computable ? {} : { band_low: null, band_high: null }),
  };
  const { error } = await supabase
    .from("voice_traits")
    .upsert(payload, { onConflict: "profile_id,trait_key" });
  if (error) throw error;
}

export async function setTraitLock(traitId: string, locked: boolean) {
  const { error } = await supabase.from("voice_traits").update({ locked }).eq("id", traitId);
  if (error) throw error;
}

export async function restoreLearned(traitId: string, learned: number) {
  const { error } = await supabase
    .from("voice_traits")
    .update({ value: learned, source: "learned", last_confirmed_at: null })
    .eq("id", traitId);
  if (error) throw error;
}

export async function confirmTrait(traitId: string) {
  const { error } = await supabase
    .from("voice_traits")
    .update({ last_confirmed_at: new Date().toISOString() })
    .eq("id", traitId);
  if (error) throw error;
}

/** Rejecting deletes the guess and remembers it, so Aura waits 30 days. */
export async function rejectTrait(userId: string, profileId: string, trait: DnaTrait) {
  if (!trait.id) return;
  const { error } = await supabase.from("voice_trait_rejections").insert({
    user_id: userId, profile_id: profileId, trait_key: trait.trait_key, rejected_value: trait.value,
  });
  if (error) throw error;
  const del = await supabase.from("voice_traits").delete().eq("id", trait.id);
  if (del.error) throw del.error;
}

/**
 * Create a mode. Its traits start from the member's measured values and are
 * clamped into the band their own posts prove — a mode never invents a register.
 */
export async function createMode(userId: string, def: ModeDef, baseTraits: DnaTrait[], language: string) {
  const { data: profile, error } = await supabase
    .from("authority_voice_profiles")
    // A new mode is never primary — one primary per member, always. The
    // language is carried over from the profile it is based on: uniqueness is
    // (user_id, mode_key, language), so a missing language collides.
    .insert({ user_id: userId, language, mode_key: def.key, mode_label: def.label, readiness: "forming", is_primary: false })
    .select("id")
    .single();
  if (error) throw error;

  let needsEvidence = false;
  const rows = baseTraits
    .filter((t) => t.value !== null)
    .map((t) => {
      const target = (t.value as number) + (def.shifts[t.trait_key] ?? 0);
      const clamped = clampToBand(target, t.band_low, t.band_high);
      if (Math.abs(clamped - target) > 0.01) needsEvidence = true;
      return {
        user_id: userId, profile_id: profile.id, trait_key: t.trait_key, value: clamped,
        band_low: t.band_low, band_high: t.band_high, confidence: t.confidence ?? "medium",
        source: t.source === "user" ? "user" : "learned", evidence_count: t.evidence_count,
      };
    });
  if (rows.length) {
    const ins = await supabase.from("voice_traits").insert(rows);
    if (ins.error) throw ins.error;
  }
  if (needsEvidence) {
    await supabase.from("authority_voice_profiles").update({ readiness: "forming" }).eq("id", profile.id);
  }
  return { profileId: profile.id as string, needsEvidence };
}

/**
 * Remove a mode the member created. Traits first — they hang off the profile.
 * Default and primary rows are the member's voice itself and are never removed.
 */
export async function deleteMode(profileId: string) {
  const { data: row, error: readErr } = await supabase
    .from("authority_voice_profiles")
    .select("id, mode_key, is_primary")
    .eq("id", profileId)
    .maybeSingle();
  if (readErr) throw readErr;
  if (!row) return;
  if (row.is_primary || row.mode_key === "default") {
    throw new Error("Your default voice cannot be removed.");
  }
  const delTraits = await supabase.from("voice_traits").delete().eq("profile_id", profileId);
  if (delTraits.error) throw delTraits.error;
  const del = await supabase.from("authority_voice_profiles").delete().eq("id", profileId);
  if (del.error) throw del.error;
}

/* ── rules ───────────────────────────────────────────────────────────────── */

export async function addRule(userId: string, _profileId: string | null, kind: DnaRule["kind"], text: string, rank: number) {
  const { error } = await supabase
    .from("voice_rules")
    .insert({ user_id: userId, kind, text, source: "user", rank, status: "active" });
  if (error) throw error;
}

export async function updateRuleText(id: string, text: string) {
  const { error } = await supabase.from("voice_rules").update({ text }).eq("id", id);
  if (error) throw error;
}

export async function updateRuleKind(id: string, kind: DnaRule["kind"]) {
  const { error } = await supabase.from("voice_rules").update({ kind }).eq("id", id);
  if (error) throw error;
}

export async function deleteRule(id: string) {
  const { error } = await supabase.from("voice_rules").delete().eq("id", id);
  if (error) throw error;
}

/** One round trip, not one per rule. */
export async function reorderRules(userId: string, _profileId: string | null, ordered: DnaRule[]) {
  if (ordered.length === 0) return;
  const rows = ordered.map((r, i) => ({
    id: r.id, user_id: userId, kind: r.kind, text: r.text, source: r.source, rank: i,
  }));
  const { error } = await supabase.from("voice_rules").upsert(rows, { onConflict: "id" });
  if (error) throw error;
}

/* ── suggested rules ─────────────────────────────────────────────────────── */

/** Accepting puts a rule in force. Only now does generation see it. */
export async function acceptSuggestion(id: string) {
  const { error } = await supabase
    .from("voice_rules")
    .update({ status: "active", decided_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

/** Dismissing is remembered for 90 days by the suggestion function. */
export async function dismissSuggestion(id: string) {
  const { error } = await supabase
    .from("voice_rules")
    .update({ status: "dismissed", decided_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

/** The gateway runs only when the member asks, never on a render. */
export type RuleSource = "openings" | "endings" | "phrases" | "structure" | "absences";

export async function runSuggestRules(sources: RuleSource[]): Promise<{
  written: number;
  posts_read?: number;
  sources_run?: RuleSource[];
  by_source?: Record<string, number>;
}> {
  const { data: session } = await supabase.auth.getSession();
  if (!session.session) throw new Error("Sign in to look for patterns.");
  const { data, error } = await supabase.functions.invoke("voice-suggest-rules", { body: { sources } });
  if (error) throw error;
  return (data ?? { written: 0 }) as {
    written: number; posts_read?: number; sources_run?: RuleSource[]; by_source?: Record<string, number>;
  };
}
