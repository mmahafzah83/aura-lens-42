import { useCallback, useEffect, useRef } from "react";
import type { FamilyEntry } from "./renderers";
import type { FrameDecision } from "./renderers/FrameCard";
import type { Lang, Mood } from "./renderers/shared";
import { useMemo, useState } from "react";
import { useSuggestions, type Suggestion, type SuggestSource } from "./useSuggestions";
import { logSignatureEvent } from "./logEvent";
import { ensureCardFontsLoaded } from "./fitText";
import { supabase } from "@/integrations/supabase/client";

export interface EditorFields {
  name: string;
  title: string;
  line1: string;
  line2: string;
  meta: string;
}

interface Props {
  family: FamilyEntry;
  lang: Lang;
  mood: Mood;
  fields: EditorFields;
  photoUrl?: string;
  onLang: (l: Lang) => void;
  onMood: (m: Mood) => void;
  onFields: (f: EditorFields) => void;
  onPhoto: (url: string | undefined) => void;
  onPickedSource?: (src: "profile" | "signal" | "voice") => void;
  // Frame designer-brain state, lifted so Preview/Publish render the same composition.
  decision?: FrameDecision;
  emphasisOff?: boolean;
  designOption?: "A" | "B" | "C" | null;
  onDecision?: (d: FrameDecision | undefined) => void;
  onEmphasisOff?: (v: boolean) => void;
  onDesignOption?: (id: "A" | "B" | "C" | null) => void;
  onBack: () => void;
  onContinue: () => void;
}

const MOODS: { key: Mood; hex: string; label: string }[] = [
  { key: "oxblood", hex: "#6E2A26", label: "Oxblood" },
  { key: "teal", hex: "#36C5B0", label: "Teal" },
  { key: "amber", hex: "#D6A748", label: "Amber" },
];

/** Downscale an uploaded image to max 2000px on the long edge, then
 *  emit an object URL. Kept client-side; storage upload happens in
 *  the (future) publish step. */
async function downscaleToObjectUrl(file: File, max = 2000): Promise<string> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * scale);
  const h = Math.round(bmp.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bmp, 0, 0, w, h);
  const blob: Blob = await new Promise((res) => canvas.toBlob((b) => res(b as Blob), "image/jpeg", 0.9)!);
  return URL.createObjectURL(blob);
}

interface FrameOption extends FrameDecision {
  id: "A" | "B" | "C";
  reason: string;
}

