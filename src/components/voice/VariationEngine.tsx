/**
 * The variation engine.
 *
 * Every figure comes from `voice_window()`, `voice_opener_diversity()` and
 * `voice_top_style_share()` via the loader — nothing is recounted here. All
 * seven styles render, including the ones at zero, because an unused opener is
 * the recommendation.
 */
import { useState } from "react";
import { BLUE, GREEN, INK, LINE, MUTED, RED, cardStyle, microLabel, monoNum } from "@/components/voice/tokens";
import { ENDING_KEYS, ENDING_NAME, HOOK_KEYS, HOOK_NAME, variationSentence, type VoiceDnaModel } from "@/lib/voiceDna";

const AMBER_CHIP = "#9A6F12";

function risk(share: number): { label: string; colour: string; bg: string } {
  if (share > 40) return { label: "Repetitive", colour: RED, bg: "#FBEDEB" };
  if (share >= 25) return { label: "Watch", colour: AMBER_CHIP, bg: "#FBF4E4" };
  if (share > 0) return { label: "Healthy", colour: GREEN, bg: "#E8F5EF" };
  return { label: "Unused", colour: BLUE, bg: "#EAF3FB" };
}

function Rows({ keys, names, dist, total }: {
  keys: string[]; names: Record<string, string>; dist: Record<string, number>; total: number;
}) {
  return (
    <div style={{ marginBlockStart: 10 }}>
      {keys.map((k) => {
        const n = dist[k] ?? 0;
        const share = total === 0 ? 0 : (n / total) * 100;
        const r = risk(share);
        return (
          <div key={k} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderBlockStart: `1px solid ${LINE}` }}>
            <span style={{ fontSize: 13, color: INK, flex: "0 0 132px" }}>{names[k]}</span>
            <span aria-hidden style={{ flex: 1, blockSize: 6, borderRadius: 3, background: "#EDF1F6", overflow: "hidden" }}>
              <span style={{ display: "block", blockSize: "100%", inlineSize: `${share}%`, background: r.colour, borderRadius: 3 }} />
            </span>
            <span style={{ ...monoNum, fontSize: 11.5, color: MUTED, flex: "0 0 52px", textAlign: "end" }}>{n} / {total}</span>
            <span style={{
              ...monoNum, fontSize: 9.5, letterSpacing: ".08em", textTransform: "uppercase",
              color: r.colour, background: r.bg, borderRadius: 6, padding: "2px 6px", flex: "0 0 auto",
            }}>{r.label}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function VariationEngine({ model }: { model: VoiceDnaModel }) {
  const [tab, setTab] = useState<"openers" | "closers">("openers");
  const thin = model.windowClassified < 8;
  const sentence = variationSentence(model);

  return (
    <section style={{ marginBlockStart: 12 }}>
      <div style={cardStyle}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <div style={microLabel}>Variation engine</div>
          <div style={{ display: "flex", gap: 14 }} role="tablist" aria-label="Openers or closers">
            {(["openers", "closers"] as const).map((t) => (
              <button
                key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
                style={{
                  background: "transparent", border: "none", padding: "4px 0", cursor: "pointer",
                  fontSize: 12.5, fontWeight: 600, color: tab === t ? BLUE : MUTED,
                  borderBlockEnd: tab === t ? `2px solid ${BLUE}` : "2px solid transparent",
                }}
              >
                {t === "openers" ? "Openers" : "Closers"}
              </button>
            ))}
          </div>
        </div>

        {thin ? (
          <p style={{ fontSize: 13, color: MUTED, lineHeight: 1.6, marginBlockStart: 10, marginBlockEnd: 0 }}>
            Not enough posts yet — Aura needs 8 to read your patterns.
          </p>
        ) : tab === "openers" ? (
          <>
            <Rows keys={HOOK_KEYS} names={HOOK_NAME} dist={model.windowDist} total={model.windowClassified} />
            <div style={{
              display: "flex", gap: 16, flexWrap: "wrap", background: "#F2F5F9", borderRadius: 10,
              padding: "10px 12px", marginBlockStart: 10,
            }}>
              <span style={{ ...monoNum, fontSize: 12, color: INK }}>
                Diversity {model.diversity === null ? "—" : `${model.diversity}%`}
                <span style={{ color: MUTED }}> · 60% is the bar</span>
              </span>
              <span style={{ ...monoNum, fontSize: 12, color: INK }}>
                Top opener {model.topShare === null ? "—" : `${model.topShare}%`}
                <span style={{ color: MUTED }}> · 35% or under is the bar</span>
              </span>
            </div>
          </>
        ) : (
          <Rows keys={ENDING_KEYS} names={ENDING_NAME} dist={model.endingDist} total={model.endingClassified} />
        )}
      </div>

      {!thin && sentence && (
        <p style={{ fontSize: 13, color: MUTED, lineHeight: 1.6, marginBlockStart: 10, marginBlockEnd: 0 }}>{sentence}</p>
      )}
    </section>
  );
}