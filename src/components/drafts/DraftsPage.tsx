import React, { useCallback, useEffect, useState } from "react";
import { ButtonPrimary, ButtonGhost } from "@/components/systemb";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { loadStudioDrafts, type StudioDraft } from "@/components/studio/draftsSource";
import { T, savedAgo } from "@/components/studio/strings";

/**
 * DraftsPage — the resume surface, out in the open.
 *
 * "Save and come back later" says the work went to your drafts. This is the
 * screen it goes to. The composer's step-1 drafts stage stays as a shortcut;
 * this page is the door behind Write.
 *
 * Opening a draft uses the SHELL's existing deep link (`?draft=<id>&src=<table>`,
 * handled by Dashboard's applyDeepLinkParams). That path works whether or not
 * the composer is already mounted, which the mount-only `?piece=` read is not.
 */

const MONO: React.CSSProperties = { fontFamily: "var(--ff-mono)", fontVariantNumeric: "tabular-nums" };
const SHOWN = 12;

const firstLine = (text: string, max = 90) => {
  const line = (text || "").split(/\r?\n/).find((l) => l.trim().length > 0)?.trim() ?? "";
  return line.length > max ? `${line.slice(0, max).trimEnd()}…` : line;
};

const DraftsPage: React.FC = () => {
  const { lang, isRTL } = useLanguage();
  const L = (lang === "ar" ? "ar" : "en") as "en" | "ar";
  const [drafts, setDrafts] = useState<StudioDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [askId, setAskId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const rows = await loadStudioDrafts();
      if (cancelled) return;
      setDrafts(rows);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const openInComposer = useCallback((d: StudioDraft) => {
    try {
      window.dispatchEvent(new CustomEvent("aura:switch-tab", {
        detail: { tab: "authority", params: `draft=${encodeURIComponent(d.id)}&src=${d._source}` },
      }));
    } catch { /* navigation is never allowed to throw at a member */ }
  }, []);

  const newPost = useCallback(() => {
    try {
      window.dispatchEvent(new CustomEvent("aura:switch-tab", { detail: { tab: "authority" } }));
    } catch { /* same */ }
  }, []);

  const remove = useCallback(async (d: StudioDraft) => {
    setRowError(null);
    const table = d._source === "linkedin_posts" ? "linkedin_posts" : "content_items";
    const { error } = await supabase.from(table).delete().eq("id", d.id);
    if (error) {
      setRowError({ id: d.id, message: T.draftsDeleteFailed[L] });
      setAskId(null);
      return;
    }
    setDrafts((prev) => prev.filter((r) => r.id !== d.id));
    setAskId(null);
  }, [L]);

  const arabicLine = L === "ar" ? { lineHeight: 1.9 as const } : undefined;
  const rest = T.draftsShowingRecent(drafts.length, L);

  return (
    <section data-testid="drafts-page" style={{ fontFamily: "var(--ff-ui)", marginBottom: 26 }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ ...MONO, fontSize: 10.5, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--text-muted)" }}>
          {T.draftsPageEyebrow[L]}
        </div>
        <h1 style={{ margin: "8px 0 0", fontSize: 26, lineHeight: L === "ar" ? 1.9 : 1.15, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-.01em" }}>
          {T.draftsPageTitle[L]}
        </h1>
        <p style={{ margin: "8px 0 0", fontSize: 14, color: "var(--text-secondary)", maxWidth: 620, ...arabicLine }}>
          {T.draftsPageDesc[L]}
        </p>
      </div>

      {loading ? (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "28px 4px", color: "var(--text-secondary)", fontSize: 14 }}>
          <Loader2 className="w-4 h-4 animate-spin" style={{ color: "var(--act)" }} />
          <span style={arabicLine}>{T.loading[L]}</span>
        </div>
      ) : drafts.length === 0 ? (
        <div style={{
          background: "var(--surface-card)",
          border: "1px solid var(--border-default)",
          borderRadius: 20,
          padding: "26px 22px",
        }}>
          <p style={{ margin: "0 0 14px", fontSize: 14.5, color: "var(--text-secondary)", ...arabicLine }}>
            {T.draftsPageEmpty[L]}
          </p>
          <ButtonPrimary onClick={newPost}>{T.newPost[L]}</ButtonPrimary>
        </div>
      ) : (
        <>
          <div style={{ display: "grid", gap: 10 }}>
            {drafts.slice(0, SHOWN).map((d) => {
              const heading = (d.title || "").trim() || firstLine(d.body);
              const asking = askId === d.id;
              return (
                <div
                  key={d.id}
                  role="button"
                  tabIndex={0}
                  data-testid="draft-row"
                  className="v23-focus"
                  onClick={() => { if (!asking) openInComposer(d); }}
                  onKeyDown={(e) => {
                    if (asking) return;
                    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openInComposer(d); }
                  }}
                  style={{
                    background: "var(--surface-card)",
                    border: "1px solid var(--border-default)",
                    borderRadius: 20,
                    padding: "16px 18px",
                    cursor: "pointer",
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 12,
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <div style={{ minWidth: 220, flex: "1 1 320px" }}>
                    <div style={{ fontSize: 14.5, fontWeight: 700, color: "var(--text-primary)", ...arabicLine }}>
                      {heading}
                    </div>
                    <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, fontSize: 12.5, color: "var(--text-secondary)" }}>
                      {d.topic && <span style={arabicLine}>{d.topic}</span>}
                      {d.topic && <span aria-hidden>·</span>}
                      <span style={MONO}>{d.language === "ar" ? "AR" : "EN"}</span>
                      <span aria-hidden>·</span>
                      <span style={arabicLine}>
                        {d.type === "carousel" ? T.formatWordsAndSlides[L] : T.formatWords[L]}
                      </span>
                      <span aria-hidden>·</span>
                      <span style={MONO}>{savedAgo(d.saved_at, L)}</span>
                    </div>
                    {rowError?.id === d.id && (
                      <p style={{ margin: "8px 0 0", fontSize: 12.5, color: "var(--error)", ...arabicLine }}>
                        {rowError.message}
                      </p>
                    )}
                  </div>

                  <div
                    style={{ display: "flex", alignItems: "center", gap: 8, flexDirection: isRTL ? "row-reverse" : "row" }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <ButtonGhost onClick={() => openInComposer(d)}>{T.hubResumeOpen[L]}</ButtonGhost>
                    {asking ? (
                      <>
                        <span style={{ fontSize: 12.5, color: "var(--text-muted)", ...arabicLine }}>{T.draftsDeleteAsk[L]}</span>
                        <ButtonGhost onClick={() => void remove(d)} style={{ color: "var(--error)" }}>
                          {T.draftsDeleteYes[L]}
                        </ButtonGhost>
                        <ButtonGhost onClick={() => setAskId(null)}>{T.draftsDeleteCancel[L]}</ButtonGhost>
                      </>
                    ) : (
                      <ButtonGhost onClick={() => { setRowError(null); setAskId(d.id); }}>
                        {T.draftsDelete[L]}
                      </ButtonGhost>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {drafts.length > SHOWN && (
            <p style={{ margin: "12px 0 0", fontSize: 12.5, color: "var(--text-muted)", ...arabicLine }}>
              {rest.pre}
              {rest.digit && <span style={MONO}>{rest.digit}</span>}
              {rest.post}
            </p>
          )}
        </>
      )}
    </section>
  );
};

export default DraftsPage;
