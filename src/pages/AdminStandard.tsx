import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import AdminShell from "@/components/admin/AdminShell";

// Guard pattern reused verbatim from src/pages/AdminDesignSystem.tsx
const ADMIN_USER_ID = "9e0c6ee1-6562-4fdc-89ba-d62b39f02bb3";

/**
 * /admin/standard — read-only host for the Aura Standard V2.0 constitution.
 * The HTML is served byte-faithfully from public/admin/aura-standard-v2.html
 * inside an iframe so its own CSS, fonts, and theme are fully isolated from
 * the app's design system (Standard §15 — light canonical, derived).
 */
export default function AdminStandard() {
  const navigate = useNavigate();
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (cancelled) return;
      if (!session) {
        navigate("/auth", { replace: true });
        return;
      }
      if (session.user.id !== ADMIN_USER_ID) {
        navigate("/home", { replace: true });
        return;
      }
      setAuthChecked(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  if (!authChecked) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ backgroundColor: "var(--ink)" }}
      >
        <Loader2 className="w-5 h-5 animate-spin" style={{ color: "var(--brand)" }} />
      </div>
    );
  }

  return (
    <AdminShell bleed>
      <iframe
        title="The Aura Standard V2.0"
        src="/admin/aura-standard-v2.html"
        style={{
          display: "block",
          width: "100%",
          height: "calc(100vh - 60px)",
          border: 0,
          background: "var(--paper)",
        }}
      />
    </AdminShell>
  );
}