import { useEffect, useState } from "react";
import { Award, X } from "lucide-react";
import { Link } from "react-router-dom";

interface Milestone { id: string; name: string; }

interface Props {
  userId: string | null;
  /** Score payload from calculate-aura-score, owned by the parent (HomeTab).
   *  When present, drives newly_earned + milestones — no independent EF call. */
  auraData?: {
    newly_earned?: string[];
    milestones?: Milestone[];
  } | null;
}

const STORAGE_KEY = "aura_seen_milestones";

const MilestoneNotification = ({ userId, auraData }: Props) => {
  const [pending, setPending] = useState<Milestone[]>([]);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!userId || !auraData) return;
    try {
      const newly: string[] = auraData.newly_earned || [];
      const all: Milestone[] = auraData.milestones || [];
      if (!newly.length) return;
      const seen: string[] = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      const fresh = newly.filter((id) => !seen.includes(id));
      if (!fresh.length) return;
      const items = all.filter((m) => fresh.includes(m.id));
      setPending(items);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(new Set([...seen, ...fresh]))));
    } catch (e) {
      console.error("MilestoneNotification process failed", e);
    }
  }, [userId, auraData]);

  useEffect(() => {
    if (!pending.length || dismissed) return;
    const t = setTimeout(() => setDismissed(true), 8000);
    return () => clearTimeout(t);
  }, [pending, dismissed]);

  if (!pending.length || dismissed) return null;
  const first = pending[0];

  return (
    <div
      role="status"
      style={{
        background: "hsl(var(--card))",
        border: "1px solid hsl(var(--border) / 0.5)",
        borderLeft: "3px solid hsl(var(--primary))",
        borderRadius: 8,
        padding: "10px 14px",
        display: "flex",
        alignItems: "center",
        gap: 10,
        fontFamily: "'DM Sans', sans-serif",
        fontSize: 14,
        color: "hsl(var(--foreground))",
      }}
    >
      <Award size={16} style={{ color: "hsl(var(--primary))", flexShrink: 0 }} />
      <span style={{ flex: 1 }}>
        Milestone earned: <strong style={{ fontWeight: 500 }}>{first.name}</strong>
      </span>
      <Link
        to="/dashboard?tab=identity"
        onClick={() => setDismissed(true)}
        style={{ color: "hsl(var(--primary))", fontSize: 12, textDecoration: "none" }}
      >
        View on My Story
      </Link>
      <button
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
        style={{ background: "none", border: 0, color: "hsl(var(--muted-foreground))", cursor: "pointer", padding: 2 }}
      >
        <X size={14} />
      </button>
    </div>
  );
};

export default MilestoneNotification;
