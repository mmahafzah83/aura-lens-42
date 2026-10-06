/**
 * What worked — does any of this matter?
 *
 * The one surface where the voice meets its results. It names the sample every
 * time, and says plainly when there is no pattern. Nothing here is manufactured:
 * when the arithmetic returns nothing, the card says nothing was found.
 */
import { useCallback, useState } from "react";
import { toast } from "sonner";
import InfoTooltip from "@/components/voice/InfoTooltip";
import CollapseBlock from "@/components/common/CollapseBlock";
import {
  AMBER_FILL, AMBER_TEXT, GREEN, INK, LINE, MUTED, RADIUS, TAP, TYPE, WHITE, cardStyle, chipStyle,
  ghostButton, microLabel, monoNum,
} from "@/components/voice/tokens";
import { useCachedVoice } from "@/lib/voiceCache";
import { OUTCOME_RULES } from "../../../supabase/functions/_shared/voiceOutcomes";
import {
  EXCLUSION_LABEL, loadWhatWorked, proposalSentence, setLearningSwitch, styleFindingSentence,
  traitFindingSentence, type WhatWorkedModel,
} from "@/lib/voiceOutcomes";
import type { DnaTrait } from "@/lib/voiceDna";
import { exclusionLabel } from "@/lib/voiceOutcomes";
import { useLanguage } from "@/contexts/LanguageContext";
import { arStyle, arabicList } from "@/lib/arDisplay";
import { endingWord, hookWord, voiceWord, type VoiceTr } from "@/lib/voiceText";

