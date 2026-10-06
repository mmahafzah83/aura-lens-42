/**
 * Test & Improve — the sample, the honest fidelity reading, and the loop that
 * turns a verdict into a change (or into a plainly stated non-change).
 *
 * The sample re-composes client-side on every interaction. The gateway is
 * called from exactly one place: the "Another sample" button. The variation
 * fact is referenced here, never re-derived — one generator, one sentence.
 */
import { useCallback, useMemo, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, RotateCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { displayDate, arStyle } from "@/lib/arDisplay";
import { hookWord, isoNum, scopeWord, traitWord, type VoiceTr } from "@/lib/voiceText";
import InfoTooltip from "@/components/voice/InfoTooltip";
import {
  AMBER_TEXT, BLUE, CYAN, GREEN, INK, LINE, MUTED, NIGHT, NIGHT_LINE, NIGHT_MUTED, NIGHT_RAISED,
  NIGHT_TEXT, RADIUS, RED, SURFACE, TYPE, WHITE, cardStyle, chipStyle, ghostButton, microLabel,
  monoNum, primaryButton,
} from "@/components/voice/tokens";
import { useCachedVoice, invalidateVoiceCache } from "@/lib/voiceCache";
import { HOOK_NAME, loadVoiceDna, type VoiceDnaModel } from "@/lib/voiceDna";
import { leastUsedHook, variationSummary } from "@/lib/voiceOverview";
import { REPETITION_GATES } from "@/lib/voiceGates";
import { voiceFidelity, type FidelityResult, type FidelityTraitInput } from "@/lib/voiceFidelity";
import { GENERIC_AI_SAMPLE, composeFromTraits, type Segment } from "@/lib/voiceSample";
import {
  VERDICTS, VERDICT_LABEL, verdictLabel, loadFeedbackHistory, needsCorpusReread, planVerdict, submitVerdict,
  type FeedbackRow, type FeedbackTrait, type Verdict,
} from "@/lib/voiceFeedback";

const HL_CYAN = "rgba(0,206,201,.16)";
const HL_AMBER = "rgba(224,168,46,.18)";

const dateMono = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }).toUpperCase();

interface TestModel { dna: VoiceDnaModel; history: FeedbackRow[] }

function Highlighted({ segments, isArabic, whyTerm }: { segments: Segment[]; isArabic: boolean; whyTerm: string }) {
  return (
    <div
      dir={isArabic ? "rtl" : "auto"}
      style={{
        whiteSpace: "pre-wrap", color: NIGHT_TEXT, fontSize: TYPE.bodyLg,
        lineHeight: isArabic ? 1.9 : 1.75,
        fontFamily: isArabic ? "'Cairo', 'Inter', sans-serif" : "Inter, system-ui, sans-serif",
      }}
    >
      {segments.map((s, i) => {
        const bg = s.kind === "hook" || s.kind === "closer" ? HL_CYAN : s.kind === "evidence" ? HL_AMBER : "transparent";
        return (
          <span key={i}>
            {bg === "transparent" ? (
              <span>{s.text}</span>
            ) : (
              <span style={{ display: "inline" }}>
                <span
                  style={{
                    background: bg, borderRadius: RADIUS.chip, padding: "1px 3px",
                    boxDecorationBreak: "clone", WebkitBoxDecorationBreak: "clone",
                  }}
                >
                  {s.text}
                </span>
                {s.reason && <InfoTooltip term={whyTerm} body={s.reason} />}
              </span>
            )}
            {i < segments.length - 1 ? "\n\n" : ""}
          </span>
        );
      })}
    </div>
  );
}

/** Split a gateway-written sample into the same shapes so highlighting still means something. */
function segmentise(text: string, tr?: VoiceTr | null): Segment[] {
  const ar = tr?.lang === "ar";
  const L = (en: string, key: string) => (ar ? tr!.t(key) : en);
  const paras = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  return paras.map((p, i) => {
    if (i === 0) return { text: p, kind: "hook" as const, reason: L("Opening line of this sample", "vo.ti.hlOpen") };
    if (i === paras.length - 1) return { text: p, kind: "closer" as const, reason: L("Closing line of this sample", "vo.ti.hlClose") };
    if (/[\d٠-٩]/.test(p)) return { text: p, kind: "evidence" as const, reason: L("Carries a figure — your evidence habit", "vo.ti.hlFigure") };
    return { text: p, kind: "body" as const };
  });
}

