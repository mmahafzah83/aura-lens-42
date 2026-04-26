import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Sparkles, Bell, Clock, AlertTriangle, TrendingUp, FileText, BookOpen, ArrowUpRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";

type EventType = "timing_window" | "silence_alarm" | "signal_shift" | "weekly_brief" | "knowledge_debt";

interface NotificationEvent {
  id: string;
  type: EventType;
  title: string;
  body: string | null;
  sent_at: string;
}

// Higher number = more urgent
const PRIORITY: Record<EventType, number> = {
  timing_window: 5,
  silence_alarm: 4,
  signal_shift: 3,
  weekly_brief: 2,
  knowledge_debt: 1,
};

const TYPE_ICON: Record<EventType, typeof Bell> = {
  timing_window: Clock,
  silence_alarm: AlertTriangle,
  signal_shift: TrendingUp,
  weekly_brief: FileText,
  knowledge_debt: BookOpen,
};

type Visual = {
  borderColor: string | null;
  badgeBg: string | null;
  badgeText: string;
  textColor: string;
  pulse: boolean;
};

function getVisual(count: number, mostUrgent: EventType | null): Visual {
  if (count === 0 || !mostUrgent) {
    return { borderColor: null, badgeBg: null, badgeText: "", textColor: "#fff", pulse: false };
  }
  // STATE 6 — Active: count >= 3 with mixed types takes precedence over single-type styling
  // We treat "mixed types" as count >= 3 (handled by caller passing count and most urgent).
  // But the spec keeps state-specific styling tied to most-urgent type below.
  switch (mostUrgent) {
    case "signal_shift":
      return { borderColor: "#7F77DD", badgeBg: "#7F77DD", badgeText: String(count), textColor: "#fff", pulse: false };
    case "timing_window":
      return { borderColor: "#F97316", badgeBg: "#F97316", badgeText: "!", textColor: "#fff", pulse: true };
    case "silence_alarm":
      return { borderColor: "#E24B4A", badgeBg: "#E24B4A", badgeText: "!", textColor: "#fff", pulse: false };
    case "weekly_brief":
      return { borderColor: "#1D9E75", badgeBg: "#1D9E75", badgeText: "B", textColor: "#fff", pulse: false };
    case "knowledge_debt":
      return { borderColor: "#534AB7", badgeBg: "#534AB7", badgeText: String(count), textColor: "#fff", pulse: false };
  }
}

interface Props {
  collapsed?: boolean;
  onOpen: () => void;
  className?: string;
  showLabel?: boolean;
}

const POLL_MS = 5 * 60 * 1000;

