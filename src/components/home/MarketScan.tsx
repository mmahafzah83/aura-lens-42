import { useEffect, useState } from "react";
import { Globe, FileText, TrendingUp, Lightbulb, Plus, ExternalLink, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface BriefingItem {
  title?: string;
  source?: string;
  url?: string | null;
  bluf?: string;
  type?: string;
}

interface MarketScanProps {
  onOpenCapture?: (prefillUrl?: string) => void;
  onSwitchTab?: (tab: "home" | "identity" | "intelligence" | "authority" | "influence") => void;
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

const Card = ({ item, onCapture, onDraft }: {
  item: BriefingItem;
  onCapture: () => void;
  onDraft: () => void;
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
              onClick={onCapture}
              style={{
                fontSize: 11, padding: "4px 10px", borderRadius: 6,
                background: "hsl(var(--muted) / 0.6)",
                color: "hsl(var(--foreground))", border: 0, cursor: "pointer",
                display: "inline-flex", alignItems: "center", gap: 4,
              }}
            >
              <Plus size={12} /> Capture
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

export default function MarketScan({ onOpenCapture, onSwitchTab }: MarketScanProps) {
  const [items, setItems] = useState<BriefingItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

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
    <section>
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "0 4px", marginBottom: 12, flexWrap: "wrap",
      }}>
        <Globe size={14} style={{ color: "hsl(var(--muted-foreground))" }} />
        <span style={{ fontSize: 13, color: "var(--color-text-secondary, hsl(var(--foreground)))" }}>
          Market scan
        </span>
        <span style={{ fontSize: 11, color: "hsl(var(--muted-foreground))" }}>
          Curated for your sector · verify before citing
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {loading ? (
          <><Skel /><Skel /><Skel /></>
        ) : (
          (items || []).slice(0, 3).map((it, i) => (
            <Card
              key={i}
              item={it}
              onCapture={() => onOpenCapture?.(it.url || undefined)}
              onDraft={() => onSwitchTab?.("authority")}
            />
          ))
        )}
      </div>
    </section>
  );
}