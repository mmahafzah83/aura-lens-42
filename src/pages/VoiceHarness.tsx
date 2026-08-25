/**
 * Dev harness for the Voice states — the same pattern as
 * SignatureHarness. It renders the page against hand-built models so the
 * empty states can be reviewed without owning an account in that state.
 * Nothing here is reachable from the product navigation.
 */
import YourVoice from "@/components/voice/YourVoice";
import VoiceWorkspace from "@/components/voice/VoiceWorkspace";
import TestImprove from "@/components/voice/TestImprove";
import WhatWorked from "@/components/voice/WhatWorked";
import type { VoiceDnaModel } from "@/lib/voiceDna";
import { buildRecommendation, type VoiceOverviewModel } from "@/lib/voiceOverview";
import type { WhatWorkedModel } from "@/lib/voiceOutcomes";

/* ── What worked states ──────────────────────────────────────────────────── */

/** The founder's real shape today: metrics exist, but none on a post Aura reads. */
const WORKED_NONE: WhatWorkedModel = {
  outcomes: [],
  excludedCounts: { no_text: 116, no_metrics_yet: 41, not_own_writing: 36 },
  learningOn: true,
  traitFindings: [],
  styleFindings: [],
  learningSinceDays: 479,
  postsRead: 41,
  correctionsApplied: 0,
  proposalsConfirmed: 0,
  proposalsRejected: 0,
};

const WORKED_SIGNAL: WhatWorkedModel = {
  outcomes: Array.from({ length: 18 }, (_, i) => ({
    post_id: `p${i}`,
    performance_index: [0.7, 1.4, 0.9, 2.1, 0.8, 1.1, 1.6, 0.6, 1.2, 0.95, 1.8, 0.75, 1.35, 1.05, 0.85, 1.5, 1.15, 0.9][i],
    sample_traits: { evidence_density: 40 + i * 2 },
    hook_style: i % 3 === 0 ? "number_first" : "contrarian_claim",
    ending_type: "question",
    published_at: new Date(Date.now() - (18 - i) * 7 * 864e5).toISOString(),
  })),
  excludedCounts: { too_new: 2 },
  learningOn: true,
  traitFindings: [{
    kind: "trait", trait_key: "evidence_density", raise: true, topN: 6, bottomN: 6,
    topTraitMedian: 66, bottomTraitMedian: 47, topPerfMedian: 1.55, bottomPerfMedian: 0.72,
    ratio: 2.4, effect: 1.9, gap: 19,
  }],
  styleFindings: [{ kind: "hook", style: "number_first", n: 8, ratio: 1.6 }],
  learningSinceDays: 512,
  postsRead: 41,
  correctionsApplied: 3,
  proposalsConfirmed: 1,
  proposalsRejected: 1,
};

function make(partial: Partial<VoiceOverviewModel>): VoiceOverviewModel {
  const base = {
    hasProfile: false,
    profileId: null,
    readiness: "forming" as const,
    corpusCount: 0,
    freshnessDays: null,
    windowSize: 0,
    windowClassified: 0,
    windowDist: {},
    diversity: null,
    topShare: null,
    topStyleKey: null,
    topStyleCount: null,
    otherDominant: false,
    traits: [],
    computableComputed: 0,
    computableHigh: 0,
    changes: [],
    ...partial,
  };
  return { ...base, recommendation: buildRecommendation(base), recommendationDismissed: false };
}

const STATES: { title: string; model: VoiceOverviewModel }[] = [
  { title: "A — no profile, no posts", model: make({}) },
  {
    title: "B — profile exists, 5 posts",
    model: make({
      hasProfile: true, profileId: "x", corpusCount: 5, freshnessDays: 12,
      windowSize: 5, windowClassified: 3, windowDist: { contrarian_claim: 2, question: 1 },
      computableComputed: 2, computableHigh: 1,
      traits: [{
        trait_key: "length", display_name: "Length", value: 19, confidence: "low", source: "learned",
        computable: true, min_evidence: 8, updated_at: new Date().toISOString(), last_confirmed_at: null, evidence_count: 5,
      }],
    }),
  },
  {
    title: "C — full profile",
    model: make({
      hasProfile: true, profileId: "y", readiness: "reliable", corpusCount: 41, freshnessDays: 31,
      windowSize: 12, windowClassified: 12,
      windowDist: { contrarian_claim: 7, announcement: 2, number_first: 1, other: 1, question: 1 },
      diversity: 63.4, topShare: 58.3, topStyleKey: "contrarian_claim", topStyleCount: 7, computableComputed: 5, computableHigh: 4,
      changes: [
        { at: new Date().toISOString(), emphasis: "Length", text: " was measured at 20 from your posts, confidence high." },
        { at: new Date(Date.now() - 86400000).toISOString(), emphasis: "Readiness", text: " was recalculated to Reliable from 41 posts." },
      ],
      traits: [{
        trait_key: "pace", display_name: "Pace", value: 94, confidence: "high", source: "learned",
        computable: true, min_evidence: 8, updated_at: new Date().toISOString(), last_confirmed_at: null, evidence_count: 5,
      }],
    }),
  },
];

