import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate, Link } from "react-router-dom";
import { Loader2, Radio, PenLine, TrendingUp, Eye, EyeOff } from "lucide-react";
import AuraLogo from "@/components/brand/AuraLogo";
import { useToast } from "@/hooks/use-toast";

const Auth = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const navigate = useNavigate();
  const { toast } = useToast();

  // Password recovery state
  const [showNewPasswordForm, setShowNewPasswordForm] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordConfirm, setNewPasswordConfirm] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [updatingPwd, setUpdatingPwd] = useState(false);
  const inRecoveryRef = useRef(false);

  const checkOnboardingAndRedirect = async (session: any) => {
    const { data: profile } = await supabase
      .from("diagnostic_profiles")
      .select("onboarding_completed")
      .eq("user_id", session.user.id)
      .maybeSingle();
    // No profile row → go to /home where the onboarding wizard (G1) will trigger.
    if (!profile) {
      navigate("/home");
      return;
    }
    if (!(profile as any).onboarding_completed) {
      navigate("/onboarding");
    } else {
      navigate("/home");
    }
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") {
        inRecoveryRef.current = true;
        setShowNewPasswordForm(true);
        return;
      }
      if (inRecoveryRef.current) return;
      if (session) checkOnboardingAndRedirect(session);
    });
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (inRecoveryRef.current) return;
      if (session) checkOnboardingAndRedirect(session);
    });
    return () => subscription.unsubscribe();
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      toast({
        title: "Sign in failed",
        description:
          "Email or password incorrect. If this is your first time, try Forgot Password to set up your account.",
        variant: "destructive",
      });
    }
    setLoading(false);
  };

  const handleGoogle = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/home` },
    });
    if (error) {
      toast({ title: "Google sign-in unavailable", description: error.message, variant: "destructive" });
    }
  };

  const handleForgotPassword = async () => {
    setEmailError(null);
    if (!email || !email.includes("@")) {
      setEmailError("Enter your email first");
      return;
    }
    setResetting(true);
    try {
      await supabase.functions.invoke("send-password-reset", {
        body: { email: email.trim().toLowerCase() },
      });
      toast({
        title: "Check your email",
        description: "If this email has an account, you'll receive a reset link shortly.",
      });
    } catch (e: any) {
      toast({ title: "Couldn't send reset", description: "Please try again.", variant: "destructive" });
    } finally {
      setResetting(false);
    }
  };

  const handleResetPassword = async () => {
    if (newPassword.length < 8) {
      toast({ title: "Password too short", description: "Must be at least 8 characters", variant: "destructive" });
      return;
    }
    if (newPassword !== newPasswordConfirm) {
      toast({ title: "Passwords don't match", variant: "destructive" });
      return;
    }
    setUpdatingPwd(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
        data: { password_set: true },
      });
      if (error) throw error;
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user?.email) {
          await supabase.functions.invoke("send-account-notification", {
            body: { type: "password_changed", email: user.email, first_name: null },
          });
        }
      } catch (e) {
        console.warn("password_changed notification failed:", e);
      }
      toast({ title: "Password updated", description: "Welcome back." });
      inRecoveryRef.current = false;
      setShowNewPasswordForm(false);
      navigate("/home");
    } catch (e: any) {
      toast({ title: "Couldn't update password", description: e?.message || "Please try again.", variant: "destructive" });
    } finally {
      setUpdatingPwd(false);
    }
  };

  return (
    <div className="min-h-screen flex" style={{ backgroundColor: "var(--ink)", fontFamily: "'DM Sans', sans-serif" }}>
      {/* Scoped style overrides to defeat global input styles + autofill */}
      <style>{`
        .auth-input {
          background-color: var(--surface-ink-subtle) !important;
          border: 0.5px solid var(--ink-3) !important;
          color: var(--ink-7) !important;
          border-radius: 10px !important;
          padding: 12px 14px !important;
          width: 100%;
          font-size: 13px;
          line-height: 1.4;
          outline: none;
          font-family: 'DM Sans', sans-serif;
          transition: border-color 0.15s ease, box-shadow 0.15s ease;
        }
        .auth-input::placeholder {
          color: var(--ink-4) !important;
          opacity: 1;
        }
        .auth-input:focus {
          border-color: var(--brand) !important;
          box-shadow: 0 0 0 3px var(--brand-muted) !important;
        }
        /* Defeat browser autofill white background */
        .auth-input:-webkit-autofill,
        .auth-input:-webkit-autofill:hover,
        .auth-input:-webkit-autofill:focus,
        .auth-input:-webkit-autofill:active {
          -webkit-box-shadow: 0 0 0 1000px var(--surface-ink-subtle) inset !important;
          -webkit-text-fill-color: var(--ink-7) !important;
          caret-color: var(--ink-7) !important;
          transition: background-color 9999s ease-in-out 0s;
        }
        .auth-headline {
          color: #ffffff !important;
          font-family: 'Cormorant Garamond', Georgia, serif !important;
          font-weight: 400 !important;
          font-size: 34px !important;
          letter-spacing: -0.02em !important;
          line-height: 1.15 !important;
          opacity: 1 !important;
          text-shadow: none !important;
          background: none !important;
          -webkit-text-fill-color: #ffffff !important;
        }
        .auth-headline em {
          font-style: italic;
          color: var(--brand);
          -webkit-text-fill-color: var(--brand);
        }
        .auth-sublabel {
          font-family: 'DM Sans', sans-serif;
          font-size: 13px;
          color: var(--ink-5);
          font-weight: 300;
          line-height: 1.6;
          margin-bottom: 28px;
        }
        .auth-tagline {
          color: var(--ink-7) !important;
          opacity: 1 !important;
          font-size: 24px !important;
          font-weight: 400 !important;
          text-align: center !important;
          font-family: 'Cormorant Garamond', Georgia, serif !important;
          line-height: 1.35 !important;
          letter-spacing: -0.01em !important;
          background: none !important;
          -webkit-text-fill-color: var(--ink-7) !important;
        }
        .auth-feature-title {
          color: var(--ink-7) !important;
          font-weight: 600 !important;
          font-size: 13px !important;
          font-family: 'DM Sans', sans-serif !important;
          margin-bottom: 2px !important;
          opacity: 1 !important;
        }
        .auth-feature-desc {
          color: var(--ink-5) !important;
          font-size: 12px !important;
          font-weight: 300 !important;
          line-height: 1.5 !important;
          font-family: 'DM Sans', sans-serif !important;
          opacity: 1 !important;
        }
        .auth-label {
          color: #6B6866 !important;
          font-size: 11px !important;
          font-weight: 600 !important;
          letter-spacing: 0.06em !important;
          font-family: 'DM Sans', sans-serif !important;
          display: block;
          margin-bottom: 6px;
          opacity: 1 !important;
        }
        .auth-submit {
          background: var(--brand);
          color: #ffffff;
          border: none;
          border-radius: 10px;
          padding: 13px;
          font-family: 'DM Sans', sans-serif;
          font-size: 14px;
          font-weight: 600;
          width: 100%;
          cursor: pointer;
          letter-spacing: -0.01em;
          transition: background-color 0.15s ease;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }
        .auth-submit:hover:not(:disabled) { background: var(--brand-hover); }
        .auth-submit:disabled { opacity: 0.6; cursor: not-allowed; }
        .auth-google {
          background: #ffffff;
          color: var(--ink);
          border: none;
          border-radius: 10px;
          padding: 12px;
          font-family: 'DM Sans', sans-serif;
          font-size: 13px;
          font-weight: 500;
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          cursor: pointer;
          transition: opacity 0.15s ease;
        }
        .auth-google:hover { opacity: 0.92; }
        .auth-divider-line { height: 0.5px; background: var(--ink-3); flex: 1; }
        .auth-divider-text { font-size: 11px; color: var(--ink-4); font-family: 'DM Sans', sans-serif; }
        .auth-wordmark {
          font-family: 'Cormorant Garamond', Georgia, serif;
          font-weight: 500;
          font-size: 22px;
          color: #ffffff;
          letter-spacing: 0.04em;
          line-height: 1;
        }
        .auth-wordmark-sub {
          font-size: 9px;
          font-weight: 600;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--ink-4);
          font-family: 'DM Sans', sans-serif;
          margin-top: 4px;
        }
        .auth-beta-pill {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          background: var(--brand-muted);
          border: 0.5px solid var(--bronze-line);
          border-radius: 20px;
          padding: 4px 12px;
          font-size: 10px;
          font-weight: 600;
          color: var(--brand);
          letter-spacing: 0.06em;
          font-family: 'DM Sans', sans-serif;
        }
        .auth-beta-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--brand); }
        .auth-link { font-size: 12px; color: var(--ink-4); font-family: 'DM Sans', sans-serif; }
        .auth-link-orange { color: var(--brand); font-weight: 500; }
        .auth-brand-large {
          display: flex;
          justify-content: center;
        }
        .auth-feature-icon {
          width: 36px;
          height: 36px;
          border-radius: 10px;
          background: var(--surface-ink-subtle);
          border: 0.5px solid var(--ink-3);
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .auth-footer-note {
          font-size: 10px;
          color: #3A3836;
          text-align: center;
          font-family: 'DM Sans', sans-serif;
        }
      `}</style>

      {/* LEFT — auth form */}
      <div
        className="w-full md:w-[40%] min-h-screen flex items-center justify-center px-6 py-10"
        style={{ backgroundColor: "var(--ink)" }}
      >
        <div className="w-full max-w-sm">
          {/* Logo */}
          <div className="flex items-center gap-3 mb-2">
            <AuraLogo size={40} variant="dark" withWordmark />
            <div className="auth-wordmark-sub" style={{ marginTop: 0 }}>Strategic Intelligence</div>
          </div>

          {/* Beta pill */}
          <div className="auth-beta-pill mt-5 mb-6">
            <span className="auth-beta-dot" />
            CLOSED BETA
          </div>

          {/* Headline */}
          <h1 className="auth-headline mb-2">
            Welcome <em>back</em>
          </h1>
          <p className="auth-sublabel">
            Sign in. Every session builds your authority.
          </p>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div
              style={{
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 12.5,
                lineHeight: 1.55,
                color: "var(--ink-5)",
                background: "var(--brand-muted)",
                border: "0.5px solid var(--bronze-line)",
                borderRadius: 10,
                padding: "10px 12px",
              }}
            >
              Use the email and password from your invitation. First time?
              Use <span style={{ color: "var(--brand)", fontWeight: 600 }}>Forgot Password</span> below to set your password.
            </div>
            <div>
              <label htmlFor="email" className="auth-label">
                EMAIL
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setEmailError(null); }}
                required
                placeholder="your@email.com"
                className="auth-input"
              />
              {emailError && (
                <p className="mt-1.5 text-xs" style={{ color: "var(--danger)" }}>{emailError}</p>
              )}
            </div>

            <div>
              <label htmlFor="password" className="auth-label">
                PASSWORD
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                placeholder="••••••••"
                className="auth-input"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="auth-submit"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              Sign in →
            </button>

            {/* Divider */}
            <div className="flex items-center gap-3 py-1">
              <div className="auth-divider-line" />
              <span className="auth-divider-text">or</span>
              <div className="auth-divider-line" />
            </div>

            <button
              type="button"
              onClick={handleGoogle}
              className="auth-google"
            >
              <svg width="16" height="16" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Continue with Google
            </button>

            <div className="pt-1 text-center">
              <button
                type="button"
                onClick={handleForgotPassword}
                disabled={resetting}
                className="hover:underline disabled:opacity-50"
                style={{
                  color: "var(--brand)",
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: 14,
                  fontWeight: 600,
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: "4px 8px",
                }}
              >
                {resetting ? "Sending…" : "Forgot password?"}
              </button>
            </div>
          </form>

          {/* Bottom link */}
          <p className="mt-8 auth-link">
            Don't have access?{" "}
            <Link to="/request-access" className="auth-link auth-link-orange hover:underline">
              Request early access →
            </Link>
          </p>
        </div>
      </div>

      {/* RIGHT — brand panel (hidden on mobile) */}
      <div
        className="hidden md:flex md:w-[60%] min-h-screen relative items-center justify-center px-12"
        style={{ backgroundColor: "var(--surface-ink-subtle, #1C1812)" }}
      >
        {/* Centered radial glow */}
        <div
          className="pointer-events-none"
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: 400,
            height: 400,
            background:
              "radial-gradient(circle, hsl(43 50% 55% / 0.08) 0%, transparent 65%)",
            zIndex: 0,
          }}
        />

        <div className="max-w-md text-center" style={{ position: "relative", zIndex: 1 }}>
          <div className="auth-brand-large">
            <AuraLogo size={60} variant="dark" />
          </div>
          <p className="auth-tagline mt-6">
            Your expertise is invisible. Aura fixes that.
          </p>

          <div className="mx-auto my-8" style={{ width: 40, height: 2, backgroundColor: "var(--brand)", opacity: 0.5 }} />

          <div className="space-y-6 text-left">
            <FeatureRow
              icon={<Radio className="w-4 h-4" style={{ color: "var(--brand)" }} />}
              title="Signal intelligence"
              desc="Converts what you read into ranked market signals"
            />
            <FeatureRow
              icon={<PenLine className="w-4 h-4" style={{ color: "var(--brand)" }} />}
              title="Flash content"
              desc="LinkedIn posts in your voice, English or Arabic, in minutes"
            />
            <FeatureRow
              icon={<TrendingUp className="w-4 h-4" style={{ color: "var(--brand)" }} />}
              title="Authority score"
              desc="Tracks how your visibility compounds over time"
            />
          </div>
        </div>

        <div className="absolute bottom-6 left-0 right-0 auth-footer-note" style={{ zIndex: 1 }}>
          Closed beta · GCC senior professionals · 2026
        </div>
      </div>
    </div>
  );
};

const FeatureRow = ({
  icon,
  title,
  desc,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
}) => (
  <div className="flex items-start gap-3">
    <div className="auth-feature-icon">
      {icon}
    </div>
    <div>
      <div className="auth-feature-title">{title}</div>
      <div className="auth-feature-desc">{desc}</div>
    </div>
  </div>
);

export default Auth;
