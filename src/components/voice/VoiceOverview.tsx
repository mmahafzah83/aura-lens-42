/**
 * Voice Overview — the honest state of the member's voice.
 *
 * Every number here is read from the database through `loadVoiceOverview`,
 * which routes all "recent" figures through the canonical window. Where a
 * value is unknown this page says so in words; it never renders 0%, an em
 * dash, or a grey placeholder in place of a fact it does not have.
 *
 * Chrome is English throughout. Data values carry `dir="auto"`.
 */
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import VoiceMicBadge from "@/components/voice/VoiceMicBadge";
import {
  loadVoiceOverview, dismissRecommendation, readinessSentence,
  READINESS_LABEL, READINESS_ORDER, type VoiceOverviewModel, type Readiness,
} from "@/lib/voiceOverview";

/* ── System-B tokens ─────────────────────────────────────────────────────── */
const NIGHT = "#0F1519";
const CYAN = "#00CEC9";
const BLUE = "#0670C4";
const LINE = "#E2E7EE";
const MUTED = "#5B6673";
const MUTED_NIGHT = "#8A97A6";
const INK = "#0F1519";
const GREEN = "#12805C";
const AMBER = "#E0A82E";
const RED = "#C0392B";
const MONO = "'IBM Plex Mono', ui-monospace, monospace";

const monoNum: React.CSSProperties = { fontFamily: MONO, fontVariantNumeric: "tabular-nums" };
const cardStyle: React.CSSProperties = {
  background: "#FFFFFF", border: `1px solid ${LINE}`, borderRadius: 16, padding: 16,
};
const microLabel: React.CSSProperties = {
  fontSize: 10.5, fontWeight: 600, letterSpacing: ".16em", textTransform: "uppercase", color: MUTED,
};

type Band = "good" | "watch" | "weak";
const BAND_COLOUR: Record<Band, string> = { good: GREEN, watch: AMBER, weak: RED };

interface Health {
  label: string;
  /** null = genuinely unknown; the card then says so in words. */
  value: number | null;
  unit: string;
  explain: string;
  band: Band;
  /** 0–1 fill of the track; null when the value is unknown. */
  fill: number | null;
  unknownText: string;
}

function HealthCard({ h }: { h: Health }) {
  const colour = BAND_COLOUR[h.band];
  return (
    <div style={cardStyle}>
      <div style={microLabel}>{h.label}</div>
      {h.value === null ? (
        <div style={{ fontSize: 15, fontWeight: 600, color: MUTED, marginBlockStart: 8 }}>{h.unknownText}</div>
      ) : (
        <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBlockStart: 8 }}>
          <span style={{ ...monoNum, fontSize: 26, fontWeight: 700, color: colour, lineHeight: 1 }}>{h.value}</span>
          <span style={{ ...monoNum, fontSize: 12, fontWeight: 600, color: colour }}>{h.unit}</span>
        </div>
      )}
      <div
        aria-hidden
        style={{ blockSize: 4, borderRadius: 2, background: "#EDF1F6", marginBlockStart: 12, overflow: "hidden" }}
      >
        {h.fill !== null && (
          <div style={{ blockSize: "100%", inlineSize: `${Math.max(2, Math.min(100, h.fill * 100))}%`, background: colour, borderRadius: 2 }} />
        )}
      </div>
      <p style={{ fontSize: 12, color: MUTED, lineHeight: 1.5, marginBlockStart: 10, marginBlockEnd: 0 }}>{h.explain}</p>
    </div>
  );
}

