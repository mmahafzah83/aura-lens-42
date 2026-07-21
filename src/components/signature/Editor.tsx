import { useCallback, useRef } from "react";
import type { FamilyEntry } from "./renderers";
import type { Lang, Mood } from "./renderers/shared";

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
  onLang, onMood, onFields, onPhoto, onBack, onContinue,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const usesPhoto = family.id === "frame" || family.id === "signature";
  const usesLine2 = family.id === "signature";

  const C = family.component;

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

  return (
    <section style={{ maxWidth: 1240, margin: "0 auto" }}>
      <div style={topRow}>
        <button onClick={onBack} style={backBtn}>← Filmstrip</button>
        <div style={crumb}>{family.label} · editor</div>
        <button onClick={onContinue} style={primaryBtn}>Continue →</button>
      </div>

      <div style={grid}>
        <div style={stage}>
          <div style={stageInner}>
            <C lang={lang} mood={mood} photoUrl={photoUrl}
               name={fields.name} title={fields.title}
               lines={[fields.line1, fields.line2]} meta={fields.meta} />
          </div>
        </div>

        <div style={panel}>
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
              <PillBtn active={lang === "ar"} onClick={() => onLang("ar")}>عربي</PillBtn>
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

function PillBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        ...pill,
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