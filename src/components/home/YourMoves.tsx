import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Send, Plus, Eye, ChevronRight, ChevronDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCapturedSources } from "@/hooks/useCapturedSources";
import { InfoTooltip } from "@/components/ui/InfoTooltip";

export type ActionType = "PUBLISH" | "CAPTURE" | "WATCH";
export type Urgency = "HIGH" | "MEDIUM";

export interface AuraItem {
  action_type: ActionType;
  title: string;
  reason: string;
  urgency: Urgency;
  destination?: string;
  signal_id?: string | null;
  signal_title?: string | null;
}

interface YourMovesProps {
  userId: string | null;
  items?: AuraItem[] | null;
  hideIfEmpty?: boolean;
  defaultOpen?: boolean;
  onOpenCapture?: (prefillUrl?: string, prefillText?: string, sourceKey?: string) => void;
  onSwitchTab?: (tab: "home" | "identity" | "intelligence" | "authority" | "influence") => void;
  onNavigateToSignal?: (signalId: string) => void;
  onDraftToStudio?: (prefill: any) => void;
}

const TYPE_STYLE: Record<ActionType, { bg: string; color: string; Icon: typeof Send }> = {
  PUBLISH: { bg: "color-mix(in srgb, var(--error) calc(0.12 * 100%), transparent)",  color: "var(--error)", Icon: Send },
  // TOKEN-FORMAT-1: Standard semantic tokens are hex — use color-mix, not hsl(var()/n).
  CAPTURE: { bg: "color-mix(in srgb, var(--warning) 12%, transparent)", color: "var(--warning)", Icon: Plus },
  WATCH:   { bg: "color-mix(in srgb, var(--info) 12%, transparent)",    color: "var(--color-info-text, var(--info))", Icon: Eye },
};

const URGENCY_STYLE: Record<Urgency, { bg: string; color: string }> = {
  HIGH:   { bg: "color-mix(in srgb, var(--error) calc(0.12 * 100%), transparent)",  color: "var(--error)" },
  MEDIUM: { bg: "color-mix(in srgb, var(--warning) 12%, transparent)", color: "var(--warning)" },
};

const Row = ({ item, onClick, captured }: { item: AuraItem; onClick: () => void; captured?: boolean }) => {
  const t = TYPE_STYLE[item.action_type] || TYPE_STYLE.WATCH;
  const Icon = t.Icon;
  const isDisabled = !!captured;
  return (
    <div
      role="button"
      tabIndex={isDisabled ? -1 : 0}
      aria-disabled={isDisabled || undefined}
      onClick={isDisabled ? undefined : onClick}
      onKeyDown={(e) => { if (isDisabled) return; if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } }}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        background: "hsl(var(--muted) / 0.4)",
        borderRadius: 8,
        padding: "10px 12px",
        cursor: isDisabled ? "default" : "pointer",
        opacity: isDisabled ? 0.7 : 1,
      }}
    >
      <span style={{
        fontSize: 10, fontWeight: 600, letterSpacing: "0.06em",
        padding: "3px 8px", borderRadius: 4,
        background: t.bg, color: t.color, flexShrink: 0,
      }}>
        {isDisabled ? "CAPTURED ✓" : item.action_type}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 12, fontWeight: 500, color: "hsl(var(--foreground))",
          lineHeight: 1.4,
        }}>{item.title}</div>
      </div>
      <ChevronRight size={16} style={{ color: "hsl(var(--muted-foreground))", flexShrink: 0 }} />
    </div>
  );
};

const Skel = () => (
  <div style={{
    height: 70, borderRadius: 8,
    background: "hsl(var(--muted) / 0.3)",
    animation: "pulse 1.6s ease-in-out infinite",
  }} />
);

