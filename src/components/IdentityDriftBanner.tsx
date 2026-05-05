import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Compass, X } from "lucide-react";
import type { DriftResult } from "@/lib/identityDriftCheck";
import { __DRIFT_KEYS } from "@/lib/identityDriftCheck";

/**
 * Listens for `aura:identity-drift` events and renders a persistent banner
 * suggesting the user reviews their positioning. Dismissal is session-scoped.
 */
export default function IdentityDriftBanner() {
  const navigate = useNavigate();
  const [drift, setDrift] = useState<DriftResult | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<DriftResult>).detail;
      if (detail) setDrift(detail);
    };
    window.addEventListener("aura:identity-drift", handler as EventListener);
    return () => window.removeEventListener("aura:identity-drift", handler as EventListener);
  }, []);

  if (!drift) return null;

  const dismiss = () => {
    sessionStorage.setItem(__DRIFT_KEYS.DISMISSED_KEY, new Date().toISOString());
    setDrift(null);
  };

  const review = () => {
    sessionStorage.setItem(__DRIFT_KEYS.DISMISSED_KEY, new Date().toISOString());
    setDrift(null);
    navigate("/mystory#market-position");
  };

  return (
    <div
      role="status"
      style={{
        position: "relative",
        border: "1px solid hsl(var(--brand-bronze, 39 38% 56%) / 0.5)",
        background: "hsl(var(--brand-bronze, 39 38% 56%) / 0.06)",
        borderRadius: 12,
        padding: "16px 20px",
        marginBottom: 16,
        display: "flex",
        gap: 14,
        alignItems: "flex-start",
      }}
    >
      <Compass size={22} style={{ color: "hsl(var(--brand-bronze, 39 38% 56%))", flexShrink: 0, marginTop: 2 }} />
      <div style={{ flex: 1 }}>
        <div
          style={{
            fontSize: 11,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "hsl(var(--brand-bronze, 39 38% 56%))",
            fontWeight: 600,
            marginBottom: 6,
          }}
        >
          Your intelligence is revealing something
        </div>
        <div style={{ fontSize: 14, lineHeight: 1.5, color: "hsl(var(--foreground))", marginBottom: 12 }}>
          {drift.driftPercentage}% of your recent captures are in &ldquo;{drift.dominantTopic}&rdquo; — a territory not in your current positioning pillars.
          <br />
          <span style={{ opacity: 0.8 }}>Your intelligence is sharper than your brand. Want to review your positioning?</span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={review}
            style={{
              fontSize: 13,
              padding: "6px 14px",
              borderRadius: 8,
              border: "1px solid hsl(var(--brand-bronze, 39 38% 56%))",
              background: "hsl(var(--brand-bronze, 39 38% 56%))",
              color: "hsl(var(--background))",
              cursor: "pointer",
              fontWeight: 500,
            }}
          >
            Review My Story →
          </button>
          <button
            onClick={dismiss}
            style={{
              fontSize: 13,
              padding: "6px 14px",
              borderRadius: 8,
              border: "1px solid hsl(var(--border))",
              background: "transparent",
              color: "hsl(var(--muted-foreground))",
              cursor: "pointer",
            }}
          >
            Dismiss
          </button>
        </div>
      </div>
      <button
        aria-label="Dismiss"
        onClick={dismiss}
        style={{
          background: "transparent",
          border: "none",
          color: "hsl(var(--muted-foreground))",
          cursor: "pointer",
          padding: 4,
          flexShrink: 0,
        }}
      >
        <X size={16} />
      </button>
    </div>
  );
}