function buildHealth(m: VoiceOverviewModel): Health[] {
  const coverage: Health = {
    label: "Evidence coverage",
    value: m.corpusCount,
    unit: m.corpusCount === 1 ? "post" : "posts",
    explain: `${m.corpusCount} ${m.corpusCount === 1 ? "post" : "posts"} read. 30 is the threshold for reliable.`,
    band: m.corpusCount >= 30 ? "good" : m.corpusCount >= 8 ? "watch" : "weak",
    fill: Math.min(1, m.corpusCount / 30),
    unknownText: "Nothing read yet",
  };

  const fresh: Health = {
    label: "Freshness",
    value: m.freshnessDays,
    unit: m.freshnessDays === 1 ? "day" : "days",
    explain: m.freshnessDays === null
      ? "No dated sample yet. Voice drifts after about 90 days."
      : `Since your newest sample. Voice drifts after about 90 days.`,
    band: m.freshnessDays === null ? "weak" : m.freshnessDays < 45 ? "good" : m.freshnessDays <= 90 ? "watch" : "weak",
    fill: m.freshnessDays === null ? null : Math.min(1, m.freshnessDays / 90),
    unknownText: "No dated posts yet",
  };

  const consistency: Health = {
    label: "Consistency",
    value: m.computableComputed === 0 ? null : m.computableHigh,
    unit: `of ${m.computableComputed}`,
    explain: m.computableComputed === 0
      ? "Aura has not measured any traits yet."
      : `Your posts agree with each other on ${m.computableHigh} of ${m.computableComputed} measured traits.`,
    band: m.computableComputed === 0
      ? "weak"
      : m.computableHigh / m.computableComputed >= 0.8 ? "good"
      : m.computableHigh / m.computableComputed >= 0.5 ? "watch" : "weak",
    fill: m.computableComputed === 0 ? null : m.computableHigh / m.computableComputed,
    unknownText: "Not enough posts yet",
  };

  const distinctiveness: Health = {
    label: "Distinctiveness",
    value: m.diversity === null ? null : Math.round(m.diversity),
    unit: "%",
    explain: m.diversity === null
      ? `Opener variety needs 8 classified posts in your recent window. You have ${m.windowClassified}.`
      : `How much your openers vary across your last ${m.windowSize} posts. 60% is the bar for distinctive.`,
    band: m.diversity === null ? "weak" : m.diversity >= 60 ? "good" : m.diversity >= 50 ? "watch" : "weak",
    fill: m.diversity === null ? null : m.diversity / 100,
    unknownText: "Not enough posts yet",
  };

  return [coverage, fresh, consistency, distinctiveness];
}

const shortDate = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }).toUpperCase();
};