export default function YourMoves({ userId, items: itemsProp, hideIfEmpty, defaultOpen = true, onOpenCapture, onSwitchTab, onNavigateToSignal, onDraftToStudio }: YourMovesProps) {
  const { isCaptured } = useCapturedSources();
  const navigate = useNavigate();
  const [items, setItems] = useState<AuraItem[] | null>(null);
  const [loading, setLoading] = useState(itemsProp === undefined);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    if (itemsProp !== undefined) {
      setItems(itemsProp);
      setLoading(false);
      setFailed(!itemsProp || itemsProp.length === 0);
      return;
    }
    if (!userId) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      setLoading(true); setFailed(false);
      try {
        const { data, error } = await supabase.functions.invoke("auras-read", { body: { user_id: userId } });
        if (cancelled) return;
        if (error) throw error;
        const list = Array.isArray(data?.items) ? data.items : [];
        if (list.length === 0) setFailed(true);
        else setItems(list.slice(0, 3));
      } catch (e) {
        if (!cancelled) { console.error("[YourMoves] failed", e); setFailed(true); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [userId, itemsProp]);

  const handleClick = (item: AuraItem) => {
    if (item.action_type === "PUBLISH") {
      if (item.signal_id && onDraftToStudio) {
        onDraftToStudio({
          topic: item.title,
          context: item.reason,
          signalId: item.signal_id,
          signalTitle: item.signal_title ?? undefined,
        });
        return;
      }
      if (onSwitchTab) onSwitchTab("authority");
      else navigate("/?tab=authority", { state: { prefill_topic: item.title } });
      return;
    }
    if (item.action_type === "CAPTURE") {
      const sourceKey = (item.title || "").trim();
      onOpenCapture?.(undefined, `${item.title}\n\n${item.reason}`, sourceKey);
      return;
    }
    if (item.signal_id && onNavigateToSignal) {
      onNavigateToSignal(item.signal_id);
      return;
    }
    if (onSwitchTab) onSwitchTab("intelligence");
    else navigate("/?tab=intelligence");
  };

  const itemCount = loading ? 0 : (items?.length ?? 0);
  const isEmpty = !loading && (failed || !items || items.length === 0);
  if (hideIfEmpty && isEmpty) return null;

  return (
    <section style={{ borderTop: "0.5px solid hsl(var(--border) / 0.5)", paddingTop: 20 }}>
      <button
        type="button"
        onClick={() => setOpen((s) => !s)}
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          width: "100%", background: "transparent", border: 0, padding: 0,
          cursor: "pointer", marginBottom: 4,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{
            fontSize: 11, fontWeight: 500, letterSpacing: "0.04em",
            color: "hsl(var(--muted-foreground))", textTransform: "uppercase",
          }}>
            Your moves
          </span>
          <InfoTooltip slug="home-your-moves" label="Your moves" side="bottom" triggerSize={13} />
          <span style={{
            fontSize: 10, fontWeight: 600, letterSpacing: "0.03em",
            color: "hsl(var(--muted-foreground))",
            background: "hsl(var(--muted) / 0.5)",
            borderRadius: 4, padding: "1px 6px",
          }}>
            {itemCount}
          </span>
        </div>
        <ChevronDown
          size={14}
          style={{
            color: "hsl(var(--muted-foreground))",
            transform: open ? "rotate(0deg)" : "rotate(-90deg)",
            transition: "transform 200ms",
          }}
        />
      </button>
      {open && (
        <>
          <div style={{ fontSize: 12, color: "hsl(var(--muted-foreground))", marginBottom: 12, lineHeight: 1.5 }}>
            Actions Aura recommends based on your intelligence data. Each moves your score forward.
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {loading ? (
              <>
                <Skel /><Skel /><Skel />
              </>
            ) : failed || !items || items.length === 0 ? (
              <div style={{
                fontSize: 13, color: "hsl(var(--muted-foreground))",
                padding: "16px 4px",
              }}>
                Aura is analyzing your signals. Check back after your next capture.
              </div>
            ) : (
              items.map((it, i) => (
                <Row
                  key={i}
                  item={it}
                  onClick={() => handleClick(it)}
                  captured={it.action_type === "CAPTURE" && isCaptured((it.title || "").trim())}
                />
              ))
            )}
          </div>
        </>
      )}
    </section>
  );
}