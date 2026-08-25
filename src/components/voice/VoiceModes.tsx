/**
 * Voice modes — the same `authority_voice_profiles` rows, not a parallel system.
 *
 * The whole card is the control, because that is what people press. A preset
 * with no row cannot be selected: it is visibly inert and offers Create.
 */
import { READINESS_LABEL, READINESS_ORDER, type Readiness } from "@/lib/voiceOverview";
import {
  BLUE, CYAN, INK, LINE, MUTED, RADIUS, SURFACE, TYPE, WHITE, cardStyle, chipStyle, microLabel, monoNum,
} from "@/components/voice/tokens";
import InfoTooltip from "@/components/voice/InfoTooltip";
import type { DnaMode } from "@/lib/voiceDna";

function MiniRail({ readiness }: { readiness: string | null }) {
  const idx = READINESS_ORDER.indexOf((readiness ?? "forming") as Readiness);
  return (
    <div style={{ display: "flex", gap: 3, marginBlockStart: 8 }} aria-hidden>
      {READINESS_ORDER.map((r, i) => (
        <div key={r} style={{ flex: 1, blockSize: 3, borderRadius: RADIUS.rail, background: i <= idx ? CYAN : "#E4E9F0" }} />
      ))}
    </div>
  );
}

export default function VoiceModes({
  modes, activeProfileId, busy, onSelect, onCreate, onRemove,
}: {
  modes: DnaMode[];
  activeProfileId: string | null;
  busy: boolean;
  onSelect: (profileId: string) => void;
  onCreate: (key: string) => void;
  onRemove: (mode: DnaMode) => void;
}) {
  return (
    <section style={{ marginBlockStart: 16 }}>
      <div style={{ ...microLabel, display: "flex", alignItems: "center", gap: 6 }}>
        <span>Voice modes</span>
        <InfoTooltip
          term="Voice modes"
          body="A mode is the same voice, tuned for one job. It shifts a few of your markers — never outside the range your own posts prove — and you pick it in the composer when you write. Your default voice is unchanged."
        />
      </div>
      <div className="vd-modes" role="radiogroup" aria-label="Voice modes" style={{ marginBlockStart: 10 }}>
        {modes.map((m) => {
          const set = Boolean(m.profileId);
          const on = set && m.profileId === activeProfileId;
          const choose = () => { if (set && !busy && !on) onSelect(m.profileId as string); };
          return (
            <div
              key={m.key}
              role={set ? "radio" : undefined}
              aria-checked={set ? on : undefined}
              aria-disabled={set ? undefined : true}
              tabIndex={set ? (on ? 0 : -1) : undefined}
              onClick={choose}
              onKeyDown={(e) => {
                if (!set) return;
                if (e.key === "Enter" || e.key === " ") { e.preventDefault(); choose(); }
              }}
              style={{
                ...cardStyle,
                padding: 14,
                background: set ? WHITE : SURFACE,
                borderStyle: set ? "solid" : "dashed",
                borderColor: on ? BLUE : LINE,
                boxShadow: on ? "0 0 0 3px rgba(6,112,196,.10)" : "none",
                cursor: set && !on ? "pointer" : "default",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: TYPE.bodyLg, fontWeight: 600, color: set ? INK : MUTED }}>{m.label}</span>
                {m.needsEvidence && <span style={chipStyle("#9A6F12", "#FBF4E4", "#F0DFB4")}>Needs evidence</span>}
              </div>
              <div style={{ ...monoNum, fontSize: TYPE.micro, letterSpacing: ".08em", textTransform: "uppercase", color: MUTED, marginBlockStart: 4 }}>
                {set ? READINESS_LABEL[(m.readiness ?? "forming") as Readiness] : "Not set up"}
              </div>
              {set && <MiniRail readiness={m.readiness} />}
              <p style={{ fontSize: TYPE.small, color: MUTED, lineHeight: 1.5, marginBlockStart: 8, marginBlockEnd: 10 }}>{m.blurb}</p>
              {set ? (
                <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  <span style={{ ...monoNum, fontSize: TYPE.caption, color: on ? BLUE : MUTED }}>
                    {on ? "Showing this mode" : "Press to show this mode"}
                  </span>
                  {m.removable && (
                    <button
                      type="button"
                      className="vd-act"
                      disabled={busy}
                      onClick={(e) => { e.stopPropagation(); onRemove(m); }}
                    >
                      Remove
                    </button>
                  )}
                </div>
              ) : (
                <button
                  type="button"
                  className="vd-act"
                  disabled={busy}
                  onClick={(e) => { e.stopPropagation(); onCreate(m.key); }}
                >
                  Create
                </button>
              )}
            </div>
          );
        })}
      </div>
      <p style={{ fontSize: TYPE.small, color: MUTED, lineHeight: 1.6, marginBlockStart: 10, marginBlockEnd: 0 }}>
        Your DNA stays fixed. A mode shifts a few traits within the range your own writing already proves — it never invents a register you've never used.
      </p>
    </section>
  );
}
