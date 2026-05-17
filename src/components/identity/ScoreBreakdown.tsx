import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Info } from "lucide-react";

interface Props {
  userId: string | null;
}

/**
 * Score Breakdown — reads latest score_snapshots.components
 * and renders weighted contributions: Signal (×0.4 / 40), Content (×0.4 / 40),
 * Consistency (×0.2 / 20).
 */
export default function ScoreBreakdown({ userId }: Props) {
  const [components, setComponents] = useState<{
    signal: number; content: number; capture: number;
  }>({ signal: 0, content: 0, capture: 0 });

  useEffect(() => {
    if (!userId) return;
    (async () => {
      const { data } = await (supabase.from("score_snapshots") as any)
        .select("components")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const c = data?.components || {};
      setComponents({
        signal: Number(c.signal_score) || 0,
        content: Number(c.content_score) || 0,
        capture: Number(c.capture_score) || 0,
      });
    })();
  }, [userId]);

  const signalPts = Math.round(components.signal * 0.4);
  const contentPts = Math.round(components.content * 0.4);
  const consistencyPts = Math.round(components.capture * 0.2);
  const total = signalPts + contentPts + consistencyPts;

  const rows = [
    { label: "Signal",      val: signalPts,      max: 40, color: "var(--aura-accent)"   },
    { label: "Content",     val: contentPts,     max: 40, color: "var(--aura-blue)"     },
    { label: "Consistency", val: consistencyPts, max: 20, color: "var(--aura-positive)" },
  ];

  return (
    <div style={{
      background: "var(--aura-card)",
      border: "1px solid var(--aura-card-glass)",
      borderRadius: 16,
      padding: 18,
    }}>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        marginBottom: 12,
      }}>
        <div style={{
          fontSize: 9.5, fontWeight: 600, letterSpacing: "0.12em",
          color: "var(--aura-t1)", textTransform: "uppercase",
        }}>
          Score breakdown
        </div>
        <TooltipProvider delayDuration={150}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" aria-label="Score formula" style={{ background: "transparent", border: 0, color: "var(--aura-t1)", opacity: 0.5, cursor: "help", padding: 0 }}>
                <Info className="w-3.5 h-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="left" className="max-w-xs text-xs">
              <p><strong>Signal (40%)</strong>: intelligence depth from captures.</p>
              <p className="mt-1"><strong>Content (40%)</strong>: imports give baseline max 30, new posts give max 70.</p>
              <p className="mt-1"><strong>Consistency (20%)</strong>: weekly capture streak over 4 weeks.</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {rows.map((r) => {
          const pct = Math.min(100, Math.round((r.val / r.max) * 100));
          return (
            <div key={r.label}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                <span style={{ fontSize: 12, color: "var(--aura-t1)", opacity: 0.85 }}>{r.label}</span>
                <span style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 12, fontWeight: 600, color: r.color,
                }}>
                  {r.val}/{r.max}
                </span>
              </div>
              <div style={{
                height: 6, background: "rgba(255,255,255,0.06)",
                borderRadius: 999, overflow: "hidden",
              }}>
                <div style={{
                  width: `${pct}%`, height: "100%",
                  background: r.color, borderRadius: 999,
                  transition: "width 400ms ease",
                }} />
              </div>
            </div>
          );
        })}
      </div>

      <div style={{
        marginTop: 14, paddingTop: 12,
        borderTop: "1px solid rgba(255,255,255,0.08)",
        display: "flex", alignItems: "baseline", justifyContent: "space-between",
      }}>
        <span style={{
          fontSize: 10, letterSpacing: "0.12em",
          color: "var(--aura-t1)", opacity: 0.7,
          textTransform: "uppercase", fontWeight: 600,
        }}>
          Total
        </span>
        <span style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 24, fontWeight: 700,
          color: "var(--aura-accent)",
        }}>
          {total}<span style={{ fontSize: 13, opacity: 0.6 }}>/100</span>
        </span>
      </div>
    </div>
  );
}
