import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
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

interface Props {
  family: FamilyEntry;
  lang: Lang;
  mood: Mood;
  fields: EditorFields;
  photoUrl?: string;
  pickedSource?: "profile" | "signal" | "voice" | null;
  onBack: () => void;
  onMakeAnother: () => void;
}

/** Render the final card SVG to a PNG blob at 1080×1350 using the exact
 *  same pipeline as Preview.tsx (svgToImageBlob + embedded font CSS). */
async function renderCardBlob(
  family: FamilyEntry, lang: Lang, mood: Mood, fields: EditorFields, photoUrl: string | undefined,
): Promise<Blob> {
  const w = 1080, h = 1350;
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
           lines={[fields.line1, fields.line2]} meta={fields.meta} />,
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

export default function Publish({
  family, lang, mood, fields, photoUrl, pickedSource, onBack, onMakeAnother,
}: Props) {
  const [caption, setCaption] = useState<string>("");
  const [writing, setWriting] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [hasLinkedIn, setHasLinkedIn] = useState<boolean | null>(null);
  const [publishedUrl, setPublishedUrl] = useState<string | null>(null);
  const cachedBlobRef = useRef<Blob | null>(null);

  // Check LinkedIn connection using the same query AuthorityTab uses.
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { if (alive) setHasLinkedIn(false); return; }
      const { data } = await supabase
        .from("linkedin_connections")
        .select("id")
        .eq("user_id", user.id)
        .eq("status", "active")
        .maybeSingle();
      if (alive) setHasLinkedIn(!!data);
    })();
    return () => { alive = false; };
  }, []);

  const writeCaption = async () => {
    if (writing) return;
    setWriting(true);
    try {
      const { data, error } = await supabase.functions.invoke("signature-suggest", {
        body: {
          mode: "caption",
          family: family.id,
          lang,
          cardLines: [fields.line1, fields.line2, fields.title, fields.meta].filter(Boolean),
          pickedSource: pickedSource || "",
        },
      });
      if (error) throw error;
      const c = String((data as any)?.caption || "").trim();
      if (c) setCaption(c);
      else toast.message("Couldn't draft a caption. You can type one or publish without.");
    } catch (e: any) {
      toast.message("Couldn't draft a caption. You can type one or publish without.");
    } finally { setWriting(false); }
  };

  const buildBlob = async (): Promise<Blob> => {
    if (cachedBlobRef.current) return cachedBlobRef.current;
    await ensureFontsReady(lang);
    const blob = await renderCardBlob(family, lang, mood, fields, photoUrl);
    cachedBlobRef.current = blob;
    return blob;
  };

  const downloadInstead = async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      const blob = await buildBlob();
      downloadBlob(blob, `signature-${family.id}-${slugify(fields.name || "card")}-1080x1350.png`);
      toast.success("Downloaded");
      void logSignatureEvent("exported", family.id, lang, { family: family.id, lang, mood, dim: "1080x1350", from: "publish" });
    } catch (e: any) {
      toast.error(e?.message || "Download failed");
    } finally { setDownloading(false); }
  };

  const publishToLinkedIn = async () => {
    if (publishing) return;
    setPublishing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) throw new Error("Sign in first");
      const uid = session.user.id;

      // 1. Render + upload PNG to the same public bucket AuraCardPanel uses.
      const blob = await buildBlob();
      const path = `${uid}/signature/${Date.now()}-${family.id}.png`;
      const { error: upErr } = await supabase.storage
        .from("capture-images")
        .upload(path, blob, { contentType: "image/png", upsert: true });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("capture-images").getPublicUrl(path);
      const imageUrl = pub.publicUrl;

      // 2. Insert draft row — same shape as AuthorityTab.handlePublishToLinkedIn.
      const trimmedCaption = caption.trim();
      const { data: ins, error: insErr } = await supabase
        .from("linkedin_posts")
        .insert({
          user_id: uid,
          post_text: trimmedCaption,
          content_type: "signature_card",
          format_type: "post",
          source_type: "aura_generated",
          authorship: "aura_drafted",
          acquisition: "published_via_aura",
          tracking_status: "draft",
          source_metadata: {
            origin: "signature_studio",
            family: family.id,
            lang,
            mood,
            signature: true,
            _language: lang,
            image_url: imageUrl,
          },
        })
        .select("id")
        .single();
      if (insErr) throw insErr;

      // 3. Invoke linkedin-publish — identical to AuthorityTab.
      const { data, error } = await supabase.functions.invoke("linkedin-publish", {
        body: { postId: (ins as any).id },
      });
      if (error) throw error;
      if (!(data as any)?.success) {
        const msg = (data as any)?.error || "Publish failed";
        throw new Error(/not connected/i.test(msg) ? "Connect LinkedIn in Settings first." : msg);
      }
      const url: string | null = (data as any).postUrl ?? null;
      setPublishedUrl(url);
      void logSignatureEvent("published", family.id, lang, {
        family: family.id, lang, mood, hasCaption: !!trimmedCaption,
      });
    } catch (e: any) {
      toast.error(e?.message || "Couldn't publish to LinkedIn");
    } finally { setPublishing(false); }
  };

  const C = family.component;
  const isArabic = lang === "ar";

  return (
    <section style={{ maxWidth: 1240, margin: "0 auto" }}>
      <style>{PUBLISH_CSS}</style>
      <div style={topRow}>
        <button onClick={onBack} style={backBtn}>← Back</button>
        <div style={crumb}>{family.label} · share</div>
        <span style={{ width: 84 }} />
      </div>

      <div className="sig-publish-grid">
        <div className="sig-publish-panel">
          {publishedUrl !== null ? (
            <div style={successBox}>
              <div style={successKicker}>Published</div>
              <h3 style={successTitle}>Published to LinkedIn</h3>
              <p style={successBody}>Your signature card is live.</p>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 8 }}>
                {publishedUrl && (
                  <a href={publishedUrl} target="_blank" rel="noreferrer" style={primaryBtn as any}>
                    View post ↗
                  </a>
                )}
                <button onClick={onMakeAnother} style={secondaryBtn}>Make another →</button>
              </div>
            </div>
          ) : (
            <>
              <div style={fieldLabel}>Caption <span style={optionalTag}>· optional</span></div>
              <textarea
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder={isArabic ? "اكتب سطرين — أو اتركها فارغة." : "Two short lines — or leave it empty."}
                rows={5}
                dir={isArabic ? "rtl" : "ltr"}
                style={{ ...textarea, textAlign: isArabic ? "right" as const : "left" as const }}
              />
              <button onClick={writeCaption} disabled={writing} style={secondaryBtn}>
                {writing ? "Writing…" : "Write it for me"}
              </button>

              <div style={{ height: 1, background: "var(--rule)", margin: "8px 0" }} />

              {hasLinkedIn === false ? (
                <div style={warnBox}>
                  <div style={warnKicker}>LinkedIn not connected</div>
                  <p style={warnBody}>
                    Connect LinkedIn in Settings to publish from Aura. You can still download the card now.
                  </p>
                </div>
              ) : null}

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button
                  onClick={publishToLinkedIn}
                  disabled={publishing || hasLinkedIn === false || hasLinkedIn === null}
                  style={{
                    ...primaryBtn,
                    opacity: (hasLinkedIn === false || hasLinkedIn === null) ? 0.5 : 1,
                    cursor: (hasLinkedIn === false || hasLinkedIn === null) ? "not-allowed" : "pointer",
                  }}
                  title={hasLinkedIn === false ? "Connect LinkedIn in Settings first" : undefined}
                >
                  {publishing ? "Publishing…" : "Publish to LinkedIn"}
                </button>
                <button onClick={downloadInstead} disabled={downloading} style={secondaryBtn}>
                  {downloading ? "Rendering…" : "Download instead"}
                </button>
              </div>
            </>
          )}
        </div>

        <div className="sig-publish-stage">
          <div className="sig-publish-inner">
            <C lang={lang} mood={mood} photoUrl={photoUrl}
               name={fields.name} title={fields.title}
               lines={[fields.line1, fields.line2]} meta={fields.meta} />
          </div>
        </div>
      </div>
    </section>
  );
}

