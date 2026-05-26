import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { InfoTooltip } from "@/components/ui/InfoTooltip";

interface Mission {
  id: string;
  title: string;
  description: string | null;
  mission_type: string;
  points: number;
  status: string;
}

const TYPE_LABEL: Record<string, string> = {
  signal: "Signal", content: "Content", rhythm: "Rhythm", voice: "Voice", baseline: "Baseline",
};

const TYPE_COLOR: Record<string, string> = {
  signal: "var(--warning)",
  content: "var(--color-info-text, var(--info))",
  voice: "var(--success)",
  rhythm: "var(--success)",
  baseline: "hsl(var(--muted-foreground))",
};

const explainMission = (
  title: string,
  type: string,
  topSignalTitle?: string,
  topSignalFragments?: number,
): string => {
  const t = title.toLowerCase();
  if (t.includes("capture")) {
    return "Find an article about your sector and save it. Aura will extract the strategic pattern.";
  }
  if (t.includes("publish")) {
    const sig = topSignalTitle || "strongest";
    const frags = topSignalFragments ?? 0;
    return `Your ${sig} signal has ${frags} fragment${frags === 1 ? "" : "s"}. Draft a LinkedIn post and share your perspective.`;
  }
  if (t.includes("voice") || type === "voice") {
    return "Paste 2 LinkedIn posts you've written before. Aura learns your tone so generated content sounds like you.";
  }
  return "";
};

const DEFAULT_MISSIONS: Mission[] = [
  { id: "default-1", title: "Capture a new source", description: null, mission_type: "signal", points: 5, status: "pending" },
  { id: "default-2", title: "Publish from your strongest signal", description: null, mission_type: "content", points: 8, status: "pending" },
  { id: "default-3", title: "Train your voice with 2 posts", description: null, mission_type: "voice", points: 6, status: "pending" },
];

interface MissionControlProps {
  userId: string | null;
  entriesCount?: number;
  topSignalTitle?: string;
  topSignalFragments?: number;
}

export default function MissionControl({ userId, entriesCount = 0, topSignalTitle, topSignalFragments }: MissionControlProps) {
  const [missions, setMissions] = useState<Mission[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("weekly_missions" as any)
        .select("id, title, description, mission_type, points, status")
        .eq("user_id", userId)
        .neq("status", "expired")
        .order("created_at", { ascending: true })
        .limit(8);
      if (!cancelled) {
        const rows = ((data as any) || []) as Mission[];
        if (rows.length === 0 && entriesCount > 0) {
          setMissions(DEFAULT_MISSIONS);
        } else {
          setMissions(rows);
        }
        setLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, [userId, entriesCount]);

  const toggle = async (m: Mission) => {
    if (m.id.startsWith("default-")) {
      // Defaults are placeholders only; flip local state without DB write
      setMissions(prev => prev.map(x => x.id === m.id ? { ...x, status: x.status === "completed" ? "pending" : "completed" } : x));
      return;
    }
    const next = m.status === "completed" ? "pending" : "completed";
    setMissions(prev => prev.map(x => x.id === m.id ? { ...x, status: next } : x));
    await supabase.from("weekly_missions" as any)
      .update({ status: next, completed_at: next === "completed" ? new Date().toISOString() : null })
      .eq("id", m.id);
  };

  const done = missions.filter(m => m.status === "completed").length;
  const total = missions.length;
  const pointsAvailable = missions
    .filter(m => m.status !== "completed")
    .reduce((s, m) => s + (m.points ?? 5), 0);

  return (
    <section style={{ borderTop: "0.5px solid hsl(var(--border) / 0.5)", paddingTop: 20 }}>
      <div className="flex items-baseline justify-between" style={{ marginBottom: 4 }}>
        <span style={{
          fontSize: 11, fontWeight: 500, letterSpacing: "0.04em",
          color: "hsl(var(--muted-foreground))", textTransform: "uppercase",
          display: "inline-flex", alignItems: "center", gap: 6,
        }}>
          This week's missions
          <InfoTooltip
            label="Priority actions"
            text="Your highest-impact next moves, ranked by urgency. Completing these advances your score fastest."
            side="bottom"
            triggerSize={14}
          />
        </span>
        {total > 0 && (
          <span style={{ fontSize: 11, color: "hsl(var(--muted-foreground))" }}>
            {done} of {total} ·{" "}
            <span style={{ color: "var(--success)", fontWeight: 500 }}>+{pointsAvailable} pts available</span>
          </span>
        )}
      </div>
      <div style={{ fontSize: 12, color: "hsl(var(--muted-foreground))", marginBottom: 12, lineHeight: 1.5 }}>
        Complete these to grow your presence score. Each one strengthens a different pillar.
      </div>

      {loaded && missions.length === 0 ? (
        <div style={{ padding: "16px 4px", fontSize: 12, color: "hsl(var(--muted-foreground))", textAlign: "center" }}>
          Your first missions will appear after your first capture.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {missions.map((m, i) => {
          const isDone = m.status === "completed";
          const explanation = explainMission(m.title, m.mission_type, topSignalTitle, topSignalFragments);
          const pillarColor = TYPE_COLOR[m.mission_type] || "hsl(var(--muted-foreground))";
          return (
            <div
              key={m.id}
              className="flex animate-fade-up-in"
              style={{
                gap: 12, padding: "12px 14px",
                border: "0.5px solid hsl(var(--border) / 0.5)",
                borderRadius: 8,
                alignItems: "flex-start",
                background: "hsl(var(--card))",
                animationDelay: `${Math.min(i * 60, 480)}ms`,
                animationFillMode: "backwards",
              }}
            >
              <button
                type="button"
                onClick={() => toggle(m)}
                aria-label={isDone ? "Mark as pending" : "Mark complete"}
                style={{
                  width: 18, height: 18, borderRadius: "50%",
                  border: isDone ? "0" : "1.5px solid hsl(var(--muted-foreground) / 0.6)",
                  background: isDone ? "var(--success)" : "transparent",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  cursor: "pointer", flexShrink: 0, marginTop: 1,
                }}
              >
                {isDone && <Check size={11} color="#fff" strokeWidth={3} />}
              </button>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 13, fontWeight: 500,
                  color: isDone ? "hsl(var(--muted-foreground))" : "hsl(var(--foreground))",
                  textDecoration: isDone ? "line-through" : "none",
                  lineHeight: 1.4,
                }}>
                  {m.title}
                </div>
                {explanation && (
                  <div style={{
                    fontSize: 11, color: "hsl(var(--muted-foreground))",
                    marginTop: 2, lineHeight: 1.45,
                  }}>
                    {explanation}
                  </div>
                )}
              </div>
              <div style={{
                display: "flex", flexDirection: "column", alignItems: "flex-end",
                gap: 4, flexShrink: 0,
              }}>
                <span style={{
                  fontSize: 11, fontWeight: 600,
                  color: "var(--success)",
                  background: "hsl(var(--success) / 0.12)",
                  padding: "2px 7px", borderRadius: 4,
                }}>
                  +{m.points ?? 5}
                </span>
                <span style={{
                  fontSize: 10, fontWeight: 500, letterSpacing: "0.04em",
                  color: pillarColor, textTransform: "uppercase",
                }}>
                  {TYPE_LABEL[m.mission_type] || m.mission_type}
                </span>
              </div>
            </div>
          );
        })}
        </div>
      )}
    </section>
  );
}