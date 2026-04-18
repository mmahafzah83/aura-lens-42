import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuthReady } from "@/hooks/useAuthReady";
import { formatSmartDate } from "@/lib/formatDate";

interface SignalRow {
  id: string;
  headline: string;
  insight: string | null;
  summary: string | null;
  source: string | null;
  url: string | null;
  canonical_url: string | null;
  content_markdown: string | null;
  fetched_at: string;
  validation_score: number | null;
  relevance_score: number | null;
  topic_relevance_score: number | null;
  snapshot_quality: number | null;
  final_score: number | null;
  selection_reason: string | null;
  category: string | null;
  impact_level: string | null;
  confidence_level: string | null;
  signal_type: string | null;
  opportunity_type: string | null;
  action_recommendation: string | null;
  content_angle: string | null;
  decision_label: string | null;
}

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

const impactColor = (level: string | null) => {
  if (level === "High") return "#E24B4A";
  if (level === "Emerging") return "#F97316";
  return "hsl(var(--muted-foreground))";
};
const decisionStyle = (label: string | null): { color: string; bg: string } => {
  if (label === "Act Now") return { color: "#E24B4A", bg: "#E24B4A12" };
  if (label === "Early Opportunity") return { color: "#F97316", bg: "#F9731612" };
  return { color: "hsl(var(--muted-foreground))", bg: "hsl(var(--muted) / 0.3)" };
};

