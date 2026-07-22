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

export default function Editor({
  family, lang, mood, fields, photoUrl,
  onLang, onMood, onFields, onPhoto, onPickedSource, onBack, onContinue,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const usesPhoto = family.id === "frame" || family.id === "signature";
  const usesLine2 = family.id === "signature";

  const C = family.component;
  const { suggestions, loading: suggestLoading, regenerate } = useSuggestions(family, lang);

  // ── Frame family designer brain ─────────────────────────────────
  const [decision, setDecision] = useState<FrameDecision | undefined>(undefined);
  const [designReason, setDesignReason] = useState<string>("");
  const [designLoading, setDesignLoading] = useState(false);
  const [emphasisOff, setEmphasisOff] = useState(false);
  const moodTouchedRef = useRef(false);

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
      const d = (data as any)?.decision;
      if (d && d.textZone) {
        setDecision({
          textZone: d.textZone,
          scrim: d.scrim,
          cropFocusY: typeof d.cropFocusY === "number" ? d.cropFocusY : 0.5,
          emphasis: Array.isArray(d.emphasis) ? d.emphasis : [],
        });
        setDesignReason(typeof d.reason === "string" ? d.reason : "");
        // Only auto-apply mood if user hasn't manually picked one.
        if (d.mood && !moodTouchedRef.current) onMood(d.mood);
        void logSignatureEvent("suggested", family.id, lang, { design: true, decision: d });
      }
    } catch (err) {
      console.warn("frame design failed", err);
    } finally {
      setDesignLoading(false);
    }
  }, [family.id, photoUrl, lang, fields.line1, fields.line2, onMood]);

  // Auto-run when photo or line1 changes (debounced), for frame only.
  useEffect(() => {
    if (family.id !== "frame" || !photoUrl) { setDecision(undefined); setDesignReason(""); return; }
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
    setEmphasisOff((v) => !v);
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

          {usesPhoto && (
            <Field label="Photo">
              <input ref={fileRef} type="file" accept="image/*" onChange={onPick} style={fileInput} />
              {photoUrl && (
                <button onClick={() => onPhoto(undefined)} style={secondaryBtn}>Remove photo</button>
              )}
            </Field>
          )}

          <Field label="Language">
            <div style={rowBtns}>
              <PillBtn active={lang === "en"} onClick={() => onLang("en")}>EN</PillBtn>
              <PillBtn active={lang === "ar"} onClick={() => onLang("ar")} fontFamily="'Cairo', system-ui, sans-serif">عربي</PillBtn>
            </div>
          </Field>

          <Field label="Mood">
            <div style={rowBtns}>
              {MOODS.map((m) => (
                <button
                  key={m.key}
                  onClick={() => onMood(m.key)}
                  aria-label={m.label}
                  title={m.label}
                  style={{
                    ...swatch,
                    background: m.hex,
                    outline: mood === m.key ? "2px solid var(--spot)" : "1px solid var(--rule)",
                    outlineOffset: mood === m.key ? "3px" : "0",
                  }}
                />
              ))}
            </div>
          </Field>

          <Field label="Name">
            <input value={fields.name} onChange={(e) => set("name", e.target.value)} style={input} />
          </Field>
          <Field label="Title / label">
            <input value={fields.title} onChange={(e) => set("title", e.target.value)} style={input} />
          </Field>
          <Field label={family.id === "line" || family.id === "frame" ? "Quote" : "Descriptor line 1"}>
            <textarea value={fields.line1} onChange={(e) => set("line1", e.target.value)} style={textarea} rows={3} />
          </Field>
          {usesLine2 && (
            <Field label="Descriptor line 2">
              <input value={fields.line2} onChange={(e) => set("line2", e.target.value)} style={input} />
            </Field>
          )}
          <Field label="Byline / firm">
            <input value={fields.meta} onChange={(e) => set("meta", e.target.value)} style={input} />
          </Field>

          <div className="sig-editor-continue">
            <button onClick={onContinue} style={{ ...primaryBtn, width: "100%" }}>Continue →</button>
          </div>
        </div>

        <div className="sig-editor-stage">
          <div className="sig-editor-stage-inner">
            {family.id === "frame" && (designReason || designLoading) && (
              <div style={reasonBar}>
                <span>◈ {designLoading ? "looking…" : designReason}</span>
                {photoUrl && (
                  <span style={{ display: "inline-flex", gap: 10 }}>
                    <button type="button" onClick={() => void runDesign()} style={reasonBtn}>↻ re-look</button>
                    {decision?.emphasis?.length ? (
                      <button type="button" onClick={toggleEmphasis} style={reasonBtn}>
                        {emphasisOff ? "emphasis on" : "emphasis off"}
                      </button>
                    ) : null}
                  </span>
                )}
              </div>
            )}
            <C
              lang={lang} mood={mood} photoUrl={photoUrl}
              name={fields.name} title={fields.title}
              lines={[fields.line1, fields.line2]} meta={fields.meta}
              {...(family.id === "frame" ? { decision, emphasisOff } : {})}
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
  fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
  fontSize: 11, letterSpacing: "0.22em", textTransform: "uppercase",
  border: "1px solid var(--rule)",
  cursor: "pointer",
};
const swatch: React.CSSProperties = {
  width: 36, height: 36, borderRadius: 999, cursor: "pointer",
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
  padding: "3px 8px", fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
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
  padding: "4px 10px",
  fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
  fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase",
  cursor: "pointer",
};
const filterRow: React.CSSProperties = { display: "flex", gap: 6, flexWrap: "wrap" };
const filterChip: React.CSSProperties = {
  padding: "3px 10px",
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