export default function Editor({
  family, lang, mood, fields, photoUrl,
  onLang, onMood, onFields, onPhoto, onPickedSource,
  decision, emphasisOff, designOption,
  onDecision, onEmphasisOff, onDesignOption,
  onBack, onContinue,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const usesPhoto = family.id === "frame" || family.id === "signature";
  const usesLine2 = family.id === "signature";
  const usesLayout = family.id === "frame";
  const usesHighlight = family.id === "frame";

  // "More details" is collapsed by default when core fields already have data.
  const hasCoreData = Boolean(fields.name || fields.title || fields.meta);
  const [detailsOpen, setDetailsOpen] = useState<boolean>(!hasCoreData);

  const C = family.component as React.ComponentType<React.ComponentProps<typeof family.component> & {
    decision?: FrameDecision;
    emphasisOff?: boolean;
  }>;
  const { suggestions, loading: suggestLoading, regenerate } = useSuggestions(family, lang);

  // ── Frame family designer brain ─────────────────────────────────
  // Decision + emphasisOff live at studio level (props). Options list
  // is local — the user's pick copies one option up via onDecision.
  const [options, setOptions] = useState<FrameOption[]>([]);
  const [designLoading, setDesignLoading] = useState(false);
  const moodTouchedRef = useRef(false);
  const activeOption = designOption
    ? options.find((o) => o.id === designOption) || null
    : null;
  const designReason = activeOption?.reason || "";

  const applyOption = useCallback((opt: FrameOption, log = true) => {
    const initial: FrameDecision = {
      textZone: opt.textZone,
      scrim: opt.scrim,
      cropFocusY: opt.cropFocusY,
      emphasis: opt.emphasis,
      textColor: opt.textColor,
    };
    onDecision?.(initial);
    onDesignOption?.(opt.id);
    if (log) void logSignatureEvent("picked", family.id, lang, { designOption: opt.id, decision: opt });
    // Law 5 — deterministic contrast escalation on top of the brain's pick.
    if (photoUrl) {
      void (async () => {
        const { adjustEffectiveScrim } = await import("./renderers/shared");
        const res = await adjustEffectiveScrim(initial, photoUrl);
        const before = { scrim: initial.scrim, textColor: initial.textColor ?? "paper" };
        const after = { scrim: res.decision.scrim, textColor: res.decision.textColor ?? "paper" };
        if (before.scrim !== after.scrim || before.textColor !== after.textColor) {
          onDecision?.(res.decision);
        }
      })();
    }
  }, [family.id, lang, onDecision, onDesignOption, photoUrl]);

  const runDesign = useCallback(async () => {
    if (family.id !== "frame" || !photoUrl) return;
    setDesignLoading(true);
    try {
      // Downscale current photo to <=1024px JPEG base64.
      const res = await fetch(photoUrl);
      const blob = await res.blob();
      const bmp = await createImageBitmap(blob);
      const scale = Math.min(1, 1024 / Math.max(bmp.width, bmp.height));
      const w = Math.round(bmp.width * scale);
      const h = Math.round(bmp.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      canvas.getContext("2d")!.drawImage(bmp, 0, 0, w, h);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
      const base64 = dataUrl.split(",")[1];
      const { data } = await supabase.functions.invoke("signature-suggest", {
        body: {
          mode: "design",
          lang,
          imageBase64: base64,
          line1: fields.line1,
          line2: fields.line2,
          family: "frame",
        },
      });
      const opts = Array.isArray((data as any)?.options) ? (data as any).options : null;
      const suggestedMood = (data as any)?.mood;
      if (opts && opts.length) {
        const normalized: FrameOption[] = opts.slice(0, 3).map((o: any, i: number) => ({
          id: (["A","B","C"] as const)[i],
          textZone: o.textZone,
          scrim: o.scrim,
          cropFocusY: typeof o.cropFocusY === "number" ? o.cropFocusY : 0.5,
          emphasis: Array.isArray(o.emphasis) ? o.emphasis : [],
          textColor: o.textColor === "ink" ? "ink" : "paper",
          reason: typeof o.reason === "string" ? o.reason : "",
        }));
        setOptions(normalized);
        // Apply option A by default; don't log picked on auto-apply.
        if (normalized[0]) applyOption(normalized[0], false);
        if (suggestedMood && !moodTouchedRef.current) onMood(suggestedMood);
        void logSignatureEvent("suggested", family.id, lang, { design: true, options: normalized, mood: suggestedMood });
      }
    } catch (err) {
      console.warn("frame design failed", err);
    } finally {
      setDesignLoading(false);
    }
  }, [family.id, photoUrl, lang, fields.line1, fields.line2, onMood, applyOption]);

  // Auto-run when photo or line1 changes (debounced), for frame only.
  useEffect(() => {
    if (family.id !== "frame" || !photoUrl) {
      setOptions([]);
      onDecision?.(undefined);
      onDesignOption?.(null);
      return;
    }
    const t = window.setTimeout(() => { void runDesign(); }, 1500);
    return () => window.clearTimeout(t);
  }, [family.id, photoUrl, fields.line1, lang]); // eslint-disable-line react-hooks/exhaustive-deps

  const [preferSet, setPreferSet] = useState<Set<SuggestSource>>(new Set(["profile", "signal", "voice"]));
  const filtered = useMemo(
    () => suggestions.filter((s) => preferSet.has(s.source)),
    [suggestions, preferSet],
  );
  const togglePrefer = (k: SuggestSource) => {
    setPreferSet((prev) => {
      const next = new Set(prev);
      if (next.has(k)) { if (next.size > 1) next.delete(k); }
      else next.add(k);
      // Ask the EF to bias next set toward the chosen mix.
      void regenerate(Array.from(next));
      return next;
    });
  };

  // Ensure Cairo / Newsreader / IBM Plex Mono are in the browser font
  // cache before fitText's canvas measurement runs — otherwise Arabic
  // words each measure as "too wide" and stack one-per-line.
  useEffect(() => { void ensureCardFontsLoaded(); }, []);

  // Debounced 'edited' event: fires ONCE per picked-then-edited session.
  const pickedRef = useRef<{ fields: EditorFields; suggestion: Suggestion } | null>(null);
  const editedFiredRef = useRef(false);
  const editTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!pickedRef.current || editedFiredRef.current) return;
    if (editTimerRef.current) window.clearTimeout(editTimerRef.current);
    editTimerRef.current = window.setTimeout(() => {
      if (!pickedRef.current || editedFiredRef.current) return;
      const before = pickedRef.current.fields;
      // Only log if something actually changed vs the picked snapshot.
      const changed = (Object.keys(before) as (keyof EditorFields)[])
        .some((k) => before[k] !== fields[k]);
      if (!changed) return;
      editedFiredRef.current = true;
      void logSignatureEvent("edited", family.id, lang, {
        before,
        after: fields,
        suggestion: pickedRef.current.suggestion,
      });
    }, 900);
    return () => {
      if (editTimerRef.current) window.clearTimeout(editTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fields.name, fields.title, fields.line1, fields.line2, fields.meta]);

  const pickSuggestion = (s: Suggestion) => {
    const next: EditorFields = {
      ...fields,
      line1: s.lines[0] || fields.line1,
      line2: s.lines[1] ?? (usesLine2 ? fields.line2 : ""),
    };
    pickedRef.current = { fields: next, suggestion: s };
    editedFiredRef.current = false;
    onFields(next);
    onPickedSource?.(s.source);
    void logSignatureEvent("picked", family.id, lang, { suggestion: s });
  };

  const set = useCallback((key: keyof EditorFields, v: string) => {
    onFields({ ...fields, [key]: v });
  }, [fields, onFields]);

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      if (photoUrl) URL.revokeObjectURL(photoUrl);
      const url = await downscaleToObjectUrl(f);
      onPhoto(url);
    } catch (err) {
      console.warn("photo downscale failed", err);
    }
  };

  const wrappedOnMood = (m: Mood) => {
    if (decision) {
      void logSignatureEvent("edited", family.id, lang, { overrode: "mood", from: mood, to: m });
    }
    moodTouchedRef.current = true;
    onMood(m);
  };
  const toggleEmphasis = () => {
    if (decision) {
      void logSignatureEvent("edited", family.id, lang, { overrode: "emphasis", off: !emphasisOff });
    }
    onEmphasisOff?.(!emphasisOff);
  };

  return (
    <section style={{ maxWidth: 1240, margin: "0 auto" }}>
      <style>{EDITOR_CSS}</style>
      <div style={topRow}>
        <button onClick={onBack} style={backBtn}>← Back</button>
        <div style={crumb}>{family.label}</div>
        <button onClick={onContinue} style={primaryBtn}>Continue →</button>
      </div>

      <div className="sig-editor-grid">
        <div className="sig-editor-panel">
          {/* Designer's note — moved OFF the photo, calm caption above the panel. */}
          {usesLayout && (designReason || designLoading || photoUrl) && (
            <div style={designerNote} aria-live="polite">
              ◈ {designLoading
                ? "Looking at your photo…"
                : (designReason || (photoUrl ? "Ready when you pick a layout." : ""))}
            </div>
          )}

          <div style={suggestWrap}>
            <div style={suggestHeaderRow}>
              <div style={fieldLabel}>
                Suggestions {suggestLoading && <span style={thinkingDot}>· thinking…</span>}
              </div>
              <button
                type="button"
                onClick={() => regenerate(Array.from(preferSet))}
                disabled={suggestLoading}
                style={regenBtn}
                title="Fetch a fresh set"
              >
                ↻ New set
              </button>
            </div>
            <div style={filterRow}>
              {(["profile", "signal", "voice"] as SuggestSource[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => togglePrefer(k)}
                  style={{
                    ...filterChip,
                    color: preferSet.has(k) ? "var(--ob-bg)" : "var(--ink-2)",
                    background: preferSet.has(k) ? "var(--spot)" : "transparent",
                    borderColor: preferSet.has(k) ? "var(--spot)" : "var(--rule)",
                  }}
                >
                  {k}
                </button>
              ))}
            </div>
            {suggestions.length === 0 && !suggestLoading && (
              <div style={suggestEmpty}>No AI suggestions yet — defaults below are ready to edit.</div>
            )}
            <div style={suggestList}>
              {(filtered.length ? filtered : suggestions).map((s, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => pickSuggestion(s)}
                  className="sig-suggest-card"
                  style={suggestCard}
                  title={`Fill from ${s.source}`}
                >
                  <span style={suggestSource}>{s.source}</span>
                  <span className="sig-suggest-lines" style={suggestLines}>
                    {s.lines.map((l, j) => <span key={j} style={{ display: "block" }}>{l}</span>)}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* GROUP: Your line — always first, always visible */}
          <Group title="Your line" caption="What your card says.">
            <textarea
              value={fields.line1}
              onChange={(e) => set("line1", e.target.value)}
              style={textarea}
              rows={3}
              aria-label="Your line"
            />
            {usesLine2 && (
              <>
                <span style={subLabel}>Second line</span>
                <input
                  value={fields.line2}
                  onChange={(e) => set("line2", e.target.value)}
                  style={input}
                  aria-label="Second line"
                />
              </>
            )}
          </Group>

          {/* GROUP: Layout — Frame family only, human-labelled */}
          {usesLayout && (
            <Group
              title="Layout"
              caption="Where the words sit on your photo."
              headerRight={
                <button
                  type="button"
                  onClick={() => void runDesign()}
                  disabled={!photoUrl || designLoading}
                  style={quietLink}
                  title="Fetch fresh layout options"
                >
                  New options ↻
                </button>
              }
            >
              {!photoUrl ? (
                <div style={mutedNote}>Add a photo to see layout options.</div>
              ) : options.length === 0 ? (
                <div style={mutedNote}>{designLoading ? "Looking at your photo…" : "No options yet."}</div>
              ) : (
                <>
                  <div style={layoutRow}>
                    {options.map((o, i) => {
                      const active = designOption === o.id;
                      return (
                        <button
                          key={o.id}
                          type="button"
                          onClick={() => applyOption(o)}
                          style={{
                            ...layoutCard,
                            borderColor: active ? "var(--spot)" : "var(--rule)",
                            background: active ? "rgba(212,176,86,0.10)" : "transparent",
                          }}
                          aria-pressed={active}
                        >
                          <span style={{ ...suggestSource, color: active ? "var(--spot)" : "var(--ink-3)" }}>
                            Layout {i + 1}
                          </span>
                          <span style={layoutHint}>
                            {o.textZone.startsWith("upper") ? "Top" : "Bottom"}
                            {" "}
                            {o.textZone.endsWith("left") ? "left" : "right"}
                            {" · "}
                            {o.scrim === "none" ? "no wash" : o.scrim.replace("-", " ")}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  {activeOption?.reason && (
                    <div style={activeReason}>{activeOption.reason}</div>
                  )}
                </>
              )}
            </Group>
          )}

          {/* GROUP: Highlight a phrase — Frame family only, real switch */}
          {usesHighlight && (
            <Group title="Highlight a phrase" caption="Emphasise one key phrase.">
              <div style={switchRow}>
                <SwitchBtn
                  on={!emphasisOff}
                  onClick={toggleEmphasis}
                  disabled={!decision}
                  label={emphasisOff ? "Off" : "On"}
                />
                {!emphasisOff && decision?.emphasis && decision.emphasis.length > 0 && (
                  <span style={emphasisChip}>{decision.emphasis.join(" · ")}</span>
                )}
              </div>
            </Group>
          )}

          {/* GROUP: Language */}
          <Group title="Language" caption="Which script the card reads in.">
            <div style={rowBtns} role="tablist" aria-label="Language">
              <PillBtn active={lang === "en"} onClick={() => onLang("en")}>EN</PillBtn>
              <PillBtn active={lang === "ar"} onClick={() => onLang("ar")} fontFamily="'Cairo', system-ui, sans-serif">عربي</PillBtn>
            </div>
          </Group>

          {/* GROUP: Colour mood */}
          <Group title="Colour mood" caption="Sets the card's accent.">
            <div style={swatchRow}>
              {MOODS.map((m) => {
                const active = mood === m.key;
                const plain = m.key === "oxblood" ? "Warm" : m.key === "teal" ? "Cool" : "Gold";
                return (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => wrappedOnMood(m.key)}
                    aria-label={plain}
                    aria-pressed={active}
                    style={swatchBtn}
                  >
                    <span
                      style={{
                        ...swatch,
                        background: m.hex,
                        outline: active ? "2px solid var(--spot)" : "1px solid var(--rule)",
                        outlineOffset: active ? "3px" : "0",
                      }}
                    />
                    <span style={{ ...subLabel, color: active ? "var(--spot)" : "var(--ink-2)" }}>{plain}</span>
                  </button>
                );
              })}
            </div>
          </Group>

          {/* GROUP: Photo (only for families that use one) */}
          {usesPhoto && (
            <Group title="Photo" caption={photoUrl ? "Change or remove your photo." : "Upload a portrait or scene."}>
              <input ref={fileRef} type="file" accept="image/*" onChange={onPick} style={fileInput} />
              {photoUrl && (
                <button onClick={() => onPhoto(undefined)} style={secondaryBtn}>Remove photo</button>
              )}
            </Group>
          )}

          {/* MORE DETAILS — collapsed by default when populated */}
          <div style={detailsWrap}>
            <button
              type="button"
              onClick={() => setDetailsOpen((v) => !v)}
              style={detailsToggle}
              aria-expanded={detailsOpen}
            >
              More details {detailsOpen ? "▾" : "▸"}
            </button>
            {detailsOpen && (
              <div style={detailsBody}>
                <Field label="Name">
                  <input value={fields.name} onChange={(e) => set("name", e.target.value)} style={input} />
                </Field>
                <Field label="Title / label">
                  <input value={fields.title} onChange={(e) => set("title", e.target.value)} style={input} />
                </Field>
                <Field label="Byline / firm">
                  <input value={fields.meta} onChange={(e) => set("meta", e.target.value)} style={input} />
                </Field>
              </div>
            )}
          </div>

          <div className="sig-editor-continue">
            <button onClick={onContinue} style={{ ...primaryBtn, width: "100%" }}>Continue →</button>
          </div>
        </div>

        <div className="sig-editor-stage">
          <div className="sig-editor-stage-inner">
            <C
              lang={lang} mood={mood} photoUrl={photoUrl}
              name={fields.name} title={fields.title}
              lines={[fields.line1, fields.line2]} meta={fields.meta}
              decision={decision} emphasisOff={emphasisOff}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={fieldWrap}>
      <span style={fieldLabel}>{label}</span>
      {children}
    </label>
  );
}

function Group({
  title, caption, headerRight, children,
}: { title: string; caption?: string; headerRight?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section style={groupWrap}>
      <header style={groupHeader}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={groupTitle}>{title}</span>
          {caption && <span style={groupCaption}>{caption}</span>}
        </div>
        {headerRight}
      </header>
      <div style={groupBody}>{children}</div>
    </section>
  );
}

function SwitchBtn({ on, onClick, disabled, label }: { on: boolean; onClick: () => void; disabled?: boolean; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      role="switch"
      aria-checked={on}
      style={{
        ...switchBtn,
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      <span
        style={{
          ...switchTrack,
          background: on ? "var(--spot)" : "var(--rule)",
        }}
      >
        <span
          style={{
            ...switchThumb,
            transform: on ? "translateX(20px)" : "translateX(0)",
          }}
        />
      </span>
      <span style={switchLabel}>{label}</span>
    </button>
  );
}

function PillBtn({ active, onClick, children, fontFamily }: { active: boolean; onClick: () => void; children: React.ReactNode; fontFamily?: string }) {
  return (
    <button
      onClick={onClick}
      style={{
        ...pill,
        ...(fontFamily ? { fontFamily } : null),
        color: active ? "var(--ob-bg)" : "var(--ink)",
        background: active ? "var(--spot)" : "transparent",
        borderColor: active ? "var(--spot)" : "var(--rule)",
      }}
    >
      {children}
    </button>
  );
}

/* ------- inline styles kept scoped to System-A tokens ------- */

const topRow: React.CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "space-between",
  marginBottom: 20,
};
const crumb: React.CSSProperties = {
  fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
  fontSize: 10, letterSpacing: "0.24em", textTransform: "uppercase",
  color: "var(--spot)",
};
const grid: React.CSSProperties = {
  display: "grid", gap: 28,
  gridTemplateColumns: "minmax(0, 1.4fr) minmax(280px, 1fr)",
};
const stage: React.CSSProperties = {
  background: "var(--paper)",
  border: "1px solid var(--rule)",
  padding: 24,
  display: "flex", alignItems: "center", justifyContent: "center",
  minHeight: 500,
};
const stageInner: React.CSSProperties = {
  width: "100%", maxWidth: 560,
};
const panel: React.CSSProperties = {
  background: "var(--paper)",
  border: "1px solid var(--rule)",
  padding: 20,
  display: "flex", flexDirection: "column", gap: 14,
};
const fieldWrap: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 6 };
const fieldLabel: React.CSSProperties = {
  fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
  fontSize: 9, letterSpacing: "0.24em", textTransform: "uppercase",
  color: "var(--ink-3)",
};
const input: React.CSSProperties = {
  background: "var(--paper-3, var(--paper-2))",
  color: "var(--ink)",
  border: "1px solid var(--rule)",
  padding: "10px 12px",
  fontFamily: "'Newsreader', serif",
  fontSize: 15,
};
const textarea: React.CSSProperties = { ...input, resize: "vertical" as const };
const fileInput: React.CSSProperties = {
  color: "var(--ink-2)", fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 12,
};
const rowBtns: React.CSSProperties = { display: "flex", gap: 8, flexWrap: "wrap" };
const pill: React.CSSProperties = {
  padding: "8px 16px",
  minWidth: 44, minHeight: 44,
  display: "inline-flex", alignItems: "center", justifyContent: "center",
  fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
  fontSize: 11, letterSpacing: "0.22em", textTransform: "uppercase",
  border: "1px solid var(--rule)",
  cursor: "pointer",
};
const swatch: React.CSSProperties = {
  width: 44, height: 44, borderRadius: 999, cursor: "pointer",
  border: "none",
};
const reasonBar: React.CSSProperties = {
  position: "absolute", top: 4, left: 12, right: 12,
  display: "flex", justifyContent: "space-between", alignItems: "center",
  fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
  fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase",
  color: "var(--ink-3)", pointerEvents: "auto",
};
const reasonBtn: React.CSSProperties = {
  background: "transparent", border: "1px solid var(--rule)",
  padding: "12px 14px",
  minWidth: 44, minHeight: 44,
  display: "inline-flex", alignItems: "center", justifyContent: "center",
  fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
  fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase",
  color: "var(--spot)", cursor: "pointer",
};
const backBtn: React.CSSProperties = {
  background: "transparent",
  color: "var(--ink-2)",
  border: "1px solid var(--rule)",
  padding: "8px 18px",
  fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
  fontSize: 10,
  letterSpacing: "0.24em",
  textTransform: "uppercase",
  cursor: "pointer",
};
const primaryBtn: React.CSSProperties = {
  ...backBtn,
  color: "var(--ob-bg)",
  background: "var(--spot)",
  borderColor: "var(--spot)",
};
const secondaryBtn: React.CSSProperties = {
  ...backBtn,
  marginTop: 8,
};
const suggestWrap: React.CSSProperties = {
  display: "flex", flexDirection: "column", gap: 8,
  paddingBottom: 12, borderBottom: "1px solid var(--rule)",
};
const suggestHeaderRow: React.CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
};
const regenBtn: React.CSSProperties = {
  background: "transparent",
  color: "var(--spot)",
  border: "1px solid var(--rule)",
  padding: "12px 14px",
  minWidth: 44, minHeight: 44,
  display: "inline-flex", alignItems: "center", justifyContent: "center",
  fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
  fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase",
  cursor: "pointer",
};
const filterRow: React.CSSProperties = { display: "flex", gap: 6, flexWrap: "wrap" };
const filterChip: React.CSSProperties = {
  padding: "12px 14px",
  minWidth: 44, minHeight: 44,
  display: "inline-flex", alignItems: "center", justifyContent: "center",
  fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
  fontSize: 9, letterSpacing: "0.2em", textTransform: "uppercase",
  border: "1px solid var(--rule)",
  cursor: "pointer",
};
const suggestList: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 6 };
const suggestCard: React.CSSProperties = {
  textAlign: "left" as const,
  background: "var(--paper-3, var(--paper-2))",
  border: "1px solid var(--rule)",
  padding: "10px 12px",
  cursor: "pointer",
  display: "flex", flexDirection: "column", gap: 4,
  color: "var(--ink)",
};
const suggestSource: React.CSSProperties = {
  fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
  fontSize: 9, letterSpacing: "0.22em", textTransform: "uppercase",
  color: "var(--spot)",
};
const suggestLines: React.CSSProperties = {
  fontFamily: "'Newsreader', serif", fontSize: 14, lineHeight: 1.35,
};
const suggestEmpty: React.CSSProperties = {
  fontFamily: "'Newsreader', serif", fontSize: 13, color: "var(--ink-3)",
  fontStyle: "italic",
};
const thinkingDot: React.CSSProperties = {
  color: "var(--ink-3)", fontStyle: "italic", textTransform: "none",
  letterSpacing: 0, marginLeft: 6,
};

