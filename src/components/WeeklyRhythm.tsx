import { invokeEdgeFunction } from "@/lib/invokeEdgeFunction";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import InfoTooltip from "@/components/ui/InfoTooltip";

interface WeeklyRhythmData {
  active_weeks: number;
  total_weeks: number;
  weekly_data: boolean[];
}

interface AuraScoreResponse {
  weekly_rhythm?: WeeklyRhythmData;
}

interface Props {
  userId: string | null;
  data?: AuraScoreResponse | null;
}

const WeeklyRhythm = ({ userId, data: provided }: Props) => {
  const [data, setData] = useState<AuraScoreResponse | null>(provided ?? null);
  const [loading, setLoading] = useState(!provided);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (provided) { setData(provided); setLoading(false); }
  }, [provided]);

  useEffect(() => {
    if (!userId || provided) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        await supabase.auth.getSession();
        const { data: res, error } = await invokeEdgeFunction("calculate-aura-score", { body: {} });
        if (!cancelled && !error && res) setData(res as AuraScoreResponse);
      } catch (e) {
        console.error("WeeklyRhythm load failed", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [userId, provided]);

  if (loading) {
    return (
      <section aria-label="Weekly rhythm" className="rounded-r-lg border p-5"
        style={{ background: "hsl(var(--card))", borderColor: "hsl(var(--border) / 0.5)" }}>
        <Skeleton className="h-4 w-32 mb-3" />
        <Skeleton className="h-5 w-full" />
      </section>
    );
  }

  const rhythm = data?.weekly_rhythm;
  if (!rhythm) return null;

  const total = rhythm.total_weeks ?? 12;
  // Ensure exactly `total` cells, most recent on right.
  const raw = Array.isArray(rhythm.weekly_data) ? rhythm.weekly_data.slice(-total) : [];
  const allCells: boolean[] = Array.from({ length: total }, (_, i) => {
    const idx = i - (total - raw.length);
    return idx >= 0 ? !!raw[idx] : false;
  });
  // Default: show the last 4 weeks (current + 3 prior). Expand to show all 12.
  const visibleCount = expanded ? total : Math.min(4, total);
  const cells = allCells.slice(-visibleCount);
  const todayIdx = cells.length - 1;
  const active = rhythm.active_weeks ?? allCells.filter(Boolean).length;

  // Current-week streak: count consecutive filled weeks from the most recent backward.
  let streak = 0;
  for (let i = allCells.length - 1; i >= 0; i--) {
    if (allCells[i]) streak++;
    else break;
  }

  // Momentum copy (always against the full 12-week window).
  const totalActive = rhythm.active_weeks ?? allCells.filter(Boolean).length;
  let momentumCopy: string;
  if (totalActive === 0) {
    momentumCopy = "Start your rhythm — capture something you read this week.";
  } else if (totalActive <= 3) {
    momentumCopy = `Your rhythm is building. ${totalActive} ${totalActive === 1 ? "week" : "weeks"} and counting.`;
  } else if (totalActive <= 7) {
    momentumCopy = "Steady rhythm. This is how signals compound.";
  } else if (totalActive <= 11) {
    momentumCopy = "Strong rhythm. You're in the top tier.";
  } else {
    momentumCopy = "Perfect rhythm. 12 weeks of strategic intelligence.";
  }

  return (
    <section
      aria-label="Weekly rhythm"
      className="rounded-r-lg border"
      style={{
        background: "hsl(var(--card))",
        borderColor: "hsl(var(--border) / 0.5)",
        padding: "16px 18px",
      }}
    >
      <div
        style={{
          fontSize: 12,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "hsl(var(--muted-foreground))",
          fontFamily: "var(--font-sans, 'DM Sans', sans-serif)",
          display: "inline-flex",
          alignItems: "center",
        }}
      >
        Capture rhythm
        <InfoTooltip
          label="Capture Rhythm"
          text="Your capture rhythm over the last 12 weeks. Consistent weekly captures compound your signal strength and keep your intelligence fresh."
        />
      </div>
      <div
        style={{
          fontFamily: "var(--font-display, 'Cormorant Garamond')",
          fontSize: 14,
          fontStyle: "italic",
          color: "var(--ink-3)",
          marginTop: 3,
          lineHeight: 1.5,
        }}
      >
        {momentumCopy}
      </div>

      <div
        role="list"
        aria-label={`${totalActive} of ${total} weeks active`}
        className="flex gap-1.5 mt-3"
      >
        {cells.map((filled, i) => {
          const isToday = i === todayIdx;
          // Connect adjacent filled squares visually via reduced left radius.
          const prevFilled = i > 0 ? cells[i - 1] : false;
          const nextFilled = i < cells.length - 1 ? cells[i + 1] : false;

          const base = "w-6 h-6 rounded-sm transition-all duration-300";
          let cls: string;

          if (filled) {
            // Glow intensifies slightly if part of a multi-week run.
            const inRun = prevFilled || nextFilled;
            cls = [
              base,
              "bg-brand dark:bg-brand/80",
              inRun
                ? "shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_2px_10px_rgba(176,141,58,0.45)]"
                : "shadow-[inset_0_1px_0_rgba(255,255,255,0.15),0_1px_6px_rgba(176,141,58,0.30)]",
              isToday ? "ring-2 ring-brand/30 ring-offset-0" : "",
            ].join(" ");
          } else {
            cls = [
              base,
              "border border-dashed border-ink-3/30 bg-ink-2/20 dark:bg-transparent dark:border-ink-4/30",
              isToday ? "animate-pulse border-brand/40" : "",
            ].join(" ");
          }

          return (
            <div
              key={i}
              role="listitem"
              aria-label={`Week ${i + 1}: ${filled ? "active" : "inactive"}${isToday ? " (current week)" : ""}`}
              className={cls}
            />
          );
        })}
      </div>

      <div className="mt-2.5 flex items-center gap-3 text-xs text-muted-foreground" style={{ fontFamily: "'DM Sans', sans-serif" }}>
        <span className="tabular-nums">{Math.min(active, visibleCount)}/{visibleCount}w</span>
        {streak >= 2 && (
          <span className="text-brand font-medium">{streak}-week streak</span>
        )}
      </div>

      {total > 4 && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          style={{
            marginTop: 8,
            background: "transparent",
            border: 0,
            padding: 0,
            cursor: "pointer",
            color: "hsl(var(--primary))",
            fontFamily: "'DM Sans', sans-serif",
            fontSize: 12,
            fontWeight: 500,
          }}
          className="hover:underline"
        >
          {expanded ? "Show recent weeks ←" : "Show full history →"}
        </button>
      )}
    </section>
  );
};

export default WeeklyRhythm;
