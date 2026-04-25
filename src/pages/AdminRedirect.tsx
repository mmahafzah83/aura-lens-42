import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

const ADMIN_USER_ID = "9e0c6ee1-6562-4fdc-89ba-d62b39f02bb3";

const AdminRedirect = () => {
  const navigate = useNavigate();

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
      navigate("/settings", { replace: true });
      // After navigation, scroll the section into view
      const tryScroll = (attempt = 0) => {
        const el = document.getElementById("beta-admin-section");
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "start" });
        } else if (attempt < 20) {
          setTimeout(() => tryScroll(attempt + 1), 250);
        }
      };
      setTimeout(() => tryScroll(), 300);
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  return null;
};

export default AdminRedirect;