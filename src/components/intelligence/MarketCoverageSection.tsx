import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronUp, RefreshCw, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { SectionHeader } from "@/components/ui/SectionHeader";
import AuraCard from "@/components/ui/AuraCard";
import { Button } from "@/components/ui/button";
import { formatSmartDate } from "@/lib/formatDate";
import { toast } from "sonner";

const ORANGE = "#B08D3A"; // bronze — coverage accent, not a signal indicator
const REFRESH_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const STORAGE_KEY = "market_coverage_cache_v1";

type Category = "covered" | "weak" | "gap" | "opportunity";

interface CoverageItem {
  trend_headline: string;
  category: Category;
  matching_signal?: string | null;
  signal_confidence?: number | null;
  recommendation: string;
  source?: string | null;
  final_score?: number | null;
}

interface CoverageResult {
  coverage_score: number;
  items: CoverageItem[];
  narrative: string;
}

interface CachedCoverage extends CoverageResult {
  generated_at: string;
}

interface Props {
  onOpenCapture?: () => void;
}

export default function MarketCoverageSection({ onOpenCapture }: Props) {
  const [open, setOpen] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<CachedCoverage | null>(null);

  // Load cached coverage from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setData(JSON.parse(raw));
    } catch {
      // ignore
    }
  }, []);

  const callEdge = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        throw new Error("Not authenticated");
      }
      const { data: result, error: fnError } = await supabase.functions.invoke(
        "detect-market-gaps",
        { body: {} },
      );
      if (fnError) throw fnError;
      if (!result || result.error) throw new Error(result?.error || "No result");

      const cached: CachedCoverage = { ...(result as CoverageResult), generated_at: new Date().toISOString() };
      setData(cached);
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(cached)); } catch { /* ignore */ }
    } catch (e: any) {
      console.error("market coverage error:", e);
      setError(e?.message || "Coverage analysis unavailable");
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-load on first mount if no cache
  useEffect(() => {
    if (!data && !loading && !error) {
      void callEdge();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const lastRefreshedMs = data?.generated_at ? new Date(data.generated_at).getTime() : 0;
  const canRefresh = !loading && (Date.now() - lastRefreshedMs) >= REFRESH_COOLDOWN_MS;

  const handleRefresh = () => {
    if (!canRefresh) {
      toast.info("Coverage refreshes once every 24 hours.");
      return;
    }
    void callEdge();
  };

  const coveragePct = data ? Math.round((data.coverage_score || 0) * 100) : 0;

  return (
    <div style={{ marginTop: 24, borderTop: "0.5px solid var(--surface-ink-subtle)", paddingTop: 20 }}>
      {/* Header row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14, gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }} onClick={() => setOpen(o => !o)}>
          <SectionHeader
            label="MARKET COVERAGE"
            subtitle="Where the market conversation is happening"
          />
          {data && (
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: 0.5,
                background: "var(--brand-ghost, rgba(176,141,58,0.12))",
                color: "var(--brand)",
                padding: "3px 8px",
                borderRadius: 999,
                border: "0.5px solid var(--brand-line, rgba(176,141,58,0.3))",
                whiteSpace: "nowrap",
              }}
            >
              {coveragePct}% covered
            </span>
          )}
          {open ? <ChevronUp size={14} color="var(--ink-3)" /> : <ChevronDown size={14} color="var(--ink-3)" />}
        </div>

        {open && data && (
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 10, color: "var(--ink-3)" }}>
              Last refreshed: {formatSmartDate(data.generated_at)}
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={!canRefresh}
              onClick={handleRefresh}
              style={{ fontSize: 11, height: 28 }}
            >
              <RefreshCw size={12} className={loading ? "animate-spin" : ""} style={{ marginRight: 6 }} />
              Refresh coverage
            </Button>
          </div>
        )}
      </div>

      {!open ? null : loading && !data ? (
        <SkeletonState />
      ) : error && !data ? (
        <ErrorState message={error} onRetry={callEdge} />
      ) : !data ? (
        <EmptyState />
      ) : data.items.length === 0 ? (
        <EmptyState />
      ) : (
        <CoverageBody data={data} onOpenCapture={onOpenCapture} />
      )}
    </div>
  );
}

function CoverageBody({ data, onOpenCapture }: { data: CoverageResult; onOpenCapture?: () => void }) {
  const items = data.items;

  // Coverage bar segments
  const totalScore = items.reduce((sum, it) => sum + Math.max(it.final_score ?? 1, 0.5), 0);

  const gapItems = items.filter(it => it.category === "gap" || it.category === "opportunity");

  return (
    <div>
      {/* Narrative */}
      <p
        style={{
          fontFamily: "'DM Sans', sans-serif",
          fontSize: 14,
          fontStyle: "italic",
          color: "var(--ink-muted, var(--ink-4))",
          margin: "0 0 16px",
          lineHeight: 1.6,
        }}
      >
        {data.narrative}
      </p>

      {/* Segmented coverage bar */}
      <TooltipProvider delayDuration={150}>
        <div
          style={{
            display: "flex",
            width: "100%",
            height: 10,
            borderRadius: 6,
            overflow: "hidden",
            background: "var(--surface-ink-subtle)",
            marginBottom: 18,
            gap: 1,
          }}
        >
          {items.map((it, idx) => {
            const w = (Math.max(it.final_score ?? 1, 0.5) / totalScore) * 100;
            const isCovered = it.category === "covered" || it.category === "weak";
            const bg = it.category === "covered"
              ? "var(--brand)"
              : it.category === "weak"
              ? "var(--brand-line, rgba(176,141,58,0.55))"
              : it.category === "opportunity"
              ? ORANGE
              : "var(--ink-3)";
            return (
              <Tooltip key={idx}>
                <TooltipTrigger asChild>
                  <div
                    style={{
                      width: `${w}%`,
                      height: "100%",
                      background: bg,
                      opacity: isCovered ? 1 : 0.85,
                      cursor: "pointer",
                    }}
                  />
                </TooltipTrigger>
                <TooltipContent side="top">
                  <div style={{ fontSize: 11, maxWidth: 260 }}>
                    <div style={{ fontWeight: 600 }}>{it.trend_headline}</div>
                    <div style={{ opacity: 0.7, marginTop: 2, textTransform: "uppercase", letterSpacing: 0.5, fontSize: 9 }}>
                      {it.category}
                    </div>
                  </div>
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      </TooltipProvider>

      {/* Gap & Opportunity cards */}
      {gapItems.length === 0 ? (
        <p style={{ fontSize: 12, color: "var(--ink-3)", margin: 0 }}>
          You're tracking the full conversation. No gaps detected.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {gapItems.map((it, idx) => (
            <GapCard key={idx} item={it} onOpenCapture={onOpenCapture} />
          ))}
        </div>
      )}
    </div>
  );
}

function GapCard({ item, onOpenCapture }: { item: CoverageItem; onOpenCapture?: () => void }) {
  const isOpp = item.category === "opportunity";
  return (
    <div style={{ position: "relative" }}>
      <AuraCard hover="lift">
        {isOpp && (
          <span
            aria-hidden
            style={{
              position: "absolute",
              left: 0, top: 12, bottom: 12, width: 3,
              background: ORANGE, borderRadius: 2,
            }}
          />
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {isOpp && (
            <span
              style={{
                alignSelf: "flex-start",
                fontSize: 9, fontWeight: 700, letterSpacing: 0.6,
                background: `${ORANGE}1A`, color: ORANGE,
                padding: "2px 7px", borderRadius: 4,
              }}
            >
              OPPORTUNITY
            </span>
          )}
          <h4 style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 15, fontWeight: 700, color: "var(--ink-7)", margin: 0, lineHeight: 1.3 }}>
            {item.trend_headline}
          </h4>
          {item.source && (
            <p style={{ fontSize: 12, color: "var(--ink-3)", margin: 0 }}>
              Source: {item.source}
            </p>
          )}
          <p style={{ fontSize: 13, color: "var(--ink-5)", margin: "2px 0 0", lineHeight: 1.5 }}>
            {item.recommendation}
          </p>
          <button
            onClick={() => onOpenCapture?.()}
            style={{
              alignSelf: "flex-start",
              marginTop: 4,
              background: "transparent",
              border: "none",
              color: "var(--brand)",
              fontSize: 12, fontWeight: 600,
              cursor: "pointer",
              padding: 0,
            }}
          >
            Capture on this topic →
          </button>
        </div>
      </AuraCard>
    </div>
  );
}

function SkeletonState() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ height: 10, borderRadius: 6, background: "var(--surface-ink-subtle)", marginBottom: 8 }} />
      {[0, 1, 2].map(i => (
        <div
          key={i}
          style={{
            height: 88, borderRadius: 12,
            background: "var(--surface-ink-subtle)",
            opacity: 0.5,
            animation: "pulse 1.6s ease-in-out infinite",
          }}
        />
      ))}
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <AuraCard hover="none">
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <AlertCircle size={16} color="var(--ink-3)" />
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-6)", margin: 0 }}>
            Coverage analysis unavailable
          </p>
          <p style={{ fontSize: 11, color: "var(--ink-3)", margin: "2px 0 0" }}>{message}</p>
        </div>
        <Button size="sm" variant="outline" onClick={onRetry} style={{ fontSize: 11, height: 28 }}>
          Retry
        </Button>
      </div>
    </AuraCard>
  );
}

function EmptyState() {
  return (
    <p style={{ fontSize: 13, color: "var(--ink-3)", margin: 0, fontStyle: "italic" }}>
      Market intelligence is being gathered. Coverage analysis will appear once industry trends are loaded.
    </p>
  );
}