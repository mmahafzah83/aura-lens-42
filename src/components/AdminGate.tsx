import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

/**
 * AdminGate — single source of truth for admin-only UI access.
 *
 * Replaces scattered hardcoded-UUID checks. Calls the security-definer
 * function `public.is_current_user_admin()`, which reads the admin role
 * from `public.user_roles` via `has_role()`.
 *
 * Usage:
 *   <AdminGate><AdminPageContents /></AdminGate>
 *
 * Behavior:
 *   - Loading  → centered spinner on bone surface.
 *   - No session → redirect to /auth.
 *   - Signed in but not admin → renders an inline "Not authorized." panel.
 *   - Admin → renders children.
 *
 * NOTE: This is the auth check only. PasswordGate remains the outer
 * wrapper on existing admin routes; AdminGate is the new inner check.
 */
export default function AdminGate({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const [state, setState] = useState<"loading" | "admin" | "denied">("loading");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (cancelled) return;
      if (!session) {
        navigate("/auth", { replace: true });
        return;
      }
      const { data, error } = await supabase.rpc("is_current_user_admin");
      if (cancelled) return;
      if (error || data !== true) {
        setState("denied");
        return;
      }
      setState("admin");
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  if (state === "loading") {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: "#F2F5F9" }}
      >
        <Loader2 className="w-5 h-5 animate-spin" style={{ color: "#0670C4" }} />
      </div>
    );
  }

  if (state === "denied") {
    return (
      <div
        className="min-h-screen flex items-center justify-center px-6"
        style={{ background: "#F2F5F9" }}
      >
        <div
          className="max-w-sm w-full text-center rounded-lg px-6 py-8"
          style={{
            background: "#FFFFFF",
            border: "1px solid #E2E7EE",
            color: "#0F1519",
          }}
        >
          <div
            className="text-base"
            style={{ fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif", fontWeight: 700, color: "#0F1519" }}
          >
            Not authorized.
          </div>
          <p className="mt-2 text-sm" style={{ color: "#5B6673" }}>
            This page is restricted to administrators.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
