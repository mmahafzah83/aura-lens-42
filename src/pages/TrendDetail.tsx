import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuthReady } from "@/hooks/useAuthReady";
import { formatSmartDate } from "@/lib/formatDate";
import { addTrendToSignals } from "@/lib/addTrendToSignals";
import { toast } from "sonner";

interface SignalRow {
  id: string;
  headline: string;
  insight: string | null;
  summary: string | null;
  source: string | null;
  url: string | null;
  canonical_url: string | null;
  content_markdown: string | null;
  content_clean: string | null;
  content_raw: string | null;
  fetched_at: string;
  validation_score: number | null;
  relevance_score: number | null;
  topic_relevance_score: number | null;
  snapshot_quality: number | null;
  content_quality_score: number | null;
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
  const [snapshotMode, setSnapshotMode] = useState<"clean" | "raw">("clean");
  const [added, setAdded] = useState(false);
  const [whyMatters, setWhyMatters] = useState<string | null>(null);
  const [whyLoading, setWhyLoading] = useState(false);
  const [whyFailed, setWhyFailed] = useState(false);

  const handleAddToSignals = async () => {
    if (!signal || added) return;
    setAdded(true);
    const result = await addTrendToSignals({
      id: signal.id,
      headline: signal.headline,
      insight: signal.insight,
      action_recommendation: signal.action_recommendation,
      category: signal.category,
      signal_type: signal.signal_type,
      final_score: signal.final_score,
    });
    if (result.ok) {
      toast.success(`Added to ${result.signalTitle} — fragment count now ${result.newCount}`);
    } else {
      toast.error("Couldn't add to signals — try again");
    }
  };

  useEffect(() => {
    if (!isReady || !user || !id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("industry_trends")
        .select("id, headline, insight, summary, source, url, canonical_url, content_markdown, content_clean, content_raw, fetched_at, validation_score, relevance_score, topic_relevance_score, snapshot_quality, content_quality_score, final_score, selection_reason, category, impact_level, confidence_level, signal_type, opportunity_type, action_recommendation, content_angle, decision_label")
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

  // Why this matters to you — use selection_reason if present, else AI
  useEffect(() => {
    if (!signal) return;
    const existing = (signal.selection_reason || "").trim();
    if (existing) {
      setWhyMatters(existing);
      setWhyFailed(false);
      setWhyLoading(false);
      return;
    }
    let cancelled = false;
    setWhyLoading(true);
    setWhyFailed(false);
    setWhyMatters(null);
    const timeout = setTimeout(() => {
      if (cancelled) return;
      cancelled = true;
      setWhyLoading(false);
      setWhyFailed(true);
    }, 6000);
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("trend-why-matters", {
          body: { headline: signal.headline, insight: signal.insight },
        });
        if (cancelled) return;
        clearTimeout(timeout);
        const text = (data?.text || "").trim();
        if (error || !text) {
          setWhyFailed(true);
          setWhyMatters(null);
        } else {
          setWhyMatters(text);
        }
      } catch (e) {
        if (cancelled) return;
        clearTimeout(timeout);
        setWhyFailed(true);
      } finally {
        if (!cancelled) setWhyLoading(false);
      }
    })();
    return () => { cancelled = true; clearTimeout(timeout); };
  }, [signal?.id]);

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

  const sectionLabel: React.CSSProperties = {
    fontSize: 10, fontWeight: 500, letterSpacing: "0.1em",
    textTransform: "uppercase", color: "#F97316", marginBottom: 6,
  };
  const bodyText: React.CSSProperties = {
    fontSize: 14, lineHeight: 1.65, color: "hsl(var(--foreground))",
  };
  const thinRule: React.CSSProperties = {
    borderTop: "0.5px solid hsl(var(--border) / 0.5)", margin: "16px 0",
  };

