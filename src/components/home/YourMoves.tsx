import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Send, Plus, Eye, ChevronRight, ChevronDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export type ActionType = "PUBLISH" | "CAPTURE" | "WATCH";
export type Urgency = "HIGH" | "MEDIUM";

export interface AuraItem {
  action_type: ActionType;
  title: string;
  reason: string;
  urgency: Urgency;
  destination?: string;
}

interface YourMovesProps {
  userId: string | null;
  items?: AuraItem[] | null;
  hideIfEmpty?: boolean;
  defaultOpen?: boolean;
  onOpenCapture?: () => void;
  onSwitchTab?: (tab: "home" | "identity" | "intelligence" | "authority" | "influence") => void;
}

const TYPE_STYLE: Record<ActionType, { bg: string; color: string; Icon: typeof Send }> = {
  PUBLISH: { bg: "hsl(var(--danger) / 0.12)",  color: "var(--danger)", Icon: Send },
  CAPTURE: { bg: "hsl(var(--warning) / 0.12)", color: "var(--warning)", Icon: Plus },
  WATCH:   { bg: "hsl(var(--info) / 0.12)",    color: "var(--color-info-text, var(--info))", Icon: Eye },
};

const URGENCY_STYLE: Record<Urgency, { bg: string; color: string }> = {
  HIGH:   { bg: "hsl(var(--danger) / 0.12)",  color: "var(--danger)" },
  MEDIUM: { bg: "hsl(var(--warning) / 0.12)", color: "var(--warning)" },
};

const Row = ({ item, onClick }: { item: AuraItem; onClick: () => void }) => {
  const t = TYPE_STYLE[item.action_type] || TYPE_STYLE.WATCH;
  const Icon = t.Icon;
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } }}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        background: "hsl(var(--muted) / 0.4)",
        borderRadius: 8,
        padding: "10px 12px",
        cursor: "pointer",
      }}
    >
      <span style={{
        fontSize: 10, fontWeight: 600, letterSpacing: "0.06em",
        padding: "3px 8px", borderRadius: 4,
        background: t.bg, color: t.color, flexShrink: 0,
      }}>
        {item.action_type}
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

export default function YourMoves({ userId, items: itemsProp, hideIfEmpty, onOpenCapture, onSwitchTab }: YourMovesProps) {
  const navigate = useNavigate();
  const [items, setItems] = useState<AuraItem[] | null>(null);
  const [loading, setLoading] = useState(itemsProp === undefined);
  const [failed, setFailed] = useState(false);

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
      if (onSwitchTab) onSwitchTab("authority");
      else navigate("/?tab=authority", { state: { prefill_topic: item.title } });
      return;
    }
    if (item.action_type === "CAPTURE") { onOpenCapture?.(); return; }
    if (onSwitchTab) onSwitchTab("intelligence");
    else navigate("/?tab=intelligence");
  };

  if (hideIfEmpty && !loading && (failed || !items || items.length === 0)) return null;

  return (
    <section style={{ borderTop: "0.5px solid hsl(var(--border) / 0.5)", paddingTop: 20 }}>
      <div style={{
        display: "flex", alignItems: "baseline", justifyContent: "space-between",
        marginBottom: 4,
      }}>
        <span style={{
          fontSize: 11, fontWeight: 500, letterSpacing: "0.04em",
          color: "hsl(var(--muted-foreground))", textTransform: "uppercase",
        }}>
          Your moves
        </span>
        <span style={{ fontSize: 11, color: "hsl(var(--muted-foreground))" }}>
          Based on your signals
        </span>
      </div>
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
          items.map((it, i) => <Row key={i} item={it} onClick={() => handleClick(it)} />)
        )}
      </div>
    </section>
  );
}