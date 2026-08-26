import React, { useCallback, useEffect, useState } from "react";
import { ButtonPrimary } from "@/components/systemb";
import { Plus, Loader2 } from "lucide-react";
import SourcesSubTab from "@/components/tabs/SourcesSubTab";
import SubTabs from "@/components/nav/SubTabs";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { T } from "@/components/studio/strings";
import { deckHasSlides } from "@/components/studio/draftsSource";
import { formatSmartDate } from "@/lib/formatDate";

/**
 * LibraryPage — what you saved, and what you published.
 *
 * Two segments, both page-level FILTERS: local state only. Navigation lives in
 * NAV_ITEMS and navGroups, and this page never touches either, nor the URL.
 * Unfinished work is not here; it has its own door (Drafts).
 */

const MONO: React.CSSProperties = { fontFamily: "var(--ff-mono)", fontVariantNumeric: "tabular-nums" };

type PublishedRow = {
  id: string;
  post_text: string | null;
  post_url: string | null;
  published_at: string | null;
  format_type: string | null;
  source_metadata: unknown;
};

const firstLine = (text: string, max = 90) => {
  const line = (text || "").split(/\r?\n/).find((l) => l.trim().length > 0)?.trim() ?? "";
  return line.length > max ? `${line.slice(0, max).trimEnd()}…` : line;
};

interface Props {
  onOpenCapture?: (prefillUrl?: string, prefillText?: string) => void;
}

/** Read-only: every post that actually went live. Same user scoping as
 *  draftsSource.ts — the member's own rows only, enforced by the database. */
const PublishedList: React.FC<{ lang: "en" | "ar" }> = ({ lang }) => {
  const [rows, setRows] = useState<PublishedRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const arabicLine = lang === "ar" ? { lineHeight: 1.9 as const } : undefined;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("linkedin_posts")
        .select("id, post_text, post_url, published_at, format_type, source_metadata")
        .eq("tracking_status", "published")
        .order("published_at", { ascending: false })
        .limit(50);
      if (cancelled) return;
      if (error) { setFailed(true); setLoading(false); return; }
      setRows((data as PublishedRow[]) || []);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "28px 4px", color: "var(--text-secondary)", fontSize: 14 }}>
        <Loader2 className="w-4 h-4 animate-spin" style={{ color: "var(--act)" }} />
        <span style={arabicLine}>{T.loading[lang]}</span>
      </div>
    );
  }
  if (failed) {
    return (
      <p style={{ margin: 0, padding: "22px 4px", fontSize: 14, color: "var(--error)", ...arabicLine }}>
        {T.libPublishedFailed[lang]}
      </p>
    );
  }
  if (rows.length === 0) {
    return (
      <p style={{ margin: 0, padding: "22px 4px", fontSize: 14, color: "var(--text-secondary)", ...arabicLine }}>
        {T.libPublishedEmpty[lang]}
      </p>
    );
  }

  return (
    <div style={{ display: "grid", gap: 10 }}>
      {rows.map((r) => (
        <div
          key={r.id}
          data-testid="published-row"
          style={{
            background: "var(--surface-card)",
            border: "1px solid var(--border-default)",
            borderRadius: 20,
            padding: "16px 18px",
          }}
        >
          <div style={{ fontSize: 14.5, fontWeight: 700, color: "var(--text-primary)", ...arabicLine }}>
            {firstLine(r.post_text || "")}
          </div>
          <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, fontSize: 12.5, color: "var(--text-secondary)" }}>
            <span style={MONO}>{r.published_at ? formatSmartDate(r.published_at) : ""}</span>
            <span aria-hidden>·</span>
            <span style={arabicLine}>
              {r.format_type === "carousel" ? T.pieceWordsAndSlides[lang] : T.pieceWords[lang]}
            </span>
            {r.post_url && (
              <>
                <span aria-hidden>·</span>
                <a
                  href={r.post_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="v23-focus"
                  style={{ color: "var(--act)", textDecoration: "none", ...arabicLine }}
                >
                  {T.seeOnLinkedIn[lang]}
                </a>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

const LibraryPage: React.FC<Props> = ({ onOpenCapture }) => {
  const { lang } = useLanguage();
  const L: "en" | "ar" = String(lang) === "ar" ? "ar" : "en";
  const [view, setView] = useState<"sources" | "published">("sources");

  /** Jumping to a signal is navigation, so it goes through the one shell
   *  contract (`aura:switch-tab`) rather than this page writing the URL. */
  const openSignal = useCallback((id: string) => {
    try {
      window.dispatchEvent(new CustomEvent("aura:switch-tab", {
        detail: { tab: "intelligence", params: `signal=${encodeURIComponent(id)}` },
      }));
    } catch { /* navigation is never allowed to throw at a member */ }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const sources = view === "sources";
  const arabicLine = L === "ar" ? { lineHeight: 1.9 as const } : undefined;

  return (
    <section data-testid="library-page" style={{ fontFamily: "var(--ff-ui)", marginBottom: 26 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-end", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <div style={{ ...MONO, fontSize: 10.5, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--text-muted)" }}>
            Library
          </div>
          <h1 style={{ margin: "8px 0 0", fontSize: 26, lineHeight: L === "ar" ? 1.9 : 1.15, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-.01em" }}>
            {sources ? T.libSourcesTitle[L] : T.libPublishedTitle[L]}
          </h1>
          <p style={{ margin: "8px 0 0", fontSize: 14, color: "var(--text-secondary)", maxWidth: 620, ...arabicLine }}>
            {sources ? T.libSourcesDesc[L] : T.libPublishedDesc[L]}
          </p>
        </div>
        {sources && <ButtonPrimary onClick={() => onOpenCapture?.()}><Plus size={13} />Capture something</ButtonPrimary>}
      </div>

      <SubTabs
        options={[
          { value: "sources", label: T.libSources[L] },
          { value: "published", label: T.libPublished[L] },
        ]}
        active={view}
        onSelect={(v) => setView(v === "published" ? "published" : "sources")}
        ariaLabel={T.libSources[L]}
      />

      {sources ? (
        <SourcesSubTab
          onOpenCapture={() => onOpenCapture?.()}
          onSwitchToSignal={openSignal}
        />
      ) : (
        <PublishedList lang={L} />
      )}
    </section>
  );
};

export default LibraryPage;
