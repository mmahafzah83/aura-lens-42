import { useEffect, useState } from "react";
import { FileText, TrendingUp, Lightbulb, Plus, ExternalLink, ArrowRight, ChevronDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCapturedSources } from "@/hooks/useCapturedSources";

interface BriefingItem {
  title?: string;
  source?: string;
  url?: string | null;
  bluf?: string;
  type?: string;
}

interface MarketScanProps {
  onOpenCapture?: (prefillUrl?: string, prefillText?: string, sourceKey?: string) => void;
  onSwitchTab?: (tab: "home" | "identity" | "intelligence" | "authority" | "influence") => void;
  onDraftPost?: (prefill: { topic: string; context: string }) => void;
  defaultExpanded?: boolean;
}

const todayKey = () => new Date().toISOString().slice(0, 10);

const TYPE_META: Record<string, { Icon: typeof FileText; label: string }> = {
  deep_dive:    { Icon: FileText,    label: "DEEP DIVE" },
  market_trend: { Icon: TrendingUp,  label: "MARKET TREND" },
  influence:    { Icon: Lightbulb,   label: "POST IDEA" },
};

function parseBLUF(bluf: string): { signal: string; action: string; value: string } | null {
  if (!bluf || !bluf.includes("|")) return null;
  const parts = bluf.split("|").map((p) => p.trim());
  const extract = (prefix: string) => {
    const part = parts.find((p) => p.startsWith(prefix));
    return part ? part.replace(prefix, "").trim() : "";
  };
  const out = {
    signal: extract("[SIGNAL]:"),
    action: extract("[ACTION]:"),
    value: extract("[VALUE]:"),
  };
  if (!out.signal && !out.action && !out.value) return null;
  return out;
}

const Card = ({ item, onCapture, onDraft, captured }: {
  item: BriefingItem;
  onCapture: () => void;
  onDraft: () => void;
  captured?: boolean;
}) => {
  const meta = TYPE_META[item.type || ""] || TYPE_META.deep_dive;
  const Icon = meta.Icon;
  const parsed = item.bluf ? parseBLUF(item.bluf) : null;
  const hasUrl = !!(item.url && item.url.trim().length > 0);
  const isInfluence = item.type === "influence";

  return (
    <div style={{
      background: "hsl(var(--card))",
      border: "0.5px solid hsl(var(--border) / 0.6)",
      borderRadius: 8,
      padding: "16px 18px",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <Icon size={14} style={{ color: "hsl(var(--muted-foreground))" }} />
        <span style={{
          fontSize: 11, color: "hsl(var(--muted-foreground))",
          letterSpacing: "0.06em", fontWeight: 500,
        }}>{meta.label}</span>
        {item.source && (
          <span style={{
            fontSize: 11, color: "hsl(var(--muted-foreground))",
            marginLeft: "auto", textTransform: "uppercase", letterSpacing: "0.04em",
          }}>{item.source}</span>
        )}
      </div>
      {item.title && (
        <div style={{
          fontSize: 14, fontWeight: 500, color: "hsl(var(--foreground))",
          lineHeight: 1.35, marginBottom: 10,
        }}>{item.title}</div>
      )}
      {parsed ? (
        <div style={{
          display: "grid",
          gridTemplateColumns: "auto 1fr",
          gap: "4px 10px",
          fontSize: 12, lineHeight: 1.5,
        }}>
          {parsed.signal && (<>
            <div style={{ fontWeight: 500, color: "var(--warning)" }}>SIGNAL</div>
            <div style={{ color: "hsl(var(--muted-foreground))" }}>{parsed.signal}</div>
          </>)}
          {parsed.action && (<>
            <div style={{ fontWeight: 500, color: "var(--color-info-text, var(--info))" }}>ACTION</div>
            <div style={{ color: "hsl(var(--muted-foreground))" }}>{parsed.action}</div>
          </>)}
          {parsed.value && (<>
            <div style={{ fontWeight: 500, color: "var(--success)" }}>VALUE</div>
            <div style={{ color: "hsl(var(--muted-foreground))" }}>{parsed.value}</div>
          </>)}
        </div>
      ) : item.bluf ? (
        <div style={{ fontSize: 12, color: "hsl(var(--muted-foreground))", lineHeight: 1.5 }}>
          {item.bluf}
        </div>
      ) : null}

      <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
        {isInfluence ? (
          <button
            type="button"
            onClick={onDraft}
            style={{
              fontSize: 11, padding: "4px 10px", borderRadius: 6,
              background: "hsl(var(--muted) / 0.6)",
              color: "hsl(var(--foreground))", border: 0, cursor: "pointer",
              display: "inline-flex", alignItems: "center", gap: 4,
            }}
          >
            Draft post <ArrowRight size={12} />
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={captured ? undefined : onCapture}
              disabled={!!captured}
              style={{
                fontSize: 11, padding: "4px 10px", borderRadius: 6,
                background: captured ? "hsl(var(--muted) / 0.35)" : "hsl(var(--muted) / 0.6)",
                color: captured ? "hsl(var(--muted-foreground))" : "hsl(var(--foreground))",
                border: 0, cursor: captured ? "default" : "pointer",
                opacity: captured ? 0.85 : 1,
                display: "inline-flex", alignItems: "center", gap: 4,
              }}
            >
              {captured ? <>✓ Captured</> : <><Plus size={12} /> Capture</>}
            </button>
            {hasUrl && (
              <a
                href={item.url!}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  fontSize: 11, padding: "4px 10px", borderRadius: 6,
                  background: "transparent",
                  color: "hsl(var(--muted-foreground))",
                  textDecoration: "none", cursor: "pointer",
                  display: "inline-flex", alignItems: "center", gap: 4,
                }}
              >
                Read <ExternalLink size={12} />
              </a>
            )}
          </>
        )}
      </div>
    </div>
  );
};