/** A verdict word first: a bare count gives no sense of whether it is good. */
function fidelityHeadline(inside: number, total: number, tr?: VoiceTr | null): string {
  const ar = tr?.lang === "ar";
  if (total === 0) return ar ? tr!.t("vo.ti.hNone") : "Nothing measurable to compare yet.";
  const ratio = inside / total;
  if (ar) {
    const k = ratio === 1 ? "hYours" : ratio >= 0.7 ? "hClose" : ratio >= 0.4 ? "hOff" : "hNot";
    return tr!.t(`vo.ti.${k}`, { inside: isoNum(inside), total: isoNum(total) });
  }
  const word = ratio === 1 ? "Yours" : ratio >= 0.7 ? "Close" : ratio >= 0.4 ? "Some way off" : "Not yours yet";
  return `${word} — ${inside} of ${total} measures match your range.`;
}

function Collapsible({ title, count, children, arTitle }: { title: string; count?: number; children: React.ReactNode; arTitle?: string }) {
  const [open, setOpen] = useState(false);
  const { lang } = useLanguage();
  const ar = lang === "ar";
  const Chev = open ? ChevronDown : ar ? ChevronLeft : ChevronRight;
  return (
    <section style={cardStyle}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        style={arStyle(lang, { ...ghostButton, border: "none", padding: 0, background: "transparent", color: INK, fontSize: TYPE.bodyLg, minBlockSize: 32, display: "inline-flex", alignItems: "center", gap: 6 })}
      >
        {ar
          ? <><Chev size={16} aria-hidden />{arTitle ?? title}</>
          : <>{open ? "▾" : "▸"} {title}{count === undefined ? "" : ` (${count})`}</>}
      </button>
      {open && <div style={{ marginBlockStart: 10 }}>{children}</div>}
    </section>
  );
}

