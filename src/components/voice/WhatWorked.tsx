/**
 * What worked — does any of this matter?
 *
 * The one surface where the voice meets its results. It shows the member's own
 * posts against their own trailing average, names the sample every time, and
 * says plainly when there is no pattern. Nothing here is manufactured: when the
 * arithmetic returns nothing, the card says nothing was found.
 */
import { useCallback, useState } from "react";
import { toast } from "sonner";
import InfoTooltip from "@/components/voice/InfoTooltip";
import {
  AMBER_FILL, AMBER_TEXT, CYAN, GREEN, INK, LINE, MUTED, NIGHT, NIGHT_LINE, NIGHT_MUTED,
  RADIUS, SURFACE, TAP, TYPE, WHITE, cardStyle, chipStyle, ghostButton, microLabel, monoNum,
} from "@/components/voice/tokens";
import { useCachedVoice } from "@/lib/voiceCache";
import { OUTCOME_RULES } from "../../../supabase/functions/_shared/voiceOutcomes";
import {
  EXCLUSION_LABEL, loadWhatWorked, proposalSentence, setLearningSwitch, styleFindingSentence,
  traitFindingSentence, type WhatWorkedModel,
} from "@/lib/voiceOutcomes";
import type { DnaTrait } from "@/lib/voiceDna";

/* ── sparkline — bars and a line, never a cyan label ─────────────────────── */