export default function AskAuraPresence({ collapsed = false, onOpen, className, showLabel = true }: Props) {
  const [events, setEvents] = useState<NotificationEvent[]>([]);
  const [count, setCount] = useState(0);
  const [showTip, setShowTip] = useState(false);
  const tipTimer = useRef<number | null>(null);

  const fetchEvents = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data, error } = await (supabase.from("notification_events" as any) as any)
      .select("id, type, title, body, sent_at")
      .eq("user_id", user.id)
      .eq("read", false)
      .order("sent_at", { ascending: false })
      .limit(20);
    if (error) {
      console.error("presence fetch:", error.message);
      return;
    }
    const list = (data || []) as NotificationEvent[];
    setEvents(list);
    setCount(list.length);
  }, []);

  useEffect(() => {
    fetchEvents();
    const id = window.setInterval(fetchEvents, POLL_MS);
    return () => window.clearInterval(id);
  }, [fetchEvents]);

  // Determine most urgent + count-based override
  const { mostUrgent, distinctTypes } = useMemo(() => {
    let top: EventType | null = null;
    let topScore = -1;
    const types = new Set<EventType>();
    for (const e of events) {
      types.add(e.type);
      const s = PRIORITY[e.type] ?? 0;
      if (s > topScore) { topScore = s; top = e.type; }
    }
    return { mostUrgent: top, distinctTypes: types.size };
  }, [events]);

  // STATE 6 — Active override: count >= 3 AND mixed types -> dark purple/count
  const visual: Visual = useMemo(() => {
    if (count >= 3 && distinctTypes >= 2) {
      return { borderColor: "#534AB7", badgeBg: "#534AB7", badgeText: String(count), textColor: "#fff", pulse: false };
    }
    return getVisual(count, mostUrgent);
  }, [count, mostUrgent, distinctTypes]);

  const markShownRead = useCallback(async (ids: string[]) => {
    if (ids.length === 0) return;
    const { error } = await (supabase.from("notification_events" as any) as any)
      .update({ read: true, read_at: new Date().toISOString() })
      .in("id", ids);
    if (error) console.error("mark read:", error.message);
    setEvents([]);
    setCount(0);
  }, []);

  const top3 = events.slice(0, 3);

  const handleClick = async () => {
    const ids = events.map((e) => e.id);
    onOpen();
    setShowTip(false);
    await markShownRead(ids);
  };

  const handleTipItemClick = async () => {
    const ids = top3.map((e) => e.id);
    onOpen();
    setShowTip(false);
    await markShownRead(ids);
  };

  const onEnter = () => {
    if (tipTimer.current) window.clearTimeout(tipTimer.current);
    if (count > 0) setShowTip(true);
  };
  const onLeave = () => {
    if (tipTimer.current) window.clearTimeout(tipTimer.current);
    tipTimer.current = window.setTimeout(() => setShowTip(false), 120);
  };

  return (
    <div className="relative" onMouseEnter={onEnter} onMouseLeave={onLeave}>
      <button
        onClick={handleClick}
        className={
          className ??
          "w-full flex items-center gap-3 px-3 py-3 rounded-xl bg-primary/8 text-primary hover:bg-primary/15 border border-primary/15 hover:border-primary/25 transition-all tactile-press group"
        }
        style={
          visual.borderColor
            ? { borderLeft: `2px solid ${visual.borderColor}` }
            : undefined
        }
      >
        <Sparkles className="w-4.5 h-4.5 shrink-0 group-hover:scale-110 transition-transform" />
        {showLabel && !collapsed && <span className="text-sm font-medium">Ask Aura</span>}

        {visual.badgeBg && (
          <span
            aria-label={`${count} unread`}
            className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center shadow-md"
            style={{
              background: visual.badgeBg,
              color: visual.textColor,
              animation: visual.pulse ? "askaura-pulse 1s ease-in-out infinite" : undefined,
            }}
          >
            {visual.badgeText}
          </span>
        )}
      </button>

      {/* Tooltip popup */}
      {showTip && top3.length > 0 && (
        <div
          className="absolute z-50 bottom-[calc(100%+8px)] left-0 w-[280px] rounded-xl border border-border/30 bg-popover shadow-2xl p-2 animate-fade-in"
          onMouseEnter={onEnter}
          onMouseLeave={onLeave}
        >
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70 px-2 py-1">
            Pending alerts
          </div>
          {top3.map((e) => {
            const Icon = TYPE_ICON[e.type] || Bell;
            return (
              <button
                key={e.id}
                onClick={handleTipItemClick}
                className="w-full flex items-start gap-2 px-2 py-2 rounded-lg hover:bg-secondary/40 transition-colors text-left group/item"
              >
                <Icon className="w-3.5 h-3.5 mt-0.5 shrink-0 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-foreground truncate">{e.title}</span>
                    <span className="text-[9px] text-muted-foreground/60 shrink-0">
                      {formatDistanceToNow(new Date(e.sent_at), { addSuffix: false })}
                    </span>
                  </div>
                  {e.body && (
                    <p className="text-[11px] text-muted-foreground leading-snug truncate">{e.body}</p>
                  )}
                </div>
                <ArrowUpRight className="w-3 h-3 mt-0.5 shrink-0 text-[#F97316] opacity-0 group-hover/item:opacity-100 transition-opacity" />
              </button>
            );
          })}
          <button
            onClick={handleTipItemClick}
            className="w-full text-[11px] text-primary hover:text-primary/80 px-2 py-1.5 text-right transition-colors"
          >
            See all →
          </button>
        </div>
      )}

      <style>{`
        @keyframes askaura-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }
      `}</style>
    </div>
  );
}