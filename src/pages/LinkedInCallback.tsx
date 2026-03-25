import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, AlertCircle, CheckCircle2 } from "lucide-react";

const LinkedInCallback = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<"processing" | "success" | "error">("processing");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    const handleCallback = async () => {
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
        setTimeout(() => navigate("/dashboard?tab=influence"), 3000);
        return;
      }

      if (!code) {
        setErrorMsg("No authorization code received from LinkedIn.");
        setStatus("error");
        setTimeout(() => navigate("/dashboard?tab=influence"), 3000);
        return;
      }

      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          setErrorMsg("You must be logged in to connect LinkedIn.");
          setStatus("error");
          setTimeout(() => navigate("/auth"), 3000);
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
          const msg = data?.error || fnError?.message || "Failed to exchange LinkedIn token.";
          if (msg.includes("redirect_uri")) {
            setErrorMsg("Redirect URI mismatch. Please check your LinkedIn app settings.");
          } else if (msg.includes("scope")) {
            setErrorMsg("Missing required LinkedIn permissions. Please try again.");
          } else {
            setErrorMsg(msg);
          }
          setStatus("error");
          setTimeout(() => navigate("/dashboard?tab=influence"), 4000);
          return;
        }

        setStatus("success");
        setTimeout(() => navigate("/dashboard?tab=influence"), 1500);
      } catch (err: any) {
        setErrorMsg(err.message || "An unexpected error occurred.");
        setStatus("error");
        setTimeout(() => navigate("/dashboard?tab=influence"), 4000);
      }
    };

    handleCallback();
  }, [searchParams, navigate]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center max-w-md space-y-4">
        {status === "processing" && (
          <>
            <Loader2 className="w-10 h-10 animate-spin text-primary mx-auto" />
            <h2 className="text-xl font-semibold text-foreground">Connecting LinkedIn...</h2>
            <p className="text-sm text-muted-foreground">Exchanging authorization code</p>
          </>
        )}
        {status === "success" && (
          <>
            <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" />
            <h2 className="text-xl font-semibold text-foreground">LinkedIn Connected</h2>
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