/* ---- new grouped-panel styles ---- */
const designerNote: React.CSSProperties = {
  fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
  fontSize: 13, lineHeight: 1.4,
  color: "var(--ink-2)",
  padding: "10px 12px",
  background: "var(--paper-3, var(--paper-2))",
  border: "1px solid var(--rule)",
  borderLeft: "2px solid var(--spot)",
};
const groupWrap: React.CSSProperties = {
  display: "flex", flexDirection: "column", gap: 10,
  paddingTop: 16, borderTop: "1px solid var(--rule)",
};
const groupHeader: React.CSSProperties = {
  display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12,
};
const groupTitle: React.CSSProperties = {
  fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
  fontSize: 10, letterSpacing: "0.22em", textTransform: "uppercase",
  color: "var(--ink)",
};
const groupCaption: React.CSSProperties = {
  fontFamily: "'Newsreader', serif",
  fontSize: 13, lineHeight: 1.4, color: "var(--ink-3)", fontStyle: "italic",
};
const groupBody: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 10 };
const subLabel: React.CSSProperties = {
  fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
  fontSize: 9, letterSpacing: "0.22em", textTransform: "uppercase",
  color: "var(--ink-3)",
};
const quietLink: React.CSSProperties = {
  background: "transparent", border: "none", padding: "12px 4px",
  minHeight: 44,
  fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
  fontSize: 10, letterSpacing: "0.22em", textTransform: "uppercase",
  color: "var(--spot)", cursor: "pointer",
};
const mutedNote: React.CSSProperties = {
  fontFamily: "'Newsreader', serif", fontSize: 13, color: "var(--ink-3)",
  fontStyle: "italic", padding: "6px 0",
};
const layoutRow: React.CSSProperties = { display: "flex", gap: 8, flexWrap: "wrap" };
const layoutCard: React.CSSProperties = {
  flex: "1 1 30%", minWidth: 100, minHeight: 60,
  padding: "10px 12px",
  display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 4,
  background: "transparent", border: "1px solid var(--rule)",
  cursor: "pointer", color: "var(--ink)",
  textAlign: "left" as const,
};
const layoutHint: React.CSSProperties = {
  fontFamily: "'Newsreader', serif", fontSize: 12, color: "var(--ink-2)",
};
const activeReason: React.CSSProperties = {
  fontFamily: "'Newsreader', serif", fontSize: 13, lineHeight: 1.4,
  color: "var(--ink-2)", fontStyle: "italic",
  paddingLeft: 10, borderLeft: "2px solid var(--spot)",
};
const switchRow: React.CSSProperties = { display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" };
const switchBtn: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 10,
  background: "transparent", border: "none",
  padding: "10px 4px", minHeight: 44,
  color: "var(--ink)",
};
const switchTrack: React.CSSProperties = {
  position: "relative", width: 44, height: 24, borderRadius: 999,
  transition: "background .18s ease", display: "inline-block",
};
const switchThumb: React.CSSProperties = {
  position: "absolute", top: 2, left: 2, width: 20, height: 20, borderRadius: 999,
  background: "var(--paper)", transition: "transform .18s ease",
  boxShadow: "0 1px 3px rgba(0,0,0,0.4)",
};
const switchLabel: React.CSSProperties = {
  fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
  fontSize: 10, letterSpacing: "0.22em", textTransform: "uppercase",
  color: "var(--ink-2)",
};
const emphasisChip: React.CSSProperties = {
  display: "inline-flex", alignItems: "center",
  padding: "6px 10px", minHeight: 28,
  border: "1px solid var(--spot)", color: "var(--spot)",
  fontFamily: "'Newsreader', serif", fontSize: 13, fontStyle: "italic",
};
const swatchRow: React.CSSProperties = { display: "flex", gap: 18, flexWrap: "wrap" };
const swatchBtn: React.CSSProperties = {
  background: "transparent", border: "none",
  display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
  padding: 4, minWidth: 44, minHeight: 44,
  cursor: "pointer",
};
const detailsWrap: React.CSSProperties = {
  paddingTop: 16, borderTop: "1px solid var(--rule)",
  display: "flex", flexDirection: "column", gap: 12,
};
const detailsToggle: React.CSSProperties = {
  background: "transparent", border: "none", padding: "10px 0",
  textAlign: "left" as const, minHeight: 44,
  fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
  fontSize: 10, letterSpacing: "0.22em", textTransform: "uppercase",
  color: "var(--ink-2)", cursor: "pointer",
};
const detailsBody: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 12 };

