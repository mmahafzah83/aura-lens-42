/**
 * What worked — does any of this matter?
 *
 * The one surface where the voice meets its results. It shows the member's own
 * posts against their own trailing average, names the sample every time, and
 * says plainly when there is no pattern. Nothing here is manufactured: when the
 * arithmetic returns nothing, the card says nothing was found.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import InfoTooltip from "@/components/voice/InfoTooltip";
import { supabase } from "@/integrations/supabase/client";
import {
  AMBER_FILL, AMBER_TEXT, CYAN, GREEN, INK, LINE, MONO, MUTED, NIGHT, NIGHT_LINE, NIGHT_MUTED,
  NIGHT_RAISED, NIGHT_TEXT, RADIUS, SURFACE, TAP, TYPE, WHITE, cardStyle, chipStyle, ghostButton,
  microLabel, monoNum,
} from "@/components/voice/tokens";
import { useCachedVoice } from "@/lib/voiceCache";
import { OUTCOME_RULES } from "../../../supabase/functions/_shared/voiceOutcomes";
import {
  EXCLUSION_LABEL, loadWhatWorked, proposalSentence, setLearningSwitch, styleFindingSentence,
  traitFindingSentence, type WhatWorkedModel,
} from "@/lib/voiceOutcomes";
import type { DnaTrait } from "@/lib/voiceDna";

/* ── the reading, in words ───────────────────────────────────────────────── */

const mult = (v: number) => `${v.toFixed(1)}×`;
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);

/** Last five settled posts against the five before them. Never a direction without both numbers. */
export function trendSentence(values: number[]): string {
  if (values.length < 10) {
    return `Aura needs ten settled posts before it can say whether you are getting better. It has ${values.length}.`;
  }
  const last5 = mean(values.slice(-5));
  const prev5 = mean(values.slice(-10, -5));
  const ratio = prev5 === 0 ? 1 : last5 / prev5;
  if (ratio >= 1.15) return `Your last five posts did ${mult(last5)} your own average — up from ${mult(prev5)} before.`;
  if (ratio <= 0.85) return `Your last five posts did ${mult(last5)} your own average, down from ${mult(prev5)}.`;
  return "Your last five posts are level with your own average.";
}

/* ── sparkline — a true shape, diverging around the member's own average ─── */

const W = 320, H = 132, PAD_L = 10, PAD_R = 34, PAD_T = 18, PAD_B = 26;

/** Cap the drawn scale at the 90th percentile (floor 1.4) so one post cannot flatten the rest. */
function percentile(sorted: number[], p: number) {
  if (sorted.length === 0) return 0;
  const i = (sorted.length - 1) * p;
  const lo = Math.floor(i), hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}

interface Point { v: number; date: string | null; preview: string; }

