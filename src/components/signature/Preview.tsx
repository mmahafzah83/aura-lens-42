import { useRef, useState } from "react";
import { toast } from "sonner";
import type { FamilyEntry } from "./renderers";
import type { Lang, Mood } from "./renderers/shared";
import type { EditorFields } from "./Editor";
import { logSignatureEvent } from "./logEvent";
import { photoUrlToDataUrl } from "./photoToDataUrl";
import {
  FONT_IMPORT_CSS,
  downloadBlob,
  ensureFontsReady,
  getEmbeddedFontCSS,
  slugify,
  svgToImageBlob,
} from "@/lib/broadsheetExport";
import { ensureCardFontsLoaded } from "./fitText";

interface Props {
  family: FamilyEntry;
  lang: Lang;
  mood: Mood;
  fields: EditorFields;
  photoUrl?: string;
  onBack: () => void;
  onContinue: () => void;
}

async function renderToBlob(
  family: FamilyEntry, lang: Lang, mood: Mood, fields: EditorFields,
  photoUrl: string | undefined, square: boolean,
): Promise<Blob> {
  const w = 1080;
  const h = square ? 1080 : 1350;
  await ensureCardFontsLoaded();
  const embeddedPhoto = await photoUrlToDataUrl(photoUrl);
  const host = document.createElement("div");
  host.style.cssText = "position:absolute;left:-99999px;top:0;width:1080px;height:auto;";
  document.body.appendChild(host);
  try {
    const ReactDOM = await import("react-dom/client");
    const root = ReactDOM.createRoot(host);
    const C = family.component;
    await new Promise<void>((resolve) => {
      root.render(
        <C lang={lang} mood={mood} photoUrl={embeddedPhoto}
           name={fields.name} title={fields.title}
           lines={[fields.line1, fields.line2]} meta={fields.meta}
           square={square} />,
      );
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
    const svg = host.querySelector("svg") as SVGSVGElement | null;
    if (!svg) throw new Error("SVG not found for export");
    svg.setAttribute("width", String(w));
    svg.setAttribute("height", String(h));
    const families = [
      "Newsreader:ital,wght@0,400;0,500;0,600;1,400;1,500",
      "IBM+Plex+Mono:wght@400;500;600",
    ];
    if (lang === "ar") families.push("Cairo:wght@400;600;700");
    const embedded = await getEmbeddedFontCSS(families);
    const extraCSS = embedded || FONT_IMPORT_CSS;
    const blob = await svgToImageBlob(svg, w, h, extraCSS, "image/png", 1);
    root.unmount();
    return blob;
  } finally {
    host.remove();
  }
}

export default function Preview({ family, lang, mood, fields, photoUrl, onBack, onContinue }: Props) {
  const [busy, setBusy] = useState<null | "portrait" | "square">(null);
  const stageRef = useRef<HTMLDivElement>(null);

  const doExport = async (square: boolean) => {
    const key = square ? "square" : "portrait";
    setBusy(key);
    try {
      await ensureFontsReady(lang);
      const blob = await renderToBlob(family, lang, mood, fields, photoUrl, square);
      const dim = square ? "1080x1080" : "1080x1350";
      downloadBlob(blob, `signature-${family.id}-${slugify(fields.name || "card")}-${dim}.png`);
      toast.success(`Exported ${dim}`);
      void logSignatureEvent("exported", family.id, lang, { family: family.id, lang, mood, dim });
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Export failed");
    } finally {
      setBusy(null);
    }
  };

  const C = family.component;

  return (
    <section style={{ maxWidth: 1120, margin: "0 auto" }}>
      <style>{PREVIEW_CSS}</style>
      <div style={topRow}>
        <button onClick={onBack} style={backBtn}>← Back</button>
        <div style={crumb}>{family.label}</div>
        <button onClick={onContinue} style={primaryBtn}>Continue to share →</button>
      </div>

      <div className="sig-preview-stage">
        <div ref={stageRef} className="sig-preview-inner">
          <C lang={lang} mood={mood} photoUrl={photoUrl}
             name={fields.name} title={fields.title}
             lines={[fields.line1, fields.line2]} meta={fields.meta} />
        </div>
      </div>

      <div style={exportRow}>
        <button disabled={busy !== null} onClick={() => doExport(false)} style={exportBtn}>
          <span style={exportLabel}>{busy === "portrait" ? "Rendering…" : "LinkedIn & feeds"}</span>
          <span style={exportSub}>Portrait 4:5 · best for LinkedIn, feeds</span>
        </button>
        <button disabled={busy !== null} onClick={() => doExport(true)} style={exportBtn}>
          <span style={exportLabel}>{busy === "square" ? "Rendering…" : "Square"}</span>
          <span style={exportSub}>1:1 · Instagram, X</span>
        </button>
      </div>
    </section>
  );
}

const topRow: React.CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "space-between",
  marginBottom: 14,
};
const crumb: React.CSSProperties = {
  fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
  fontSize: 10, letterSpacing: "0.24em", textTransform: "uppercase",
  color: "var(--spot)",
};
const stage: React.CSSProperties = {
  background: "var(--paper)",
  border: "1px solid var(--rule)",
  padding: 40,
  display: "flex", alignItems: "center", justifyContent: "center",
};
const exportRow: React.CSSProperties = {
  marginTop: 16,
  display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap",
};
const exportBtn: React.CSSProperties = {
  background: "transparent",
  color: "var(--ink)",
  border: "1px solid var(--spot)",
  padding: "12px 22px",
  cursor: "pointer",
  display: "flex", flexDirection: "column", gap: 4, alignItems: "center",
  minWidth: 220,
};
const exportLabel: React.CSSProperties = {
  fontFamily: "'Newsreader', serif",
  fontSize: 15, fontWeight: 600, letterSpacing: "0.01em",
  color: "var(--ink)",
};
const exportSub: React.CSSProperties = {
  fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
  fontSize: 9, letterSpacing: "0.2em", textTransform: "uppercase",
  color: "var(--ink-3)",
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

const PREVIEW_CSS = `
.sig-preview-stage {
  background: var(--paper);
  border: 1px solid var(--rule);
  padding: 16px;
  display: flex; align-items: center; justify-content: center;
  height: min(70vh, 640px);
  overflow: hidden;
}
.sig-preview-inner {
  display: flex; align-items: center; justify-content: center;
  width: 100%; height: 100%;
  overflow: hidden;
}
.sig-preview-inner > svg {
  max-height: 100%;
  max-width: 100%;
  width: auto;
  height: auto;
  display: block;
}
`;