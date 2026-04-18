import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";

interface AuraItem {
  action_type: "PUBLISH" | "CAPTURE" | "WATCH" | "IDLE";
  title: string;
  reason: string;
  urgency: "HIGH" | "MEDIUM" | "LOW" | "MONITOR";
}

interface AurasReadProps {
  userId: string | null;
  onOpenCapture?: () => void;
  onSwitchTab?: (tab: "home" | "identity" | "intelligence" | "authority" | "influence") => void;
}

const ACCENT = "#F97316";

const NUMBER_GLYPHS = ["①", "②", "③"];

const urgencyStyle = (u: AuraItem["urgency"]): { bg: string; color: string } => {
  switch (u) {
    case "HIGH":    return { bg: "#FEE2E2", color: "#991B1B" };
    case "MEDIUM":  return { bg: "#FFF7ED", color: "#C2410C" };
    case "MONITOR": return { bg: "#F1EFE8", color: "#5F5E5A" };
    case "LOW":
    default:        return { bg: "#F1EFE8", color: "#5F5E5A" };
  }
};

const formatDate = (d: Date) =>
  d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

const AurasRead = ({ userId, onOpenCapture, onSwitchTab }: AurasReadProps) => {
  const navigate = useNavigate();
  const [items, setItems] = useState<AuraItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    (async () => {
      setLoading(true);
      setFailed(false);
      try {
        const { data, error } = await supabase.functions.invoke("auras-read", { body: {} });
        if (cancelled) return;
        if (error) throw error;
        const list = Array.isArray(data?.items) ? data.items : [];
        if (list.length === 0) {
          setFailed(true);
        } else {
          setItems(list.slice(0, 3));
        }
      } catch (e) {
        if (!cancelled) {
          console.error("[AurasRead] failed", e);
          setFailed(true);
        }
      } finally {
        clearTimeout(timeout);
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [userId]);

  const handleClick = (item: AuraItem) => {
    switch (item.action_type) {
      case "PUBLISH":
        navigate("/publish");
        break;
      case "CAPTURE":
        onOpenCapture?.();
        break;
      case "WATCH":
        if (onSwitchTab) onSwitchTab("intelligence");
        else navigate("/intelligence");
        break;
      case "IDLE":
      default:
        break;
    }
  };

  return (
    <section>
      <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 11, fontWeight: 500, letterSpacing: "0.1em", textTransform: "uppercase", color: "hsl(var(--muted-foreground) / 0.7)" }}>
          Aura's Read
        </div>
        <div style={{ fontSize: 11, color: "hsl(var(--muted-foreground) / 0.7)" }}>
          {formatDate(new Date())}
        </div>
      </div>

      {loading ? (
        <div>
          {[0, 1, 2].map((i) => (
            <div key={i} style={{ padding: "12px 0", borderTop: i === 0 ? "none" : "0.5px solid hsl(var(--border))" }}>
              <div className="flex gap-3 items-start">
                <Skeleton className="h-4 w-4 rounded" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      ) : failed || !items || items.length === 0 ? (
        <div style={{ padding: "16px 0", fontSize: 12, color: "hsl(var(--muted-foreground))" }}>
          Aura needs more data to generate a recommendation. Try capturing something new.
        </div>
      ) : (
        <div>
          {items.map((item, idx) => {
            const ug = urgencyStyle(item.urgency);
            const clickable = item.action_type !== "IDLE";
            return (
              <div
                key={idx}
                onClick={clickable ? () => handleClick(item) : undefined}
                style={{
                  padding: "12px 0",
                  borderTop: idx === 0 ? "none" : "0.5px solid hsl(var(--border))",
                  cursor: clickable ? "pointer" : "default",
                }}
              >
                <div className="flex items-start gap-3">
                  <span style={{ fontSize: 14, color: ACCENT, lineHeight: "20px", flexShrink: 0 }}>
                    {NUMBER_GLYPHS[idx] || `${idx + 1}.`}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div style={{ fontSize: 15, fontWeight: 500, color: "hsl(var(--foreground))", lineHeight: 1.35 }}>
                        {item.title}
                      </div>
                      <span style={{
                        background: ug.bg,
                        color: ug.color,
                        fontSize: 10,
                        fontWeight: 600,
                        padding: "2px 8px",
                        borderRadius: 999,
                        whiteSpace: "nowrap",
                        letterSpacing: "0.04em",
                        flexShrink: 0,
                      }}>
                        {item.urgency}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: "hsl(var(--muted-foreground))", marginTop: 2, lineHeight: 1.45 }}>
                      {item.reason}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};

export default AurasRead;
