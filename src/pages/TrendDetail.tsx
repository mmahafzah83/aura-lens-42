import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuthReady } from "@/hooks/useAuthReady";
import { formatSmartDate } from "@/lib/formatDate";

interface TrendRow {
  id: string;
  headline: string;
  insight: string | null;
  summary: string | null;
  source: string | null;
  url: string | null;
  canonical_url: string | null;
  content_markdown: string | null;
  fetched_at: string;
  validation_status: string | null;
  validation_score: number | null;
  relevance_score: number | null;
  topic_relevance_score: number | null;
  final_score: number | null;
  selection_reason: string | null;
  category: string | null;
  impact_level: string | null;
}

// Truncate markdown to roughly N words while keeping basic structure intact.
function previewMarkdown(md: string, words = 400): { preview: string; truncated: boolean } {
  if (!md) return { preview: "", truncated: false };
  const tokens = md.split(/\s+/);
  if (tokens.length <= words) return { preview: md, truncated: false };
  return { preview: tokens.slice(0, words).join(" ") + "…", truncated: true };
}

const TRUSTED_SET = new Set([
  "mckinsey.com","bcg.com","bain.com","deloitte.com","ey.com","pwc.com",
  "kpmg.com","accenture.com","oliverwyman.com","rolandberger.com",
  "hbr.org","sloanreview.mit.edu","brookings.edu","gartner.com",
  "forrester.com","idc.com","ft.com","wsj.com","bloomberg.com",
  "economist.com","reuters.com","weforum.org","imf.org","worldbank.org",
  "nature.com","science.org","nber.org",
]);
const isTrusted = (s: string | null) => {
  const x = (s || "").toLowerCase();
  return Array.from(TRUSTED_SET).some(d => x === d || x.endsWith("." + d));
};
const tier = (v: number | null | undefined): { label: string; color: string } => {
  const n = v ?? 0;
  if (n >= 75) return { label: "High quality", color: "#7ab648" };
  if (n >= 50) return { label: "Solid", color: "#F97316" };
  return { label: "Low signal", color: "hsl(var(--muted-foreground))" };
};