/* ── Voice DNA states ────────────────────────────────────────────────────── */
const DNA_EMPTY: VoiceDnaModel = {
  hasProfile: false, activeProfileId: null, activeLanguage: null, traits: [], modes: [], rules: [], suggestions: [],
  windowSize: 0, windowClassified: 0, windowDist: {}, endingDist: {}, endingClassified: 0,
  diversity: null, topShare: null, topStyleKey: null, topStyleCount: null,
};

const DNA_THIN: VoiceDnaModel = {
  activeLanguage: "en",
  hasProfile: true,
  activeProfileId: "p1",
  traits: [
    {
      trait_key: "pace", display_name: "Pace", pole_low: "Flowing", pole_high: "Clipped", group_key: "structure",
      computable: true, min_evidence: 8, sort_order: 50, id: "t1", value: 61, band_low: 48, band_high: 74,
      learned_value: 61, confidence: "low", source: "learned", locked: false, evidence_count: 5, last_confirmed_at: null,
    },
    {
      trait_key: "warmth", display_name: "Warmth", pole_low: "Cool / analytical", pole_high: "Warm / personal",
      group_key: "sound", computable: false, min_evidence: 8, sort_order: 20, id: null, value: null,
      band_low: null, band_high: null, learned_value: null, confidence: null, source: null, locked: false,
      evidence_count: null, last_confirmed_at: null,
    },
  ],
  modes: [
    { key: "executive", label: "Executive", blurb: "For board notes and results — shorter, harder on evidence.", profileId: null, readiness: null, needsEvidence: false, language: null, removable: false },
    { key: "personal", label: "Personal", blurb: "For the story only you can tell — warmer, less data.", profileId: null, readiness: null, needsEvidence: false, language: null, removable: false },
  ],
  rules: [],
  // A proposal, not a rule — the strip renders it with its evidence line.
  suggestions: [{
    id: "s1", kind: "never", text: `Never close with "What are your thoughts?"`, source: "aura", rank: 1000,
    status: "suggested", evidence: { post_ids: [], count: 0, total: 42, note: "Never appears in your writing", derivation: "rule" },
  }],
  windowSize: 5, windowClassified: 3, windowDist: { question: 2, announcement: 1 },
  endingDist: { cta: 1 }, endingClassified: 1,
  diversity: null, topShare: null, topStyleKey: null, topStyleCount: null,
};

export default function VoiceHarness() {
  return (
    <div style={{ padding: 24, background: "#F7F9FC", minHeight: "100vh" }}>
      <div style={{ marginBlockEnd: 32 }}>
        <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: "#5B6673", marginBlockEnd: 8 }}>
          SUB-NAVIGATION
        </div>
        <VoiceWorkspace userId={null} onWrite={() => {}} />
      </div>
      {STATES.map((s) => (
        <div key={s.title} style={{ marginBlockEnd: 32 }}>
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: "#5B6673", marginBlockEnd: 8 }}>
            {s.title.toUpperCase()}
          </div>
          <YourVoice userId={null} onNavigate={() => {}} modelOverride={{ overview: s.model, dna: DNA_THIN }} />
        </div>
      ))}

      {[{ title: "TEST A — nothing measured", model: DNA_EMPTY }, { title: "TEST B — measured, thin window", model: DNA_THIN }].map((s) => (
        <div key={s.title} style={{ marginBlockEnd: 32 }}>
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: "#5B6673", marginBlockEnd: 8 }}>
            {s.title.toUpperCase()}
          </div>
          <TestImprove userId={null} onWrite={() => {}} onNavigate={() => {}} modelOverride={s.model} />
        </div>
      ))}

      {[{ title: "WORKED A — no signal (founder, today)", model: WORKED_NONE },
        { title: "WORKED B — a clear pattern", model: WORKED_SIGNAL }].map((s) => (
        <div key={s.title} style={{ marginBlockEnd: 32 }}>
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: "#5B6673", marginBlockEnd: 8 }}>
            {s.title.toUpperCase()}
          </div>
          <WhatWorked
            userId={null} traits={DNA_THIN.traits} onConfirm={() => {}} onReject={() => {}} modelOverride={s.model}
          />
        </div>
      ))}

    </div>
  );
}