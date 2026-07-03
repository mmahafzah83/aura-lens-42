import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft, ChevronLeft, ChevronRight, Loader2, Sparkles,
  FileText, FileArchive, BookmarkPlus, Check, Copy, ChevronDown, ChevronUp, Newspaper,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import usePageMeta from "@/hooks/usePageMeta";
import StartFromPanel from "@/components/StartFromPanel";
import EditionPageSVG, { pageLabel, type Edition, type EditionPage } from "@/components/broadsheet/EditionPageSVG";
import {
  getEmbeddedFontCSS, svgToImageBlob, ensureFontsReady, downloadBlob, slugify,
} from "@/lib/broadsheetExport";
import { dedupeHashtags, stripDuplicateHashtags } from "@/lib/hashtags";
import { getPublication } from "@/lib/publication";

const PAGE_W = 1080;
const PAGE_H = 1350;

function makeSampleEdition(lang: "en" | "ar"): Edition {
  const rtl = lang === "ar";
  const pub = getPublication(null, lang, null);
  return {
    nameplate: { name: pub.name, style: pub.style, monogram_char: pub.monogram_char },
    edition_no: 0,
    dateline: rtl ? "الأسبوع — · — — —" : "Week — · —— — —",
    sector_line: rtl ? "قطاعك · منطقتك" : "SECTOR · REGION",
    lang,
    linkedin_caption: "",
    hashtags: [],
    pages: [
      {
        page_type: "FRONT",
        kicker: rtl ? "افتتاحية الأسبوع" : "THIS WEEK'S LEAD",
        lead_headline: rtl ? "اضغط \"جمع هذا الأسبوع\" لبدء إصدارك" : "Press \"Compile this week\" to build your edition",
        lead_accent: rtl ? "لبدء إصدارك" : "your edition",
        deck: rtl ? "ثلاثة تطورات من قراءتي هذا الأسبوع.. جمعتها في إصدار واحد، لأجلك." : "Three developments from this week's reading — compiled into one edition, for you.",
        fig: { kind: "line_signal", label: rtl ? "شكل · الإشارة" : "FIG · signal over noise" },
        toc: [],
        also_inside: [],
      },
    ],
  };
}

