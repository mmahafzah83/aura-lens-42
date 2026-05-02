import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";

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
        const { data: res, error } = await supabase.functions.invoke("calculate-aura-score", { body: {} });
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
  const cells: boolean[] = Array.from({ length: total }, (_, i) => {
    const idx = i - (total - raw.length);
    return idx >= 0 ? !!raw[idx] : false;
  });
  const todayIdx = total - 1;
  const active = rhythm.active_weeks ?? cells.filter(Boolean).length;
  const milestone = active >= 4;

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
          fontSize: 11,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "hsl(var(--muted-foreground))",
          fontFamily: "var(--font-sans, 'DM Sans', sans-serif)",
        }}
      >
        Capture rhythm
      </div>

      <div
        role="list"
        aria-label={`${active} of ${total} weeks active`}
        style={{ display: "flex", gap: 4, marginTop: 10 }}
      >
        {cells.map((filled, i) => {
          const isToday = i === todayIdx;
          return (
            <div
              key={i}
              role="listitem"
              aria-label={`Week ${i + 1 - total + total}: ${filled ? "active" : "inactive"}`}
              style={{
                width: 20,
                height: 20,
                borderRadius: 4,
                background: filled ? "hsl(var(--primary))" : "transparent",
                border: filled
                  ? "1px solid hsl(var(--primary))"
                  : isToday
                  ? "1.5px solid hsl(var(--primary) / 0.55)"
                  : "1px solid hsl(var(--border))",
                transition: "background 200ms ease",
              }}
            />
          );
        })}
      </div>

      <div
        style={{
          marginTop: 10,
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontFamily: "'DM Sans', sans-serif",
          fontSize: 12,
          color: "hsl(var(--muted-foreground))",
        }}
      >
        <span>{active} of {total} weeks active</span>
        {milestone && (
          <Check
            size={14}
            strokeWidth={2.25}
            aria-label="Milestone earned"
            style={{ color: "hsl(var(--primary))" }}
          />
        )}
      </div>

      {active === 0 && (
        <div
          style={{
            marginTop: 6,
            fontFamily: "'DM Sans', sans-serif",
            fontSize: 12,
            color: "hsl(var(--muted-foreground))",
          }}
        >
          Capture something this week to start your rhythm.
        </div>
      )}
    </section>
  );
};

export default WeeklyRhythm;