export default function WhatWorked({
  userId, traits, onConfirm, onReject, modelOverride, collapsed = false, onToggleCollapse,
}: {
  userId: string | null;
  traits: DnaTrait[];
  onConfirm: (t: DnaTrait) => void;
  onReject: (t: DnaTrait) => void;
  /** Harness only. */
  modelOverride?: WhatWorkedModel;
  /** Collapse is owned by the page, so the pane can remember it. */
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}) {

  const { lang, t } = useLanguage();
  const ar = lang === "ar";
  const L = (en: string, k: string, p?: Record<string, unknown>) => (ar ? t(k, p) : en);
  const tr: VoiceTr = { lang, t };
  const [saving, setSaving] = useState(false);
  const key = modelOverride || !userId ? null : `voice:whatworked:${userId}`;
  const loader = useCallback(() => loadWhatWorked(userId as string), [userId]);
  const state = useCachedVoice<WhatWorkedModel>(key, loader);
  const model = modelOverride ?? state.data;

  // postsRead, correctionsApplied, proposalsConfirmed, proposalsRejected left with the removed chart panel because activity counters are not a member-facing result; they remain on the model for other surfaces.



  if (!model) return null;

  const name = (k: string) => traits.find((t) => t.trait_key === k)?.display_name ?? k;
  const n = model.outcomes.length;

  const proposals = traits.filter((t) => t.source === "aura" && !t.last_confirmed_at && t.value !== null);

  const rows = [
    ...model.traitFindings.map((f) => ({
      id: `t-${f.trait_key}`,
      label: voiceWord(name(f.trait_key), tr),
      ratio: f.ratio,
      sample: L(`${f.topN} best against ${f.bottomN} weakest`, "vo.ww.sample", { topN: f.topN, bottomN: f.bottomN }),
      text: traitFindingSentence(f, name(f.trait_key), tr),
    })),
    ...model.styleFindings.map((f) => ({
      id: `s-${f.kind}-${f.style}`,
      label: ar ? (f.kind === "hook" ? hookWord(f.style, tr) : endingWord(f.style, tr)) : f.style.replace(/_/g, " "),
      ratio: f.ratio,
      sample: L(`${f.n} ${f.n === 1 ? "post" : "posts"}`, "vo.ww.posts", { n: f.n }),
      text: styleFindingSentence(f, tr),
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
        ? L("KnownBy may propose changes from performance. You still confirm every one.", "vo.ww.toastOn")
        : L("KnownBy will keep showing what worked, but will not propose changes.", "vo.ww.toastOff"));
    } catch {
      state.set({ ...model, learningOn: !next });
      toast.error(L("Couldn't save that. Nothing was changed.", "vo.e.save"));
    } finally {
      setSaving(false);
    }
  };

  const headline = n === 0
    ? L("KnownBy has nothing to compare yet.", "vo.ww.none")
    : L(`KnownBy compared your last ${n} ${n === 1 ? "post" : "posts"} against your own average.`, "vo.ww.compared", { n });
  const wrapped = Boolean(onToggleCollapse);

  const body = (
    <section style={{ marginBlockStart: wrapped ? 0 : 16 }}>
      <div style={wrapped ? { ...cardStyle, border: "none", padding: 0 } : cardStyle}>

        {/* header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ maxInlineSize: 520 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
              <span style={arStyle(lang, microLabel)}>{L("What worked", "vo.ww.title")}</span>
              <InfoTooltip
                term={L("What worked", "vo.ww.title")}
                body={L("KnownBy compares each of your posts against your own recent average — never against anyone else's.", "vo.ww.tip")}
              />
            </div>
            <h3 style={{ fontSize: TYPE.section, fontWeight: 600, color: INK, margin: "6px 0 0" }}>
              {headline}
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
            {L("Let KnownBy learn from performance", "vo.ww.learn")}
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
            {L("No pattern yet. KnownBy needs more posts before it can tell what's working for you.", "vo.ww.noPattern")}
            {n < OUTCOME_RULES.minOutcomesToLearn && (
              <span style={{ color: MUTED }}>
                {" "}{L(`It has ${n} of the ${OUTCOME_RULES.minOutcomesToLearn} settled posts it needs.`, "vo.ww.has", { n, min: OUTCOME_RULES.minOutcomesToLearn })}
              </span>
            )}
          </p>
        ) : (
          <div style={{ marginBlockStart: 12 }}>
            {rows.map((r) => (
              <div key={r.id} style={{ padding: "10px 0", borderBlockStart: `1px solid ${LINE}` }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                  <span dir="ltr" style={{ ...monoNum, fontSize: TYPE.title, fontWeight: 700, color: INK }}>{r.ratio.toFixed(1)}×</span>
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
              <span style={arStyle(lang, chipStyle(AMBER_TEXT, WHITE, AMBER_FILL))}>{L("Suggested by KnownBy", "vo.src.aura")}</span>
              <p style={{ fontSize: TYPE.body, color: INK, lineHeight: 1.6, marginBlock: "8px 10px" }}>
                {f
                  ? proposalSentence(f, t.display_name, t.learned_value ?? (t.value as number), t.value as number, tr)
                  : L(`KnownBy has proposed a new value for ${t.display_name.toLowerCase()}. Confirm it or send it back.`, "vo.ww.propFallback", { name: voiceWord(t.display_name, tr) })}
              </p>
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" style={{ ...ghostButton, minBlockSize: TAP }} onClick={() => onConfirm(t)}>{L("Confirm", "vo.confirm")}</button>
                <button type="button" style={{ ...ghostButton, minBlockSize: TAP }} onClick={() => onReject(t)}>{L("Reject", "vo.reject")}</button>
              </div>
            </div>
          );
        })}

        {/* the caveat is permanent, not a dismissible nicety */}
        <p style={{ fontSize: TYPE.small, color: MUTED, lineHeight: 1.6, marginBlock: "12px 0" }}>
          {ar ? t("vo.ww.caveat") : <>Engagement depends on timing, topic and audience as well as voice. KnownBy only moves a setting when the pattern
          holds across several posts.</>}
          {Object.keys(model.excludedCounts).length > 0 && (ar ? (
            <> {t("vo.ww.setAside")} {arabicList(Object.entries(model.excludedCounts)
              .map(([k, v]) => t("vo.ww.piece", { count: v, label: exclusionLabel(k, tr) })))}.</>
          ) : (
            <> Set aside: {Object.entries(model.excludedCounts)
              .map(([k, v]) => `${v} ${EXCLUSION_LABEL[k] ?? k}`).join(", ")}.</>
          ))}
        </p>

        {model.learningSinceDays !== null && (
          <p style={{ fontSize: TYPE.small, color: MUTED, lineHeight: 1.6, marginBlock: "0 0" }}>
            {ar ? t("vo.ww.since", { n: model.learningSinceDays }) : <>KnownBy has been reading your results for {model.learningSinceDays} {model.learningSinceDays === 1 ? "day" : "days"}.</>}
          </p>
        )}
      </div>
    </section>
  );

  if (!wrapped) return body;
  return (
    <CollapseBlock
      id="what-worked"
      label={L("What worked", "vo.ww.title")}
      summary={headline}
      controlLabel={L("Open", "vo.open")}
      open={!collapsed}
      onToggle={onToggleCollapse as () => void}
    >
      {body}
    </CollapseBlock>
  );
}