export default function EditionStudio() {
  usePageMeta({
    title: "Aura — Edition Studio",
    description: "Compile your weekly personal publication from real signals.",
    path: "/edition",
  });
  const navigate = useNavigate();

  const [lang, setLang] = useState<"en" | "ar">("en");
  const [edition, setEdition] = useState<Edition>(() => makeSampleEdition("en"));
  const [activePage, setActivePage] = useState(0);
  const [compiling, setCompiling] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedToLibrary, setSavedToLibrary] = useState(false);
  const [draftId, setDraftId] = useState<string | undefined>(undefined);
  const [showSignals, setShowSignals] = useState(true);
  const [selectedSignalIds, setSelectedSignalIds] = useState<string[]>([]);
  const [manualQuestion, setManualQuestion] = useState<string>("");
  const [notEnoughSignals, setNotEnoughSignals] = useState<{ found: number } | null>(null);

  const offscreenRef = useRef<HTMLDivElement>(null);

  const pages = edition.pages || [];
  const total = pages.length;
  const current = pages[activePage];
  const rtl = lang === "ar";

  const swapLang = (l: "en" | "ar") => {
    setLang(l);
    setEdition(e => ({ ...e, lang: l }));
  };

  const compile = async () => {
    setCompiling(true);
    setNotEnoughSignals(null);
    try {
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session?.user?.id) { toast.error("Please sign in"); return; }
      const currentEditionNo = draftId ? edition.edition_no : undefined;
      const { data, error } = await supabase.functions.invoke("generate-edition", {
        body: {
          user_id: sess.session.user.id,
          lang,
          signal_ids: selectedSignalIds.length ? selectedSignalIds : undefined,
          qa_question: manualQuestion.trim() || undefined,
          current_edition_no: currentEditionNo,
        },
      });
      if (error) {
        toast.error("Compile failed: " + (error.message || "Unknown error"));
        return;
      }
      if (data?.error === "not_enough_signals") {
        setNotEnoughSignals({ found: Number(data.found) || 0 });
        return;
      }
      if (data?.error) { toast.error(data.error); return; }
      const compiled: Edition = {
        nameplate: data.nameplate,
        edition_no: data.edition_no,
        dateline: data.dateline,
        sector_line: data.sector_line || "",
        lang,
        linkedin_caption: data.linkedin_caption || "",
        hashtags: Array.isArray(data.hashtags) ? data.hashtags : [],
        pages: Array.isArray(data.pages) ? data.pages : [],
      };
      setEdition(compiled);
      setActivePage(0);
      setSavedToLibrary(false);
      toast.success(`Edition Nº ${compiled.edition_no} compiled`);
    } catch (e: any) {
      console.error(e);
      toast.error("Compile failed: " + (e?.message || "Unknown error"));
    } finally {
      setCompiling(false);
    }
  };

  /* ------------------------------------------------------------
   * Raster a single Edition page to a Blob via offscreen React root.
   * ------------------------------------------------------------ */
  const renderPageToBlob = async (idx: number, mime: "image/png" | "image/jpeg" = "image/png", quality = 1): Promise<Blob> => {
    const container = offscreenRef.current!;
    container.innerHTML = "";
    const wrapper = document.createElement("div");
    container.appendChild(wrapper);
    const ReactDOM = await import("react-dom/client");
    const root = ReactDOM.createRoot(wrapper);
    await new Promise<void>((resolve) => {
      root.render(
        <EditionPageSVG page={pages[idx]} pageIndex={idx} total={total} edition={edition} />,
      );
      requestAnimationFrame(() => setTimeout(resolve, 60));
    });
    const svgEl = wrapper.querySelector("svg") as SVGSVGElement | null;
    if (!svgEl) { root.unmount(); throw new Error("SVG render failed"); }
    const families = ["Newsreader:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400;1,600", "IBM+Plex+Mono:wght@400;500;600"];
    if (lang === "ar") families.push("Cairo:wght@400;600;700;800");
    const extraCSS = await getEmbeddedFontCSS(families);
    const blob = await svgToImageBlob(svgEl, PAGE_W, PAGE_H, extraCSS, mime, quality);
    root.unmount();
    return blob;
  };

  const exportPdf = async () => {
    if (!total) return;
    setExporting(true);
    try {
      await ensureFontsReady(lang);
      const { jsPDF } = await import("jspdf");
      const pdf = new jsPDF({ orientation: "portrait", unit: "px", format: [PAGE_W, PAGE_H] });
      for (let i = 0; i < total; i++) {
        const blob = await renderPageToBlob(i, "image/jpeg", 0.85);
        const dataUrl: string = await new Promise((res, rej) => {
          const r = new FileReader(); r.onload = () => res(r.result as string); r.onerror = rej; r.readAsDataURL(blob);
        });
        if (i > 0) pdf.addPage([PAGE_W, PAGE_H], "portrait");
        pdf.addImage(dataUrl, "JPEG", 0, 0, PAGE_W, PAGE_H);
      }
      pdf.save(`edition-${edition.edition_no}-${slugify(edition.nameplate?.name || "brief")}.pdf`);
    } catch (e: any) {
      toast.error(e.message || "PDF failed");
    } finally { setExporting(false); }
  };

  const exportZip = async () => {
    if (!total) return;
    setExporting(true);
    try {
      await ensureFontsReady(lang);
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();
      for (let i = 0; i < total; i++) {
        const blob = await renderPageToBlob(i, "image/png", 1);
        const padded = String(i + 1).padStart(2, "0");
        zip.file(`page-${padded}.png`, blob);
      }
      const zipBlob = await zip.generateAsync({ type: "blob" });
      downloadBlob(zipBlob, `edition-${edition.edition_no}-${slugify(edition.nameplate?.name || "brief")}.zip`);
    } catch (e: any) {
      toast.error(e.message || "ZIP failed");
    } finally { setExporting(false); }
  };

  const saveToLibrary = async () => {
    if (!total) return;
    setSaving(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session?.user?.id) { toast.error("Please sign in"); return; }
      const payload = {
        post_text: edition.linkedin_caption || "",
        hook: (pages.find(p => p.page_type === "FRONT") as any)?.lead_headline || "",
        title: `${edition.nameplate?.name || "Edition"} — ${lang === "ar" ? "الإصدار رقم" : "Edition Nº"} ${edition.edition_no}`,
        content_type: "edition",
        source_type: "edition_studio",
        source_metadata: edition as any,
        tracking_status: "draft",
      };
      if (draftId) {
        const { error } = await supabase.from("linkedin_posts").update(payload as any).eq("id", draftId);
        if (error) throw error;
      } else {
        const { data: ins, error } = await supabase.from("linkedin_posts")
          .insert({ user_id: sess.session.user.id, ...payload } as any)
          .select("id").single();
        if (error) throw error;
        if (ins?.id) setDraftId(ins.id);
      }
      setSavedToLibrary(true);
      toast.success("Edition saved to Library");
    } catch (e: any) {
      console.error(e);
      toast.error("Save failed: " + (e?.message || "Unknown error"));
    } finally {
      setSaving(false);
    }
  };

  const captionDisplay = useMemo(() => {
    return stripDuplicateHashtags(edition.linkedin_caption || "", edition.hashtags || []);
  }, [edition.linkedin_caption, edition.hashtags]);

  /* ==================== render ==================== */

  return (
    <div className="min-h-screen" style={{ background: "var(--ob-bg)", color: "var(--glass)" }} dir={rtl ? "rtl" : "ltr"}>
      {/* Top bar */}
      <div className="sticky top-0 z-30 px-4 md:px-8 py-3 flex flex-wrap items-center gap-3" style={{ background: "var(--ob-panel)", borderBottom: "1px solid var(--hair)" }}>
        <button
          onClick={() => navigate("/home?tab=authority")}
          className="flex items-center gap-1.5 text-xs px-2 py-1.5 rounded-lg focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--action)]"
          style={{ color: "var(--glass-2)" }}
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Publish
        </button>
        <div className="flex items-center gap-2">
          <Newspaper className="w-4 h-4" style={{ color: "var(--action)" }} />
          <span className="font-semibold" style={{ color: "var(--glass)", fontFamily: "var(--font-mono)", letterSpacing: 1 }}>Edition Studio</span>
        </div>

        <div className="ms-auto flex items-center gap-2">
          {(["en", "ar"] as const).map(l => (
            <button key={l} onClick={() => swapLang(l)}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--action)]"
                    style={{
                      background: lang === l ? "var(--action)" : "transparent",
                      color: lang === l ? "var(--ink-on-brand)" : "var(--glass)",
                      border: `1px solid ${lang === l ? "var(--action)" : "var(--hair)"}`,
                    }}>
              {l === "ar" ? "العربية" : "English"}
            </button>
          ))}
          <button
            onClick={compile}
            disabled={compiling}
            className="px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--action)]"
            style={{ background: "var(--action)", color: "var(--ink-on-brand)" }}
          >
            {compiling ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {lang === "ar" ? "جمع هذا الأسبوع" : "Compile this week"}
          </button>
        </div>
      </div>

      {/* Main grid */}
      <div className="px-4 md:px-8 py-6 grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="grid gap-6" style={{ gridTemplateColumns: "minmax(0,1fr)" }}>
          {/* Empty state / preview */}
          {notEnoughSignals ? (
            <div className="rounded-2xl p-8 text-center" style={{ background: "var(--ob-panel)", border: "1px solid var(--hair)" }}>
              <div className="text-lg font-semibold mb-2" style={{ color: "var(--glass)" }}>
                {lang === "ar" ? "أسبوعك يحتاج إلى إشارتين على الأقل" : "Your week needs at least 2 signals"}
              </div>
              <p className="text-sm mb-4" style={{ color: "var(--glass-2)" }}>
                {lang === "ar"
                  ? "التقط شيئاً يستحق القراءة أولاً — الإصدار يبنى من مادة حقيقية، لا من فراغ."
                  : "Capture something worth reading first — the edition is built from real material, not from an empty week."}
              </p>
              <button
                onClick={() => navigate("/home?tab=capture")}
                className="px-4 py-2 rounded-lg text-sm font-medium focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--action)]"
                style={{ background: "var(--action)", color: "var(--ink-on-brand)" }}
              >
                {lang === "ar" ? "افتح شاشة الالتقاط" : "Open capture"}
              </button>
            </div>
          ) : (
            <>
              {/* Preview */}
              <div className="mx-auto" style={{ maxWidth: 640, width: "100%" }}>
                <div style={{ aspectRatio: `${PAGE_W} / ${PAGE_H}`, boxShadow: "0 30px 80px rgba(0,0,0,0.5)", borderRadius: 16, overflow: "hidden" }}>
                  {current ? (
                    <EditionPageSVG page={current} pageIndex={activePage} total={total} edition={edition} />
                  ) : null}
                </div>
              </div>

              {/* Page dots + prev/next */}
              <div className="flex items-center justify-center gap-3">
                <button
                  onClick={() => setActivePage(i => Math.max(0, i - 1))}
                  disabled={activePage === 0}
                  className="p-2 rounded-lg disabled:opacity-40"
                  style={{ background: "var(--ob-raised)", color: "var(--glass)", border: "1px solid var(--hair)" }}
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <div className="flex items-center gap-1.5">
                  {pages.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setActivePage(i)}
                      className="w-2 h-2 rounded-full"
                      style={{ background: i === activePage ? "var(--action)" : "var(--hair)" }}
                      aria-label={`Page ${i + 1}`}
                    />
                  ))}
                </div>
                <button
                  onClick={() => setActivePage(i => Math.min(total - 1, i + 1))}
                  disabled={activePage >= total - 1}
                  className="p-2 rounded-lg disabled:opacity-40"
                  style={{ background: "var(--ob-raised)", color: "var(--glass)", border: "1px solid var(--hair)" }}
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
                <div className="text-xs ms-4" style={{ color: "var(--glass-2)", fontFamily: "var(--font-mono)" }}>
                  {lang === "ar" ? `صفحة ${activePage + 1} من ${total}` : `Page ${activePage + 1} of ${total}`}
                </div>
              </div>

              {/* Filmstrip */}
              <div className="flex gap-2 overflow-x-auto pb-2">
                {pages.map((p, i) => (
                  <button
                    key={i}
                    onClick={() => setActivePage(i)}
                    className="flex-shrink-0 px-3 py-2 rounded-lg text-xs text-left"
                    style={{
                      background: i === activePage ? "var(--ob-raised)" : "transparent",
                      color: i === activePage ? "var(--glass)" : "var(--glass-2)",
                      border: `1px solid ${i === activePage ? "var(--action)" : "var(--hair)"}`,
                      minWidth: 120,
                    }}
                  >
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, opacity: 0.7 }}>P.{i + 1}</div>
                    <div style={{ fontFamily: "var(--font-mono)", letterSpacing: 1 }}>{pageLabel(p, lang).toUpperCase()}</div>
                  </button>
                ))}
              </div>

              {/* Caption + hashtags */}
              {(edition.linkedin_caption || (edition.hashtags && edition.hashtags.length)) ? (
                <div className="rounded-2xl p-4 space-y-3" style={{ background: "var(--ob-panel)", border: "1px solid var(--hair)" }}>
                  <div className="flex items-center justify-between">
                    <div className="text-xs uppercase tracking-wider" style={{ color: "var(--glass-2)", fontFamily: "var(--font-mono)" }}>
                      {lang === "ar" ? "تعليق لينكدإن" : "LinkedIn caption"}
                    </div>
                    <button
                      onClick={() => {
                        const tags = dedupeHashtags(edition.hashtags || []).join(" ");
                        const full = captionDisplay + (tags ? "\n\n" + tags : "");
                        navigator.clipboard.writeText(full);
                        toast.success(lang === "ar" ? "تم النسخ" : "Copied");
                      }}
                      className="text-xs flex items-center gap-1.5 px-2 py-1 rounded"
                      style={{ background: "var(--ob-raised)", color: "var(--glass-2)", border: "1px solid var(--hair)" }}
                    >
                      <Copy className="w-3 h-3" /> {lang === "ar" ? "نسخ" : "Copy"}
                    </button>
                  </div>
                  <textarea
                    value={captionDisplay}
                    onChange={e => setEdition(ed => ({ ...ed, linkedin_caption: e.target.value }))}
                    rows={6}
                    dir={rtl ? "rtl" : "ltr"}
                    className="w-full p-3 rounded-lg text-sm"
                    style={{ background: "var(--ob-field)", color: "var(--glass)", border: "1px solid var(--hair)", fontFamily: rtl ? "'Cairo', sans-serif" : "var(--font-body)" }}
                  />
                  <div className="flex flex-wrap gap-1.5">
                    {dedupeHashtags(edition.hashtags || []).map((h, i) => (
                      <span key={i} className="text-xs px-2 py-1 rounded" style={{ background: "var(--ob-raised)", color: "var(--glass-2)", border: "1px solid var(--hair)", fontFamily: "var(--font-mono)" }}>{h}</span>
                    ))}
                  </div>
                </div>
              ) : null}
            </>
          )}
        </div>

        {/* Right rail */}
        <div className="space-y-4">
          {/* Signal picker */}
          <div className="rounded-2xl" style={{ background: "var(--ob-panel)", border: "1px solid var(--hair)" }}>
            <button
              onClick={() => setShowSignals(s => !s)}
              className="w-full flex items-center justify-between px-4 py-3 text-left"
            >
              <span className="text-xs uppercase tracking-wider font-semibold" style={{ color: "var(--glass-2)", fontFamily: "var(--font-mono)" }}>
                {lang === "ar" ? "اختر إشاراتك (اختياري)" : "Pick your signals (optional)"}
              </span>
              {showSignals ? <ChevronUp className="w-4 h-4" style={{ color: "var(--glass-2)" }} /> : <ChevronDown className="w-4 h-4" style={{ color: "var(--glass-2)" }} />}
            </button>
            {showSignals && (
              <div style={{ maxHeight: 320, overflowY: "auto" }} className="px-1 pb-2">
                <StartFromPanel
                  currentFormat="carousel"
                  hasDraft={false}
                  onSelect={(_t, _ctx, _fmt, _sigTitle, _insight, signalId) => {
                    if (!signalId) return;
                    setSelectedSignalIds(ids => (ids.includes(signalId) ? ids : [...ids, signalId]));
                    toast.success(lang === "ar" ? "أضيفت إلى الإصدار" : "Added to edition");
                  }}
                />
              </div>
            )}
          </div>

          {selectedSignalIds.length ? (
            <div className="rounded-2xl p-3 text-xs" style={{ background: "var(--ob-panel)", border: "1px solid var(--hair)", color: "var(--glass-2)" }}>
              <div className="mb-2" style={{ fontFamily: "var(--font-mono)" }}>
                {selectedSignalIds.length} {lang === "ar" ? "إشارات مختارة" : "signal(s) selected"}
              </div>
              <button onClick={() => setSelectedSignalIds([])} className="text-xs underline" style={{ color: "var(--glass-2)" }}>
                {lang === "ar" ? "إعادة تعيين" : "Reset"}
              </button>
            </div>
          ) : null}

          {/* Manual question for QA page */}
          <div className="rounded-2xl p-4 space-y-2" style={{ background: "var(--ob-panel)", border: "1px solid var(--hair)" }}>
            <div className="text-xs uppercase tracking-wider" style={{ color: "var(--glass-2)", fontFamily: "var(--font-mono)" }}>
              {lang === "ar" ? "سؤال لصفحة \"أنت سألت\" (اختياري)" : "Question for the You Asked page (optional)"}
            </div>
            <input
              value={manualQuestion}
              onChange={e => setManualQuestion(e.target.value)}
              dir={rtl ? "rtl" : "ltr"}
              placeholder={lang === "ar" ? "اترك فارغاً لاختيار الأقوى تلقائياً" : "Leave blank to auto-pick the sharpest one"}
              className="w-full p-2 rounded-lg text-sm"
              style={{ background: "var(--ob-field)", color: "var(--glass)", border: "1px solid var(--hair)" }}
            />
          </div>

          {/* Per-page edit panel */}
          {current ? (
            <div className="rounded-2xl p-4 space-y-3" style={{ background: "var(--ob-panel)", border: "1px solid var(--hair)" }}>
              <div className="flex items-center justify-between">
                <div className="text-xs uppercase tracking-wider" style={{ color: "var(--glass-2)", fontFamily: "var(--font-mono)" }}>
                  {lang === "ar" ? "تحرير" : "Edit"} · {current.page_type}
                </div>
              </div>
              <PageEditor
                page={current}
                lang={lang}
                onChange={next => {
                  setEdition(ed => {
                    const pgs = [...ed.pages];
                    pgs[activePage] = next;
                    return { ...ed, pages: pgs };
                  });
                }}
              />
            </div>
          ) : null}
        </div>
      </div>

      {/* Bottom bar */}
      <div className="sticky bottom-0 z-30 px-4 md:px-8 py-3 flex items-center gap-2 justify-end" style={{ background: "var(--ob-panel)", borderTop: "1px solid var(--hair)" }}>
        <button onClick={exportPdf} disabled={exporting || !total}
                className="px-3 py-1.5 text-xs rounded-lg flex items-center gap-1.5 focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--action)]"
                style={{ background: "var(--action)", color: "var(--ink-on-brand)" }}>
          {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />} PDF
        </button>
        <button onClick={exportZip} disabled={exporting || !total}
                className="px-3 py-1.5 text-xs rounded-lg flex items-center gap-1.5 focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--action)]"
                style={{ background: "var(--ob-raised)", color: "var(--glass)", border: "1px solid var(--hair)" }}>
          <FileArchive className="w-3.5 h-3.5" /> ZIP
        </button>
        <button onClick={saveToLibrary} disabled={saving || savedToLibrary || !total}
                className="px-3 py-1.5 text-xs rounded-lg flex items-center gap-1.5 focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--action)]"
                style={{
                  background: savedToLibrary ? "color-mix(in srgb, var(--pos) 14%, var(--ob-raised))" : "var(--ob-raised)",
                  color: savedToLibrary ? "var(--pos)" : "var(--glass)",
                  border: savedToLibrary ? "1px solid var(--pos)" : "1px solid var(--hair)",
                }}>
          {saving ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving…</>
            : savedToLibrary ? <><Check className="w-3.5 h-3.5" /> Saved to Library</>
            : <><BookmarkPlus className="w-3.5 h-3.5" /> Save to Library</>}
        </button>
      </div>

      {/* Offscreen render container */}
      <div ref={offscreenRef} style={{ position: "fixed", left: -10000, top: 0, width: PAGE_W, height: PAGE_H, pointerEvents: "none" }} />
    </div>
  );
}

