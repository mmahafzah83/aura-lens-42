import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate, Link } from "react-router-dom";
import { Loader2, Radio, PenLine, TrendingUp, Eye, EyeOff } from "lucide-react";
import AuraLogo from "@/components/brand/AuraLogo";
import { useToast } from "@/hooks/use-toast";
import usePageMeta from "@/hooks/usePageMeta";
import PublicFooter from "@/components/PublicFooter";

const Auth = () => {
  usePageMeta({
    title: "Aura — Sign in",
    description: "Sign in to Aura to access your strategic intelligence dashboard, signals, and content tools.",
    path: "/auth",
  });
  const [email, setEmail] = useState(() => {
    if (typeof window === "undefined") return "";
    try {
      const p = new URLSearchParams(window.location.search);
      return p.get("email") ?? "";
    } catch { return ""; }
  });
  const [hasEmailParam] = useState(() => {
    if (typeof window === "undefined") return false;
    try { return !!new URLSearchParams(window.location.search).get("email"); }
    catch { return false; }
  });
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [showLoginPwd, setShowLoginPwd] = useState(false);
  const [loginFailed, setLoginFailed] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [resetSentEmail, setResetSentEmail] = useState<string>("");
  const [resending, setResending] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  // Password recovery state
  const [showNewPasswordForm, setShowNewPasswordForm] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordConfirm, setNewPasswordConfirm] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [updatingPwd, setUpdatingPwd] = useState(false);
  const inRecoveryRef = useRef(false);
  const [linkExpired, setLinkExpired] = useState(false);

  // Daily rotating insight shown beneath "Welcome back" — gives returning
  // users a sense of continuity without an API call.
  const dailyInsights = [
    "Your signals are watching the market for you.",
    "New intelligence may be waiting inside.",
    "Your presence compounds while you're away.",
    "The market moved today. Let's see what Aura found.",
    "Your next post could be one signal away.",
  ];
  const dailyInsight =
    dailyInsights[new Date().getDay() % dailyInsights.length];

  const checkOnboardingAndRedirect = async (session: any) => {
    // Honor ?returnTo=... so deep links from the weekly brief land at the
    // exact destination after login. Only relative paths are accepted.
    let returnTo: string | null = null;
    try {
      const p = new URLSearchParams(window.location.search);
      const rt = p.get("returnTo");
      if (rt && rt.startsWith("/") && !rt.startsWith("//")) returnTo = rt;
    } catch {}
    const { data: profile } = await supabase
      .from("diagnostic_profiles")
      .select("onboarding_completed")
      .eq("user_id", session.user.id)
      .maybeSingle();
    // No profile row → go to /home where the onboarding wizard (G1) will trigger.
    if (!profile) {
      navigate(returnTo || "/home");
      return;
    }
    if (!(profile as any).onboarding_completed) {
      navigate("/onboarding");
    } else {
      navigate(returnTo || "/home");
    }
  };

  useEffect(() => {
    // Show post-password-update toast after hard redirect from password reset.
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get("msg") === "password_updated") {
        toast({ title: "Password updated", description: "Please sign in with your new password." });
        window.history.replaceState({}, "", "/auth");
      }
    } catch {}

    // Detect expired/invalid recovery links arriving in the URL hash
    // (e.g. #error=access_denied&error_code=otp_expired&error_description=...)
    if (typeof window !== "undefined" && window.location.hash) {
      const hash = window.location.hash.startsWith("#")
        ? window.location.hash.slice(1)
        : window.location.hash;
      const params = new URLSearchParams(hash);
      const err = params.get("error");
      const errCode = params.get("error_code");
      if (err === "access_denied" || errCode === "otp_expired" || params.get("error_description")) {
        setLinkExpired(true);
        // Clear the hash so refreshing doesn't keep showing the error
        try { window.history.replaceState(null, "", window.location.pathname + window.location.search); } catch {}
      }
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") {
        inRecoveryRef.current = true;
        setShowNewPasswordForm(true);
        setLinkExpired(false);
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
      setLoginFailed(true);
      toast({
        title: "Sign in failed",
        description:
          "Email or password incorrect. If this is your first time, try Forgot Password to set up your account.",
        variant: "destructive",
      });
    }
    setLoading(false);
  };

  // Google SSO temporarily disabled during closed beta — re-enable after closed beta.
  // (Allowlist enforcement happens server-side; hiding the button avoids creating
  // accounts for non-allowlisted users via OAuth before that check runs.)

  const sendReset = async (target: string) => {
    const { data, error } = await supabase.functions.invoke("send-password-reset", {
      body: { email: target.trim().toLowerCase() },
    });
    if (error) throw error;
    if ((data as any)?.error) throw new Error((data as any).error);
  };

  const handleForgotPassword = async () => {
    setEmailError(null);
    if (!email || !email.includes("@")) {
      setEmailError("Enter your email first");
      return;
    }
    setResetting(true);
    try {
      const target = email.trim().toLowerCase();
      await sendReset(target);
      setResetSentEmail(target);
      setResetSent(true);
    } catch (e: any) {
      toast({ title: "Couldn't send reset", description: "Please try again.", variant: "destructive" });
    } finally {
      setResetting(false);
    }
  };

  const handleResend = async () => {
    if (!resetSentEmail) return;
    setResending(true);
    try {
      await sendReset(resetSentEmail);
      toast({ title: "Reset link resent", description: `Sent again to ${resetSentEmail}` });
    } catch {
      toast({ title: "Couldn't resend", description: "Please try again.", variant: "destructive" });
    } finally {
      setResending(false);
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
      const { data: pwData, error } = await supabase.functions.invoke("update-user-password", {
        body: { new_password: newPassword },
      });
      if (error) throw error;
      if ((pwData as any)?.error) throw new Error((pwData as any).error);
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
      inRecoveryRef.current = false;
      setShowNewPasswordForm(false);
      // Force sign-out so the user must log in with the new password.
      try { await supabase.auth.signOut(); } catch {}
      // Hard redirect clears React state + any cached session tokens.
      window.location.href = "/auth?msg=password_updated";
    } catch (e: any) {
      toast({ title: "Couldn't update password", description: e?.message || "Please try again.", variant: "destructive" });
    } finally {
      setUpdatingPwd(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: "var(--paper)", fontFamily: "var(--font-body)" }}>
      <div className="flex-1 flex">
      {/* Scoped style overrides to defeat global input styles + autofill */}
      <style>{`
        .auth-input {
          background-color: var(--paper-2) !important;
          border: 0.5px solid var(--rule) !important;
          color: var(--ink) !important;
          border-radius: 10px !important;
          padding: 12px 14px !important;
          width: 100%;
          font-size: 13px;
          line-height: 1.4;
          outline: none;
          font-family: var(--font-body);
          transition: border-color 0.15s ease, box-shadow 0.15s ease;
        }
        .auth-input::placeholder {
          color: var(--ink-3) !important;
          opacity: 1;
        }
        .auth-input:focus {
          border-color: var(--action) !important;
          box-shadow: 0 0 0 3px color-mix(in srgb, var(--action) 22%, transparent) !important;
        }
        /* Defeat browser autofill white background */
        .auth-input:-webkit-autofill,
        .auth-input:-webkit-autofill:hover,
        .auth-input:-webkit-autofill:focus,
        .auth-input:-webkit-autofill:active {
          -webkit-box-shadow: 0 0 0 1000px #E9E2D3 inset !important; /* mirrors --paper-2 */
          -webkit-text-fill-color: #1B1712 !important;                /* mirrors --ink */
          caret-color: #1B1712 !important;                            /* mirrors --ink */
          transition: background-color 9999s ease-in-out 0s;
        }
        .auth-headline {
          color: var(--ink) !important;
          font-family: var(--font-serif) !important;
          font-weight: 400 !important;
          font-size: 34px !important;
          letter-spacing: -0.02em !important;
          line-height: 1.15 !important;
          opacity: 1 !important;
          text-shadow: none !important;
          background: none !important;
          -webkit-text-fill-color: var(--ink) !important;
        }
        .auth-headline em {
          font-style: italic;
          color: var(--spot);
          -webkit-text-fill-color: var(--spot);
        }
        .auth-sublabel {
          font-family: var(--font-body);
          font-size: 13px;
          color: var(--ink-2);
          font-weight: 300;
          line-height: 1.6;
          margin-bottom: 28px;
        }
        .auth-tagline {
          color: var(--glass) !important;
          opacity: 1 !important;
          font-size: 24px !important;
          font-weight: 400 !important;
          text-align: center !important;
          font-family: var(--font-serif) !important;
          line-height: 1.35 !important;
          letter-spacing: -0.01em !important;
          background: none !important;
          -webkit-text-fill-color: var(--glass) !important;
        }
        .auth-feature-title {
          color: var(--glass) !important;
          font-weight: 600 !important;
          font-size: 13px !important;
          font-family: var(--font-body) !important;
          margin-bottom: 2px !important;
          opacity: 1 !important;
        }
        .auth-feature-desc {
          color: var(--glass-2) !important;
          font-size: 12px !important;
          font-weight: 300 !important;
          line-height: 1.5 !important;
          font-family: var(--font-body) !important;
          opacity: 1 !important;
        }
        .auth-label {
          color: var(--ink-3) !important;
          font-size: 11px !important;
          font-weight: 600 !important;
          letter-spacing: 0.08em !important;
          text-transform: uppercase !important;
          font-family: var(--font-mono) !important;
          display: block;
          margin-bottom: 6px;
          opacity: 1 !important;
        }
        .auth-submit {
          background: var(--action);
          color: var(--ink);
          border: none;
          border-radius: 10px;
          padding: 13px;
          font-family: var(--font-body);
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
        .auth-submit:hover:not(:disabled) { background: color-mix(in srgb, var(--action) 88%, black); }
        .auth-submit:disabled { opacity: 0.6; cursor: not-allowed; }
        .auth-google {
          background: var(--paper);
          color: var(--ink);
          border: none;
          border-radius: 10px;
          padding: 12px;
          font-family: var(--font-body);
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
        .auth-divider-line { height: 0.5px; background: var(--rule); flex: 1; }
        .auth-divider-text { font-size: 11px; color: var(--ink-3); font-family: var(--font-mono); letter-spacing: 0.08em; }
        .auth-wordmark {
          font-family: var(--font-serif);
          font-weight: 500;
          font-size: 22px;
          color: var(--ink);
          letter-spacing: 0.04em;
          line-height: 1;
        }
        .auth-wordmark-sub {
          font-size: 10px;
          font-weight: 600;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--ink-3);
          font-family: var(--font-mono);
          margin-top: 4px;
        }
        .auth-beta-pill {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          background: color-mix(in srgb, var(--action) 14%, transparent);
          border: 0.5px solid color-mix(in srgb, var(--action) 40%, transparent);
          border-radius: 20px;
          padding: 4px 12px;
          font-size: 10px;
          font-weight: 600;
          color: var(--spot);
          letter-spacing: 0.12em;
          font-family: var(--font-mono);
        }
        .auth-beta-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--action); }
        .auth-link { font-size: 12px; color: var(--ink-3); font-family: var(--font-body); }
        .auth-link-orange { color: var(--spot); font-weight: 600; }
        .auth-brand-large {
          display: flex;
          justify-content: center;
        }
        .auth-feature-icon {
          width: 36px;
          height: 36px;
          border-radius: 10px;
          background: var(--ob-panel);
          border: 0.5px solid var(--hair);
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .auth-footer-note {
          font-size: 10px;
          color: var(--glass-3);
          text-align: center;
          font-family: var(--font-mono);
          letter-spacing: 0.08em;
        }
        @media (prefers-reduced-motion: reduce) {
          .auth-glow { animation: none !important; }
        }
      `}</style>

      {/* LEFT — auth form */}
      <div
        className="w-full md:w-[40%] min-h-screen flex items-center justify-center px-6 py-10"
        style={{ backgroundColor: "var(--paper)" }}
      >
        <div className="w-full max-w-sm">
          {/* Logo */}
          <div className="flex items-center gap-3 mb-2">
            <AuraLogo size={40} variant="auto" withWordmark />
            <div className="auth-wordmark-sub" style={{ marginTop: 0 }}>Turns your expertise into presence</div>
          </div>

          {/* Beta pill */}
          <div className="auth-beta-pill mt-5 mb-6">
            <span className="auth-beta-dot" />
            CLOSED BETA
          </div>

          {/* Headline */}
          <h1 className="auth-headline mb-2">
            {showNewPasswordForm
              ? <>Reset your <em>password</em></>
              : resetSent
                ? <>Check your <em>email</em></>
                : <>Welcome <em>back</em></>}
          </h1>
          <p className="auth-sublabel">
            {showNewPasswordForm
              ? "Enter your new password below."
              : resetSent
                ? <>We sent a password reset link to <span style={{ color: "var(--ink-7)", fontWeight: 600 }}>{resetSentEmail}</span>.</>
                : hasEmailParam
                  ? "Welcome back — sign in to see your intelligence brief."
                  : dailyInsight}
          </p>

          {resetSent ? (
            <div className="space-y-4">
              <div
                style={{
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: 12.5,
                  lineHeight: 1.625,
                  color: "var(--ink-5)",
                  background: "var(--brand-muted)",
                  border: "0.5px solid var(--bronze-line)",
                  borderRadius: 10,
                  padding: "12px 14px",
                }}
              >
                The link expires in 1 hour. Click it to set a new password and sign in.
              </div>
              <button
                type="button"
                onClick={handleResend}
                disabled={resending}
                className="auth-submit"
              >
                {resending && <Loader2 className="w-4 h-4 animate-spin" />}
                {resending ? "Resending…" : "Resend link →"}
              </button>
              <p className="auth-link" style={{ textAlign: "center" }}>
                Didn't receive it? Check your spam folder or{" "}
                <button
                  type="button"
                  onClick={() => { setResetSent(false); setResetSentEmail(""); }}
                  className="auth-link auth-link-orange hover:underline"
                  style={{ background: "none", border: 0, cursor: "pointer", padding: 0, fontWeight: 600 }}
                >try a different email →</button>
              </p>
              <div className="pt-2 text-center">
                <button
                  type="button"
                  onClick={() => { setResetSent(false); }}
                  style={{
                    color: "var(--ink-4)",
                    fontFamily: "'DM Sans', sans-serif",
                    fontSize: 14,
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    padding: "4px 8px",
                  }}
                  className="hover:underline"
                >← Back to sign in</button>
              </div>
            </div>
          ) : showNewPasswordForm ? (
            <div className="space-y-4">
              <div>
                <label className="auth-label">New password</label>
                <div style={{ position: "relative" }}>
                  <input
                    type={showPwd ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="••••••••"
                    className="auth-input"
                    style={{ paddingRight: 38 }}
                    autoComplete="new-password"
                  />
                  <button
                    type="button" onClick={() => setShowPwd((s) => !s)}
                    aria-label={showPwd ? "Hide password" : "Show password"}
                    style={{
                      position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
                      background: "transparent", border: 0, cursor: "pointer",
                      color: "var(--ink-4)", padding: 4,
                    }}
                  >{showPwd ? <EyeOff size={16} /> : <Eye size={16} />}</button>
                </div>
              </div>
              <div>
                <label className="auth-label">Confirm password</label>
                <input
                  type={showPwd ? "text" : "password"}
                  value={newPasswordConfirm}
                  onChange={(e) => setNewPasswordConfirm(e.target.value)}
                  placeholder="••••••••"
                  className="auth-input"
                  autoComplete="new-password"
                  onKeyDown={(e) => { if (e.key === "Enter") handleResetPassword(); }}
                />
              </div>
              <p className="text-xs" style={{ color: "var(--ink-4)" }}>Must be at least 8 characters.</p>
              <button
                type="button"
                onClick={handleResetPassword}
                disabled={updatingPwd || newPassword.length < 8 || newPassword !== newPasswordConfirm}
                className="auth-submit"
              >
                {updatingPwd && <Loader2 className="w-4 h-4 animate-spin" />}
                Update password →
              </button>
            </div>
          ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {linkExpired ? (
              <div
                style={{
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: 12.5,
                  lineHeight: 1.625,
                  color: "var(--ink-6)",
                  background: "rgba(220, 80, 60, 0.08)",
                  border: "0.5px solid rgba(220, 80, 60, 0.35)",
                  borderRadius: 10,
                  padding: "10px 12px",
                }}
              >
                This reset link has expired. Enter your email below and request a new one.
              </div>
            ) : (
              <div
                style={{
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: 12.5,
                  lineHeight: 1.625,
                  color: "var(--ink-5)",
                  background: "var(--brand-muted)",
                  border: "0.5px solid var(--bronze-line)",
                  borderRadius: 10,
                  padding: "10px 12px",
                }}
              >
                Use the email and password from your invitation. First time?
                Use <span style={{ color: "var(--brand)", fontWeight: 600 }}>Set Password</span> below to create your password.
              </div>
            )}
            <div>
              <label htmlFor="email" className="auth-label">
                Email
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
                <p className="mt-1.5 text-xs" style={{ color: "var(--error)" }}>{emailError}</p>
              )}
            </div>

            <div>
              <label htmlFor="password" className="auth-label">
                Password
              </label>
              <div style={{ position: "relative" }}>
                <input
                  id="password"
                  type={showLoginPwd ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  placeholder="••••••••"
                  className="auth-input"
                  style={{ paddingRight: 38 }}
                  autoComplete="current-password"
                />
                <button
                  type="button" onClick={() => setShowLoginPwd((s) => !s)}
                  aria-label={showLoginPwd ? "Hide password" : "Show password"}
                  style={{
                    position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
                    background: "transparent", border: 0, cursor: "pointer",
                    color: "var(--ink-4)", padding: 4,
                  }}
                >{showLoginPwd ? <EyeOff size={16} /> : <Eye size={16} />}</button>
              </div>
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
            {/* Google SSO hidden during closed beta — re-enable after closed beta. */}

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
                {resetting
                  ? "Sending…"
                  : linkExpired
                    ? "Request a new reset link →"
                    : loginFailed
                      ? "Forgot your password? →"
                      : "Set or reset your password →"}
              </button>
            </div>
          </form>
          )}

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
        style={{ backgroundColor: "var(--ob-bg)" }}
      >
        {/* Centered radial glow */}
        <div
          className="pointer-events-none auth-glow"
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: 400,
            height: 400,
            background:
              "radial-gradient(circle, color-mix(in srgb, var(--action) 12%, transparent) 0%, transparent 65%)",
            zIndex: 0,
          }}
        />

        <div className="max-w-md text-center" style={{ position: "relative", zIndex: 1 }}>
          <div className="auth-brand-large">
            <AuraLogo size={60} variant="dark" />
          </div>
          <p className="auth-tagline mt-6 animate-fade-up-in" style={{ animationDuration: "600ms" }}>
            Your expertise is invisible. Aura fixes that.
          </p>

          <div className="mx-auto my-8" style={{ width: 40, height: 2, backgroundColor: "var(--action)", opacity: 0.5 }} />

          <div className="space-y-6 text-left">
            <FeatureRow
              delay={300}
              icon={<Radio className="w-4 h-4" style={{ color: "var(--action)" }} />}
              title="Signal intelligence"
              desc="Converts what you read into ranked market signals"
            />
            <FeatureRow
              delay={360}
              icon={<PenLine className="w-4 h-4" style={{ color: "var(--action)" }} />}
              title="Flash content"
              desc="LinkedIn posts in your voice, English or Arabic, in minutes"
            />
            <FeatureRow
              delay={420}
              icon={<TrendingUp className="w-4 h-4" style={{ color: "var(--action)" }} />}
              title="Imprint"
              desc="Tracks how your visibility compounds over time"
            />
          </div>
        </div>

        <div className="absolute bottom-6 left-0 right-0 auth-footer-note" style={{ zIndex: 1 }}>
          Closed beta · GCC senior professionals · 2026
        </div>
      </div>
      </div>
      <PublicFooter forceDark />
    </div>
  );
};

const FeatureRow = ({
  icon,
  title,
  desc,
  delay = 0,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  delay?: number;
}) => (
  <div
    className="flex items-start gap-3 animate-fade-up-in"
    style={{ animationDelay: `${delay}ms` }}
  >
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