export default function TrendDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, isReady } = useAuthReady();
  const [trend, setTrend] = useState<TrendRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [externalAlive, setExternalAlive] = useState<boolean | null>(null);

  useEffect(() => {
    if (!isReady || !user || !id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("industry_trends")
        .select("id, headline, insight, summary, source, url, canonical_url, content_markdown, fetched_at, validation_status, validation_score, relevance_score, topic_relevance_score, final_score, selection_reason, category, impact_level")
        .eq("id", id)
        .eq("user_id", user.id)
        .maybeSingle();
      if (cancelled) return;
      if (error) console.error("[TrendDetail] load failed", error);
      setTrend(data as TrendRow | null);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [isReady, user, id]);

  // Lightweight liveness probe for the external link (best-effort)
  useEffect(() => {
    const target = trend?.canonical_url || trend?.url;
    if (!target) { setExternalAlive(null); return; }
    let cancelled = false;
    (async () => {
      try {
        // no-cors HEAD probe — opaque but resolves on any response
        await fetch(target, { method: "HEAD", mode: "no-cors" });
        if (!cancelled) setExternalAlive(true);
      } catch {
        if (!cancelled) setExternalAlive(false);
      }
    })();
    return () => { cancelled = true; };
  }, [trend?.canonical_url, trend?.url]);

  if (loading) {
    return (
      <div className="mx-auto" style={{ maxWidth: 720, padding: "32px 20px" }}>
        <Skeleton className="h-6 w-32 mb-6" />
        <Skeleton className="h-10 w-full mb-3" />
        <Skeleton className="h-5 w-2/3 mb-8" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!trend) {
    return (
      <div className="mx-auto text-center" style={{ maxWidth: 560, padding: "64px 20px" }}>
        <div style={{ fontSize: 14, color: "hsl(var(--foreground))", marginBottom: 6 }}>Trend not found</div>
        <div style={{ fontSize: 12, color: "hsl(var(--muted-foreground))", marginBottom: 16 }}>
          It may have been expired or removed.
        </div>
        <button
          onClick={() => navigate("/home")}
          style={{ fontSize: 12, color: "#F97316", background: "transparent", border: "0.5px solid #F9731644", padding: "6px 14px", borderRadius: 4, cursor: "pointer" }}
        >
          Back to Home
        </button>
      </div>
    );
  }

  const externalUrl = trend.canonical_url || trend.url;

  return (
    <div className="mx-auto" style={{ maxWidth: 760, padding: "28px 20px 80px" }}>
      <button
        onClick={() => navigate(-1)}
        style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", background: "transparent", border: "none", padding: 0, cursor: "pointer", marginBottom: 20 }}
      >
        ← Back
      </button>

      <div className="flex items-center flex-wrap" style={{ gap: 6, marginBottom: 10 }}>
        <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "hsl(var(--muted-foreground) / 0.8)", fontWeight: 500 }}>
          {trend.source ? `From ${trend.source}` : "From the web"}
        </span>
        {isTrusted(trend.source) && (
          <span style={{ fontSize: 9, color: "#7ab648", border: "0.5px solid #7ab64855", padding: "1px 6px", borderRadius: 3, fontWeight: 600, letterSpacing: "0.04em" }}>
            ✓ TRUSTED
          </span>
        )}
        {(() => { const t = tier(trend.validation_score); return (
          <span title={`Quality ${trend.validation_score ?? 0}/100`} style={{ fontSize: 9, color: t.color, border: `0.5px solid ${t.color}55`, padding: "1px 6px", borderRadius: 3, fontWeight: 600, letterSpacing: "0.04em" }}>
            {t.label.toUpperCase()} · {trend.validation_score ?? 0}
          </span>
        ); })()}
        {(trend.topic_relevance_score ?? 0) >= 40 && (
          <span title="Topic match with your profile" style={{ fontSize: 9, color: "#F97316", border: "0.5px solid #F9731655", padding: "1px 6px", borderRadius: 3, fontWeight: 600, letterSpacing: "0.04em" }}>
            FOCUS MATCH · {trend.topic_relevance_score}
          </span>
        )}
        <span style={{ fontSize: 10, color: "hsl(var(--muted-foreground) / 0.6)" }}>
          · {formatSmartDate(trend.fetched_at)}
        </span>
      </div>

      {trend.selection_reason && trend.selection_reason.trim().length > 0 && (
        <div style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", marginBottom: 14, fontStyle: "italic" }}>
          Why selected: {trend.selection_reason}
        </div>
      )}
      <h1 style={{ fontSize: 24, fontWeight: 600, color: "hsl(var(--foreground))", marginBottom: 14, lineHeight: 1.3 }}>
        {trend.headline}
      </h1>

      {trend.insight && (
        <div style={{ fontSize: 13, color: "hsl(var(--foreground) / 0.85)", padding: "12px 14px", borderLeft: "2px solid #F97316", background: "hsl(var(--muted) / 0.3)", marginBottom: 24, borderRadius: "0 4px 4px 0" }}>
          <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.08em", color: "#F97316", marginBottom: 4, fontWeight: 600 }}>Why this matters</div>
          {trend.insight}
        </div>
      )}

      {trend.summary && (
        <div style={{ fontSize: 13, color: "hsl(var(--muted-foreground))", lineHeight: 1.6, marginBottom: 24 }}>
          {trend.summary}
        </div>
      )}

      <div style={{ borderTop: "0.5px solid hsl(var(--border))", paddingTop: 20, marginBottom: 24 }}>
        <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "hsl(var(--muted-foreground) / 0.7)", marginBottom: 12 }}>
          Article snapshot
        </div>
        {trend.content_markdown ? (
          <div className="prose prose-sm max-w-none dark:prose-invert" style={{ fontSize: 13, lineHeight: 1.7 }}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{trend.content_markdown}</ReactMarkdown>
          </div>
        ) : (
          <div style={{ fontSize: 12, color: "hsl(var(--muted-foreground))" }}>
            No internal snapshot stored for this trend.
          </div>
        )}
      </div>

      {externalUrl && (
        <div style={{ borderTop: "0.5px solid hsl(var(--border))", paddingTop: 16, fontSize: 11, color: "hsl(var(--muted-foreground))" }}>
          {externalAlive === false ? (
            <span>Original source unavailable.</span>
          ) : (
            <a href={externalUrl} target="_blank" rel="noopener noreferrer" style={{ color: "hsl(var(--muted-foreground))", textDecoration: "underline" }}>
              View original on {trend.source || "publisher site"} ↗
            </a>
          )}
        </div>
      )}
    </div>
  );
}
