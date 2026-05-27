import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import ObjectiveAuditModal from "@/components/ObjectiveAuditModal";

const DISMISS_KEY = "aura_audit_cta_dismissed";
const COUNT_KEY = "aura_audit_cta_dismiss_count";
const TIMESTAMP_KEY = "aura_audit_cta_dismiss_ts";
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;

interface AuditCtaCardProps {
  onNavigateToMyStory?: () => void;
}

const AuditCtaCard = ({ onNavigateToMyStory }: AuditCtaCardProps) => {
  const [visible, setVisible] = useState(false);
  const [open, setOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const evaluate = async () => {
    try {
      // Permanent dismissal
      if (localStorage.getItem(DISMISS_KEY) === "true") return false;
      const count = parseInt(localStorage.getItem(COUNT_KEY) || "0", 10);
      if (count >= 3) {
        localStorage.setItem(DISMISS_KEY, "true");
        return false;
      }
      // Snoozed 7-day window
      const ts = parseInt(localStorage.getItem(TIMESTAMP_KEY) || "0", 10);
      if (ts && Date.now() - ts < SEVEN_DAYS_MS) return false;

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return false;
      const { data } = await (supabase.from("diagnostic_profiles" as any) as any)
        .select("audit_method, created_at")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!data) return false;
      if (data.audit_method !== "self_calibration") return false;
      // Within 14 days of onboarding (using created_at as proxy)
      const createdAt = data.created_at ? new Date(data.created_at).getTime() : 0;
      if (createdAt && Date.now() - createdAt > FOURTEEN_DAYS_MS) return false;
      return true;
    } catch {
      return false;
    }
  };

  useEffect(() => {
    (async () => {
      const show = await evaluate();
      setVisible(show);
    })();
  }, []);

  const handleLater = () => {
    try {
      const count = parseInt(localStorage.getItem(COUNT_KEY) || "0", 10) + 1;
      localStorage.setItem(COUNT_KEY, String(count));
      localStorage.setItem(TIMESTAMP_KEY, String(Date.now()));
      if (count >= 3) localStorage.setItem(DISMISS_KEY, "true");
    } catch { /* ignore */ }
    setLeaving(true);
    window.setTimeout(() => setVisible(false), 250);
  };

  const handleComplete = () => {
    // Permanently hide once audit is completed
    try { localStorage.setItem(DISMISS_KEY, "true"); } catch { /* ignore */ }
    setVisible(false);
    toast.success("Your capabilities are now evidence-verified. Your positioning is upgrading.", {
      duration: 5000,
      action: onNavigateToMyStory
        ? { label: "View your updated profile →", onClick: () => onNavigateToMyStory() }
        : undefined,
    });
  };

  if (!visible) return null;

  return (
    <>
      <div
        role="region"
        aria-label="Sharpen your Capability Map"
        style={{
          background: "var(--brand-ghost, rgba(197,165,90,0.06))",
          borderLeft: "4px solid var(--brand)",
          borderRadius: 10,
          padding: "18px 22px",
          opacity: leaving ? 0 : 1,
          transform: leaving ? "translateY(-8px)" : "translateY(0)",
          transition: "opacity 250ms ease, transform 250ms ease",
        }}
      >
        <h3
          style={{
            fontFamily: "'Cormorant Garamond', Georgia, serif",
            fontSize: 20,
            fontWeight: 600,
            lineHeight: 1.25,
            color: "hsl(var(--foreground))",
            margin: "0 0 8px",
          }}
        >
          Sharpen your Capability Map
        </h3>
        <p
          style={{
            fontFamily: "'DM Sans', system-ui, sans-serif",
            fontSize: 14,
            lineHeight: 1.6,
            color: "hsl(var(--muted-foreground))",
            margin: "0 0 14px",
          }}
        >
          You rated your 10 capabilities during setup. Verify them with evidence — 30 questions, 5 minutes. Your radar will upgrade and your positioning will sharpen.
        </p>
        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => setOpen(true)}
            style={{
              background: "var(--brand)",
              color: "var(--ink-on-brand, #1a160f)",
              border: 0,
              borderRadius: 8,
              padding: "9px 16px",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "'DM Sans', system-ui, sans-serif",
            }}
          >
            Verify now →
          </button>
          <button
            type="button"
            onClick={handleLater}
            style={{
              background: "transparent",
              border: 0,
              color: "hsl(var(--muted-foreground))",
              fontSize: 13,
              cursor: "pointer",
              padding: "8px 4px",
              fontFamily: "'DM Sans', system-ui, sans-serif",
            }}
          >
            Later
          </button>
        </div>
      </div>
      <ObjectiveAuditModal
        open={open}
        onOpenChange={setOpen}
        onComplete={handleComplete}
      />
    </>
  );
};

export default AuditCtaCard;