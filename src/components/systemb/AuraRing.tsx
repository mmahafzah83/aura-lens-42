import React, { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * AuraRing — wraps an avatar and draws the user's Imprint as a conic arc.
 *
 * Truth law: the arc only exists if an imprint_snapshots row exists. No row →
 * the avatar renders bare. A zero-ring would read as "score 0", which is a
 * different claim from "not measured yet".
 */

interface AuraRingProps {
  userId?: string | null;
  /** Avatar box size in px. Ring adds 8px (2px ring + 2px gap, both sides). */
  size?: number;
  children: React.ReactNode;
  /** Gap colour between ring and avatar — match the host surface. */
  gap?: string;
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

const AuraRing: React.FC<AuraRingProps> = ({ userId, size = 34, children, gap = "var(--surface-card)" }) => {
  const [imprint, setImprint] = useState<number | null>(null);
  const [sweep, setSweep] = useState(0);
  const rafRef = useRef(0);

  useEffect(() => {
    if (!userId) { setImprint(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase
          .from("imprint_snapshots")
          .select("imprint")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(1);
        if (cancelled) return;
        const v = ((data as any[]) || [])[0]?.imprint;
        setImprint(typeof v === "number" ? Math.max(0, Math.min(100, Math.round(v))) : null);
      } catch { if (!cancelled) setImprint(null); }
    })();
    return () => { cancelled = true; };
  }, [userId]);

  useEffect(() => {
    if (imprint == null) { setSweep(0); return; }
    if (prefersReducedMotion()) { setSweep(imprint); return; }
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 400);
      const e = 1 - Math.pow(1 - t, 3);
      setSweep(imprint * e);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [imprint]);

  // No measurement → no ring. Never a zero-ring, never a fake value.
  if (imprint == null) return <>{children}</>;

  const outer = size + 8;
  return (
    <span
      data-testid="aura-ring"
      aria-label={`Imprint ${imprint} of 100`}
      style={{
        width: outer, height: outer, borderRadius: 999, flexShrink: 0,
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        background: `conic-gradient(var(--act) 0 ${sweep}%, var(--rule-outer) ${sweep}% 100%)`,
      }}
    >
      <span
        aria-hidden
        style={{
          width: outer - 4, height: outer - 4, borderRadius: 999,
          background: gap,
          display: "inline-flex", alignItems: "center", justifyContent: "center",
        }}
      >
        {children}
      </span>
    </span>
  );
};

export default AuraRing;
