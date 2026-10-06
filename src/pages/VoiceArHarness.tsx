/** TEMPORARY Batch 9a screenshot harness — delete after use. */
import YourVoice from "@/components/voice/YourVoice";
import WhatWorked from "@/components/voice/WhatWorked";
import VoiceStyles from "@/components/voice/VoiceStyles";
import { supabase } from "@/integrations/supabase/client";
import type { VoiceDnaModel, DnaTrait } from "@/lib/voiceDna";
import { buildRecommendation, type VoiceOverviewModel } from "@/lib/voiceOverview";
import type { WhatWorkedModel } from "@/lib/voiceOutcomes";

const now = new Date().toISOString();
const tr = (k: string, name: string, lo: string, hi: string, g: string, v: number | null, src: string | null, extra: Partial<DnaTrait> = {}): DnaTrait => ({
  trait_key: k, display_name: name, pole_low: lo, pole_high: hi, group_key: g, computable: v !== null, min_evidence: 8, sort_order: 10,
  id: v === null ? null : `t-${k}`, value: v, band_low: v === null ? null : v - 12, band_high: v === null ? null : v + 12,
  learned_value: v, confidence: v === null ? null : "high", source: src, locked: false, evidence_count: v === null ? null : 24,
  last_confirmed_at: src === "user" ? "2026-09-21T10:00:00Z" : null, ...extra,
});

const TRAITS: DnaTrait[] = [
  tr("directness", "Directness", "Diplomatic", "Direct", "sound", 72, "learned"),
  tr("warmth", "Warmth", "Cool / analytical", "Warm / personal", "sound", 38, "user", { locked: true }),
  tr("challenge", "Challenge", "Reassuring", "Challenging", "sound", 55, "aura", { learned_value: 48 }),
  tr("evidence_density", "Evidence density", "Narrative", "Data-led", "structure", 64, "learned"),
  tr("pace", "Pace", "Flowing", "Clipped", "structure", 61, "learned"),
  tr("formality", "Formality", "Conversational", "Formal", "structure", null, null),
  tr("length", "Length", "800 chars", "2,600 chars", "structure", 40, "learned"),
  tr("emoji", "Emoji", "None", "Frequent", "language", 5, "learned"),
  tr("language_mix", "Language mix", "All English", "All Arabic", "language", 30, "learned"),
];

const DNA_FULL: VoiceDnaModel = {
  hasProfile: true, activeProfileId: "p1", activeLanguage: "en", traits: TRAITS,
  modes: [
    { key: "default", label: "Your default voice", blurb: "", profileId: "p1", readiness: "reliable", needsEvidence: false, language: "en", removable: false },
    { key: "executive", label: "Executive", blurb: "", profileId: "p2", readiness: "developing", needsEvidence: true, language: "en", removable: true },
    { key: "personal", label: "Personal", blurb: "", profileId: null, readiness: null, needsEvidence: false, language: null, removable: false },
  ],
  rules: [
    { id: "r1", kind: "always", text: "Open with the decision, then the reason.", source: "user", rank: 1, times_applied: 7 },
    { id: "r2", kind: "always", text: "ابدأ بالرقم ثم المعنى.", source: "learned", rank: 2, times_applied: 2 },
    { id: "r3", kind: "always", text: "One idea per post.", source: "aura", rank: 3, times_applied: 0 },
    { id: "r4", kind: "always", text: "Name the trade-off.", source: "user", rank: 4, times_applied: 1 },
    { id: "r5", kind: "never", text: "game-changer", source: "user", rank: 1, times_applied: 3, check: null },
  ],
  suggestions: [
    { id: "s1", kind: "never", text: "Exclamation marks", source: "aura", rank: 1, evidence: { count: 0 } },
    { id: "s2", kind: "always", text: "End on a question", source: "aura", rank: 2, evidence: { count: 9, post_ids: [] } },
  ],
  windowSize: 12, windowClassified: 12,
  windowDist: { contrarian_claim: 7, announcement: 2, number_first: 1, other: 1, question: 1 },
  endingDist: { question: 6, reframe: 3, cta: 2, other: 1 }, endingClassified: 12,
  diversity: 63.4, topShare: 58.3, topStyleKey: "contrarian_claim", topStyleCount: 7,
};

const DNA_EMPTY: VoiceDnaModel = {
  hasProfile: false, activeProfileId: null, activeLanguage: "en", traits: [], modes: [], rules: [], suggestions: [],
  windowSize: 0, windowClassified: 0, windowDist: {}, endingDist: {}, endingClassified: 0,
  diversity: null, topShare: null, topStyleKey: null, topStyleCount: null,
};

function make(p: Partial<VoiceOverviewModel>): VoiceOverviewModel {
  const base = {
    hasProfile: false, profileId: null, readiness: "forming" as const, corpusCount: 0, freshnessDays: null,
    windowSize: 0, windowClassified: 0, windowDist: {}, diversity: null, topShare: null, topStyleKey: null,
    topStyleCount: null, otherDominant: false, traits: [], computableComputed: 0, computableHigh: 0, changes: [], ...p,
  };
  return { ...base, recommendation: buildRecommendation(base), recommendationDismissed: false } as VoiceOverviewModel;
}

const OV_FULL = make({
  hasProfile: true, profileId: "p1", readiness: "reliable", corpusCount: 41, freshnessDays: 31,
  windowSize: 12, windowClassified: 12, windowDist: DNA_FULL.windowDist, diversity: 63.4, topShare: 58.3,
  topStyleKey: "contrarian_claim", topStyleCount: 7, computableComputed: 7, computableHigh: 5,
  traits: TRAITS.map((t) => ({ ...t, updated_at: now })) as unknown as VoiceOverviewModel["traits"],
});

const WORKED: WhatWorkedModel = {
  outcomes: Array.from({ length: 18 }, (_, i) => ({
    post_id: `p${i}`, performance_index: 1, sample_traits: {}, hook_style: "number_first", ending_type: "question", published_at: now,
  })),
  excludedCounts: { too_new: 2, no_text: 4 }, learningOn: true,
  traitFindings: [{ kind: "trait", trait_key: "evidence_density", raise: true, topN: 6, bottomN: 6, topTraitMedian: 66, bottomTraitMedian: 47, topPerfMedian: 1.55, bottomPerfMedian: 0.72, ratio: 2.4, effect: 1.9, gap: 19 }],
  styleFindings: [{ kind: "hook", style: "number_first", n: 8, ratio: 1.6 }],
  learningSinceDays: 512, postsRead: 41, correctionsApplied: 0, proposalsConfirmed: 0, proposalsRejected: 0,
} as unknown as WhatWorkedModel;

const s = new URLSearchParams(window.location.search).get("s") ?? "full";
if (s === "error") {
  (supabase as unknown as { from: () => never }).from = () => { throw new Error("Failed to fetch"); };
}

export default function VoiceArHarness() {
  return (
    <div className="voice-os" style={{ maxInlineSize: 1100, margin: "0 auto", padding: 16 }}>
      <VoiceStyles />
      {s === "full" && (
        <>
          <YourVoice userId={null} onNavigate={() => {}} modelOverride={{ overview: OV_FULL, dna: DNA_FULL }} />
          <WhatWorked userId={null} traits={TRAITS} onConfirm={() => {}} onReject={() => {}} modelOverride={WORKED} />
        </>
      )}
      {s === "empty" && <YourVoice userId={null} onNavigate={() => {}} modelOverride={{ overview: make({}), dna: DNA_EMPTY }} />}
      {s === "error" && <YourVoice userId="00000000-0000-0000-0000-000000000000" onNavigate={() => {}} />}
    </div>
  );
}
