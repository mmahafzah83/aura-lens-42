import { useEffect, useState } from "react";
import { Award, X } from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

interface Milestone { id: string; name: string; }

interface Props { userId: string | null; }

const STORAGE_KEY = "aura_seen_milestones";

const MilestoneNotification = ({ userId }: Props) => {
  const [pending, setPending] = useState<Milestone[]>([]);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      try {
        await supabase.auth.getSession();
        const { data, error } = await supabase.functions.invoke("calculate-aura-score", { body: {} });
        if (cancelled || error || !data) return;
        const newly: string[] = (data as any).newly_earned || [];
        const all: Milestone[] = (data as any).milestones || [];
        if (!newly.length) return;
        const seen: string[] = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
        const fresh = newly.filter((id) => !seen.includes(id));
        if (!fresh.length) return;
        const items = all.filter((m) => fresh.includes(m.id));
        setPending(items);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(new Set([...seen, ...fresh]))));
      } catch (e) {
        console.error("MilestoneNotification load failed", e);
      }
    })();
    return () => { cancelled = true; };
  }, [userId]);

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
        fontSize: 13,
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