const EDITOR_CSS = `
.sig-editor-grid {
  display: grid;
  gap: 22px;
  grid-template-columns: minmax(360px, 420px) minmax(0, 1fr);
  align-items: start;
}
.sig-editor-panel {
  background: var(--paper);
  border: 1px solid var(--rule);
  padding: 16px;
  display: flex; flex-direction: column; gap: 12px;
  max-height: calc(100vh - 140px);
  overflow-y: auto;
}
.sig-editor-stage {
  position: sticky; top: 16px;
  background: var(--paper);
  border: 1px solid var(--rule);
  padding: 16px;
  display: flex; align-items: center; justify-content: center;
  height: min(62vh, 560px);
  overflow: hidden;
}
.sig-editor-stage-inner {
  width: 100%; height: 100%;
  display: flex; align-items: center; justify-content: center;
  overflow: hidden;
}
.sig-editor-stage-inner > svg { max-height: 100%; max-width: 100%; width: auto; height: auto; display: block; }
.sig-editor-continue { padding-top: 8px; border-top: 1px solid var(--rule); margin-top: 4px; position: sticky; bottom: -16px; background: var(--paper); }

.sig-suggest-card { position: relative; }
.sig-suggest-lines {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  transition: -webkit-line-clamp .2s ease;
}
.sig-suggest-card:hover .sig-suggest-lines,
.sig-suggest-card:focus-visible .sig-suggest-lines {
  -webkit-line-clamp: 8;
}

@media (max-width: 900px) {
  .sig-editor-grid { grid-template-columns: 1fr; }
  .sig-editor-stage { position: sticky; top: 8px; height: 40vh; order: -1; }
  .sig-editor-panel { max-height: none; overflow: visible; padding-bottom: 88px; }
  .sig-editor-continue {
    position: fixed; left: 0; right: 0; bottom: 0;
    padding: 12px 16px; margin: 0; border-top: 1px solid var(--rule);
    background: var(--paper); z-index: 20;
  }
}
`;