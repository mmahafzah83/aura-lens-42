import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

const LinkedInCallback = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<"processing" | "syncing" | "success" | "error">("processing");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    const handleCallback = async () => {
      const returnTo = sessionStorage.getItem("aura_li_return");
      // When onboarding opened this in a popup, the answer goes back through
      // postMessage — the member never leaves the flow they were in.
      const popup = typeof window !== "undefined" && !!window.opener && window.name === "aura_li_oauth";
      const tellOpener = (ok: boolean, message?: string) => {
        if (!popup) return false;
        try {
          window.opener.postMessage({ source: "aura-linkedin-oauth", ok, message }, window.location.origin);
        } catch { /* the opener may be gone */ }
        window.setTimeout(() => { try { window.close(); } catch { /* ignore */ } }, 600);
        return true;
      };
      const goBack = (fallback: string) => {
        if (returnTo) {
          try { sessionStorage.removeItem("aura_li_return"); } catch {}
          navigate(returnTo);
        } else {
          navigate(fallback);
        }
      };
      const code = searchParams.get("code");
      const error = searchParams.get("error");
      const errorDescription = searchParams.get("error_description");

      if (error) {
        const messages: Record<string, string> = {
          user_cancelled_login: "You cancelled the LinkedIn login.",
          user_cancelled_authorize: "You cancelled LinkedIn authorization.",
          access_denied: "LinkedIn access was denied.",
        };
        setErrorMsg(messages[error] || errorDescription || `LinkedIn error: ${error}`);
        setStatus("error");
        if (tellOpener(false, messages[error] || errorDescription || "LinkedIn didn't complete.")) return;
        setTimeout(() => goBack("/dashboard?tab=influence"), 3000);
        return;
      }

      if (!code) {
        setErrorMsg("No authorization code received from LinkedIn.");
        setStatus("error");
        if (tellOpener(false, "LinkedIn didn't send anything back.")) return;
        setTimeout(() => goBack("/dashboard?tab=influence"), 3000);
        return;
      }

      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          // LinkedIn's grant is stored against an account. Without one there is
          // nowhere safe to keep it — say that plainly instead of "failed".
          const msg = "Save your report first — LinkedIn connects to your account. Aura reads your public posts either way.";
          setErrorMsg(msg);
          setStatus("error");
          if (tellOpener(false, msg)) return;
          setTimeout(() => goBack("/onboarding"), 3500);
          return;
        }

        // Exchange code via edge function
        const { data, error: fnError } = await supabase.functions.invoke("linkedin-oauth-callback", {
          body: {
            code,
            redirect_uri: `${window.location.origin}/api/auth/linkedin/callback`,
          },
        });

        if (fnError || !data?.success) {
          const msg = data?.error || fnError?.message || "Couldn't exchange LinkedIn token.";
          if (msg.includes("redirect_uri")) {
            setErrorMsg("Redirect URI mismatch. Please check your LinkedIn app settings.");
          } else if (msg.includes("scope")) {
            setErrorMsg("Missing required LinkedIn permissions. Please try again.");
          } else {
            setErrorMsg(msg);
          }
          setStatus("error");
          if (tellOpener(false, msg)) return;
          setTimeout(() => goBack("/dashboard?tab=influence"), 4000);
          return;
        }

        // ── Fire first sync immediately so Analytics is alive on day one ──
        // Fire-and-forget both syncs with the current user's JWT (scope:"me").
        // We do NOT use the stale linkedin-sync function.
        setStatus("syncing");
        try {
          supabase.functions
            .invoke("linkedin-metrics-sync", { body: { scope: "me" } })
            .catch((e) => console.warn("linkedin-metrics-sync (bg) failed:", e));
          supabase.functions
            .invoke("linkedin-post-metrics-sync", { body: { scope: "me" } })
            .catch((e) => console.warn("linkedin-post-metrics-sync (bg) failed:", e));
          toast.message("Syncing your LinkedIn analytics…", {
            description: "This runs in the background. Analytics will populate shortly.",
          });
        } catch (syncErr) {
          console.warn("First sync dispatch failed (non-blocking):", syncErr);
        }

        setStatus("success");
        if (tellOpener(true)) return;
        setTimeout(() => goBack("/dashboard?tab=influence"), 1500);
      } catch (err: any) {
        setErrorMsg(err.message || "An unexpected error occurred.");
        setStatus("error");
        if (tellOpener(false, err?.message)) return;
        setTimeout(() => goBack("/dashboard?tab=influence"), 4000);
      }
    };

    handleCallback();
  }, [searchParams, navigate]);

  return (
    <div className="story-page min-h-screen bg-background flex items-center justify-center">
      <div className="text-center max-w-md space-y-4">
        {status === "processing" && (
          <>
            <Loader2 className="w-10 h-10 animate-spin text-primary mx-auto" />
            <h2 className="text-xl font-semibold text-foreground">Connecting LinkedIn...</h2>
            <p className="text-sm text-muted-foreground">Exchanging authorization code</p>
          </>
        )}
        {status === "syncing" && (
          <>
            <Loader2 className="w-10 h-10 animate-spin text-primary mx-auto" />
            <h2 className="text-xl font-semibold text-foreground">Syncing Analytics...</h2>
            <p className="text-sm text-muted-foreground">Running first analytics sync with AI classification</p>
          </>
        )}
        {status === "success" && (
          <>
            <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" />
            <h2 className="text-xl font-semibold text-foreground">LinkedIn Connected & Synced</h2>
            <p className="text-sm text-muted-foreground">Redirecting to Influence dashboard...</p>
          </>
        )}
        {status === "error" && (
          <>
            <AlertCircle className="w-10 h-10 text-destructive mx-auto" />
            <h2 className="text-xl font-semibold text-foreground">Connection Failed</h2>
            <p className="text-sm text-muted-foreground">{errorMsg}</p>
            <p className="text-xs text-muted-foreground/50">Redirecting back...</p>
          </>
        )}
      </div>
    </div>
  );
};

export default LinkedInCallback;
