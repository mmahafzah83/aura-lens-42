/**
 * Voice modes — the same `authority_voice_profiles` rows, not a parallel system.
 *
 * A mode the member has never created has no profile row, so it renders as an
 * outlined "Not set up" card. When one is created its trait values are clamped
 * into the band the member's own writing proves (see `createMode`), which is
 * what makes the sentence under the grid true.
 */
import { READINESS_LABEL, READINESS_ORDER, type Readiness } from "@/lib/voiceOverview";
import { BLUE, CYAN, INK, LINE, MUTED, cardStyle, microLabel, monoNum, ghostButton } from "@/components/voice/tokens";
import type { DnaMode } from "@/lib/voiceDna";

function MiniRail({ readiness }: { readiness: string | null }) {
  const idx = READINESS_ORDER.indexOf((readiness ?? "forming") as Readiness);
  return (
    <div style={{ display: "flex", gap: 3, marginBlockStart: 8 }} aria-hidden>
      {READINESS_ORDER.map((r, i) => (
        <div key={r} style={{ flex: 1, blockSize: 3, borderRadius: 2, background: i <= idx ? CYAN : "#E4E9F0" }} />
      ))}
    </div>
  );
}

export default function VoiceModes({
  modes, activeProfileId, busy, onSelect, onCreate,
}: {
  modes: DnaMode[];
  activeProfileId: string | null;
  busy: boolean;
  onSelect: (profileId: string) => void;
  onCreate: (key: string) => void;
}) {
  return (
    <section style={{ marginBlockStart: 12 }}>
      <div style={microLabel}>Voice modes</div>
      <div className="vd-modes" style={{ marginBlockStart: 10 }}>
        {modes.map((m) => {
          const set = Boolean(m.profileId);
          const on = set && m.profileId === activeProfileId;
          return (
            <div
              key={m.key}
              style={{
                ...cardStyle,
                padding: 14,
                borderStyle: set ? "solid" : "dashed",
                borderColor: on ? BLUE : LINE,
                boxShadow: on ? "0 0 0 3px rgba(6,112,196,.10)" : "none",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: INK }}>{m.label}</span>
                {m.needsEvidence && (
                  <span style={{ ...monoNum, fontSize: 10, color: "#9A6F12", background: "#FBF4E4", border: "1px solid #F0DFB4", borderRadius: 6, padding: "1px 6px", textTransform: "uppercase" }}>
                    Needs evidence
                  </span>
                )}
              </div>
              <div style={{ ...monoNum, fontSize: 10.5, letterSpacing: ".08em", textTransform: "uppercase", color: MUTED, marginBlockStart: 4 }}>
                {set ? READINESS_LABEL[(m.readiness ?? "forming") as Readiness] : "Not set up"}
              </div>
              {set && <MiniRail readiness={m.readiness} />}
              <p style={{ fontSize: 12, color: MUTED, lineHeight: 1.5, marginBlockStart: 8, marginBlockEnd: 10 }}>{m.blurb}</p>
              <button
                type="button"
                disabled={busy || on}
                style={{ ...ghostButton, opacity: busy || on ? 0.6 : 1 }}
                onClick={() => (set ? onSelect(m.profileId as string) : onCreate(m.key))}
              >
                {on ? "Showing" : set ? "Show this mode" : "Create"}
              </button>
            </div>
          );
        })}
      </div>
      <p style={{ fontSize: 12, color: MUTED, lineHeight: 1.6, marginBlockStart: 10, marginBlockEnd: 0 }}>
        Your DNA stays fixed. A mode shifts a few traits within the range your own writing already proves — it never invents a register you've never used.
      </p>
    </section>
  );
}