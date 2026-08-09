/**
 * Dev harness for the Voice Overview states — the same pattern as
 * SignatureHarness. It renders the page against hand-built models so the
 * empty states can be reviewed without owning an account in that state.
 * Nothing here is reachable from the product navigation.
 */
import VoiceOverview from "@/components/voice/VoiceOverview";
import VoiceWorkspace from "@/components/voice/VoiceWorkspace";
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
      hasProfile: true, profileId: "y", readiness: "distinctive", corpusCount: 41, freshnessDays: 31,
      windowSize: 12, windowClassified: 12,
      windowDist: { contrarian_claim: 7, announcement: 2, number_first: 1, other: 1, question: 1 },
      diversity: 63.4, topShare: 58.3, topStyleKey: "contrarian_claim", topStyleCount: 7, computableComputed: 5, computableHigh: 4,
      changes: [
        { at: new Date().toISOString(), emphasis: "Length", text: " was measured at 20 from your posts, confidence high." },
        { at: new Date(Date.now() - 86400000).toISOString(), emphasis: "Readiness", text: " was recalculated to Distinctive from 41 posts." },
      ],
      traits: [{
        trait_key: "pace", display_name: "Pace", value: 94, confidence: "high", source: "learned",
        computable: true, min_evidence: 8, updated_at: new Date().toISOString(), last_confirmed_at: null, evidence_count: 5,
      }],
    }),
  },
];

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
    </div>
  );
}