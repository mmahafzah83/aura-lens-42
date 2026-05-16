import { useEffect, useState } from "react";
import { Target, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

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

export default function MissionControl({ userId }: { userId: string | null }) {
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
        setMissions((data as any) || []);
        setLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, [userId]);

  const toggle = async (m: Mission) => {
    const next = m.status === "completed" ? "pending" : "completed";
    setMissions(prev => prev.map(x => x.id === m.id ? { ...x, status: next } : x));
    await supabase.from("weekly_missions" as any)
      .update({ status: next, completed_at: next === "completed" ? new Date().toISOString() : null })
      .eq("id", m.id);
  };

  const done = missions.filter(m => m.status === "completed").length;
  const total = missions.length;
  const pct = total ? (done / total) * 100 : 0;

  return (
    <div
      style={{
        border: "1px solid hsl(var(--border) / 0.6)",
        borderRadius: 10,
        overflow: "hidden",
        background: "hsl(var(--card))",
      }}
    >
      <div
        className="flex items-center justify-between"
        style={{ padding: "14px 16px", borderBottom: "1px solid hsl(var(--border) / 0.5)" }}
      >
        <div className="flex items-center" style={{ gap: 8 }}>
          <Target size={15} color="#B08D3A" />
          <span style={{ fontSize: 13, fontWeight: 500, color: "hsl(var(--foreground))" }}>
            Your missions this week
          </span>
        </div>
        {total > 0 && (
          <div className="flex items-center" style={{ gap: 10 }}>
            <span style={{ fontSize: 11, color: "hsl(var(--muted-foreground))" }}>{done} of {total}</span>
            <div style={{ width: 60, height: 4, background: "hsl(var(--border) / 0.6)", borderRadius: 2, overflow: "hidden" }}>
              <div style={{ width: `${pct}%`, height: "100%", background: "#B08D3A", transition: "width 400ms" }} />
            </div>
          </div>
        )}
      </div>

      {loaded && missions.length === 0 ? (
        <div style={{ padding: "20px 16px", fontSize: 12, color: "hsl(var(--muted-foreground))", textAlign: "center" }}>
          Your first missions will appear after your first capture.
        </div>
      ) : (
        missions.map((m, i) => {
          const isDone = m.status === "completed";
          return (
            <div
              key={m.id}
              className="flex"
              style={{
                gap: 12, padding: "12px 16px",
                borderBottom: i === missions.length - 1 ? "none" : "1px solid hsl(var(--border) / 0.35)",
                alignItems: "flex-start",
              }}
            >
              <button
                type="button"
                onClick={() => toggle(m)}
                aria-label={isDone ? "Mark as pending" : "Mark complete"}
                style={{
                  width: 20, height: 20, borderRadius: "50%",
                  border: isDone ? "0" : "1.5px solid hsl(var(--border))",
                  background: isDone ? "#B08D3A" : "transparent",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  cursor: "pointer", flexShrink: 0, marginTop: 1,
                }}
              >
                {isDone && <Check size={12} color="#fff" strokeWidth={3} />}
              </button>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 13,
                    color: isDone ? "hsl(var(--muted-foreground))" : "hsl(var(--foreground))",
                    textDecoration: isDone ? "line-through" : "none",
                  }}
                >
                  {m.title}
                </div>
                <div
                  className="flex items-center"
                  style={{ gap: 8, marginTop: 4, fontSize: 11, color: "hsl(var(--muted-foreground))" }}
                >
                  <span style={{
                    color: "#B08D3A", fontWeight: 500,
                    background: "rgba(176,141,58,0.10)",
                    padding: "2px 6px", borderRadius: 4, fontSize: 10,
                  }}>
                    +{m.points ?? 5} pts
                  </span>
                  <span>{TYPE_LABEL[m.mission_type] || m.mission_type}</span>
                </div>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}