function Sparkline({ values }: { values: number[] }) {
  const w = 260, h = 48, pad = 4;
  const max = Math.max(1.4, ...values);
  const min = Math.min(0.6, ...values);
  const x = (i: number) => pad + (i * (w - pad * 2)) / Math.max(1, values.length - 1);
  const y = (v: number) => h - pad - ((v - min) / Math.max(0.01, max - min)) * (h - pad * 2);
  const d = values.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`} width="100%" height={h} role="img" preserveAspectRatio="none"
      aria-label={`Performance against your own average across your last ${values.length} posts`}
    >
      <line x1={pad} x2={w - pad} y1={y(1)} y2={y(1)} stroke={NIGHT_LINE} strokeWidth="1" strokeDasharray="3 3" />
      <path d={d} fill="none" stroke={CYAN} strokeWidth="1.5" strokeLinejoin="round" />
      {values.map((v, i) => <circle key={i} cx={x(i)} cy={y(v)} r="2" fill={CYAN} />)}
    </svg>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ minInlineSize: 92 }}>
      <div style={{ ...monoNum, fontSize: TYPE.title, fontWeight: 700, color: WHITE }}>{value}</div>
      <div style={{ fontSize: TYPE.caption, color: NIGHT_MUTED, marginBlockStart: 2 }}>{label}</div>
    </div>
  );
}

/* ── card ────────────────────────────────────────────────────────────────── */

export default function WhatWorked({
  userId, traits, onConfirm, onReject, modelOverride,
}: {
  userId: string | null;
  traits: DnaTrait[];
  onConfirm: (t: DnaTrait) => void;
  onReject: (t: DnaTrait) => void;
  /** Harness only. */
  modelOverride?: WhatWorkedModel;
}) {
  const [saving, setSaving] = useState(false);
  const key = modelOverride || !userId ? null : `voice:whatworked:${userId}`;
  const loader = useCallback(() => loadWhatWorked(userId as string), [userId]);
  const state = useCachedVoice<WhatWorkedModel>(key, loader);
  const model = modelOverride ?? state.data;

  if (!model) return null;

  const name = (k: string) => traits.find((t) => t.trait_key === k)?.display_name ?? k;
  const n = model.outcomes.length;
  const spark = model.outcomes.slice(-20).map((o) => o.performance_index as number);
  const proposals = traits.filter((t) => t.source === "aura" && !t.last_confirmed_at && t.value !== null);

  const rows = [
    ...model.traitFindings.map((f) => ({
      id: `t-${f.trait_key}`,
      label: name(f.trait_key),
      ratio: f.ratio,
      sample: `${f.topN} best against ${f.bottomN} weakest`,
      text: traitFindingSentence(f, name(f.trait_key)),
    })),
    ...model.styleFindings.map((f) => ({
      id: `s-${f.kind}-${f.style}`,
      label: f.style.replace(/_/g, " "),
      ratio: f.ratio,
      sample: `${f.n} ${f.n === 1 ? "post" : "posts"}`,
      text: styleFindingSentence(f),
    })),
  ].slice(0, 3);

  const toggle = async () => {
    if (!userId) return;
    const next = !model.learningOn;
    state.set({ ...model, learningOn: next });
    setSaving(true);
    try {
      await setLearningSwitch(userId, next);
      toast.success(next
        ? "Aura may propose changes from performance. You still confirm every one."
        : "Aura will keep showing what worked, but will not propose changes.");
    } catch {
      state.set({ ...model, learningOn: !next });
      toast.error("Couldn't save that. Nothing was changed.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section style={{ marginBlockStart: 16 }}>
      <div style={cardStyle}>
        {/* header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ maxInlineSize: 520 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
              <span style={microLabel}>What worked</span>
              <InfoTooltip
                term="What worked"
                body="Aura compares each of your posts against your own recent average — never against anyone else's."
              />
            </div>
            <h3 style={{ fontSize: TYPE.section, fontWeight: 600, color: INK, margin: "6px 0 0" }}>
              {n === 0
                ? "Aura has nothing to compare yet."
                : `Aura compared your last ${n} ${n === 1 ? "post" : "posts"} against your own average.`}
            </h3>
          </div>
          <button
            type="button" role="switch" aria-checked={model.learningOn} disabled={saving || !userId}
            onClick={() => void toggle()}
            style={{
              display: "flex", alignItems: "center", gap: 8, background: WHITE, cursor: "pointer",
              border: `1px solid ${LINE}`, borderRadius: RADIUS.button, padding: "8px 10px", minBlockSize: TAP,
              fontSize: TYPE.small, fontWeight: 600, color: MUTED,
            }}
          >
            Let Aura learn from performance
            <span aria-hidden style={{
              inlineSize: 34, blockSize: 18, borderRadius: 9, background: model.learningOn ? GREEN : LINE,
              position: "relative", flex: "0 0 auto",
            }}>
              <span style={{
                position: "absolute", insetBlockStart: 2, insetInlineStart: model.learningOn ? 18 : 2,
                inlineSize: 14, blockSize: 14, borderRadius: 7, background: WHITE,
              }} />
            </span>
          </button>
        </div>

        {/* findings */}
        {n < OUTCOME_RULES.minOutcomesToLearn || rows.length === 0 ? (
          <p style={{ fontSize: TYPE.bodyLg, color: INK, lineHeight: 1.65, marginBlock: "12px 0" }}>
            No pattern yet. Aura needs more posts before it can tell what's working for you.
            {n < OUTCOME_RULES.minOutcomesToLearn && (
              <span style={{ color: MUTED }}>
                {" "}It has {n} of the {OUTCOME_RULES.minOutcomesToLearn} settled posts it needs.
              </span>
            )}
          </p>
        ) : (
          <div style={{ marginBlockStart: 12 }}>
            {rows.map((r) => (
              <div key={r.id} style={{ padding: "10px 0", borderBlockStart: `1px solid ${LINE}` }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                  <span style={{ ...monoNum, fontSize: TYPE.title, fontWeight: 700, color: INK }}>{r.ratio.toFixed(1)}×</span>
                  <span style={{ fontSize: TYPE.body, color: INK }}>{r.label}</span>
                  <span style={{ ...monoNum, fontSize: TYPE.caption, color: MUTED }}>{r.sample}</span>
                </div>
                <p style={{ fontSize: TYPE.body, color: MUTED, lineHeight: 1.6, marginBlock: "4px 0" }}>{r.text}</p>
              </div>
            ))}
          </div>
        )}

        {/* proposals — the existing Confirm / Reject mechanism, not a new one */}
        {proposals.map((t) => {
          const f = model.traitFindings.find((x) => x.trait_key === t.trait_key);
          return (
            <div key={t.trait_key} style={{ marginBlockStart: 12, background: "#FBF4E4", border: `1px solid #F0DFB4`, borderRadius: RADIUS.card, padding: 12 }}>
              <span style={chipStyle(AMBER_TEXT, WHITE, AMBER_FILL)}>Suggested by Aura</span>
              <p style={{ fontSize: TYPE.body, color: INK, lineHeight: 1.6, marginBlock: "8px 10px" }}>
                {f
                  ? proposalSentence(f, t.display_name, t.learned_value ?? (t.value as number), t.value as number)
                  : `Aura has proposed a new value for ${t.display_name.toLowerCase()}. Confirm it or send it back.`}
              </p>
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" style={{ ...ghostButton, minBlockSize: TAP }} onClick={() => onConfirm(t)}>Confirm</button>
                <button type="button" style={{ ...ghostButton, minBlockSize: TAP }} onClick={() => onReject(t)}>Reject</button>
              </div>
            </div>
          );
        })}

        {/* the caveat is permanent, not a dismissible nicety */}
        <p style={{ fontSize: TYPE.small, color: MUTED, lineHeight: 1.6, marginBlock: "12px 0" }}>
          Engagement depends on timing, topic and audience as well as voice. Aura only moves a setting when the pattern
          holds across several posts.
          {Object.keys(model.excludedCounts).length > 0 && (
            <> Set aside: {Object.entries(model.excludedCounts)
              .map(([k, v]) => `${v} ${EXCLUSION_LABEL[k] ?? k}`).join(", ")}.</>
          )}
        </p>
      </div>

      {/* compounding */}
      <div style={{ background: NIGHT, borderRadius: RADIUS.card, padding: 16, marginBlockStart: 12 }}>
        <div style={{ ...microLabel, color: NIGHT_MUTED }}>Getting better</div>
        <h3 style={{ fontSize: TYPE.title, fontWeight: 600, color: WHITE, margin: "6px 0 0" }}>
          {model.learningSinceDays === null
            ? "Aura hasn't started learning your voice yet."
            : `Aura has been learning your voice for ${model.learningSinceDays} ${model.learningSinceDays === 1 ? "day" : "days"}.`}
        </h3>
        <div style={{ display: "flex", gap: 20, flexWrap: "wrap", marginBlockStart: 14 }}>
          <Stat label="Posts read" value={String(model.postsRead)} />
          <Stat label="Corrections applied" value={String(model.correctionsApplied)} />
          <Stat label="Proposals confirmed" value={String(model.proposalsConfirmed)} />
          <Stat label="Proposals rejected" value={String(model.proposalsRejected)} />
        </div>
        {spark.length >= 2 ? (
          <div style={{ marginBlockStart: 14 }}>
            <Sparkline values={spark} />
            <div style={{ ...monoNum, fontSize: TYPE.caption, color: NIGHT_MUTED, marginBlockStart: 4 }}>
              Last {spark.length} posts · dashed line is your own average
            </div>
          </div>
        ) : (
          <p style={{ fontSize: TYPE.small, color: NIGHT_MUTED, lineHeight: 1.6, marginBlock: "12px 0 0" }}>
            The performance line appears once Aura has settled figures for two or more of your posts.
          </p>
        )}
      </div>
    </section>
  );
}