/* -------- styles (System-A tokens only) -------- */

const topRow: React.CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 };
const crumb: React.CSSProperties = {
  fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
  fontSize: 10, letterSpacing: "0.24em", textTransform: "uppercase",
  color: "var(--spot)",
};
const grid: React.CSSProperties = {
  display: "grid", gap: 28,
  gridTemplateColumns: "minmax(0, 1.4fr) minmax(300px, 1fr)",
};
const stage: React.CSSProperties = {
  background: "var(--paper)", border: "1px solid var(--rule)", padding: 24,
  display: "flex", alignItems: "center", justifyContent: "center", minHeight: 500,
};
const panel: React.CSSProperties = {
  background: "var(--paper)", border: "1px solid var(--rule)", padding: 20,
  display: "flex", flexDirection: "column", gap: 12,
};
const fieldLabel: React.CSSProperties = {
  fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
  fontSize: 9, letterSpacing: "0.24em", textTransform: "uppercase",
  color: "var(--ink-3)",
};
const optionalTag: React.CSSProperties = { color: "var(--ink-3)", textTransform: "none", letterSpacing: 0, fontStyle: "italic" };
const input: React.CSSProperties = {
  background: "var(--paper-3, var(--paper-2))",
  color: "var(--ink)",
  border: "1px solid var(--rule)",
  padding: "10px 12px",
  fontFamily: "'Newsreader', serif",
  fontSize: 15,
};
const textarea: React.CSSProperties = { ...input, resize: "vertical" as const, minHeight: 110 };
const backBtn: React.CSSProperties = {
  background: "transparent", color: "var(--ink-2)", border: "1px solid var(--rule)",
  padding: "8px 18px",
  fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
  fontSize: 10, letterSpacing: "0.24em", textTransform: "uppercase",
  cursor: "pointer",
};
const primaryBtn: React.CSSProperties = {
  ...backBtn, color: "var(--ob-bg)", background: "var(--spot)", borderColor: "var(--spot)",
  padding: "12px 22px", fontSize: 11,
  textAlign: "center" as const,
};
const secondaryBtn: React.CSSProperties = {
  ...backBtn, padding: "10px 18px",
};
const warnBox: React.CSSProperties = {
  border: "1px solid var(--rule)", background: "var(--paper-3, var(--paper-2))",
  padding: "10px 12px", display: "flex", flexDirection: "column", gap: 4,
};
const warnKicker: React.CSSProperties = { ...fieldLabel, color: "var(--spot)" };
const warnBody: React.CSSProperties = {
  margin: 0, fontFamily: "'Newsreader', serif", fontSize: 14, lineHeight: 1.45, color: "var(--ink-2)",
};
const successBox: React.CSSProperties = {
  border: "1px solid var(--spot)", background: "var(--paper-3, var(--paper-2))",
  padding: "14px 16px", display: "flex", flexDirection: "column", gap: 6,
};
const successKicker: React.CSSProperties = { ...fieldLabel, color: "var(--spot)" };
const successTitle: React.CSSProperties = {
  margin: 0, fontFamily: "'Newsreader', serif", fontStyle: "italic",
  fontSize: 22, color: "var(--ink)",
};
const successBody: React.CSSProperties = {
  margin: 0, fontFamily: "'Newsreader', serif", fontSize: 14.5, color: "var(--ink-2)",
};

const PUBLISH_CSS = `
.sig-publish-grid {
  display: grid; gap: 22px;
  grid-template-columns: minmax(360px, 420px) minmax(0, 1fr);
  align-items: start;
}
.sig-publish-panel {
  background: var(--paper); border: 1px solid var(--rule);
  padding: 16px; display: flex; flex-direction: column; gap: 12px;
}
.sig-publish-stage {
  position: sticky; top: 16px;
  background: var(--paper); border: 1px solid var(--rule);
  padding: 16px; display: flex; align-items: center; justify-content: center;
  max-height: 62vh;
}
.sig-publish-inner {
  display: flex; align-items: center; justify-content: center;
  max-height: calc(62vh - 32px);
}
.sig-publish-inner > svg {
  max-height: calc(62vh - 32px);
  width: auto !important; height: auto; max-width: 100%;
}
@media (max-width: 900px) {
  .sig-publish-grid { grid-template-columns: 1fr; }
  .sig-publish-stage { position: sticky; top: 8px; max-height: 40vh; order: -1; }
  .sig-publish-inner > svg { max-height: calc(40vh - 32px); }
}
`;