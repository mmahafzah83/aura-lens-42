import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { invokeEdgeFunction } from "@/lib/invokeEdgeFunction";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Info } from "lucide-react";

interface Props {
  userId: string | null;
}

// 5-minute in-memory cache keyed by user id so tab switches don't re-call the EF.
const SCORE_CACHE_TTL_MS = 5 * 60 * 1000;
const scoreCache = new Map<string, {
  ts: number;
  signal: number; content: number; capture: number;
  signalW: number; contentW: number; captureW: number;
  total: number;
}>();

/**
 * Score Breakdown — calls calculate-aura-score live so numbers match Home/Impact.
 * Cached for 5 minutes per user to avoid re-calling on every tab switch.
 * Renders weighted contributions: Signal (×0.4 / 40), Content (×0.4 / 40),
 * Consistency (×0.2 / 20).
 */
export default function ScoreBreakdown({ userId }: Props) {
  const [components, setComponents] = useState<{
    signal: number; content: number; capture: number;
  }>({ signal: 0, content: 0, capture: 0 });
  const [weighted, setWeighted] = useState<{
    signal: number; content: number; capture: number; total: number;
  }>({ signal: 0, content: 0, capture: 0, total: 0 });

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    const cached = scoreCache.get(userId);
    if (cached && Date.now() - cached.ts < SCORE_CACHE_TTL_MS) {
      setComponents({ signal: cached.signal, content: cached.content, capture: cached.capture });
      setWeighted({ signal: cached.signalW, content: cached.contentW, capture: cached.captureW, total: cached.total });
      return;
    }
    (async () => {
      try {
        await supabase.auth.getSession();
        const { data, error } = await invokeEdgeFunction("calculate-aura-score", { body: {} });
        if (cancelled || error || !data) return;
        const d: any = data;
        const next = {
          signal: Number(d.signal_score) || 0,
          content: Number(d.content_score) || 0,
          capture: Number(d.capture_score) || 0,
        };
        const w = {
          // Fall back to local math only if EF predates the weighted fields.
          signal: Number.isFinite(Number(d.signal_weighted)) ? Number(d.signal_weighted) : Math.round(next.signal * 0.4),
          content: Number.isFinite(Number(d.content_weighted)) ? Number(d.content_weighted) : Math.round(next.content * 0.4),
          capture: Number.isFinite(Number(d.capture_weighted)) ? Number(d.capture_weighted) : Math.round(next.capture * 0.2),
          total: Number.isFinite(Number(d.aura_score)) ? Number(d.aura_score) : 0,
        };
        scoreCache.set(userId, {
          ts: Date.now(), ...next,
          signalW: w.signal, contentW: w.content, captureW: w.capture, total: w.total,
        });
        setComponents(next);
        setWeighted(w);
      } catch (e) {
        console.error("ScoreBreakdown live load failed", e);
      }
    })();
    return () => { cancelled = true; };
  }, [userId]);

  const signalPts = weighted.signal;
  const contentPts = weighted.content;
  const consistencyPts = weighted.capture;
  // Total comes from the EF (aura_score), never a local re-sum.
  const total = weighted.total || (signalPts + contentPts + consistencyPts);

  const rows = [
    { label: "Signal",      val: signalPts,      max: 40, color: "var(--gold-dark)" },
    { label: "Content",     val: contentPts,     max: 40, color: "var(--gold-dark)" },
    { label: "Consistency", val: consistencyPts, max: 20, color: "var(--gold-dark)" },
  ];

  // Animate progress bars from 0 → actual on first mount only.
  const [animatedPct, setAnimatedPct] = useState<number[]>([0, 0, 0]);
  const animatedRef = useRef(false);
  useEffect(() => {
    const targets = rows.map(r => Math.min(100, Math.round((r.val / r.max) * 100)));
    if (animatedRef.current) {
      setAnimatedPct(targets);
      return;
    }
    if (targets.every(t => t === 0)) return;
    animatedRef.current = true;
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setAnimatedPct(targets);
      return;
    }
    setAnimatedPct([0, 0, 0]);
    const start = performance.now();
    const duration = 600;
    const easeOut = (t: number) => 1 - Math.pow(1 - t, 4);
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const e = easeOut(t);
      setAnimatedPct(targets.map(target => Math.round(target * e)));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signalPts, contentPts, consistencyPts]);

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
        <div className="text-section-header" style={{ color: "var(--ink)" }}>
          Score breakdown
        </div>
        <TooltipProvider delayDuration={150}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" aria-label="Score formula" style={{ background: "transparent", border: 0, color: "var(--aura-t1)", opacity: 0.5, cursor: "help", padding: 0 }}>
                <Info className="w-3.5 h-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" align="end" className="max-w-xs text-xs">
              <p><strong>Signal (40%)</strong>: how many signals you have, their strength, and territory breadth.</p>
              <p className="mt-1"><strong>Content (40%)</strong>: imported history is your foundation (up to 15 points). New signal-driven content grows this (up to 85 points). Resets monthly.</p>
              <p className="mt-1"><strong>Consistency (20%)</strong>: your capture rhythm. Recent weeks count more (60%), long-term consistency also matters (40%).</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {rows.map((r, i) => {
          const pct = animatedPct[i];
          return (
            <div key={r.label}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                <span style={{ fontSize: 12, color: "var(--aura-t1)", opacity: 0.85 }}>{r.label}</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: r.color }}>
                  {r.val}/{r.max}
                </span>
              </div>
              <div style={{
                height: 6, background: "var(--paper-3)",
                borderRadius: 999, overflow: "hidden",
              }}>
                <div style={{
                  width: `${pct}%`, height: "100%",
                  background: r.color, borderRadius: 999,
                  transition: "width 60ms linear",
                }} />
              </div>
            </div>
          );
        })}
      </div>

      <div style={{
        marginTop: 14, paddingTop: 12,
        borderTop: "1px solid var(--vellum)",
        display: "flex", alignItems: "baseline", justifyContent: "space-between",
      }}>
        <span className="text-section-header" style={{ color: "var(--ink-3)" }}>
          Total
        </span>
        <span className="text-metric" style={{ color: "var(--brand)" }}>
          {total}<span className="text-denominator">/100</span>
        </span>
      </div>
    </div>
  );
}
