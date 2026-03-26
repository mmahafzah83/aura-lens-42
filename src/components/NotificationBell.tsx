import { useEffect, useState } from "react";
import { Bell, Zap, Brain, Eye, TrendingUp, AlertTriangle, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatDistanceToNow } from "date-fns";

interface Notification {
  id: string;
  title: string;
  body: string;
  type: string;
  read: boolean;
  created_at: string;
  metadata: any;
}

const TYPE_ICONS: Record<string, typeof Bell> = {
  opportunity: Zap,
  insight_ready: Brain,
  pattern: Eye,
  momentum: TrendingUp,
  drift: AlertTriangle,
  nudge: ArrowRight,
  strategic: Zap,
};

const TYPE_COLORS: Record<string, string> = {
  opportunity: "text-amber-400",
  insight_ready: "text-blue-400",
  pattern: "text-emerald-400",
  momentum: "text-orange-400",
  drift: "text-red-400",
  nudge: "text-primary",
  strategic: "text-primary",
};

const NotificationBell = () => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const fetchNotifications = async () => {
    const { data } = await (supabase.from("notifications" as any) as any)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20);
    if (data) setNotifications(data);
  };

  useEffect(() => {
    fetchNotifications();

    const channel = supabase
      .channel("notifications-realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications" }, () => {
        fetchNotifications();
        if ("Notification" in window && Notification.permission === "granted") {
          // Browser notification handled by service worker
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const handleOpen = (isOpen: boolean) => {
    setOpen(isOpen);
    if (isOpen && "Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
    if (isOpen && unreadCount > 0) {
      markAllRead();
    }
  };

  const markAllRead = async () => {
    const unreadIds = notifications.filter((n) => !n.read).map((n) => n.id);
    if (unreadIds.length === 0) return;
    await (supabase.from("notifications" as any) as any)
      .update({ read: true })
      .in("id", unreadIds);
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const clearAll = async () => {
    const ids = notifications.map((n) => n.id);
    if (ids.length === 0) return;
    await (supabase.from("notifications" as any) as any)
      .delete()
      .in("id", ids);
    setNotifications([]);
  };

  return (
    <Popover open={open} onOpenChange={handleOpen}>
      <PopoverTrigger asChild>
        <button className="relative text-muted-foreground hover:text-primary transition-colors tactile-press p-2 rounded-xl glass-card">
          <Bell className="w-4 h-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-primary text-primary-foreground text-[9px] font-bold flex items-center justify-center animate-ring-pulse">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-80 sm:w-96 p-0 glass-card-elevated border-border/30"
        align="end"
        sideOffset={8}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/20">
          <h4 className="text-sm font-semibold text-foreground">Strategic Alerts</h4>
          {notifications.length > 0 && (
            <button onClick={clearAll} className="text-[10px] text-muted-foreground hover:text-destructive transition-colors">
              Clear all
            </button>
          )}
        </div>
        <div className="max-h-[360px] overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <Bell className="w-6 h-6 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-xs text-muted-foreground">No strategic alerts yet</p>
              <p className="text-[10px] text-muted-foreground/60 mt-1">Aura will notify you when meaningful patterns emerge</p>
            </div>
          ) : (
            notifications.map((n) => {
              const Icon = TYPE_ICONS[n.type] || Bell;
              const iconColor = TYPE_COLORS[n.type] || "text-muted-foreground";
              return (
                <div
                  key={n.id}
                  className={`px-4 py-3 border-b border-border/10 transition-colors ${
                    n.read ? "opacity-60" : "bg-primary/5"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 bg-secondary/30 ${iconColor}`}>
                      <Icon className="w-3.5 h-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <h5 className="text-xs font-semibold text-foreground truncate">{n.title}</h5>
                        <span className="text-[9px] text-muted-foreground/50 shrink-0">
                          {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">{n.body}</p>

                      {/* Alert urgency badge */}
                      {n.metadata?.urgency === "high" && (
                        <span className="inline-block mt-1.5 text-[9px] uppercase font-bold tracking-wider text-red-400/70 bg-red-500/10 px-1.5 py-0.5 rounded">
                          High Priority
                        </span>
                      )}

                      {/* KPI mini-bars for weekly summaries */}
                      {n.metadata && n.type === "weekly_summary" && (
                        <div className="flex gap-3 mt-2">
                          {[
                            { label: "Auth", value: n.metadata.authority_index, color: "bg-primary" },
                            { label: "Voice", value: n.metadata.market_voice, color: "bg-blue-500" },
                          ].map((kpi) => (
                            <div key={kpi.label} className="flex items-center gap-1.5">
                              <span className="text-[9px] text-muted-foreground">{kpi.label}</span>
                              <div className="w-12 h-1 rounded-full bg-secondary overflow-hidden">
                                <div className={`h-full rounded-full ${kpi.color}`} style={{ width: `${kpi.value || 0}%` }} />
                              </div>
                              <span className="text-[9px] text-muted-foreground">{kpi.value || 0}%</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default NotificationBell;