export default function TrendDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, isReady } = useAuthReady();
  const [signal, setSignal] = useState<SignalRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [externalAlive, setExternalAlive] = useState<boolean | null>(null);
  const [showFullSnapshot, setShowFullSnapshot] = useState(false);

  useEffect(() => {
    if (!isReady || !user || !id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("industry_trends")
        .select("id, headline, insight, summary, source, url, canonical_url, content_markdown, fetched_at, validation_score, relevance_score, topic_relevance_score, snapshot_quality, final_score, selection_reason, category, impact_level, confidence_level, signal_type, opportunity_type, action_recommendation, content_angle, decision_label")
        .eq("id", id)
        .eq("user_id", user.id)
        .maybeSingle();
      if (cancelled) return;
      if (error) console.error("[TrendDetail] load failed", error);
      setSignal(data as SignalRow | null);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [isReady, user, id]);

  useEffect(() => {
    const target = signal?.canonical_url || signal?.url;
    if (!target) { setExternalAlive(null); return; }
    let cancelled = false;
    (async () => {
      try {
        await fetch(target, { method: "HEAD", mode: "no-cors" });
        if (!cancelled) setExternalAlive(true);
      } catch {
        if (!cancelled) setExternalAlive(false);
      }
    })();
    return () => { cancelled = true; };
  }, [signal?.canonical_url, signal?.url]);

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

  if (!signal) {
    return (
      <div className="mx-auto text-center" style={{ maxWidth: 560, padding: "64px 20px" }}>
        <div style={{ fontSize: 14, color: "hsl(var(--foreground))", marginBottom: 6 }}>Signal not found</div>
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

  const externalUrl = signal.canonical_url || signal.url;
  const dStyle = decisionStyle(signal.decision_label);
  const iColor = impactColor(signal.impact_level);

  return (
    <div className="mx-auto" style={{ maxWidth: 760, padding: "28px 20px 80px" }}>
      <button
        onClick={() => navigate(-1)}
        style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", background: "transparent", border: "none", padding: 0, cursor: "pointer", marginBottom: 20 }}
      >
        ← Back
      </button>

      {/* Decision header */}
      <div className="flex items-center flex-wrap" style={{ gap: 6, marginBottom: 14 }}>
        {signal.decision_label && (
          <span style={{ fontSize: 10, color: dStyle.color, background: dStyle.bg, border: `0.5px solid ${dStyle.color}55`, padding: "3px 10px", borderRadius: 3, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}>
            ◆ {signal.decision_label}
          </span>
        )}
        {signal.signal_type && (
          <span style={{ fontSize: 9, color: "hsl(var(--muted-foreground))", border: "0.5px solid hsl(var(--border))", padding: "2px 8px", borderRadius: 3, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase" }}>
            {signal.signal_type}
          </span>
        )}
        {signal.category && (
          <span style={{ fontSize: 9, color: "hsl(var(--muted-foreground))", border: "0.5px solid hsl(var(--border))", padding: "2px 8px", borderRadius: 3, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase" }}>
            {signal.category}
          </span>
        )}
        {signal.impact_level && (
          <span style={{ fontSize: 9, color: iColor, border: `0.5px solid ${iColor}55`, padding: "2px 8px", borderRadius: 3, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase" }}>
            Impact · {signal.impact_level}
          </span>
        )}
        {signal.confidence_level && (
          <span style={{ fontSize: 9, color: "hsl(var(--muted-foreground))", border: "0.5px solid hsl(var(--border))", padding: "2px 8px", borderRadius: 3, fontWeight: 500, letterSpacing: "0.05em", textTransform: "uppercase" }}>
            Confidence · {signal.confidence_level}
          </span>
        )}
        {isTrusted(signal.source) && (
          <span style={{ fontSize: 9, color: "#7ab648", border: "0.5px solid #7ab64855", padding: "2px 8px", borderRadius: 3, fontWeight: 600, letterSpacing: "0.05em" }}>
            ✓ TRUSTED
          </span>
        )}
        <span style={{ fontSize: 10, color: "hsl(var(--muted-foreground) / 0.6)", marginLeft: "auto" }}>
          {signal.source ? `${signal.source} · ` : ""}{formatSmartDate(signal.fetched_at)}
        </span>
      </div>

      <h1 style={{ fontSize: 26, fontWeight: 600, color: "hsl(var(--foreground))", marginBottom: 16, lineHeight: 1.25, letterSpacing: "-0.01em" }}>
        {signal.headline}
      </h1>

      {/* Insight (top) */}
      {signal.insight && (
        <div style={{ fontSize: 14, color: "hsl(var(--foreground) / 0.9)", padding: "14px 16px", borderLeft: "2px solid #F97316", background: "hsl(var(--muted) / 0.3)", marginBottom: 16, borderRadius: "0 4px 4px 0", lineHeight: 1.55 }}>
          <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.08em", color: "#F97316", marginBottom: 5, fontWeight: 700 }}>Insight</div>
          {signal.insight}
        </div>
      )}

      {/* Action recommendation (highlighted) */}
      {signal.action_recommendation && (
        <div style={{ fontSize: 13, color: "hsl(var(--foreground))", padding: "14px 16px", border: "0.5px solid #E24B4A55", background: "#E24B4A0A", marginBottom: 12, borderRadius: 6, lineHeight: 1.55 }}>
          <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.08em", color: "#E24B4A", marginBottom: 5, fontWeight: 700 }}>What to do</div>
          {signal.action_recommendation}
        </div>
      )}

      {/* Content angle (highlighted) */}
      {signal.content_angle && (
        <div style={{ fontSize: 13, color: "hsl(var(--foreground))", padding: "14px 16px", border: "0.5px solid #7ab64855", background: "#7ab6480A", marginBottom: 24, borderRadius: 6, lineHeight: 1.55 }}>
          <div className="flex items-center justify-between" style={{ marginBottom: 5 }}>
            <span style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.08em", color: "#7ab648", fontWeight: 700 }}>Content angle</span>
            {signal.opportunity_type && (
              <span style={{ fontSize: 9, color: "#7ab648", fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase" }}>
                {signal.opportunity_type} opportunity
              </span>
            )}
          </div>
          {signal.content_angle}
        </div>
      )}

      {signal.summary && (
        <div style={{ fontSize: 13, color: "hsl(var(--muted-foreground))", lineHeight: 1.65, marginBottom: 24 }}>
          {signal.summary}
        </div>
      )}

      {/* Internal snapshot — primary reading */}
      <div style={{ borderTop: "0.5px solid hsl(var(--border))", paddingTop: 20, marginBottom: 24 }}>
        <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "hsl(var(--muted-foreground) / 0.7)" }}>
            Article snapshot · primary reading
          </div>
          {signal.content_markdown && (() => {
            const { truncated } = previewMarkdown(signal.content_markdown, 400);
            if (!truncated) return null;
            return (
              <button
                onClick={() => setShowFullSnapshot(s => !s)}
                style={{ fontSize: 10, color: "#F97316", background: "transparent", border: "0.5px solid #F9731644", padding: "3px 10px", borderRadius: 3, cursor: "pointer", letterSpacing: "0.04em" }}
              >
                {showFullSnapshot ? "Show preview" : "Show full snapshot"}
              </button>
            );
          })()}
        </div>
        {signal.content_markdown ? (
          <div className="prose prose-sm max-w-none dark:prose-invert" style={{ fontSize: 13, lineHeight: 1.7 }}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {showFullSnapshot ? signal.content_markdown : previewMarkdown(signal.content_markdown, 400).preview}
            </ReactMarkdown>
          </div>
        ) : (
          <div style={{ fontSize: 12, color: "hsl(var(--muted-foreground))" }}>
            No internal snapshot stored for this signal.
          </div>
        )}
      </div>

      {/* External link — secondary reference */}
      {externalUrl && (
        <div style={{ borderTop: "0.5px solid hsl(var(--border))", paddingTop: 16, fontSize: 11, color: "hsl(var(--muted-foreground) / 0.7)" }}>
          <span style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.08em", marginRight: 8 }}>Reference</span>
          {externalAlive === false ? (
            <span>Original source unavailable.</span>
          ) : (
            <a href={externalUrl} target="_blank" rel="noopener noreferrer" style={{ color: "hsl(var(--muted-foreground))", textDecoration: "underline" }}>
              View original on {signal.source || "publisher site"} ↗
            </a>
          )}
        </div>
      )}

      {signal.selection_reason && signal.selection_reason.trim().length > 0 && (
        <div style={{ fontSize: 10, color: "hsl(var(--muted-foreground) / 0.6)", marginTop: 16, fontStyle: "italic" }}>
          ◆ Why selected: {signal.selection_reason}
        </div>
      )}
    </div>
  );
}