const Skel = () => (
  <div style={{
    height: 110, borderRadius: 8,
    background: "hsl(var(--muted) / 0.25)",
    animation: "pulse 1.6s ease-in-out infinite",
  }} />
);

export default function MarketScan({ onOpenCapture, onSwitchTab, onDraftPost, defaultExpanded = true }: MarketScanProps) {
  const { isCaptured } = useCapturedSources();
  const [items, setItems] = useState<BriefingItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [expanded, setExpanded] = useState(defaultExpanded);

  useEffect(() => {
    const date = todayKey();
    const cacheKey = `briefing_${date}`;
    let cancelled = false;
    (async () => {
      try {
        const cached = sessionStorage.getItem(cacheKey);
        if (cached) {
          const parsed = JSON.parse(cached);
          const list = (parsed?.items || []).filter(Boolean);
          if (list.length === 0) setFailed(true);
          else setItems(list);
          setLoading(false);
          return;
        }
        const { data, error } = await supabase.functions.invoke("daily-briefing", { body: {} });
        if (cancelled) return;
        if (error) throw error;
        const list = ((data as any)?.items || []).filter(Boolean);
        if (list.length === 0) setFailed(true);
        else {
          sessionStorage.setItem(cacheKey, JSON.stringify(data));
          setItems(list);
        }
      } catch (e) {
        if (!cancelled) { console.warn("[MarketScan] failed", e); setFailed(true); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Hide entirely on failure or empty
  if (!loading && (failed || !items || items.length === 0)) return null;

  return (
    <section style={{ borderTop: "0.5px solid hsl(var(--border) / 0.5)", paddingTop: 20 }}>
      <button
        type="button"
        onClick={() => setExpanded(s => !s)}
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          width: "100%", background: "transparent", border: 0, padding: 0,
          cursor: "pointer", marginBottom: 6,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{
            fontSize: 11, fontWeight: 500, letterSpacing: "0.04em",
            color: "hsl(var(--muted-foreground))", textTransform: "uppercase",
          }}>
            Market scan
          </span>
          <span style={{
            fontSize: 10, fontWeight: 600, letterSpacing: "0.03em",
            color: "hsl(var(--muted-foreground))",
            background: "hsl(var(--muted) / 0.5)",
            borderRadius: 4, padding: "1px 6px",
          }}>
            {loading ? 0 : (items?.length ?? 0)}
          </span>
        </div>
        <ChevronDown
          size={14}
          style={{
            color: "hsl(var(--muted-foreground))",
            transform: expanded ? "rotate(0deg)" : "rotate(-90deg)",
            transition: "transform 200ms",
          }}
        />
      </button>
      <div style={{ fontSize: 12, color: "hsl(var(--muted-foreground))", marginBottom: 12, lineHeight: 1.5 }}>
        AI-curated articles aligned to your sector. Verify before citing.
      </div>
      {expanded && (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {loading ? (
          <><Skel /><Skel /><Skel /></>
        ) : (
          (items || []).slice(0, 3).map((it, i) => (
            <Card
              key={i}
              item={it}
              onCapture={() => {
                if (it.url) {
                  onOpenCapture?.(it.url);
                } else {
                  const cleanBluf = (it.bluf || "")
                    .replace(/\[SIGNAL\]:\s*/gi, "")
                    .replace(/\s*\|\s*\[ACTION\]:\s*/gi, "\n\n")
                    .replace(/\s*\|\s*\[VALUE\]:\s*/gi, "\n\n");
                  onOpenCapture?.(undefined, `${it.title || ""}\n\n${cleanBluf}`.trim());
                }
              }}
              onDraft={() => {
                if (onDraftPost) {
                  const context = it.bluf
                    ? it.bluf
                        .replace(/\[SIGNAL\]:\s*/i, "Signal: ")
                        .replace(/\s*\|\s*\[ACTION\]:\s*/i, "\n\nAction: ")
                        .replace(/\s*\|\s*\[VALUE\]:\s*/i, "\n\nValue: ")
                    : "";
                  onDraftPost({ topic: it.title || "", context });
                } else {
                  onSwitchTab?.("authority");
                }
              }}
            />
          ))
        )}
      </div>
      )}
    </section>
  );
}