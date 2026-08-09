/**
 * Test & Improve — the sample, the honest fidelity count, and the loop that
 * turns a verdict into a change (or into a plainly stated non-change).
 *
 * The sample re-composes client-side on every interaction. The gateway is
 * called from exactly one place: the "Another sample" button.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AMBER, BLUE, CYAN, GREEN, INK, LINE, MONO, MUTED, NIGHT, RED, cardStyle, ghostButton, microLabel, monoNum } from "@/components/voice/tokens";
import { HOOK_NAME, loadVoiceDna, variationSentence, type VoiceDnaModel } from "@/lib/voiceDna";
import { leastUsedHook } from "@/lib/voiceOverview";
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

function Highlighted({ segments, isArabic }: { segments: Segment[]; isArabic: boolean }) {
  return (
    <div
      dir={isArabic ? "rtl" : "auto"}
      style={{
        whiteSpace: "pre-wrap",
        color: "#E8EDF2",
        fontSize: 14.5,
        lineHeight: isArabic ? 1.9 : 1.75,
        fontFamily: isArabic ? "'Cairo', 'Inter', sans-serif" : "Inter, system-ui, sans-serif",
      }}
    >
      {segments.map((s, i) => {
        const bg = s.kind === "hook" || s.kind === "closer" ? HL_CYAN : s.kind === "evidence" ? HL_AMBER : "transparent";
        return (
          <span key={i}>
            <span
              title={s.reason}
              style={bg === "transparent" ? undefined : { background: bg, borderRadius: 4, padding: "1px 3px", boxDecorationBreak: "clone", WebkitBoxDecorationBreak: "clone" }}
            >
              {s.text}
            </span>
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

export default function TestImprove({ userId, onWrite, onNavigate, modelOverride }: {
  userId: string | null;
  onWrite: () => void;
  onNavigate: (key: "overview" | "dna" | "teach" | "test") => void;
  /** dev harness only — lets the empty and thin states be reviewed without owning an account in that state */
  modelOverride?: VoiceDnaModel;
}) {
  const [model, setModel] = useState<VoiceDnaModel | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [side, setSide] = useState<"voice" | "generic">("voice");
  const [seed, setSeed] = useState(0);
  const [gatewayText, setGatewayText] = useState<string | null>(null);
  const [loadingSample, setLoadingSample] = useState(false);
  const [hookOverride, setHookOverride] = useState<string | null>(null);
  const [history, setHistory] = useState<FeedbackRow[]>([]);
  const [pendingPhrase, setPendingPhrase] = useState<Verdict | null>(null);
  const [phrase, setPhrase] = useState("");
  const [applyToAll, setApplyToAll] = useState(false);
  const [report, setReport] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (modelOverride) { setModel(modelOverride); return; }
    if (!userId) return;
    const m = await loadVoiceDna(userId, profileId);
    setModel(m);
    if (!profileId) setProfileId(m.activeProfileId);
    setHistory(await loadFeedbackHistory(userId, 10));
  }, [userId, profileId, modelOverride]);

  useEffect(() => { void refresh(); }, [refresh]);

  const measured = useMemo(() => (model?.traits ?? []).filter((t) => t.value !== null), [model]);
  const values = useMemo(() => {
    const v: Record<string, number | null> = {};
    for (const t of model?.traits ?? []) v[t.trait_key] = t.value;
    return v;
  }, [model]);

  const topHook = model?.topStyleKey ?? "contrarian_claim";
  const activeHook = hookOverride ?? topHook;
  const closerKey = useMemo(() => {
    const entries = Object.entries(model?.endingDist ?? {}).sort((a, b) => b[1] - a[1]);
    return entries[0]?.[0] ?? "question";
  }, [model]);

  const lengthTrait = model?.traits.find((t) => t.trait_key === "length") ?? null;
  const targetChars = lengthTrait?.value === null || lengthTrait?.value === undefined
    ? null
    : Math.round(800 + (lengthTrait.value / 100) * 1800);

  const composed = useMemo(
    () => composeFromTraits(
      { values, targetChars, hookKey: activeHook, closerKey },
      seed,
      HOOK_NAME[activeHook] ?? activeHook,
    ),
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
  const fidelity: FidelityResult = useMemo(
    () => voiceFidelity(sampleText, fidelityInputs),
    [sampleText, fidelityInputs],
  );

  const thin = (model?.windowClassified ?? 0) < 8;
  const isArabic = side === "voice" ? composed.isArabic && !gatewayText : false;

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

  const modeOptions = (model?.modes ?? []).filter((m) => m.profileId);
  const activeMode = modeOptions.find((m) => m.profileId === profileId) ?? modeOptions[0] ?? null;

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
        profileId,
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
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if ((!userId && !modelOverride) || !model) {
    return <div style={{ ...cardStyle, color: MUTED, fontSize: 13 }}>Loading…</div>;
  }

  /* ── empty state: nothing measured ─────────────────────────────────────── */
  if (measured.length === 0) {
    return (
      <div style={cardStyle}>
        <div style={microLabel}>Test &amp; improve</div>
        <div style={{ fontSize: 16, fontWeight: 600, color: INK, marginBlockStart: 8 }}>
          Aura hasn&apos;t learned your voice yet.
        </div>
        <p style={{ fontSize: 13, color: MUTED, lineHeight: 1.65, marginBlockStart: 6 }}>
          There is nothing to test until Aura has read something you wrote. Give it your posts and this page fills itself.
        </p>
        <button
          type="button"
          onClick={() => onNavigate("teach")}
          style={{
            background: BLUE, color: "#FFFFFF", border: "none", borderRadius: 10,
            padding: "10px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer", marginBlockStart: 10,
          }}
        >
          Teach Aura
        </button>
      </div>
    );
  }

  const variation = variationSentence(model);
  const altHook = leastUsedHook(model.windowDist);
  const reread = needsCorpusReread(history);

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {/* ── PART A — the sample ─────────────────────────────────────────── */}
      <section style={{ background: NIGHT, borderRadius: 24, padding: 18, overflow: "hidden" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ ...microLabel, color: "#8FA0B2" }}>Test your voice</span>
            <span aria-hidden style={{
              inlineSize: 7, blockSize: 7, borderRadius: "50%", background: CYAN,
              animation: "auraBlink 1.6s ease-in-out infinite", display: "inline-block",
            }} />
            <span style={{ ...monoNum, fontSize: 10.5, letterSpacing: ".12em", textTransform: "uppercase", color: CYAN }}>Live</span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {modeOptions.length > 0 && (
              <select
                aria-label="Voice mode"
                value={profileId ?? ""}
                onChange={(e) => { setProfileId(e.target.value); setGatewayText(null); setReport(null); }}
                style={{
                  background: "#162026", color: "#E8EDF2", border: "1px solid #24323C", borderRadius: 8,
                  padding: "5px 8px", fontSize: 12, fontWeight: 600,
                }}
              >
                {modeOptions.map((m) => (
                  <option key={m.profileId} value={m.profileId as string}>{m.label}</option>
                ))}
              </select>
            )}
            <div role="tablist" aria-label="Sample source" style={{ display: "flex", background: "#162026", borderRadius: 8, padding: 2 }}>
              {(["voice", "generic"] as const).map((s) => (
                <button
                  key={s} type="button" role="tab" aria-selected={side === s}
                  onClick={() => { setSide(s); setReport(null); }}
                  style={{
                    background: side === s ? "#24323C" : "transparent", color: side === s ? "#E8EDF2" : "#8FA0B2",
                    border: "none", borderRadius: 6, padding: "5px 10px", fontSize: 12, fontWeight: 600, cursor: "pointer",
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
            <div style={{ whiteSpace: "pre-wrap", color: "#E8EDF2", fontSize: 14.5, lineHeight: 1.75 }}>
              {GENERIC_AI_SAMPLE}
            </div>
          )}
        </div>

        <div style={{
          ...monoNum, fontSize: 10.5, letterSpacing: ".1em", textTransform: "uppercase",
          color: "#8FA0B2", marginBlockStart: 14, display: "flex", flexWrap: "wrap", gap: 10,
        }}>
          <span>{isArabic ? "Arabic" : "English"}</span>
          <span>{sampleText.length.toLocaleString("en-US")} chars</span>
          {targetChars !== null && <span>Target {targetChars.toLocaleString("en-US")}</span>}
          {!thin && !fidelity.unjudgeable && <span>Inside range on {fidelity.inside} of {fidelity.total}</span>}
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBlockStart: 14 }}>
          <button
            type="button"
            onClick={() => void anotherSample()}
            disabled={loadingSample}
            style={{
              background: "transparent", color: "#C7D2DC", border: "1px solid #24323C", borderRadius: 8,
              padding: "7px 12px", fontSize: 12, fontWeight: 600, cursor: loadingSample ? "wait" : "pointer",
            }}
          >
            {loadingSample ? "Writing…" : "↻ Another sample"}
          </button>
          <button
            type="button"
            onClick={() => { setSeed((s) => s + 1); setGatewayText(null); }}
            style={{
              background: "transparent", color: "#8FA0B2", border: "1px solid #24323C", borderRadius: 8,
              padding: "7px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer",
            }}
          >
            Shuffle the template
          </button>
          <button
            type="button"
            onClick={onWrite}
            style={{
              background: BLUE, color: "#FFFFFF", border: "none", borderRadius: 8,
              padding: "7px 14px", fontSize: 12.5, fontWeight: 700, cursor: "pointer",
            }}
          >
            Write in this voice →
          </button>
        </div>
        {error && <p style={{ color: "#FF9A8B", fontSize: 12, marginBlockStart: 8 }}>{error}</p>}
      </section>

      {/* ── PART B — fidelity ───────────────────────────────────────────── */}
      <section style={cardStyle}>
        <div style={microLabel}>How close this is to your range</div>
        {thin || fidelity.unjudgeable ? (
          <p style={{ fontSize: 13, color: MUTED, lineHeight: 1.65, marginBlockStart: 8, marginBlockEnd: 0 }}>
            Not enough evidence to judge range yet.
          </p>
        ) : (
          <>
            <div style={{ ...monoNum, fontSize: 15, color: INK, marginBlockStart: 8 }}>
              Inside your range on {fidelity.inside} of {fidelity.total} measures
            </div>
            <div style={{ marginBlockStart: 10 }}>
              {fidelity.traits.map((t) => (
                <div key={t.trait_key} style={{ display: "flex", gap: 10, alignItems: "baseline", padding: "6px 0", borderBlockStart: `1px solid ${LINE}` }}>
                  <span style={{
                    ...monoNum, fontSize: 9.5, letterSpacing: ".08em", textTransform: "uppercase",
                    color: t.inside ? GREEN : AMBER, background: t.inside ? "#E8F5EF" : "#FBF4E4",
                    borderRadius: 6, padding: "2px 6px", flex: "0 0 auto",
                  }}>{t.inside ? "Inside" : "Outside"}</span>
                  <span style={{ fontSize: 13, color: t.inside ? MUTED : INK, lineHeight: 1.55 }}>
                    {t.miss ?? `${t.display_name} sits inside your measured range.`}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
        {fidelity.excluded.length > 0 && (
          <p style={{ fontSize: 12, color: MUTED, lineHeight: 1.6, marginBlockStart: 10, marginBlockEnd: 0 }}>
            Excluded from the count: {fidelity.excluded.map((e) => `${e.display_name} (${e.reason})`).join(", ")}.
          </p>
        )}
      </section>

      {/* ── PART C — the correction loop ────────────────────────────────── */}
      <section style={cardStyle}>
        <div style={{ fontSize: 14, fontWeight: 600, color: INK }}>Does this sound like you?</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBlockStart: 10 }}>
          {VERDICTS.map((v) => (
            <button
              key={v} type="button" disabled={busy} onClick={() => void send(v)}
              style={{ ...ghostButton, color: INK, opacity: busy ? 0.6 : 1 }}
            >
              {VERDICT_LABEL[v]}
            </button>
          ))}
        </div>

        <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12.5, color: MUTED, marginBlockStart: 10 }}>
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
              style={{ flex: "1 1 220px", border: `1px solid ${LINE}`, borderRadius: 8, padding: "8px 10px", fontSize: 13 }}
            />
            <button
              type="button" disabled={!phrase.trim() || busy}
              onClick={() => void send("would_never_say", phrase)}
              style={{ ...ghostButton, color: INK }}
            >
              Add to never list
            </button>
          </div>
        )}

        {report && (
          <div style={{ marginBlockStart: 12, background: "#F2F5F9", borderRadius: 10, padding: "10px 12px" }}>
            {report.map((line, i) => (
              <p key={i} style={{ fontSize: 13, color: INK, lineHeight: 1.6, margin: i === 0 ? 0 : "6px 0 0" }}>{line}</p>
            ))}
          </div>
        )}

        {reread && (
          <p style={{ fontSize: 13, color: RED, lineHeight: 1.6, marginBlockStart: 10, marginBlockEnd: 0 }}>
            Three drafts in a row missed in the last fortnight. That is a pattern — let Aura re-read your posts.{" "}
            <button type="button" onClick={() => onNavigate("teach")} style={{ ...ghostButton, color: INK, marginInlineStart: 6 }}>
              Re-read my corpus
            </button>
          </p>
        )}
      </section>

      {/* ── PART D — recent learning ────────────────────────────────────── */}
      <section style={cardStyle}>
        <div style={microLabel}>Recent learning</div>
        {history.length === 0 ? (
          <p style={{ fontSize: 13, color: MUTED, lineHeight: 1.65, marginBlockStart: 8, marginBlockEnd: 0 }}>
            Nothing yet. Every time you tell Aura a draft is wrong, the correction lands here.
          </p>
        ) : (
          <div style={{ marginBlockStart: 8 }}>
            {history.map((r) => (
              <div key={r.id} style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "baseline", padding: "8px 0", borderBlockStart: `1px solid ${LINE}` }}>
                <span style={{ ...monoNum, fontSize: 11, color: MUTED, flex: "0 0 96px" }}>{dateMono(r.created_at)}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: INK, flex: "0 0 auto" }}>{VERDICT_LABEL[r.verdict] ?? r.verdict}</span>
                <span style={{ fontSize: 13, color: MUTED, flex: "1 1 200px", lineHeight: 1.55 }}>
                  {r.applied_changes.length === 0
                    ? "No change: one verdict is not enough to move a trait."
                    : r.applied_changes
                        .map((c) => `${c.trait_key.replace(/_/g, " ")} ${c.from === null ? "set" : Math.round(c.from) + "%"} → ${c.to === null ? "—" : Math.round(c.to) + "%"} · ${c.scope}`)
                        .join("; ")}
                </span>
                <span style={{ ...monoNum, fontSize: 10.5, color: MUTED, flex: "0 0 auto" }}>{r.mode_scope ?? "—"}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── PART E — variation ──────────────────────────────────────────── */}
      {variation && (
        <section style={cardStyle}>
          <div style={microLabel}>Variation</div>
          <p style={{ fontSize: 13, color: MUTED, lineHeight: 1.65, marginBlockStart: 8, marginBlockEnd: 10 }}>{variation}</p>
          <button
            type="button"
            onClick={() => { setHookOverride(altHook ?? "question"); setGatewayText(null); setSeed((s) => s + 1); }}
            style={{ ...ghostButton, color: INK }}
          >
            Show me that opening
          </button>
          {hookOverride && (
            <span style={{ fontSize: 12, color: MUTED, marginInlineStart: 10 }}>
              Sample now opens with {HOOK_NAME[hookOverride] ?? hookOverride}.{" "}
              <button type="button" onClick={() => setHookOverride(null)} style={{ ...ghostButton, color: INK }}>Back to yours</button>
            </span>
          )}
        </section>
      )}

      <style>{`@keyframes auraBlink { 0%,100% { opacity: 1 } 50% { opacity: .25 } }`}</style>
    </div>
  );
}
