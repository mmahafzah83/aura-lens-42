import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  userId: string | null;
  authorityScore?: number | null;
  onGoToImpact?: () => void;
}

interface Stats {
  signalsCount: number;
  topConfidence: number | null;
  postsCount: number;
  engagementRate: number | null;
  followers: number | null;
}

const fmtCompact = (n: number) => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(Math.round(n));
};

const tierBenchmark = (followers: number | null): { low: number; high: number; label: string } => {
  const f = followers ?? 0;
  if (f < 1000) return { low: 5, high: 10, label: "under 1K" };
  if (f < 10000) return { low: 3, high: 7, label: "1K–10K" };
  if (f < 50000) return { low: 1.5, high: 4, label: "10K–50K" };
  return { low: 0.5, high: 2, label: "50K+" };
};

const Item = ({
  value, label, delta, valueColor, onClick,
}: { value: string; label: string; delta: string; valueColor?: string; onClick?: () => void }) => (
  <button
    type="button"
    onClick={onClick}
    style={{
      flex: 1,
      padding: "10px 6px",
      borderRadius: 10,
      background: "transparent",
      border: 0,
      textAlign: "center",
      cursor: onClick ? "pointer" : "default",
      transition: "background 150ms",
      color: "inherit",
    }}
    onMouseEnter={(e) => { (e.currentTarget.style.background = "hsl(var(--primary) / 0.08)"); }}
    onMouseLeave={(e) => { (e.currentTarget.style.background = "transparent"); }}
  >
    <div
      className="tabular-nums"
      style={{
        fontFamily: "'JetBrains Mono', ui-monospace, monospace",
        fontSize: 22, fontWeight: 700,
        color: valueColor || "var(--aura-t1)", lineHeight: 1.1,
      }}
    >
      {value}
    </div>
    <div
      style={{
        fontSize: 9.5, marginTop: 4, textTransform: "uppercase",
        letterSpacing: "0.08em", color: "var(--aura-t2)",
      }}
    >
      {label}
    </div>
    <div style={{ fontSize: 10, marginTop: 3, color: "var(--aura-t3)" }}>
      {delta}
    </div>
  </button>
);

export default function AuthorityPulseStrip({ userId, authorityScore, onGoToImpact }: Props) {
  const [stats, setStats] = useState<Stats>({
    signalsCount: 0, topConfidence: null, postsCount: 0, engagementRate: null, followers: null,
  });

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      const [signalsRes, postsRes, metricsRes, followerRes] = await Promise.all([
        supabase.from("strategic_signals" as any)
          .select("confidence", { count: "exact" })
          .eq("user_id", userId).eq("status", "active")
          .order("confidence", { ascending: false }).limit(1),
        supabase.from("linkedin_posts")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId),
        supabase.from("linkedin_post_metrics")
          .select("engagement_rate")
          .eq("user_id", userId).limit(500),
        supabase.from("influence_snapshots")
          .select("followers, snapshot_date")
          .eq("user_id", userId).eq("source_type", "linkedin_export")
          .gt("followers", 0)
          .order("snapshot_date", { ascending: false }).limit(1),
      ]);
      if (cancelled) return;
      const topConf = (signalsRes.data as any)?.[0]?.confidence ?? null;
      const ers = (metricsRes.data as any[] || [])
        .map(r => Number(r.engagement_rate || 0))
        .filter(v => v > 0);
      const avgEr = ers.length ? ers.reduce((a, b) => a + b, 0) / ers.length : null;
      setStats({
        signalsCount: signalsRes.count ?? 0,
        topConfidence: topConf,
        postsCount: postsRes.count ?? 0,
        engagementRate: avgEr,
        followers: (followerRes.data as any)?.[0]?.followers ?? null,
      });
    })();
    return () => { cancelled = true; };
  }, [userId]);

  const hasLinkedIn = stats.postsCount > 0 || stats.followers != null;

  return (
    <div
      style={{
        display: "flex",
        background: "var(--aura-card)",
        borderRadius: 10,
        padding: 3,
        border: "1px solid var(--aura-border)",
      }}
    >
      <Item
        value={authorityScore != null ? String(Math.round(authorityScore)) : "--"}
        label="Authority"
        delta={authorityScore != null ? `+${Math.round(authorityScore)}` : "Build it"}
        valueColor="var(--aura-accent)"
      />
      <Item
        value={String(stats.signalsCount)}
        label="Signals"
        delta={stats.topConfidence != null ? `${Math.round(stats.topConfidence * 100)}% conf.` : "—"}
        valueColor="var(--aura-accent3)"
      />
      <Item
        value={stats.postsCount > 0 ? String(stats.postsCount) : (hasLinkedIn ? "0" : "--")}
        label="Posts"
        delta={hasLinkedIn ? "imported" : "Import LinkedIn"}
        valueColor="var(--aura-blue)"
        onClick={!hasLinkedIn ? onGoToImpact : undefined}
      />
      <Item
        value={stats.engagementRate != null ? `${stats.engagementRate.toFixed(1)}%` : "--"}
        label="Engagement"
        delta={(() => {
          if (stats.engagementRate == null) return "Import LinkedIn";
          const b = tierBenchmark(stats.followers);
          return `vs ${b.low}–${b.high}% (${b.label})`;
        })()}
        valueColor="var(--aura-positive)"
        onClick={stats.engagementRate == null ? onGoToImpact : undefined}
      />
      <Item
        value={stats.followers != null ? fmtCompact(stats.followers) : "--"}
        label="Followers"
        delta={stats.followers != null ? "tracked" : "Import LinkedIn"}
        valueColor="var(--aura-purple)"
        onClick={stats.followers == null ? onGoToImpact : undefined}
      />
    </div>
  );
}