/* ==================== Per-page editor ==================== */

function Field({ label, value, onChange, textarea, rtl }: { label: string; value: string; onChange: (v: string) => void; textarea?: boolean; rtl: boolean }) {
  const common = {
    value: value || "",
    onChange: (e: any) => onChange(e.target.value),
    dir: rtl ? "rtl" : "ltr" as const,
    className: "w-full p-2 rounded-lg text-sm",
    style: { background: "var(--ob-field)", color: "var(--glass)", border: "1px solid var(--hair)", fontFamily: rtl ? "'Cairo', sans-serif" : undefined },
  };
  return (
    <label className="block space-y-1">
      <div className="text-[10px] uppercase tracking-wider" style={{ color: "var(--glass-3)", fontFamily: "var(--font-mono)" }}>{label}</div>
      {textarea ? <textarea rows={3} {...(common as any)} /> : <input {...(common as any)} />}
    </label>
  );
}

function PageEditor({ page, lang, onChange }: { page: EditionPage; lang: "en" | "ar"; onChange: (p: EditionPage) => void }) {
  const rtl = lang === "ar";
  const set = (patch: any) => onChange({ ...page, ...patch });

  switch (page.page_type) {
    case "FRONT":
      return (
        <div className="space-y-2">
          <Field label="Kicker" rtl={rtl} value={page.kicker} onChange={v => set({ kicker: v })} />
          <Field label="Lead headline" rtl={rtl} value={page.lead_headline} onChange={v => set({ lead_headline: v })} textarea />
          <Field label="Lead accent" rtl={rtl} value={page.lead_accent || ""} onChange={v => set({ lead_accent: v })} />
          <Field label="Deck" rtl={rtl} value={page.deck} onChange={v => set({ deck: v })} textarea />
          <Field label="Fig label" rtl={rtl} value={page.fig?.label || ""} onChange={v => set({ fig: { ...(page.fig || { kind: "line_signal" }), label: v } })} />
        </div>
      );
    case "ARTICLE":
      return (
        <div className="space-y-2">
          <Field label="Section" rtl={rtl} value={page.section} onChange={v => set({ section: v })} />
          <Field label="Story no" rtl={rtl} value={page.story_no} onChange={v => set({ story_no: v })} />
          <Field label="Kicker" rtl={rtl} value={page.kicker} onChange={v => set({ kicker: v })} />
          <Field label="Headline" rtl={rtl} value={page.headline} onChange={v => set({ headline: v })} textarea />
          <Field label="Headline accent" rtl={rtl} value={page.headline_accent || ""} onChange={v => set({ headline_accent: v })} />
          <Field label="Body (news)" rtl={rtl} value={page.body} onChange={v => set({ body: v })} textarea />
          <Field label="My read" rtl={rtl} value={page.my_read} onChange={v => set({ my_read: v })} textarea />
          <Field label="Source line" rtl={rtl} value={page.source_line} onChange={v => set({ source_line: v })} />
          <Field label="Fig label" rtl={rtl} value={page.fig?.label || ""} onChange={v => set({ fig: { ...(page.fig || { kind: "line_signal" }), label: v } })} />
        </div>
      );
    case "DIGEST":
      return (
        <div className="space-y-2">
          <Field label="Kicker" rtl={rtl} value={page.kicker} onChange={v => set({ kicker: v })} />
          <Field label="Intro" rtl={rtl} value={page.intro} onChange={v => set({ intro: v })} textarea />
          {(page.items || []).map((item, i) => (
            <div key={i} className="p-2 rounded-lg space-y-1" style={{ background: "var(--ob-raised)", border: "1px solid var(--hair)" }}>
              <div className="text-[10px] uppercase" style={{ color: "var(--glass-3)", fontFamily: "var(--font-mono)" }}>Item {i + 1}</div>
              <Field label="Big value" rtl={rtl} value={item.big_value} onChange={v => {
                const items = [...page.items]; items[i] = { ...item, big_value: v }; set({ items });
              }} />
              <Field label="Claim" rtl={rtl} value={item.claim} onChange={v => {
                const items = [...page.items]; items[i] = { ...item, claim: v }; set({ items });
              }} />
              <Field label="Takeaway" rtl={rtl} value={item.takeaway} onChange={v => {
                const items = [...page.items]; items[i] = { ...item, takeaway: v }; set({ items });
              }} textarea />
              <Field label="Source" rtl={rtl} value={item.source} onChange={v => {
                const items = [...page.items]; items[i] = { ...item, source: v }; set({ items });
              }} />
            </div>
          ))}
          <Field label="Close" rtl={rtl} value={page.close} onChange={v => set({ close: v })} textarea />
        </div>
      );
    case "QA":
      return (
        <div className="space-y-2">
          <Field label="Kicker" rtl={rtl} value={page.kicker} onChange={v => set({ kicker: v })} />
          <Field label="Question" rtl={rtl} value={page.question} onChange={v => set({ question: v })} textarea />
          <Field label="Asked by (role)" rtl={rtl} value={page.asked_by_role} onChange={v => set({ asked_by_role: v })} />
          <Field label="Answer" rtl={rtl} value={page.answer} onChange={v => set({ answer: v })} textarea />
          <Field label="Invite" rtl={rtl} value={page.invite} onChange={v => set({ invite: v })} textarea />
        </div>
      );
    case "BACK":
      return (
        <div className="space-y-2">
          <Field label="Kicker" rtl={rtl} value={page.kicker} onChange={v => set({ kicker: v })} />
          <Field label="Headline" rtl={rtl} value={page.headline} onChange={v => set({ headline: v })} textarea />
          <Field label="Headline accent" rtl={rtl} value={page.headline_accent || ""} onChange={v => set({ headline_accent: v })} />
          <Field label="Promise" rtl={rtl} value={page.promise} onChange={v => set({ promise: v })} textarea />
          <Field label="Sign name" rtl={rtl} value={page.sign_name} onChange={v => set({ sign_name: v })} />
          <Field label="Sign line" rtl={rtl} value={page.sign_line} onChange={v => set({ sign_line: v })} />
          <Field label="Follow label" rtl={rtl} value={page.follow_label} onChange={v => set({ follow_label: v })} />
          <Field label="Follow sub" rtl={rtl} value={page.follow_sub} onChange={v => set({ follow_sub: v })} />
        </div>
      );
  }
}