/* ── Readiness rail ──────────────────────────────────────────────────────── */
function ReadinessRail({ readiness }: { readiness: Readiness }) {
  const idx = Math.max(0, READINESS_ORDER.indexOf(readiness));
  return (
    <div style={{ marginBlockStart: 16 }}>
      <div style={{ display: "flex", gap: 6 }}>
        {READINESS_ORDER.map((r, i) => (
          <div
            key={r}
            style={{
              flex: 1, blockSize: 4, borderRadius: 2,
              background: i <= idx ? CYAN : "#242E36",
              boxShadow: i === idx ? "0 0 0 3px rgba(0,206,201,.18)" : "none",
            }}
          />
        ))}
      </div>
      <div style={{ display: "flex", gap: 6, marginBlockStart: 8 }}>
        {READINESS_ORDER.map((r, i) => (
          <span
            key={r}
            style={{
              ...monoNum, flex: 1, fontSize: 9.5, textTransform: "uppercase", letterSpacing: ".08em",
              color: i === idx ? CYAN : MUTED_NIGHT,
            }}
          >
            {READINESS_LABEL[r]}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ── Page ────────────────────────────────────────────────────────────────── */
export default function VoiceOverview({
  userId,
  onNavigate,
  modelOverride,
}: {
  userId: string | null;
  onNavigate: (tab: "dna" | "teach" | "test") => void;
  /** Harness only: render a known model instead of reading the database. */
  modelOverride?: VoiceOverviewModel;
}) {
  const [model, setModel] = useState<VoiceOverviewModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState(false);

  const load = useCallback(async () => {
    if (modelOverride) { setModel(modelOverride); setLoading(false); return; }
    if (!userId) { setLoading(false); return; }
    setLoading(true);
    try {
      setModel(await loadVoiceOverview(userId));
    } catch (e) {
      console.error("[VoiceOverview] load failed", e);
      toast.error("Couldn't load your voice overview.");
    } finally {
      setLoading(false);
    }
  }, [userId, modelOverride]);

  useEffect(() => { void load(); }, [load]);

  if (loading) {
    return <div style={{ fontSize: 13, color: MUTED, padding: "24px 0" }}>Reading your voice…</div>;
  }
  if (!model) {
    return <div style={{ fontSize: 13, color: MUTED, padding: "24px 0" }}>Sign in to see your voice overview.</div>;
  }

  const nothingRead = model.corpusCount === 0;
  const health = buildHealth(model);
  const reco = model.recommendation;
  const showReco = !model.recommendationDismissed && !dismissed && !nothingRead;

  return (
    <div dir="ltr" style={{ fontFamily: "Inter, system-ui, sans-serif", color: INK }}>
      <style>{`
        .vo-health { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
        .vo-split { display: grid; grid-template-columns: 1.35fr 1fr; gap: 12px; align-items: start; }
        @media (max-width: 860px) {
          .vo-health { grid-template-columns: 1fr; }
          .vo-split { grid-template-columns: 1fr; }
        }
      `}</style>

      {/* B1 — readiness header */}
      <div style={{ background: NIGHT, borderRadius: 24, padding: "20px 22px", display: "flex", gap: 18, alignItems: "flex-start", flexWrap: "wrap" }}>
        <VoiceMicBadge size={56} />
        <div style={{ flex: 1, minInlineSize: 240 }}>
          <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: ".18em", textTransform: "uppercase", color: MUTED_NIGHT }}>
            Voice readiness
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: "#FFFFFF", marginBlockStart: 4 }}>
            {READINESS_LABEL[model.readiness]}
          </div>
          <p style={{ fontSize: 13, lineHeight: 1.6, color: "#C7D2DC", marginBlockStart: 6, marginBlockEnd: 0, maxInlineSize: 620 }}>
            {readinessSentence(model)}
          </p>
          <ReadinessRail readiness={model.readiness} />
        </div>
      </div>

      {/* B5 — nothing read yet */}
      {nothingRead ? (
        <div style={{ ...cardStyle, marginBlockStart: 12 }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>Aura hasn't read anything you've written yet.</div>
          <p style={{ fontSize: 13, color: MUTED, lineHeight: 1.6, marginBlockStart: 6 }}>
            Import your LinkedIn posts or paste something you wrote, and Aura will start measuring your voice.
          </p>
          <button
            type="button"
            onClick={() => onNavigate("teach")}
            style={{
              marginBlockStart: 4, background: BLUE, color: "#FFFFFF", border: "none", borderRadius: 10,
              padding: "9px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer",
            }}
          >
            Teach Aura
          </button>
        </div>
      ) : (
        <>
          {/* B2 — health indicators */}
          <div className="vo-health" style={{ marginBlockStart: 12 }}>
            {health.map((h) => <HealthCard key={h.label} h={h} />)}
          </div>

          <div className="vo-split" style={{ marginBlockStart: 12 }}>
            {/* B3 — recent changes */}
            <div style={cardStyle}>
              <div style={microLabel}>Recent changes</div>
              {model.changes.length === 0 ? (
                <p style={{ fontSize: 13, color: MUTED, lineHeight: 1.6, marginBlockStart: 10, marginBlockEnd: 0 }}>
                  Nothing has changed yet. Aura logs every adjustment here.
                </p>
              ) : (
                <ul style={{ listStyle: "none", margin: "10px 0 0", padding: 0 }}>
                  {model.changes.map((c, i) => (
                    <li key={`${c.at}-${i}`} style={{ display: "flex", gap: 10, padding: "8px 0", borderBlockStart: i === 0 ? "none" : `1px solid ${LINE}` }}>
                      <span style={{ ...monoNum, inlineSize: 62, flex: "0 0 62px", fontSize: 11, color: MUTED }}>
                        {shortDate(c.at)}
                      </span>
                      <span dir="auto" style={{ fontSize: 13, lineHeight: 1.55, color: INK }}>
                        <strong style={{ fontWeight: 600 }}>{c.emphasis}</strong>{c.text}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* B4 — one recommendation */}
            {showReco && (
              <div style={{ ...cardStyle, borderInlineStart: `3px solid ${AMBER}` }}>
                <div style={microLabel}>Top recommendation</div>
                <p dir="auto" style={{ fontSize: 13.5, lineHeight: 1.6, color: INK, marginBlockStart: 8, marginBlockEnd: 0 }}>
                  {reco.text}
                </p>
                {reco.actionLabel && reco.actionTab && (
                  <div style={{ display: "flex", gap: 8, marginBlockStart: 12, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      onClick={() => onNavigate(reco.actionTab!)}
                      style={{
                        background: BLUE, color: "#FFFFFF", border: "none", borderRadius: 10,
                        padding: "8px 14px", fontSize: 12.5, fontWeight: 600, cursor: "pointer",
                      }}
                    >
                      {reco.actionLabel}
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        setDismissed(true);
                        if (userId) await dismissRecommendation(userId, reco.key);
                      }}
                      style={{
                        background: "transparent", color: MUTED, border: `1px solid ${LINE}`, borderRadius: 10,
                        padding: "8px 14px", fontSize: 12.5, fontWeight: 600, cursor: "pointer",
                      }}
                    >
                      Not now
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}