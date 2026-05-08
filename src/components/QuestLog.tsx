import { useMemo, useState } from "react";
import { Phase, useQuestProgress } from "@/hooks/useQuestProgress";

interface Props {
  userId: string | null;
  compact?: boolean;
  onQuestAction?: (questId: string) => void;
  onViewFullJourney?: () => void;
}

const QuestLog = ({ userId, compact = true, onQuestAction, onViewFullJourney }: Props) => {
  const { phases, loading } = useQuestProgress(userId);
  const [expanded, setExpanded] = useState(!compact);

  const currentPhase: Phase | null = useMemo(() => {
    if (phases.length === 0) return null;
    return phases.find(p => p.unlocked && p.completed < p.total) || phases[phases.length - 1];
  }, [phases]);

  if (loading || !currentPhase) {
    return (
      <div style={{ padding: 12, fontSize: 11, color: "var(--muted-foreground)" }}>
        Loading progress…
      </div>
    );
  }

  const pct = Math.round((currentPhase.completed / currentPhase.total) * 100);
  const visibleQuests = expanded
    ? currentPhase.quests
    : [
        ...currentPhase.quests.filter(q => q.done).slice(-1),
        ...currentPhase.quests.filter(q => !q.done).slice(0, 3),
      ];

  return (
    <div
      style={{
        padding: 12,
        borderRadius: 10,
        background: "var(--brand-ghost, rgba(197,165,90,0.06))",
        border: "0.5px solid var(--brand-line, rgba(197,165,90,0.2))",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--brand)" }}>
          Your progress
        </span>
        <span style={{ fontSize: 10, color: "var(--muted-foreground)" }}>
          Phase {currentPhase.index} of 3
        </span>
      </div>

      <div style={{ fontSize: 11, color: "var(--foreground)", marginBottom: 8, fontWeight: 500 }}>
        {currentPhase.name} · {currentPhase.completed}/{currentPhase.total} complete
      </div>

      <div
        aria-hidden
        style={{
          height: 4,
          width: "100%",
          background: "var(--brand-line, rgba(197,165,90,0.15))",
          borderRadius: 999,
          overflow: "hidden",
          marginBottom: 10,
        }}
      >
        <div style={{ width: `${pct}%`, height: "100%", background: "var(--brand)", transition: "width 300ms ease" }} />
      </div>

      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 4 }}>
        {visibleQuests.map(q => (
          <li key={q.id} style={{ margin: 0 }}>
            <button
              type="button"
              onClick={() => onQuestAction?.(q.id)}
              disabled={!onQuestAction}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "4px 6px",
                borderRadius: 6,
                border: "none",
                background: "transparent",
                cursor: onQuestAction ? "pointer" : "default",
                fontSize: 11,
                color: q.done ? "var(--muted-foreground)" : "var(--foreground)",
                opacity: q.done ? 0.7 : 1,
                textAlign: "left",
              }}
              className={onQuestAction ? "hover:bg-[var(--brand-ghost,rgba(197,165,90,0.08))] transition-colors" : ""}
            >
              <span style={{ width: 14, color: q.done ? "var(--brand)" : "var(--muted-foreground)", fontSize: 11 }}>
                {q.done ? "✓" : "○"}
              </span>
              <span style={{ textDecoration: q.done ? "line-through" : "none", flex: 1 }}>{q.label}</span>
              {!q.done && onQuestAction && (
                <span style={{ color: "var(--brand)", fontSize: 11, opacity: 0.7 }}>›</span>
              )}
            </button>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={() => {
          if (onViewFullJourney && !expanded) onViewFullJourney();
          else setExpanded(v => !v);
        }}
        style={{
          marginTop: 10,
          background: "transparent",
          border: "none",
          color: "var(--brand)",
          fontSize: 11,
          fontWeight: 500,
          cursor: "pointer",
          padding: 0,
        }}
      >
        {expanded ? "Show less" : "View full journey →"}
      </button>
    </div>
  );
};

export default QuestLog;
