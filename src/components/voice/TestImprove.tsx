/**
 * Test & Improve — the sample, the honest fidelity reading, and the loop that
 * turns a verdict into a change (or into a plainly stated non-change).
 *
 * The sample re-composes client-side on every interaction. The gateway is
 * called from exactly one place: the "Another sample" button. The variation
 * fact is referenced here, never re-derived — one generator, one sentence.
 */
import { useCallback, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
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
  VERDICTS, VERDICT_LABEL, loadFeedbackHistory, needsCorpusReread, planVerdict, submitVerdict,
  type FeedbackRow, type FeedbackTrait, type Verdict,
} from "@/lib/voiceFeedback";

const HL_CYAN = "rgba(0,206,201,.16)";
const HL_AMBER = "rgba(224,168,46,.18)";

const dateMono = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }).toUpperCase();

interface TestModel { dna: VoiceDnaModel; history: FeedbackRow[] }

function Highlighted({ segments, isArabic }: { segments: Segment[]; isArabic: boolean }) {
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
                {s.reason && <InfoTooltip term="Why this is highlighted" body={s.reason} />}
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
function segmentise(text: string): Segment[] {
  const paras = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  return paras.map((p, i) => {
    if (i === 0) return { text: p, kind: "hook" as const, reason: "Opening line of this sample" };
    if (i === paras.length - 1) return { text: p, kind: "closer" as const, reason: "Closing line of this sample" };
    if (/[\d٠-٩]/.test(p)) return { text: p, kind: "evidence" as const, reason: "Carries a figure — your evidence habit" };
    return { text: p, kind: "body" as const };
  });
}

/** A verdict word first: a bare count gives no sense of whether it is good. */
function fidelityHeadline(inside: number, total: number): string {
  if (total === 0) return "Nothing measurable to compare yet.";
  const ratio = inside / total;
  const word = ratio === 1 ? "Yours" : ratio >= 0.7 ? "Close" : ratio >= 0.4 ? "Some way off" : "Not yours yet";
  return `${word} — ${inside} of ${total} measures match your range.`;
}

function Collapsible({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <section style={cardStyle}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        style={{ ...ghostButton, border: "none", padding: 0, background: "transparent", color: INK, fontSize: TYPE.bodyLg, minBlockSize: 32 }}
      >
        {open ? "▾" : "▸"} {title}{count === undefined ? "" : ` (${count})`}
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
    () => composeFromTraits({ values, targetChars, hookKey: activeHook, closerKey }, seed, HOOK_NAME[activeHook] ?? activeHook),
    [values, targetChars, activeHook, closerKey, seed],
  );

  const voiceSegments = gatewayText ? segmentise(gatewayText) : composed.segments;
  const voiceText = gatewayText ?? composed.text;
  const sampleText = side === "voice" ? voiceText : GENERIC_AI_SAMPLE;

  const fidelityInputs: FidelityTraitInput[] = useMemo(
    () => (model?.traits ?? []).map((t) => ({
      trait_key: t.trait_key, display_name: t.display_name, computable: t.computable,
      value: t.value, band_low: t.band_low, band_high: t.band_high,
    })),
    [model],
  );
  const fidelity: FidelityResult = useMemo(() => voiceFidelity(sampleText, fidelityInputs), [sampleText, fidelityInputs]);

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
      setError((e as Error).message);
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
      modeOptions.map((m) => m.label), applyToAll,
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
      });
      setReport(lines);
      setPendingPhrase(null);
      setPhrase("");
      invalidateVoiceCache("voice:");
      await state.reload(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!userId && !modelOverride) {
    return <div style={{ ...cardStyle, color: MUTED, fontSize: TYPE.body }}>Sign in to test your voice.</div>;
  }
  if (state.loading && !model) {
    return <div style={{ ...cardStyle, color: MUTED, fontSize: TYPE.body }}>Reading your voice…</div>;
  }
  if (state.error && !model) {
    return (
      <div style={cardStyle}>
        <div style={{ fontSize: TYPE.title, fontWeight: 600, color: INK }}>Aura couldn't load your voice.</div>
        <p style={{ fontSize: TYPE.body, color: MUTED, lineHeight: 1.65, marginBlock: "8px 14px" }}>
          This is a connection problem, not an empty file. {state.error}
        </p>
        <button type="button" style={primaryButton} onClick={() => void state.reload(true)}>Try again</button>
      </div>
    );
  }
  if (!model) return null;

  /* ── empty state: nothing measured ─────────────────────────────────────── */
  if (measured.length === 0) {
    return (
      <div style={cardStyle}>
        <div style={microLabel}>Test &amp; improve</div>
        <div style={{ fontSize: TYPE.section, fontWeight: 600, color: INK, marginBlockStart: 8 }}>
          Aura hasn&apos;t learned your voice yet.
        </div>
        <p style={{ fontSize: TYPE.body, color: MUTED, lineHeight: 1.65, marginBlock: "6px 12px" }}>
          There is nothing to test until Aura has read something you wrote. Give it your posts and this page fills itself.
        </p>
        <button type="button" style={primaryButton} onClick={() => onNavigate("teach")}>Teach Aura</button>
      </div>
    );
  }

  const summary = variationSummary(model);
  const altHook = leastUsedHook(model.windowDist);
  const reread = needsCorpusReread(history);

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {/* ── PART A — the sample ─────────────────────────────────────────── */}
      <section className="on-night" style={{ background: NIGHT, borderRadius: RADIUS.hero, padding: 18, overflow: "hidden" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ ...microLabel, color: NIGHT_MUTED }}>Test your voice</span>
            <span aria-hidden style={{
              inlineSize: 7, blockSize: 7, borderRadius: "50%", background: CYAN,
              animation: "auraBlink 1.6s ease-in-out infinite", display: "inline-block",
            }} />
            <span style={{ ...monoNum, fontSize: TYPE.micro, letterSpacing: ".12em", textTransform: "uppercase", color: NIGHT_TEXT }}>
              Live
            </span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {modeOptions.length > 0 && (
              <div role="radiogroup" aria-label="Voice mode" style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
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
                      {m.label}
                    </button>
                  );
                })}
              </div>
            )}
            <div role="tablist" aria-label="Sample source" style={{ display: "flex", background: NIGHT_RAISED, borderRadius: RADIUS.button, padding: 2 }}>
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
                  {s === "voice" ? "With your voice" : "Generic AI"}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div style={{ marginBlockStart: 14 }}>
          {side === "voice" ? (
            <Highlighted segments={voiceSegments} isArabic={isArabic} />
          ) : (
            <div style={{ whiteSpace: "pre-wrap", color: NIGHT_TEXT, fontSize: TYPE.bodyLg, lineHeight: 1.75 }}>
              {GENERIC_AI_SAMPLE}
            </div>
          )}
        </div>

        <div style={{
          ...monoNum, fontSize: TYPE.micro, letterSpacing: ".1em", textTransform: "uppercase",
          color: NIGHT_MUTED, marginBlockStart: 14, display: "flex", flexWrap: "wrap", gap: 10,
        }}>
          <span>{isArabic ? "Arabic" : "English"}</span>
          <span>{sampleText.length.toLocaleString("en-US")} chars</span>
          {targetChars !== null && <span>Target {targetChars.toLocaleString("en-US")}</span>}
          {!thin && !fidelity.unjudgeable && <span>Inside range on {fidelity.inside} of {fidelity.total}</span>}
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
            }}
          >
            {loadingSample ? "Writing…" : "↻ Another sample"}
          </button>
          <button
            type="button"
            onClick={() => { setSeed((s) => s + 1); setGatewayText(null); }}
            style={{
              background: "transparent", color: NIGHT_MUTED, border: `1px solid ${NIGHT_LINE}`,
              borderRadius: RADIUS.button, padding: "8px 12px", fontSize: TYPE.small, fontWeight: 600, cursor: "pointer",
            }}
          >
            Try another sample, free
          </button>
          <button type="button" onClick={onWrite} style={primaryButton}>Write in this voice →</button>
        </div>
        {error && <p style={{ color: "#F2B8B0", fontSize: TYPE.small, marginBlockStart: 8 }}>{error}</p>}
      </section>

      {/* ── PART B — fidelity ───────────────────────────────────────────── */}
      <section style={cardStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
          <span style={microLabel}>Inside range</span>
          <InfoTooltip
            term="Inside range"
            body="Aura measures this sample the same way it measured your posts, then checks each figure against the range your own writing spans. It is arithmetic, not an opinion about how it sounds."
          />
        </div>
        {thin || fidelity.unjudgeable ? (
          <p style={{ fontSize: TYPE.body, color: MUTED, lineHeight: 1.65, marginBlock: "8px 0" }}>
            Not enough evidence to judge range yet.
          </p>
        ) : (
          <>
            <div style={{ fontSize: TYPE.title, fontWeight: 600, color: INK, marginBlockStart: 8 }}>
              {fidelityHeadline(fidelity.inside, fidelity.total)}
            </div>
            <div style={{ marginBlockStart: 10 }}>
              {fidelity.traits.map((t) => (
                <div key={t.trait_key} style={{ display: "flex", gap: 10, alignItems: "baseline", padding: "6px 0", borderBlockStart: `1px solid ${LINE}` }}>
                  <span style={chipStyle(t.inside ? GREEN : AMBER_TEXT, t.inside ? "#E8F5EF" : "#FBF4E4")}>
                    {t.inside ? "Inside" : "Outside"}
                  </span>
                  <span style={{ fontSize: TYPE.body, color: t.inside ? MUTED : INK, lineHeight: 1.55 }}>
                    {t.miss ?? `${t.display_name} sits inside your measured range.`}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
        {fidelity.excluded.length > 0 && (
          <p style={{ fontSize: TYPE.small, color: MUTED, lineHeight: 1.6, marginBlock: "10px 0" }}>
            Excluded from the count: {fidelity.excluded.map((e) => `${e.display_name} (${e.reason})`).join(", ")}.
          </p>
        )}
      </section>

      {/* ── PART C — the correction loop ────────────────────────────────── */}
      <section style={cardStyle}>
        <div style={{ fontSize: TYPE.bodyLg, fontWeight: 600, color: INK }}>Does this sound like you?</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBlockStart: 10 }}>
          {VERDICTS.map((v) => (
            <button key={v} type="button" className="vd-act" disabled={busy} onClick={() => void send(v)}>
              {VERDICT_LABEL[v]}
            </button>
          ))}
        </div>

        <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: TYPE.body, color: MUTED, marginBlockStart: 10 }}>
          <input type="checkbox" checked={applyToAll} onChange={(e) => setApplyToAll(e.target.checked)} />
          Apply to all modes (otherwise the change stays in {activeMode?.label ?? "your default voice"})
        </label>

        {pendingPhrase === "would_never_say" && (
          <div style={{ marginBlockStart: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input
              value={phrase}
              onChange={(e) => setPhrase(e.target.value)}
              placeholder="Which phrase would you never say?"
              aria-label="Phrase you would never say"
              style={{ flex: "1 1 220px", border: `1px solid ${LINE}`, borderRadius: RADIUS.button, padding: "10px", fontSize: TYPE.body }}
            />
            <button type="button" className="vd-act" disabled={!phrase.trim() || busy} onClick={() => void send("would_never_say", phrase)}>
              Add to never list
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
            Three drafts in a row missed in the last fortnight. That is a pattern —{" "}
            <button
              type="button"
              onClick={() => onNavigate("teach")}
              style={{ background: "none", border: "none", padding: 0, color: BLUE, fontSize: TYPE.body, fontWeight: 600, textDecoration: "underline", cursor: "pointer" }}
            >
              let Aura re-read your posts
            </button>.
          </p>
        )}
      </section>

      {/* ── PART D — recent learning ────────────────────────────────────── */}
      <Collapsible title="Recent learning" count={history.length}>
        {history.length === 0 ? (
          <p style={{ fontSize: TYPE.body, color: MUTED, lineHeight: 1.65, margin: 0 }}>
            Nothing yet. Every time you tell Aura a draft is wrong, the correction lands here.
          </p>
        ) : (
          history.map((r) => (
            <div key={r.id} style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "baseline", padding: "8px 0", borderBlockStart: `1px solid ${LINE}` }}>
              <span style={{ ...monoNum, fontSize: TYPE.caption, color: MUTED, flex: "0 0 96px" }}>{dateMono(r.created_at)}</span>
              <span style={{ fontSize: TYPE.body, fontWeight: 600, color: INK, flex: "0 0 auto" }}>{VERDICT_LABEL[r.verdict] ?? r.verdict}</span>
              <span style={{ fontSize: TYPE.body, color: MUTED, flex: "1 1 200px", lineHeight: 1.55 }}>
                {r.applied_changes.length === 0
                  ? "No change: one verdict is not enough to move a trait."
                  : r.applied_changes
                      .map((c) => `${c.trait_key.replace(/_/g, " ")} ${c.from === null ? "set" : Math.round(c.from) + "%"} → ${c.to === null ? "—" : Math.round(c.to) + "%"} · ${c.scope}`)
                      .join("; ")}
              </span>
              <span style={{ ...monoNum, fontSize: TYPE.micro, color: MUTED, flex: "0 0 auto" }}>{r.mode_scope ?? "—"}</span>
            </div>
          ))
        )}
      </Collapsible>

      {/* ── PART E — variation, referenced not repeated ─────────────────── */}
      {summary && (
        <Collapsible title="How you open a post">
          <p style={{ fontSize: TYPE.body, color: INK, lineHeight: 1.65, marginBlock: "0 10px" }}>{summary}</p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <button
              type="button"
              className="vd-act"
              onClick={() => { setHookOverride(altHook ?? "question"); setGatewayText(null); setSeed((s) => s + 1); }}
            >
              Show me that opening
            </button>
            <button
              type="button"
              onClick={() => onNavigate("voice")}
              style={{ background: "none", border: "none", padding: 0, color: BLUE, fontSize: TYPE.body, fontWeight: 600, cursor: "pointer" }}
            >
              See the full breakdown →
            </button>
            {hookOverride && (
              <span style={{ fontSize: TYPE.small, color: MUTED }}>
                Sample now opens with {HOOK_NAME[hookOverride] ?? hookOverride}.{" "}
                <button type="button" className="vd-act" onClick={() => setHookOverride(null)}>Back to yours</button>
              </span>
            )}
          </div>
        </Collapsible>
      )}
    </div>
  );
}
