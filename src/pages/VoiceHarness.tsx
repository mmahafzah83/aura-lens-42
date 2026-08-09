/**
 * Dev harness for the Voice Overview states — the same pattern as
 * SignatureHarness. It renders the page against hand-built models so the
 * empty states can be reviewed without owning an account in that state.
 * Nothing here is reachable from the product navigation.
 */
import VoiceOverview from "@/components/voice/VoiceOverview";
import VoiceWorkspace from "@/components/voice/VoiceWorkspace";
import VoiceDna from "@/components/voice/VoiceDna";
import TestImprove from "@/components/voice/TestImprove";
import type { VoiceDnaModel } from "@/lib/voiceDna";
import { buildRecommendation, type VoiceOverviewModel } from "@/lib/voiceOverview";

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
  hasProfile: false, activeProfileId: null, traits: [], modes: [], rules: [],
  windowSize: 0, windowClassified: 0, windowDist: {}, endingDist: {}, endingClassified: 0,
  diversity: null, topShare: null, topStyleKey: null, topStyleCount: null,
};

const DNA_THIN: VoiceDnaModel = {
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
    { key: "executive", label: "Executive", blurb: "For board notes and results — shorter, harder on evidence.", profileId: null, readiness: null, needsEvidence: false },
    { key: "personal", label: "Personal", blurb: "For the story only you can tell — warmer, less data.", profileId: null, readiness: null, needsEvidence: false },
  ],
  rules: [],
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
          <VoiceOverview userId={null} onNavigate={() => {}} modelOverride={s.model} />
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

      {[{ title: "DNA A — no profile", model: DNA_EMPTY }, { title: "DNA B — thin profile", model: DNA_THIN }].map((s) => (
        <div key={s.title} style={{ marginBlockEnd: 32 }}>
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: "#5B6673", marginBlockEnd: 8 }}>
            {s.title.toUpperCase()}
          </div>
          <VoiceDna userId={null} onNavigate={() => {}} modelOverride={s.model} />
        </div>
      ))}
    </div>
  );
}