  return (
    <div className="mx-auto" style={{ maxWidth: 760, padding: "20px 24px 80px" }}>
      <button
        onClick={() => navigate(-1)}
        style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", background: "transparent", border: "none", padding: 0, cursor: "pointer", marginBottom: 20 }}
      >
        ← Back
      </button>

      {/* Tags row */}
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

      {/* Headline */}
      <h1 style={{ fontSize: 24, fontWeight: 500, lineHeight: 1.3, color: "hsl(var(--foreground))", margin: 0 }}>
        {signal.headline}
      </h1>

      {/* Meta line */}
      {signal.selection_reason && signal.selection_reason.trim().length > 0 && (
        <div style={{ fontSize: 12, color: "hsl(var(--muted-foreground) / 0.7)", marginTop: 6, marginBottom: 16 }}>
          {signal.selection_reason}
        </div>
      )}

      {/* Insight */}
      {signal.insight && (
        <div style={{ marginBottom: 16, marginTop: signal.selection_reason ? 0 : 16 }}>
          <div style={sectionLabel}>Insight</div>
          <div style={bodyText}>{signal.insight}</div>
        </div>
      )}

      {signal.insight && <div style={thinRule} />}

      {/* Why this matters to you */}
      {(whyLoading || whyMatters) && (
        <>
          <div style={{ marginBottom: 16 }}>
            <div style={sectionLabel}>Why this matters to you</div>
            {whyLoading ? (
              <Skeleton className="h-4 w-3/4" />
            ) : (
              <div style={{ ...bodyText, fontStyle: "italic" }}>{whyMatters}</div>
            )}
          </div>
          {signal.action_recommendation && <div style={thinRule} />}
        </>
      )}
      {!whyLoading && !whyMatters && !whyFailed === false && signal.insight && signal.action_recommendation && null}
      {!whyLoading && !whyMatters && signal.insight && signal.action_recommendation && (
        <div style={thinRule} />
      )}

      {/* What to do */}
      {signal.action_recommendation && (
        <div style={{ marginBottom: 16 }}>
          <div style={sectionLabel}>What to do</div>
          <div style={bodyText}>{signal.action_recommendation}</div>
        </div>
      )}

      {signal.action_recommendation && signal.content_angle && <div style={thinRule} />}

      {/* Content angle */}
      {signal.content_angle && (
        <div style={{ marginBottom: 16 }}>
          <div className="flex items-center" style={{ gap: 8, marginBottom: 6 }}>
            <span style={sectionLabel as React.CSSProperties}>Content angle</span>
            {signal.opportunity_type && (
              <span style={{ fontSize: 9, color: "#7ab648", background: "#7ab64812", border: "0.5px solid #7ab64855", padding: "2px 8px", borderRadius: 999, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: 6 }}>
                {signal.opportunity_type} opportunity
              </span>
            )}
          </div>
          <div style={bodyText}>{signal.content_angle}</div>
        </div>
      )}

      {signal.summary && (
        <div style={{ fontSize: 13, color: "hsl(var(--muted-foreground))", lineHeight: 1.65, marginBottom: 16 }}>
          {signal.summary}
        </div>
      )}

      {/* Internal snapshot — primary reading. Default = clean. Toggle to raw. */}
      {(() => {
        const cleanMd = signal.content_clean || signal.content_markdown;
        const rawMd = signal.content_raw || signal.content_markdown;
        const activeMd = snapshotMode === "raw" ? (rawMd || cleanMd) : (cleanMd || rawMd);
        const hasAny = !!activeMd;
        const hasBoth = !!(signal.content_clean && signal.content_raw && signal.content_clean !== signal.content_raw);
        if (!hasAny) {
          return (
            <div style={{ borderTop: "0.5px solid hsl(var(--border))", paddingTop: 20, marginBottom: 24, padding: "20px 18px", background: "hsl(var(--muted) / 0.25)", borderRadius: 6 }}>
              <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.08em", color: "hsl(var(--muted-foreground))", marginBottom: 8, fontWeight: 700 }}>
                Legacy signal · incomplete
              </div>
              <div style={{ fontSize: 13, color: "hsl(var(--foreground) / 0.85)", lineHeight: 1.6, marginBottom: 12 }}>
                This signal was created before snapshots were stored locally. No internal article copy is available — only the headline and original publisher reference below.
              </div>
              <div style={{ fontSize: 11, color: "hsl(var(--muted-foreground))" }}>
                Click <span style={{ color: "#F97316" }}>↻ Refresh signals</span> on Home to generate fresh signal-quality results with full article snapshots.
              </div>
            </div>
          );
        }
        const { truncated } = previewMarkdown(activeMd!, 400);
        const tabBtn = (mode: "clean" | "raw", label: string) => {
          const active = snapshotMode === mode;
          return (
            <button
              onClick={() => setSnapshotMode(mode)}
              style={{
                fontSize: 10,
                color: active ? "#F97316" : "hsl(var(--muted-foreground))",
                background: active ? "#F9731612" : "transparent",
                border: `0.5px solid ${active ? "#F9731644" : "hsl(var(--border))"}`,
                padding: "3px 10px", borderRadius: 3, cursor: "pointer", letterSpacing: "0.04em",
                fontWeight: active ? 600 : 400,
              }}
            >
              {label}
            </button>
          );
        };
        return (
          <div style={{ marginBottom: 20, marginTop: 4 }}>
            <div style={thinRule} />
            <div className="flex items-center justify-between flex-wrap" style={{ marginBottom: 12, gap: 8 }}>
              <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "hsl(var(--muted-foreground) / 0.7)" }}>
                Article snapshot · {snapshotMode === "clean" ? "cleaned" : "raw"}
              </div>
              <div className="flex items-center" style={{ gap: 6 }}>
                {hasBoth && (
                  <>
                    {tabBtn("clean", "View clean")}
                    {tabBtn("raw", "View raw")}
                  </>
                )}
                <button
                  onClick={() => setShowFullSnapshot(s => !s)}
                  style={{ fontSize: 10, color: "#F97316", background: "transparent", border: "0.5px solid #F9731644", padding: "3px 10px", borderRadius: 3, cursor: "pointer", letterSpacing: "0.04em" }}
                >
                  {showFullSnapshot ? "Show less" : "Show more"}
                </button>
              </div>
            </div>
            <div
              className="prose prose-sm max-w-none dark:prose-invert"
              style={{
                fontSize: 13,
                lineHeight: 1.7,
                ...(showFullSnapshot ? {} : {
                  display: "-webkit-box",
                  WebkitLineClamp: 4,
                  WebkitBoxOrient: "vertical" as const,
                  overflow: "hidden",
                }),
              }}
            >
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {activeMd!}
              </ReactMarkdown>
            </div>
          </div>
        );
      })()}

      {/* Footer actions */}
      <div className="flex items-center flex-wrap" style={{ gap: 8, marginTop: 24 }}>
        <button
          onClick={() => navigate(`/dashboard?tab=publish&signal=${signal.id}`)}
          style={{
            fontSize: 13, padding: "8px 16px", borderRadius: 8,
            border: "0.5px solid #F9731566",
            background: "#F97316", color: "#fff",
            fontWeight: 500, cursor: "pointer",
          }}
        >
          Draft Post
        </button>
        {added ? (
          <span
            style={{
              fontSize: 13, padding: "8px 16px", borderRadius: 8,
              border: "0.5px solid hsl(var(--border))",
              background: "transparent", color: "hsl(var(--muted-foreground))",
            }}
          >
            Added ✓
          </span>
        ) : (
          <button
            onClick={handleAddToSignals}
            style={{
              fontSize: 13, padding: "8px 16px", borderRadius: 8,
              border: "0.5px solid hsl(var(--border))",
              background: "transparent", color: "hsl(var(--foreground))",
              cursor: "pointer",
            }}
          >
            Add to Signals
          </button>
        )}
        {externalUrl && externalAlive !== false && (
          <a
            href={externalUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontSize: 13, padding: "8px 16px", borderRadius: 8,
              border: "0.5px solid hsl(var(--border))",
              background: "transparent", color: "hsl(var(--foreground))",
              textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4,
            }}
          >
            View original ↗
          </a>
        )}
      </div>
    </div>
  );
}
