/**
 * Coverage — what evidence Aura is missing.
 *
 * Counts, thresholds and the gap sentence all come from `teachAura.ts`. This
 * component renders them and nothing else; moving a threshold is a constant
 * change, not a component change.
 */
import {
  MIN_POSTS_FOR_COVERAGE,
  biggestGapSentence,
  type CoverageRow,
  type CoverageStatus,
} from "@/lib/teachAura";

const LINE = "#E2E7EE";
const INK = "#0F1519";
const MUTED = "#5B6673";
const MONO = "'IBM Plex Mono', ui-monospace, monospace";

const CHIP: Record<CoverageStatus, { bg: string; fg: string; border: string; label: string }> = {
  sufficient: { bg: "#EAF6F0", fg: "#12805C", border: "#BFE3D3", label: "Sufficient" },
  thin: { bg: "#FBF4E4", fg: "#9A6F12", border: "#F0DFB4", label: "Thin" },
  missing: { bg: "#FBEDEB", fg: "#C0392B", border: "#F1CFCA", label: "Missing" },
};

export default function TeachAuraCoverage({
  coverage,
  includedCount,
}: {
  coverage: CoverageRow[];
  includedCount: number;
}) {
  const gap = biggestGapSentence({ coverage, includedCount });

  return (
    <section style={{ marginBlockStart: 20 }}>
      <h3 style={{ fontSize: 15, fontWeight: 600, color: INK, margin: "0 0 8px" }}>
        What evidence is missing
      </h3>
      <div style={{ background: "#FFFFFF", border: `1px solid ${LINE}`, borderRadius: 16, padding: 16 }}>
        {coverage.map((row, i) => {
          const chip = CHIP[row.status];
          const pct = Math.min(100, Math.round((row.count / row.threshold) * 100));
          return (
            <div
              key={row.key}
              style={{
                display: "grid", gridTemplateColumns: "minmax(0,1fr) 90px", gap: 12, alignItems: "center",
                paddingBlock: 10, borderBlockStart: i === 0 ? "none" : `1px solid ${LINE}`,
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
                  <span style={{ fontSize: 13.5, fontWeight: 600, color: INK }}>{row.label}</span>
                  <span style={{ fontFamily: MONO, fontSize: 12.5, color: MUTED }}>
                    {row.count} / {row.threshold}
                  </span>
                </div>
                <div style={{ blockSize: 6, borderRadius: 999, background: "#EDF1F6", marginBlockStart: 8 }}>
                  <div style={{ inlineSize: `${pct}%`, blockSize: "100%", borderRadius: 999, background: chip.fg }} />
                </div>
              </div>
              <span
                style={{
                  justifySelf: "end", fontSize: 11.5, fontWeight: 600, padding: "3px 8px", borderRadius: 999,
                  background: chip.bg, color: chip.fg, border: `1px solid ${chip.border}`,
                }}
              >
                {chip.label}
              </span>
            </div>
          );
        })}
      </div>
      <p style={{ fontSize: 13, color: MUTED, lineHeight: 1.65, marginBlockStart: 10 }}>
        {gap ?? `Aura needs at least ${MIN_POSTS_FOR_COVERAGE} posts before it can judge coverage.`}
      </p>
    </section>
  );
}