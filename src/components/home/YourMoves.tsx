import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Send, Plus, Eye, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type ActionType = "PUBLISH" | "CAPTURE" | "WATCH";
type Urgency = "HIGH" | "MEDIUM";

interface AuraItem {
  action_type: ActionType;
  title: string;
  reason: string;
  urgency: Urgency;
  destination?: string;
}

interface YourMovesProps {
  userId: string | null;
  onOpenCapture?: () => void;
  onSwitchTab?: (tab: "home" | "identity" | "intelligence" | "authority" | "influence") => void;
}

const TYPE_STYLE: Record<ActionType, { bg: string; color: string; Icon: typeof Send }> = {
  PUBLISH: { bg: "var(--danger-pale)", color: "var(--danger)", Icon: Send },
  CAPTURE: { bg: "var(--warning-pale)", color: "var(--warning)", Icon: Plus },
  WATCH:   { bg: "var(--info-pale)",    color: "var(--color-info-text, var(--info))", Icon: Eye },
};

const URGENCY_STYLE: Record<Urgency, { bg: string; color: string }> = {
  HIGH:   { bg: "var(--danger-pale)",  color: "var(--danger)" },
  MEDIUM: { bg: "var(--warning-pale)", color: "var(--warning)" },
};

const Row = ({ item, onClick }: { item: AuraItem; onClick: () => void }) => {
  const t = TYPE_STYLE[item.action_type] || TYPE_STYLE.WATCH;
  const u = URGENCY_STYLE[item.urgency] || URGENCY_STYLE.MEDIUM;
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
        gap: 14,
        background: "hsl(var(--card))",
        border: "0.5px solid hsl(var(--border) / 0.6)",
        borderRadius: 8,
        padding: "14px 18px",
        cursor: "pointer",
      }}
    >
      <div
        style={{
          width: 28, height: 28, borderRadius: "50%",
          background: t.bg, color: t.color,
          display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <Icon size={14} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
          <span style={{
            fontSize: 11, fontWeight: 500, letterSpacing: "0.06em",
            color: t.color,
          }}>{item.action_type}</span>
          <span style={{
            fontSize: 11, padding: "1px 7px", borderRadius: 8,
            background: u.bg, color: u.color, fontWeight: 500,
            letterSpacing: "0.04em",
          }}>{item.urgency}</span>
        </div>
        <div style={{
          fontSize: 14, fontWeight: 500, color: "hsl(var(--foreground))",
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          lineHeight: 1.35,
        }}>{item.title}</div>
        <div style={{
          fontSize: 12, color: "hsl(var(--muted-foreground))",
          marginTop: 2, lineHeight: 1.45,
        }}>{item.reason}</div>
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

export default function YourMoves({ userId, onOpenCapture, onSwitchTab }: YourMovesProps) {
  const navigate = useNavigate();
  const [items, setItems] = useState<AuraItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
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
  }, [userId]);

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

  return (
    <section
      style={{
        background: "hsl(var(--muted) / 0.35)",
        borderRadius: 12,
        padding: 20,
      }}
    >
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 14, fontWeight: 500, color: "hsl(var(--foreground))" }}>
          Your moves
        </div>
        <div style={{ fontSize: 12, color: "hsl(var(--muted-foreground))", marginTop: 2 }}>
          Based on your signals and data
        </div>
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