export default function TestImprove({ userId, onWrite, onNavigate, modelOverride }: {
  userId: string | null;
  onWrite: () => void;
  onNavigate: (key: "voice" | "teach" | "test") => void;
  /** dev harness only — lets the empty and thin states be reviewed without owning an account in that state */
  modelOverride?: VoiceDnaModel;
}) {
  const { lang, t } = useLanguage();
  const ar = lang === "ar";
  const tr = useMemo(() => ({ lang, t }), [lang, t]);
  const L = (en: string, key: string, vars?: Record<string, unknown>) => (ar ? t(key, vars) : en);
  const modeName = (label: string | null | undefined) => (ar ? scopeWord(label ?? "your default voice", tr) : label ?? "your default voice");
  const [profileId, setProfileId] = useState<string | null>(null);
  const [side, setSide] = useState<"voice" | "generic">("voice");
  const [seed, setSeed] = useState(0);
  const [gatewayText, setGatewayText] = useState<string | null>(null);
  const [loadingSample, setLoadingSample] = useState(false);
  const [hookOverride, setHookOverride] = useState<string | null>(null);
  const [pendingPhrase, setPendingPhrase] = useState<Verdict | null>(null);
  const [phrase, setPhrase] = useState("");
  const [applyToAll, setApplyToAll] = useState(false);
  const [report, setReport] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The key holds the selected mode, so nothing inside the loader sets state
  // that the loader itself depends on — that loop was costing a double mount.
  const key = modelOverride || !userId ? null : `voice:test:${userId}:${profileId ?? "active"}`;
  const loader = useCallback(async (): Promise<TestModel> => {
    const [dna, history] = await Promise.all([
      loadVoiceDna(userId as string, profileId),
      loadFeedbackHistory(userId as string, 10),
    ]);
    return { dna, history };
  }, [userId, profileId]);

  const state = useCachedVoice<TestModel>(key, loader);
  const model = modelOverride ?? state.data?.dna ?? null;
  const history = state.data?.history ?? [];

  const measured = useMemo(() => (model?.traits ?? []).filter((t) => t.value !== null), [model]);
  const values = useMemo(() => {
    const v: Record<string, number | null> = {};
    for (const t of model?.traits ?? []) v[t.trait_key] = t.value;
    return v;
  }, [model]);

  const activeHook = hookOverride ?? model?.topStyleKey ?? "contrarian_claim";
  const closerKey = useMemo(() => {
    const entries = Object.entries(model?.endingDist ?? {}).sort((a, b) => b[1] - a[1]);
    return entries[0]?.[0] ?? "question";
  }, [model]);

  const lengthTrait = model?.traits.find((t) => t.trait_key === "length") ?? null;
  const targetChars = lengthTrait?.value === null || lengthTrait?.value === undefined
    ? null
    : Math.round(800 + (lengthTrait.value / 100) * 1800);

  const composed = useMemo(
    () => composeFromTraits({ values, targetChars, hookKey: activeHook, closerKey }, seed, HOOK_NAME[activeHook] ?? activeHook, tr),
    [values, targetChars, activeHook, closerKey, seed, tr],
  );

  const voiceSegments = gatewayText ? segmentise(gatewayText, tr) : composed.segments;
  const voiceText = gatewayText ?? composed.text;
  const sampleText = side === "voice" ? voiceText : GENERIC_AI_SAMPLE;

  const fidelityInputs: FidelityTraitInput[] = useMemo(
    () => (model?.traits ?? []).map((t) => ({
      trait_key: t.trait_key, display_name: t.display_name, computable: t.computable,
      value: t.value, band_low: t.band_low, band_high: t.band_high,
    })),
    [model],
  );
  const fidelity: FidelityResult = useMemo(() => voiceFidelity(sampleText, fidelityInputs, tr), [sampleText, fidelityInputs, tr]);

  const thin = (model?.windowClassified ?? 0) < REPETITION_GATES.minClassified;
  const isArabic = side === "voice" ? composed.isArabic && !gatewayText : false;

  const modeOptions = (model?.modes ?? []).filter((m) => m.profileId);
  const activeProfileId = profileId ?? model?.activeProfileId ?? null;
  const activeMode = modeOptions.find((m) => m.profileId === activeProfileId) ?? modeOptions[0] ?? null;

  const anotherSample = async () => {
    if (!userId) return;
    setLoadingSample(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Session expired — sign in again.");
      const { data, error: fnErr } = await supabase.functions.invoke("voice-sample", {
        body: {
          voice: {
            language: composed.isArabic ? "ar" : "en",
            rhythm: (values.pace ?? 50) >= 60 ? "clipped" : "flowing",
            emoji: (values.emoji ?? 0) > 20 ? "some" : "none",
            opener: HOOK_NAME[activeHook] ?? activeHook,
            closer: closerKey,
            length: targetChars ?? 1200,
          },
        },
      });
      if (fnErr) throw fnErr;
      const text = String((data as { sample?: string })?.sample ?? "").trim();
      if (!text) throw new Error("No sample came back. Try again.");
      setGatewayText(text);
    } catch (e) {
      const msg = (e as Error).message;
      setError(ar
        ? t(msg === "Session expired — sign in again." ? "vo.ti.eSession" : msg === "No sample came back. Try again." ? "vo.ti.eNoSample" : "vo.ti.eOther")
        : msg);
    } finally {
      setLoadingSample(false);
    }
  };

  const feedbackTraits: FeedbackTrait[] = (model?.traits ?? []).map((t) => ({
    id: t.id, trait_key: t.trait_key, display_name: t.display_name, value: t.value,
    band_low: t.band_low, band_high: t.band_high, locked: t.locked, source: t.source, computable: t.computable,
  }));

  const send = async (verdict: Verdict, phraseText?: string) => {
    if (!userId || busy) return;
    const plan = planVerdict(
      verdict, feedbackTraits, activeMode?.label ?? "your default voice",
      modeOptions.map((m) => m.label), applyToAll, tr,
    );
    if (plan.needsPhrase && !phraseText) { setPendingPhrase(verdict); setReport(null); return; }
    setBusy(true);
    setError(null);
    try {
      const lines = await submitVerdict({
        userId,
        profileId: activeProfileId,
        allProfileIds: modeOptions.map((m) => m.profileId as string),
        applyToAll,
        modeScope: activeMode?.key ?? "default",
        verdict,
        sampleText,
        traits: feedbackTraits,
        plan,
        phrase: phraseText,
        tr,
      });
      setReport(lines);
      setPendingPhrase(null);
      setPhrase("");
      invalidateVoiceCache("voice:");
      await state.reload(true);
    } catch (e) {
      setError(ar ? t("vo.ti.eOther") : (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!userId && !modelOverride) {
    return <div style={{ ...cardStyle, color: MUTED, fontSize: TYPE.body }}>{L("Sign in to test your voice.", "vo.ti.signIn")}</div>;
  }
  if (state.loading && !model) {
    return <div style={{ ...cardStyle, color: MUTED, fontSize: TYPE.body }}>{L("Reading your voice…", "vo.ti.loading")}</div>;
  }
  if (state.error && !model) {
    return (
      <div style={cardStyle}>
        <div style={{ fontSize: TYPE.title, fontWeight: 600, color: INK }}>{L("KnownBy couldn't load your voice.", "vo.ti.errTitle")}</div>
        <p style={{ fontSize: TYPE.body, color: MUTED, lineHeight: 1.65, marginBlock: "8px 14px" }}>
          {ar ? t("vo.ti.errBody") : <>This is a connection problem, not an empty file. {state.error}</>}
        </p>
        <button type="button" style={primaryButton} onClick={() => void state.reload(true)}>{L("Try again", "vo.ti.retry")}</button>
      </div>
    );
  }
  if (!model) return null;

  /* ── empty state: nothing measured ─────────────────────────────────────── */
  if (measured.length === 0) {
    return (
      <div style={cardStyle}>
        <div style={arStyle(lang, microLabel)}>{ar ? t("vws.test") : "Test & improve"}</div>
        <div style={{ fontSize: TYPE.section, fontWeight: 600, color: INK, marginBlockStart: 8 }}>
          {L("KnownBy hasn't learned your voice yet.", "vo.ti.emptyTitle")}
        </div>
        <p style={{ fontSize: TYPE.body, color: MUTED, lineHeight: 1.65, marginBlock: "6px 12px" }}>
          {L("There is nothing to test until KnownBy has read something you wrote. Give it your posts and this page fills itself.", "vo.ti.emptyBody")}
        </p>
        <button type="button" style={primaryButton} onClick={() => onNavigate("teach")}>{ar ? t("vws.teach") : "Teach KnownBy"}</button>
      </div>
    );
  }

  const summary = variationSummary(model, tr);
  const altHook = leastUsedHook(model.windowDist);
  const reread = needsCorpusReread(history);

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {/* ── PART A — the sample ─────────────────────────────────────────── */}
      <section className="on-night" style={{ background: NIGHT, borderRadius: RADIUS.hero, padding: 18, overflow: "hidden" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={arStyle(lang, { ...microLabel, color: NIGHT_MUTED })}>{L("Test your voice", "vo.ti.testVoice")}</span>
            <span aria-hidden style={{
              inlineSize: 7, blockSize: 7, borderRadius: "50%", background: CYAN,
              animation: "auraBlink 1.6s ease-in-out infinite", display: "inline-block",
            }} />
            <span style={arStyle(lang, { ...monoNum, fontSize: TYPE.micro, letterSpacing: ".12em", textTransform: "uppercase", color: NIGHT_TEXT })}>
              {L("Live", "vo.ti.live")}
            </span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {modeOptions.length > 0 && (
              <div role="radiogroup" aria-label={L("Voice mode", "vo.ti.modeAria")} style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {modeOptions.map((m) => {
                  const on = m.profileId === activeProfileId;
                  return (
                    <button
                      key={m.profileId}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => { setProfileId(m.profileId as string); setGatewayText(null); setReport(null); }}
                      style={{
                        background: on ? NIGHT_RAISED : "transparent", color: on ? NIGHT_TEXT : NIGHT_MUTED,
                        border: `1px solid ${NIGHT_LINE}`, borderRadius: RADIUS.chip, padding: "6px 10px",
                        fontSize: TYPE.small, fontWeight: 600, cursor: "pointer",
                      }}
                    >
                      {modeName(m.label)}
                    </button>
                  );
                })}
              </div>
            )}
            <div role="tablist" aria-label={L("Sample source", "vo.ti.srcAria")} style={{ display: "flex", background: NIGHT_RAISED, borderRadius: RADIUS.button, padding: 2 }}>
              {(["voice", "generic"] as const).map((s) => (
                <button
                  key={s} type="button" role="tab" aria-selected={side === s}
                  onClick={() => { setSide(s); setReport(null); }}
                  style={{
                    background: side === s ? NIGHT_LINE : "transparent", color: side === s ? NIGHT_TEXT : NIGHT_MUTED,
                    border: "none", borderRadius: RADIUS.chip, padding: "6px 10px", fontSize: TYPE.small,
                    fontWeight: 600, cursor: "pointer",
                  }}
                >
                  {s === "voice" ? L("With your voice", "vo.ti.withVoice") : L("Generic AI", "vo.ti.generic")}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div style={{ marginBlockStart: 14 }}>
          {side === "voice" ? (
            <Highlighted segments={voiceSegments} isArabic={isArabic} whyTerm={L("Why this is highlighted", "vo.ti.whyHl")} />
          ) : (
            <div dir="ltr" style={{ whiteSpace: "pre-wrap", color: NIGHT_TEXT, fontSize: TYPE.bodyLg, lineHeight: 1.75, textAlign: "start" }}>
              {GENERIC_AI_SAMPLE}
            </div>
          )}
        </div>

        <div style={arStyle(lang, {
          ...monoNum, fontSize: TYPE.micro, letterSpacing: ".1em", textTransform: "uppercase",
          color: NIGHT_MUTED, marginBlockStart: 14, display: "flex", flexWrap: "wrap", gap: 10,
        })}>
          <span>{isArabic ? L("Arabic", "vo.ti.arabic") : L("English", "vo.ti.english")}</span>
          <span>{L(`${sampleText.length.toLocaleString("en-US")} chars`, "vo.ti.chars", { n: isoNum(sampleText.length) })}</span>
          {targetChars !== null && <span>{L(`Target ${targetChars.toLocaleString("en-US")}`, "vo.ti.target", { n: isoNum(targetChars) })}</span>}
          {!thin && !fidelity.unjudgeable && <span>{L(`Inside range on ${fidelity.inside} of ${fidelity.total}`, "vo.ti.insideOn", { inside: isoNum(fidelity.inside), total: isoNum(fidelity.total) })}</span>}
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBlockStart: 14, alignItems: "center" }}>
          <button
            type="button"
            onClick={() => void anotherSample()}
            disabled={loadingSample}
            style={{
              background: "transparent", color: NIGHT_TEXT, border: `1px solid ${NIGHT_LINE}`,
              borderRadius: RADIUS.button, padding: "8px 12px", fontSize: TYPE.small, fontWeight: 600,
              cursor: loadingSample ? "wait" : "pointer",
              display: "inline-flex", alignItems: "center", gap: 6,
            }}
          >
            {ar
              ? loadingSample ? t("vo.ti.writing") : <><RotateCw size={13} aria-hidden />{t("vo.ti.another")}</>
              : loadingSample ? "Writing…" : "↻ Another sample"}
          </button>
          <button
            type="button"
            onClick={() => { setSeed((s) => s + 1); setGatewayText(null); }}
            style={{
              background: "transparent", color: NIGHT_MUTED, border: `1px solid ${NIGHT_LINE}`,
              borderRadius: RADIUS.button, padding: "8px 12px", fontSize: TYPE.small, fontWeight: 600, cursor: "pointer",
            }}
          >
            {L("Try another sample, free", "vo.ti.free")}
          </button>
          <button type="button" onClick={onWrite} style={{ ...primaryButton, display: "inline-flex", alignItems: "center", gap: 4 }}>
            {ar ? <>{t("vo.ti.write")}<ChevronLeft size={14} aria-hidden /></> : "Write in this voice →"}
          </button>
        </div>
        {error && <p style={{ color: "#F2B8B0", fontSize: TYPE.small, marginBlockStart: 8 }}>{error}</p>}
      </section>

      {/* ── PART B — fidelity ───────────────────────────────────────────── */}
      <section style={cardStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
          <span style={arStyle(lang, microLabel)}>{L("Inside range", "vo.ti.insideRange")}</span>
          <InfoTooltip
            term={L("Inside range", "vo.ti.insideRange")}
            body={L("KnownBy measures this sample the same way it measured your posts, then checks each figure against the range your own writing spans. It is arithmetic, not an opinion about how it sounds.", "vo.ti.insideTip")}
          />
        </div>
        {thin || fidelity.unjudgeable ? (
          <p style={{ fontSize: TYPE.body, color: MUTED, lineHeight: 1.65, marginBlock: "8px 0" }}>
            {L("Not enough evidence to judge range yet.", "vo.ti.notEnough")}
          </p>
        ) : (
          <>
            <div style={{ fontSize: TYPE.title, fontWeight: 600, color: INK, marginBlockStart: 8 }}>
              {fidelityHeadline(fidelity.inside, fidelity.total, tr)}
            </div>
            <div style={{ marginBlockStart: 10 }}>
              {fidelity.traits.map((t) => (
                <div key={t.trait_key} style={{ display: "flex", gap: 10, alignItems: "baseline", padding: "6px 0", borderBlockStart: `1px solid ${LINE}` }}>
                  <span style={arStyle(lang, chipStyle(t.inside ? GREEN : AMBER_TEXT, t.inside ? "#E8F5EF" : "#FBF4E4"))}>
                    {t.inside ? L("Inside", "vo.ti.in") : L("Outside", "vo.ti.out")}
                  </span>
                  <span style={{ fontSize: TYPE.body, color: t.inside ? MUTED : INK, lineHeight: 1.55 }}>
                    {t.miss ?? L(`${t.display_name} sits inside your measured range.`, "vo.ti.sits", { name: t.display_name })}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
        {fidelity.excluded.length > 0 && (
          <p style={{ fontSize: TYPE.small, color: MUTED, lineHeight: 1.6, marginBlock: "10px 0" }}>
            {ar
              ? t("vo.ti.excluded", { list: fidelity.excluded.map((e) => t("vo.ti.excludedPiece", { name: e.display_name, reason: e.reason })).join("، ") })
              : <>Excluded from the count: {fidelity.excluded.map((e) => `${e.display_name} (${e.reason})`).join(", ")}.</>}
          </p>
        )}
      </section>

      {/* ── PART C — the correction loop ────────────────────────────────── */}
      <section style={cardStyle}>
        <div style={{ fontSize: TYPE.bodyLg, fontWeight: 600, color: INK }}>{L("Does this sound like you?", "vo.ti.ask")}</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBlockStart: 10 }}>
          {VERDICTS.map((v) => (
            <button key={v} type="button" className="vd-act" disabled={busy} onClick={() => void send(v)}>
              {verdictLabel(v, tr)}
            </button>
          ))}
        </div>

        <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: TYPE.body, color: MUTED, marginBlockStart: 10 }}>
          <input type="checkbox" checked={applyToAll} onChange={(e) => setApplyToAll(e.target.checked)} />
          {ar ? t("vo.ti.applyAll", { mode: modeName(activeMode?.label) }) : <>Apply to all modes (otherwise the change stays in {activeMode?.label ?? "your default voice"})</>}
        </label>

        {pendingPhrase === "would_never_say" && (
          <div style={{ marginBlockStart: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input
              value={phrase}
              onChange={(e) => setPhrase(e.target.value)}
              dir="auto"
              placeholder={L("Which phrase would you never say?", "vo.ti.phrasePh")}
              aria-label={L("Phrase you would never say", "vo.ti.phraseAria")}
              style={{ flex: "1 1 220px", border: `1px solid ${LINE}`, borderRadius: RADIUS.button, padding: "10px", fontSize: TYPE.body }}
            />
            <button type="button" className="vd-act" disabled={!phrase.trim() || busy} onClick={() => void send("would_never_say", phrase)}>
              {L("Add to never list", "vo.ti.addNever")}
            </button>
          </div>
        )}

        {report && (
          <div role="status" style={{ marginBlockStart: 12, background: SURFACE, borderRadius: RADIUS.button, padding: "10px 12px" }}>
            {report.map((line, i) => (
              <p key={i} style={{ fontSize: TYPE.body, color: INK, lineHeight: 1.6, margin: i === 0 ? 0 : "6px 0 0" }}>{line}</p>
            ))}
          </div>
        )}

        {reread && (
          <p style={{ fontSize: TYPE.body, color: RED, lineHeight: 1.6, marginBlock: "10px 0" }}>
            {L("Three drafts in a row missed in the last fortnight. That is a pattern —", "vo.ti.pattern")}{" "}
            <button
              type="button"
              onClick={() => onNavigate("teach")}
              style={{ background: "none", border: "none", padding: 0, color: BLUE, fontSize: TYPE.body, fontWeight: 600, textDecoration: "underline", cursor: "pointer" }}
            >
              {L("let KnownBy re-read your posts", "vo.ti.patternBtn")}
            </button>{ar ? "" : "."}
          </p>
        )}
      </section>

      {/* ── PART D — recent learning ────────────────────────────────────── */}
      <Collapsible title="Recent learning" count={history.length} arTitle={t("vo.ti.recentCount", { count: isoNum(history.length) })}>
        {history.length === 0 ? (
          <p style={{ fontSize: TYPE.body, color: MUTED, lineHeight: 1.65, margin: 0 }}>
            {L("Nothing yet. Every time you tell KnownBy a draft is wrong, the correction lands here.", "vo.ti.recentNone")}
          </p>
        ) : (
          history.map((r) => (
            <div key={r.id} style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "baseline", padding: "8px 0", borderBlockStart: `1px solid ${LINE}` }}>
              <span style={{ ...monoNum, fontSize: TYPE.caption, color: MUTED, flex: "0 0 96px" }}>{ar ? <span style={arStyle(lang, { fontSize: TYPE.caption })}>{displayDate(r.created_at, lang)}</span> : dateMono(r.created_at)}</span>
              <span style={{ fontSize: TYPE.body, fontWeight: 600, color: INK, flex: "0 0 auto" }}>{ar ? verdictLabel(r.verdict, tr) : VERDICT_LABEL[r.verdict] ?? r.verdict}</span>
              <span style={{ fontSize: TYPE.body, color: MUTED, flex: "1 1 200px", lineHeight: 1.55 }}>
                {r.applied_changes.length === 0
                  ? L("No change: one verdict is not enough to move a trait.", "vo.ti.noChange")
                  : ar
                    ? r.applied_changes.map((c) => c.from === null
                      ? t("vo.ti.changeSet", { trait: traitWord(c.trait_key, tr), to: c.to === null ? "—" : isoNum(Math.round(c.to)), scope: scopeWord(c.scope, tr) })
                      : t("vo.ti.change", { trait: traitWord(c.trait_key, tr), from: isoNum(Math.round(c.from)), to: c.to === null ? "—" : isoNum(Math.round(c.to)), scope: scopeWord(c.scope, tr) }),
                    ).join("؛ ")
                  : r.applied_changes
                      .map((c) => `${c.trait_key.replace(/_/g, " ")} ${c.from === null ? "set" : Math.round(c.from) + "%"} → ${c.to === null ? "—" : Math.round(c.to) + "%"} · ${c.scope}`)
                      .join("; ")}
              </span>
              <span style={{ ...monoNum, fontSize: TYPE.micro, color: MUTED, flex: "0 0 auto" }}>{ar ? (r.mode_scope ? scopeWord(r.mode_scope, tr) : "—") : r.mode_scope ?? "—"}</span>
            </div>
          ))
        )}
      </Collapsible>

      {/* ── PART E — variation, referenced not repeated ─────────────────── */}
      {summary && (
        <Collapsible title="How you open a post" arTitle={t("vo.ti.howOpen")}>
          <p style={{ fontSize: TYPE.body, color: INK, lineHeight: 1.65, marginBlock: "0 10px" }}>{summary}</p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <button
              type="button"
              className="vd-act"
              onClick={() => { setHookOverride(altHook ?? "question"); setGatewayText(null); setSeed((s) => s + 1); }}
            >
              {L("Show me that opening", "vo.ti.showOpening")}
            </button>
            <button
              type="button"
              onClick={() => onNavigate("voice")}
              style={{ background: "none", border: "none", padding: 0, color: BLUE, fontSize: TYPE.body, fontWeight: 600, cursor: "pointer" }}
            >
              {ar ? t("vo.ti.fullBreakdown") : "See the full breakdown →"}
            </button>
            {hookOverride && (
              <span style={{ fontSize: TYPE.small, color: MUTED }}>
                {ar ? t("vo.ti.opensWith", { hook: hookWord(hookOverride, tr) }) : <>Sample now opens with {HOOK_NAME[hookOverride] ?? hookOverride}.</>}{" "}
                <button type="button" className="vd-act" onClick={() => setHookOverride(null)}>{L("Back to yours", "vo.ti.backToYours")}</button>
              </span>
            )}
          </div>
        </Collapsible>
      )}
    </div>
  );
}
