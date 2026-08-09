/**
 * How you start and end a post.
 *
 * Every figure comes from `voice_window()`, `voice_opener_diversity()` and
 * `voice_top_style_share()` via the loader — nothing is recounted here. The
 * reading is one sentence from the shared generator, so this page cannot
 * disagree with any other.
 */
import { useState } from "react";
import {
  AMBER_TEXT, BLUE, INK, LINE, MUTED, RADIUS, SURFACE, TAP, TYPE,
  cardStyle, chipStyle, microLabel, monoNum,
} from "@/components/voice/tokens";
import InfoTooltip from "@/components/voice/InfoTooltip";
import { REPETITION_GATES } from "@/lib/voiceGates";
import { variationSummary } from "@/lib/voiceOverview";
import { ENDING_KEYS, ENDING_NAME, HOOK_KEYS, HOOK_NAME, type VoiceDnaModel } from "@/lib/voiceDna";

/** A one-line definition for every opener and closer. None of them are self-evident. */
const DEFINITION: Record<string, string> = {
  contrarian_claim: "You open by disagreeing with something the field takes for granted.",
  number_first: "You open with a figure — a result, a cost, a percentage.",
  short_story: "You open with a scene: a moment, a room, a conversation.",
  question: "You open by asking the reader something.",
  experience_led: "You open with something that happened to you.",
  announcement: "You open by stating news — a launch, a move, a result.",
  other: "Openings that don't match any of the six named styles.",
  suspended: "You end on an unfinished line the reader completes.",
  reframe: "You end by restating the idea in a different frame.",
  equation: "You end with a formula or a trade-off.",
  number: "You end on a figure.",
  cta: "You end by asking the reader to do something.",
};

function Rows({ keys, names, dist, total, topKey }: {
  keys: string[]; names: Record<string, string>; dist: Record<string, number>; total: number; topKey: string | null;
}) {
  return (
    <div style={{ marginBlockStart: 10 }}>
      {keys.map((k) => {
        const n = dist[k] ?? 0;
        const share = total === 0 ? 0 : Math.round((n / total) * 100);
        const isTop = k === topKey && share > REPETITION_GATES.topShareCeiling;
        return (
          <div key={k} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBlockStart: `1px solid ${LINE}` }}>
            <span style={{ flex: "0 0 150px", minInlineSize: 0, display: "flex", alignItems: "center", gap: 2 }}>
              <span style={{ fontSize: TYPE.body, color: INK }}>{names[k]}</span>
              {DEFINITION[k] && <InfoTooltip term={names[k]} body={DEFINITION[k]} />}
            </span>
            <span aria-hidden style={{ flex: 1, blockSize: 6, borderRadius: RADIUS.rail, background: SURFACE, overflow: "hidden" }}>
              <span style={{ display: "block", blockSize: "100%", inlineSize: `${share}%`, background: isTop ? AMBER_TEXT : BLUE, borderRadius: RADIUS.rail }} />
            </span>
            <span style={{ flex: "0 0 84px", textAlign: "end" }}>
              <span style={{ ...monoNum, display: "block", fontSize: TYPE.title, fontWeight: 600, color: INK }}>{share}%</span>
              <span style={{ fontSize: TYPE.caption, color: MUTED }}>{n} of {total} posts</span>
            </span>
            <span style={{ flex: "0 0 auto", inlineSize: 108, textAlign: "end" }}>
              {isTop && <span style={chipStyle(AMBER_TEXT, "#FBF4E4", "#F0DFB4")}>Overused — {share}% of your posts</span>}
              {n === 0 && <span style={chipStyle(MUTED, SURFACE)}>Never used</span>}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default function VariationEngine({ model }: { model: VoiceDnaModel }) {
  const [tab, setTab] = useState<"openers" | "closers">("openers");
  const thin = model.windowClassified < REPETITION_GATES.minClassified;
  const summary = variationSummary(model);

  const topCloser = Object.entries(model.endingDist).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const closerShare = model.endingClassified === 0 || !topCloser
    ? null
    : Math.round(((model.endingDist[topCloser] ?? 0) / model.endingClassified) * 100);

  return (
    <section style={{ marginBlockStart: 16 }}>
      <div style={cardStyle}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <div style={{ maxInlineSize: 520 }}>
            <div style={microLabel}>How you start a post</div>
            <p style={{ fontSize: TYPE.body, color: MUTED, lineHeight: 1.6, marginBlock: "6px 0" }}>
              Aura sorted your last {model.windowClassified} posts into seven opening styles. Too much of one and your feed starts to sound the same.
            </p>
          </div>
          <div style={{ display: "flex", gap: 14 }} role="tablist" aria-label="Openers or closers">
            {(["openers", "closers"] as const).map((t) => (
              <button
                key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
                style={{
                  background: "transparent", border: "none", padding: "0 2px", minBlockSize: TAP, cursor: "pointer",
                  fontSize: TYPE.body, fontWeight: 600, color: tab === t ? BLUE : MUTED,
                  borderBlockEnd: tab === t ? `2px solid ${BLUE}` : "2px solid transparent",
                }}
              >
                {t === "openers" ? "Openers" : "Closers"}
              </button>
            ))}
          </div>
        </div>

        {thin ? (
          <p style={{ fontSize: TYPE.body, color: MUTED, lineHeight: 1.6, marginBlockStart: 10, marginBlockEnd: 0 }}>
            Not enough posts yet — Aura needs {REPETITION_GATES.minClassified} to read your patterns.
          </p>
        ) : tab === "openers" ? (
          <>
            <Rows keys={HOOK_KEYS} names={HOOK_NAME} dist={model.windowDist} total={model.windowClassified} topKey={model.topStyleKey} />
            {summary && (
              <p style={{ fontSize: TYPE.bodyLg, color: INK, lineHeight: 1.65, marginBlockStart: 12, marginBlockEnd: 0 }}>{summary}</p>
            )}
          </>
        ) : (
          <>
            <Rows keys={ENDING_KEYS} names={ENDING_NAME} dist={model.endingDist} total={model.endingClassified} topKey={topCloser} />
            <p style={{ fontSize: TYPE.bodyLg, color: INK, lineHeight: 1.65, marginBlockStart: 12, marginBlockEnd: 0 }}>
              {closerShare === null
                ? "None of your recent posts have a labelled ending yet."
                : `${closerShare}% of your posts end with ${(ENDING_NAME[topCloser as string] ?? "").toLowerCase()}, and healthy is ${REPETITION_GATES.topShareCeiling}% or less.`}
            </p>
          </>
        )}
      </div>
    </section>
  );
}
