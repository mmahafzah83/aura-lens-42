import { useEffect, useState } from "react";
import { AuraCard } from "@/components/ui/AuraCard";
import { AuraButton } from "@/components/ui/AuraButton";
import { X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface FirstLoginWelcomeProps {
  firstName?: string | null;
  onOpenGuide: () => void;
  onDismiss: () => void;
}

export function FirstLoginWelcome({ firstName: firstNameProp, onOpenGuide, onDismiss }: FirstLoginWelcomeProps) {
  const [visible, setVisible] = useState(false);
  const [fetchedName, setFetchedName] = useState<string | null>(null);

  useEffect(() => {
    try {
      if (!localStorage.getItem("aura_welcome_briefing_done")) {
        setVisible(true);
      }
    } catch {
      // localStorage blocked — skip
    }
  }, []);

  useEffect(() => {
    async function loadName() {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) return;

      const { data: profile } = await supabase
        .from("diagnostic_profiles")
        .select("first_name")
        .eq("user_id", user.id)
        .single();

      if (profile?.first_name) {
        setFetchedName(profile.first_name);
        return;
      }

      const metaName = user.user_metadata?.first_name as string | undefined;
      if (metaName) {
        setFetchedName(metaName);
      }
    }

    if (!firstNameProp) {
      loadName();
    }
  }, [firstNameProp]);

  if (!visible) return null;

  const firstName = firstNameProp || fetchedName;

  const handleExplore = () => {
    try { localStorage.setItem("aura_welcome_briefing_done", "1"); } catch {}
    setVisible(false);
    onOpenGuide();
    onDismiss();
  };

  const handleDismiss = () => {
    try { localStorage.setItem("aura_welcome_briefing_done", "1"); } catch {}
    setVisible(false);
    onDismiss();
  };

  return (
    <div style={{ marginBottom: 20, animation: "fade-in 400ms ease" }}>
      <AuraCard hover="none">
        <div style={{ position: "relative", padding: "4px 2px" }}>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={handleDismiss}
            style={{
              position: "absolute",
              top: -8,
              right: -8,
              background: "none",
              border: "none",
              color: "var(--ink-3)",
              cursor: "pointer",
              padding: 4,
              lineHeight: 1,
            }}
          >
            <X size={16} />
          </button>

          <h2
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 22,
              fontWeight: 500,
              color: "var(--ink)",
              margin: "0 0 10px",
              lineHeight: 1.3,
            }}
          >
            {firstName ? `Welcome, ${firstName}.` : "Welcome."}
          </h2>

          <p
            style={{
              fontSize: 14,
              lineHeight: 1.6,
              color: "var(--ink-3)",
              margin: "0 0 16px",
              maxWidth: 520,
            }}
          >
            Aura turns your expertise into presence. It helps you share your thinking with your market, without adding work to your week. The steps below are the best place to start.
          </p>

          <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
            <AuraButton variant="primary" size="sm" onClick={handleExplore}>
              Explore the Guide
            </AuraButton>
            <button
              type="button"
              onClick={handleDismiss}
              style={{
                background: "none",
                border: "none",
                color: "var(--ink-3)",
                fontSize: 13,
                fontWeight: 500,
                cursor: "pointer",
                padding: 0,
              }}
            >
              Got it
            </button>
          </div>
        </div>
      </AuraCard>
    </div>
  );
}

export default FirstLoginWelcome;
