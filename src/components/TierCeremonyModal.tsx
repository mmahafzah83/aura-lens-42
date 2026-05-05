import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/integrations/supabase/client";
import useMilestones, { type Milestone } from "@/hooks/useMilestones";

interface Props {
  userId: string | null;
}

const TIER_COPY: Record<string, { name: string; subtitle: string }> = {
  tier_strategist: {
    name: "Strategist",
    subtitle:
      "Your intelligence graph shows consistent pattern recognition. You're no longer observing — you're reading the market.",
  },
  tier_authority: {
    name: "Authority",
    subtitle:
      "Your signal depth, content authority, and capture consistency place you in the top tier. The market recognizes expertise at this level.",
  },
  tier_observer: {
    name: "Observer",
    subtitle: "You've begun building your strategic intelligence.",
  },
};

function useCountUp(target: number, durationMs = 1200, start = false) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!start) return;
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / durationMs);
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(Math.round(target * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs, start]);
  return val;
}

export default function TierCeremonyModal({ userId }: Props) {
  const { unacknowledgedMilestones, acknowledgeMilestone, shareMilestone } = useMilestones(userId);
  const tierMilestone: Milestone | undefined = useMemo(
    () => unacknowledgedMilestones.find((m) => m.milestone_id?.startsWith("tier_")),
    [unacknowledgedMilestones]
  );

  const [stats, setStats] = useState<{ signals: number; posts: number; weeks: number } | null>(null);
  const [topSignal, setTopSignal] = useState<{ title: string; confidence: number } | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (!tierMilestone || !userId) return;
    let cancelled = false;
    (async () => {
      const twelveWeeksAgo = new Date(Date.now() - 12 * 7 * 24 * 60 * 60 * 1000).toISOString();
      const [{ count: sigCount }, { count: postCount }, { data: entries }, { data: sigTop }] = await Promise.all([
        supabase.from("strategic_signals").select("id", { count: "exact", head: true })
          .eq("user_id", userId).eq("status", "active"),
        supabase.from("linkedin_posts").select("id", { count: "exact", head: true })
          .eq("user_id", userId).not("published_at", "is", null),
        supabase.from("entries").select("created_at").eq("user_id", userId).gte("created_at", twelveWeeksAgo),
        supabase.from("strategic_signals").select("signal_title,confidence")
          .eq("user_id", userId).eq("status", "active")
          .order("confidence", { ascending: false }).limit(1).maybeSingle(),
      ]);
      if (cancelled) return;

      const weeks = new Set<number>();
      (entries || []).forEach((e: any) => {
        const d = new Date(e.created_at);
        const wk = Math.floor((Date.now() - d.getTime()) / (7 * 24 * 60 * 60 * 1000));
        if (wk >= 0 && wk < 12) weeks.add(wk);
      });

      const ctx = (tierMilestone.context || {}) as any;
      setStats({ signals: sigCount ?? 0, posts: postCount ?? 0, weeks: weeks.size });
      const t = sigTop as any;
      setTopSignal(
        t?.signal_title
          ? { title: t.signal_title, confidence: Number(t.confidence) || 0 }
          : ctx?.top_signal_title
          ? { title: ctx.top_signal_title, confidence: 0 }
          : null
      );
      requestAnimationFrame(() => setMounted(true));
    })();
    return () => {
      cancelled = true;
    };
  }, [tierMilestone, userId]);

  if (!tierMilestone) return null;

  const copy = TIER_COPY[tierMilestone.milestone_id] || {
    name: tierMilestone.milestone_id.replace("tier_", ""),
    subtitle: "",
  };

  const close = async () => {
    setMounted(false);
    await acknowledgeMilestone(tierMilestone.id);
  };

  const onShare = async () => {
    await shareMilestone(tierMilestone.id);
    // Credential card UI is delivered in O-2c. For now, dismiss after marking shared.
    await acknowledgeMilestone(tierMilestone.id);
  };

  const node = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`You have reached ${copy.name} tier`}
      onClick={close}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        opacity: mounted ? 1 : 0,
        transition: "opacity 400ms ease-out",
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 520,
          background: "var(--surface-ink-raised, var(--paper, #1a160f))",
          color: "var(--ink, #f5efe1)",
          border: "1px solid var(--brand-line, rgba(197,165,90,0.25))",
          borderRadius: 16,
          padding: 32,
          boxShadow: "0 24px 80px rgba(0,0,0,0.55)",
          textAlign: "center",
          fontFamily: "var(--font-body, 'DM Sans', system-ui, sans-serif)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
          <TierBadge tier={copy.name} animate={mounted} />
        </div>

        <h2
          style={{
            fontFamily: "var(--font-display, 'Cormorant Garamond', serif)",
            fontSize: 28,
            lineHeight: 1.15,
            color: "var(--brand, #C5A55A)",
            margin: "0 0 12px",
          }}
        >
          You've reached {copy.name}
        </h2>

        <p
          style={{
            color: "var(--ink-muted, rgba(245,239,225,0.72))",
            fontSize: 15,
            lineHeight: 1.55,
            margin: "0 0 24px",
          }}
        >
          {copy.subtitle}
        </p>

        <StatsRow stats={stats} animate={mounted} />

        {topSignal && (
          <p
            style={{
              fontSize: 13,
              color: "var(--ink-muted, rgba(245,239,225,0.7))",
              margin: "20px 0 24px",
              lineHeight: 1.5,
            }}
          >
            Your strongest signal:{" "}
            <span style={{ color: "var(--ink, #f5efe1)" }}>{topSignal.title}</span>
            {topSignal.confidence > 0 && (
              <>
                {" "}at{" "}
                <span style={{ fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)", color: "var(--brand, #C5A55A)" }}>
                  {Math.round(topSignal.confidence * 100)}%
                </span>{" "}
                confidence
              </>
            )}
          </p>
        )}

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
          <button
            onClick={onShare}
            style={{
              flex: "1 1 200px",
              padding: "12px 18px",
              borderRadius: 8,
              background: "var(--brand, #C5A55A)",
              color: "var(--ink-on-brand, #1a160f)",
              border: "none",
              fontWeight: 600,
              fontSize: 14,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Share this credential →
          </button>
          <button
            onClick={close}
            style={{
              flex: "1 1 140px",
              padding: "12px 18px",
              borderRadius: 8,
              background: "transparent",
              color: "var(--ink, #f5efe1)",
              border: "1px solid var(--brand-line, rgba(197,165,90,0.3))",
              fontWeight: 500,
              fontSize: 14,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Continue →
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(node, document.body);
}

function TierBadge({ tier, animate }: { tier: string; animate: boolean }) {
  return (
    <div
      style={{
        position: "relative",
        width: 128,
        height: 128,
        transform: animate ? "scale(1)" : "scale(0.95)",
        transition: "transform 600ms ease-out",
      }}
    >
      <svg viewBox="0 0 128 128" width={128} height={128} aria-hidden>
        <defs>
          <radialGradient id="tier-bg" cx="50%" cy="45%" r="55%">
            <stop offset="0%" stopColor="var(--brand, #C5A55A)" stopOpacity="0.25" />
            <stop offset="100%" stopColor="var(--brand, #C5A55A)" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx="64" cy="64" r="60" fill="url(#tier-bg)" />
        <circle
          cx="64"
          cy="64"
          r="52"
          fill="none"
          stroke="var(--brand, #C5A55A)"
          strokeWidth="1.5"
          opacity="0.85"
        />
        <circle
          cx="64"
          cy="64"
          r="44"
          fill="none"
          stroke="var(--brand, #C5A55A)"
          strokeWidth="0.75"
          opacity="0.5"
        />
        <text
          x="64"
          y="72"
          textAnchor="middle"
          fontFamily="var(--font-display, 'Cormorant Garamond', serif)"
          fontSize="22"
          fill="var(--brand, #C5A55A)"
          letterSpacing="2"
        >
          {tier.toUpperCase()}
        </text>
      </svg>
    </div>
  );
}

function StatsRow({
  stats,
  animate,
}: {
  stats: { signals: number; posts: number; weeks: number } | null;
  animate: boolean;
}) {
  const s = stats ?? { signals: 0, posts: 0, weeks: 0 };
  const sig = useCountUp(s.signals, 1200, animate && !!stats);
  const post = useCountUp(s.posts, 1200, animate && !!stats);
  const wks = useCountUp(s.weeks, 1200, animate && !!stats);
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
      <StatBox value={sig} label="Active signals" />
      <StatBox value={post} label="Published posts" />
      <StatBox value={wks} label="Weeks active" />
    </div>
  );
}

function StatBox({ value, label }: { value: number; label: string }) {
  return (
    <div
      style={{
        padding: "14px 8px",
        background: "rgba(197,165,90,0.06)",
        border: "1px solid var(--brand-line, rgba(197,165,90,0.18))",
        borderRadius: 10,
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
          fontSize: 24,
          color: "var(--brand, #C5A55A)",
          lineHeight: 1,
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontSize: 11,
          marginTop: 6,
          color: "var(--ink-muted, rgba(245,239,225,0.65))",
          letterSpacing: 0.4,
        }}
      >
        {label}
      </div>
    </div>
  );
}