function Sparkline({
  points, active, setActive,
}: {
  points: Point[];
  active: number | null;
  setActive: (i: number | null) => void;
}) {
  const values = points.map((p) => p.v);
  const sorted = [...values].sort((a, b) => a - b);
  const cap = Math.max(1.4, percentile(sorted, 0.9));
  const min = Math.min(0.6, ...values);
  const x = (i: number) => PAD_L + (i * (W - PAD_L - PAD_R)) / Math.max(1, values.length - 1);
  const y = (v: number) => {
    const c = Math.min(cap, Math.max(min, v));
    return H - PAD_B - ((c - min) / Math.max(0.01, cap - min)) * (H - PAD_T - PAD_B);
  };
  const base = y(1);
  const line = values.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const area = `${line} L${x(values.length - 1).toFixed(1)},${base.toFixed(1)} L${x(0).toFixed(1)},${base.toFixed(1)} Z`;
  const last = values.length - 1;
  const cid = "ww-above", cid2 = "ww-below";

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      role="img"
      style={{ display: "block", height: "auto", touchAction: "none" }}
      aria-label={
        active === null
          ? `Your last ${values.length} settled posts against your own average. Use the arrow keys to read each post.`
          : `Post ${active + 1} of ${values.length}: ${mult(values[active])} your own average.`
      }
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
        e.preventDefault();
        const cur = active ?? last;
        setActive(Math.max(0, Math.min(last, cur + (e.key === "ArrowRight" ? 1 : -1))));
      }}
      onBlur={() => setActive(null)}
      onMouseLeave={() => setActive(null)}
      onMouseMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        const px = ((e.clientX - r.left) / r.width) * W;
        let best = 0;
        for (let i = 1; i < values.length; i++) if (Math.abs(x(i) - px) < Math.abs(x(best) - px)) best = i;
        setActive(best);
      }}
    >
      <defs>
        <clipPath id={cid}><rect x="0" y="0" width={W} height={base} /></clipPath>
        <clipPath id={cid2}><rect x="0" y={base} width={W} height={H - base} /></clipPath>
      </defs>

      {/* above the member's own average — cyan, the good side */}
      <path d={area} fill={CYAN} fillOpacity={0.18} clipPath={`url(#${cid})`} />
      {/* below — a quiet night grey-blue, never an alarm colour */}
      <path d={area} fill={NIGHT_MUTED} fillOpacity={0.12} clipPath={`url(#${cid2})`} />

      {/* the baseline, named on the chart itself */}
      <line x1={PAD_L} x2={W - PAD_R} y1={base} y2={base} stroke={NIGHT_MUTED} strokeWidth="1" />
      <text x={PAD_L + 2} y={base + 12} fill={NIGHT_MUTED} fontFamily={MONO} fontSize="9">your average</text>

      <path d={line} fill="none" stroke={CYAN} strokeWidth="1.5" strokeLinejoin="round" />

      {active !== null && (
        <line x1={x(active)} x2={x(active)} y1={PAD_T - 8} y2={H - PAD_B} stroke={NIGHT_LINE} strokeWidth="1" />
      )}

      {values.map((v, i) => {
        const over = v > cap;
        const above = v >= 1;
        const isLast = i === last;
        if (over) {
          return (
            <g key={i}>
              <circle cx={x(i)} cy={y(v)} r="4" fill="none" stroke={CYAN} strokeWidth="1.5" />
              <text x={x(i)} y={y(v) - 7} textAnchor="middle" fill={NIGHT_MUTED} fontFamily={MONO} fontSize="9">{mult(v)}</text>
              <circle cx={x(i)} cy={y(v)} r="9" fill="transparent" />
            </g>
          );
        }
        return (
          <g key={i}>
            {isLast && <circle cx={x(i)} cy={y(v)} r="6" fill="none" stroke={NIGHT} strokeWidth="2" />}
            <circle cx={x(i)} cy={y(v)} r={isLast ? 4 : 2.4} fill={above ? CYAN : NIGHT_MUTED} />
            <circle cx={x(i)} cy={y(v)} r="9" fill="transparent" />
          </g>
        );
      })}

      {/* only the last point carries a number */}
      <text
        x={x(last) + 7} y={y(values[last]) + 3}
        fill={NIGHT_MUTED} fontFamily={MONO} fontSize="10"
      >{mult(values[last])}</text>
    </svg>
  );
}

const shortDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "no date saved";

function Stat({ label, value, term, body }: { label: string; value: number; term: string; body: string }) {
  return (
    <div style={{ minInlineSize: 92 }}>
      <div style={{ ...monoNum, fontSize: TYPE.title, fontWeight: 700, color: value === 0 ? NIGHT_MUTED : WHITE }}>
        {value === 0 ? "—" : String(value)}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 2, marginBlockStart: 2 }}>
        <span style={{ fontSize: TYPE.caption, color: NIGHT_MUTED }}>{label}</span>
        <InfoTooltip term={term} body={body} />
      </div>
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
  const [active, setActive] = useState<number | null>(null);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const key = modelOverride || !userId ? null : `voice:whatworked:${userId}`;
  const loader = useCallback(() => loadWhatWorked(userId as string), [userId]);
  const state = useCachedVoice<WhatWorkedModel>(key, loader);
  const model = modelOverride ?? state.data;

  const shown = useMemo(() => (model?.outcomes ?? []).slice(-20), [model]);
  const ids = shown.map((o) => o.post_id).join(",");

  /* the tooltip has to name the post, so the text is read once for the drawn window */
  useEffect(() => {
    const list = ids ? ids.split(",") : [];
    if (list.length === 0) return;
    let live = true;
    void (async () => {
      const [li, ci] = await Promise.all([
        supabase.from("linkedin_posts").select("id, post_text").in("id", list),
        supabase.from("content_items").select("id, body").in("id", list),
      ]);
      if (!live) return;
      const map: Record<string, string> = {};
      for (const r of li.data ?? []) if (r.post_text) map[r.id] = r.post_text;
      for (const r of ci.data ?? []) if (!map[r.id] && r.body) map[r.id] = r.body;
      setPreviews(map);
    })();
    return () => { live = false; };
  }, [ids]);

  if (!model) return null;

  const name = (k: string) => traits.find((t) => t.trait_key === k)?.display_name ?? k;
  const n = model.outcomes.length;
  const points: Point[] = shown.map((o) => ({
    v: o.performance_index as number,
    date: o.published_at,
    preview: (previews[o.post_id] ?? "").replace(/\s+/g, " ").trim().slice(0, 60),
  }));
  const spark = points.map((p) => p.v);

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

      {/* compounding — the reading first, then the picture */}
      <div style={{ background: NIGHT, borderRadius: RADIUS.card, padding: 16, marginBlockStart: 12 }}>
        <div style={{ ...microLabel, color: NIGHT_MUTED }}>Getting better</div>
        <h3 style={{ fontSize: TYPE.title, fontWeight: 600, color: NIGHT_TEXT, margin: "6px 0 0", lineHeight: 1.5 }}>
          {trendSentence(model.outcomes.map((o) => o.performance_index as number))}
        </h3>
        <div style={{ fontSize: TYPE.caption, color: NIGHT_MUTED, marginBlockStart: 4 }}>
          {model.learningSinceDays === null
            ? "Aura hasn't started learning your voice yet."
            : `Aura has been learning your voice for ${model.learningSinceDays} ${model.learningSinceDays === 1 ? "day" : "days"}.`}
        </div>

        {spark.length >= 2 ? (
          <div style={{ marginBlockStart: 14, position: "relative" }}>
            <Sparkline points={points} active={active} setActive={setActive} />
            {active !== null && points[active] && (
              <div
                role="status"
                style={{
                  position: "absolute", insetBlockStart: 0,
                  insetInlineStart: `${Math.min(66, (active / Math.max(1, points.length - 1)) * 78)}%`,
                  background: NIGHT_RAISED, border: `1px solid ${NIGHT_LINE}`, borderRadius: RADIUS.button,
                  padding: "6px 8px", maxInlineSize: 210, pointerEvents: "none", zIndex: 2,
                }}
              >
                <div style={{ ...monoNum, fontSize: TYPE.micro, color: NIGHT_MUTED }}>{shortDate(points[active].date)}</div>
                <div style={{ ...monoNum, fontSize: TYPE.body, color: NIGHT_TEXT }}>
                  {mult(points[active].v)} your average
                </div>
                <div style={{ fontSize: TYPE.caption, color: NIGHT_MUTED, lineHeight: 1.5, marginBlockStart: 2 }}>
                  {points[active].preview || "No text saved for this post."}
                </div>
              </div>
            )}
            <div style={{ ...monoNum, fontSize: TYPE.caption, color: NIGHT_MUTED, marginBlockStart: 4 }}>
              {shortDate(points[0].date)} → {shortDate(points[points.length - 1].date)} · your last {points.length} settled posts
            </div>
          </div>
        ) : (
          <p style={{ fontSize: TYPE.small, color: NIGHT_MUTED, lineHeight: 1.6, marginBlock: "12px 0 0" }}>
            The performance line appears once Aura has settled figures for two or more of your posts.
          </p>
        )}

        {model.postsRead === 0 && model.correctionsApplied === 0 && model.proposalsConfirmed === 0 && model.proposalsRejected === 0 ? (
          <p style={{ fontSize: TYPE.small, color: NIGHT_MUTED, lineHeight: 1.6, marginBlock: "14px 0 0" }}>
            Nothing to count yet — Aura hasn't been given a correction or a proposal.
          </p>
        ) : (
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap", marginBlockStart: 14 }}>
            <Stat label="Posts read" value={model.postsRead} term="Posts read"
              body="How many of your own posts Aura has read while learning your voice." />
            <Stat label="Times you corrected Aura" value={model.correctionsApplied} term="Times you corrected Aura"
              body="Edits you made to a draft that Aura kept as a change to how it writes for you." />
            <Stat label="Aura's suggestions you accepted" value={model.proposalsConfirmed} term="Suggestions you accepted"
              body="Changes Aura proposed to your voice settings that you confirmed." />
            <Stat label="Aura's suggestions you turned down" value={model.proposalsRejected} term="Suggestions you turned down"
              body="Changes Aura proposed to your voice settings that you rejected." />
          </div>
        )}
      </div>

    </section>
  );
}
