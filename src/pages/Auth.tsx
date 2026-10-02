import { useState, useEffect, useRef } from "react";
import LanguageToggle from "@/components/LanguageToggle";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate, Link } from "react-router-dom";
import { Loader2, Eye, EyeOff } from "lucide-react";
import { useTranslation, Trans } from "react-i18next";
import { ltrIsolate } from "@/i18n";
import AuraLogo from "@/components/brand/AuraLogo";
import { useToast } from "@/hooks/use-toast";
import { claimPendingSession } from "@/lib/assessmentSession";
import usePageMeta from "@/hooks/usePageMeta";
import { isOnboarded } from "@/lib/onboarding";
import { setPendingDestination } from "@/lib/pendingDestination";
import { PRODUCT_DESCRIPTOR, ASSESSMENT_MINUTES, ASSESSMENT_MINUTES_LINE, ASSESSMENT_MINUTES_WORD } from "@/lib/brand";

/** The consent text version recorded against every new account. */
export const CONSENT_VERSION = "2026-08-16";

const readParam = (key: string) => {
  if (typeof window === "undefined") return "";
  try { return new URLSearchParams(window.location.search).get(key) ?? ""; }
  catch { return ""; }
};

/* ────────────────────────────────────────────────────────────────
   /auth — "The Return".
   Left: the form. Fast, nothing to read, one job.
   Right: the dark instrument — the night that ran while they were
   away. Labelled illustrative, because before sign-in we know
   nothing about this person and must not imply that we do.

   Every rule is scoped under .au. Palette is System-B verbatim.

   All recovery logic is carried over unchanged: PASSWORD_RECOVERY
   events, expired-hash detection, returnTo, the onboarding
   gate, forced sign-out after a password change.
   ──────────────────────────────────────────────────────────────── */

type View = "signin" | "signup" | "existing" | "verify" | "sent" | "newPassword";

const Auth = () => {
  const [email, setEmail] = useState(() => readParam("email"));
  const [hasEmailParam] = useState(() => !!readParam("email"));
  const [isAssessment] = useState(() => readParam("intent") === "assessment");
  const { t } = useTranslation();

  usePageMeta({
    title: isAssessment ? t("auth.meta.assessmentTitle") : t("auth.meta.signinTitle"),
    description: isAssessment
      ? t("auth.meta.assessmentDescription")
      : t("auth.meta.signinDescription"),
    path: "/auth",
  });

  const [password, setPassword] = useState("");
  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resending, setResending] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [signInError, setSignInError] = useState<string | null>(null);
  const [showLoginPwd, setShowLoginPwd] = useState(false);
  const [resetSentEmail, setResetSentEmail] = useState("");
  const [linkExpired, setLinkExpired] = useState(false);
  // Confirmation resend — honest state only. `confirmResendState` is never
  // "sent" unless the provider accepted the send.
  const [confirmCooldown, setConfirmCooldown] = useState(0);
  const [confirmResending, setConfirmResending] = useState(false);
  const [confirmResendNote, setConfirmResendNote] = useState<
    { kind: "sent" | "error"; text: string } | null
  >(null);

  // password recovery
  const [view, setView] = useState<View>(() =>
    (typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("intent") === "assessment")
      ? "signup"
      : "signin",
  );
  const [signUpError, setSignUpError] = useState<string | null>(null);
  const [signingUp, setSigningUp] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordConfirm, setNewPasswordConfirm] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [updatingPwd, setUpdatingPwd] = useState(false);
  const inRecoveryRef = useRef(false);

  const emailRef = useRef<HTMLInputElement>(null);
  const pwdRef = useRef<HTMLInputElement>(null);

  /* ── the sixty seconds between confirmation sends ── */
  useEffect(() => {
    if (confirmCooldown <= 0) return;
    const t = window.setInterval(() => setConfirmCooldown((s) => (s <= 1 ? 0 : s - 1)), 1000);
    return () => window.clearInterval(t);
  }, [confirmCooldown > 0]);

  const navigate = useNavigate();
  const { toast } = useToast();

  const longEnough = newPassword.length >= 8;
  const matches = newPassword.length > 0 && newPassword === newPasswordConfirm;

  /* ── land the cursor where the work is ── */
  useEffect(() => {
    if (view !== "signin" && view !== "signup") return;
    const t = window.setTimeout(() => {
      (hasEmailParam ? pwdRef.current : emailRef.current)?.focus();
    }, 60);
    return () => window.clearTimeout(t);
  }, [view, hasEmailParam]);

  const checkOnboardingAndRedirect = async (session: any) => {
    // An anonymous run started at /assessment is attached to this account now.
    // A failure keeps the local token — nothing is dropped, it is claimed later.
    await claimPendingSession();

    // Honour ?next=... (and legacy ?returnTo=...) so a member who was sent to
    // sign in lands back on the page they wanted. Internal paths only —
    // absolute URLs and protocol-relative paths are rejected outright, or this
    // becomes an open redirect.
    let returnTo: string | null = null;
    try {
      const p = new URLSearchParams(window.location.search);
      const rt = p.get("next") || p.get("returnTo");
      if (rt && rt.startsWith("/") && !rt.startsWith("//") && !/^\/?\w+:/.test(rt)) {
        returnTo = rt;
      }
    } catch { /* ignore */ }

    const { data: profile } = await supabase
      .from("diagnostic_profiles")
      .select("onboarding_step")
      .eq("user_id", session.user.id)
      .maybeSingle();

    // ONE definition of onboarded, shared with Dashboard (D122).
    if (!isOnboarded(profile)) {
      // A validated returnTo is never discarded — it is parked and consumed
      // once the member lands back on the dashboard after onboarding.
      if (returnTo) setPendingDestination(returnTo);
      navigate("/onboarding", { replace: true });
      return;
    }
    // The assessment lives at /onboarding — a member arriving with
    // intent=assessment is sent there rather than to the generic dashboard.
    if (!returnTo && isAssessment) {
      navigate("/onboarding", { replace: true });
      return;
    }
    navigate(returnTo || "/home", { replace: true });
  };

  useEffect(() => {
    // Toast after the hard redirect that follows a password change.
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get("msg") === "password_updated") {
        toast({ title: t("auth.reset.updatedTitle"), description: t("auth.reset.updatedBody") });
        window.history.replaceState({}, "", "/auth");
      }
    } catch { /* ignore */ }

    // Expired or invalid recovery links arrive in the URL hash, e.g.
    // #error=access_denied&error_code=otp_expired&error_description=...
    if (typeof window !== "undefined" && window.location.hash) {
      const hash = window.location.hash.replace(/^#/, "");
      const params = new URLSearchParams(hash);
      const err = params.get("error");
      const errCode = params.get("error_code");
      if (err === "access_denied" || errCode === "otp_expired" || params.get("error_description")) {
        setLinkExpired(true);
        try {
          window.history.replaceState(null, "", window.location.pathname + window.location.search);
        } catch { /* ignore */ }
      }
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") {
        inRecoveryRef.current = true;
        setView("newPassword");
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
    setSignInError(null);
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      // Inline and persistent. A toast disappears before a person has
      // finished reading it, and this is the message they most need.
      setSignInError(
        t("auth.error.signinMismatch"),
      );
      setLoading(false);
      pwdRef.current?.focus();
      return;
    }
    // Leave the button in its loading state — onAuthStateChange navigates.
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setSignUpError(null);
    setEmailError(null);
    if (signingUp) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setEmailError(t("auth.error.emailInvalid"));
      emailRef.current?.focus();
      return;
    }
    if (password.length < 8) { setSignUpError(t("auth.error.passwordShort")); pwdRef.current?.focus(); return; }
    if (!consent) return;
    setSigningUp(true);
    try {
      const { data, error } = await supabase.functions.invoke("auth-signup", {
        body: {
          email: email.trim().toLowerCase(),
          password,
          origin: window.location.origin,
          consent_version: CONSENT_VERSION,
        },
      });
      const result = data as { ok?: boolean; existing?: boolean; code?: string; error?: string } | null;
      if (result?.existing) {
        setView("existing");
        return;
      }
      const msg = result?.error || error?.message;
      if (msg) {
        const raw = String(msg);
        setSignUpError(
          result?.code === "signup_limit" || /rate|too many|429|as many accounts/i.test(raw)
              ? t("auth.error.signupLimit")
              : /password/i.test(raw)
                ? t("auth.error.passwordShort")
                : t("auth.error.signupFailed"),
        );
        return;
      }
      // The sign-up itself is a send: start the same sixty seconds, or the
      // provider's own window rejects an immediate resend.
      setConfirmResendNote(null);
      setConfirmCooldown(60);
      setView("verify");
    } catch {
      setSignUpError(t("auth.error.signupFailed"));
    } finally {
      setSigningUp(false);
    }
  };

  const sendReset = async (target: string) => {
    const { data, error } = await supabase.functions.invoke("send-password-reset", {
      body: { email: target.trim().toLowerCase(), origin: window.location.origin },
    });
    if (error) throw error;
    if ((data as any)?.error) throw new Error((data as any).error);
  };

  const handleForgotPassword = async () => {
    setEmailError(null);
    setSignInError(null);
    if (!email || !email.includes("@")) {
      setEmailError(t("auth.error.emailFirst"));
      emailRef.current?.focus();
      return;
    }
    setResetting(true);
    try {
      const target = email.trim().toLowerCase();
      await sendReset(target);
      setResetSentEmail(target);
      setView("sent");
    } catch {
      toast({ title: t("auth.error.sendLinkTitle"), description: t("auth.error.tryAgain"), variant: "destructive" });
    } finally {
      setResetting(false);
    }
  };

  const handleResend = async () => {
    if (!resetSentEmail) return;
    setResending(true);
    try {
      await sendReset(resetSentEmail);
      toast({ title: t("auth.reset.sentAgainTitle"), description: t("auth.reset.sentAgainBody", { email: ltrIsolate(resetSentEmail) }) });
    } catch {
      toast({ title: t("auth.error.resendTitle"), description: t("auth.error.tryAgain"), variant: "destructive" });
    } finally {
      setResending(false);
    }
  };

  /** Resend the sign-up confirmation link. Reports exactly what happened. */
  const handleResendConfirmation = async () => {
    const target = email.trim().toLowerCase();
    if (!target || confirmCooldown > 0 || confirmResending) return;
    setConfirmResending(true);
    setConfirmResendNote(null);
    try {
      const { data, error } = await supabase.functions.invoke("auth-resend-confirmation", {
        body: { email: target, origin: window.location.origin },
      });
      const result = data as { ok?: boolean; error?: string } | null;
      if (error || !result?.ok) {
        setConfirmResendNote({
          kind: "error",
          text: result?.error || t("auth.error.linkNotSent"),
        });
        return;
      }
      setConfirmResendNote({ kind: "sent", text: t("auth.signup.resentNote", { email: ltrIsolate(target) }) });
      setConfirmCooldown(60);
    } catch {
      setConfirmResendNote({
        kind: "error",
        text: t("auth.error.linkNotSent"),
      });
    } finally {
      setConfirmResending(false);
    }
  };

  const handleResetPassword = async () => {
    if (!longEnough || !matches) return;
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
      setView("signin");
      // Force sign-out so the new password is actually used.
      try { await supabase.auth.signOut(); } catch { /* ignore */ }
      // Hard redirect clears React state and any cached session tokens.
      window.location.href = "/auth?msg=password_updated";
    } catch (e: any) {
      toast({
        title: t("auth.error.updatePasswordTitle"),
        description: e?.message || t("auth.error.tryAgain"),
        variant: "destructive",
      });
    } finally {
      setUpdatingPwd(false);
    }
  };

  const headline =
    view === "newPassword" ? <Trans i18nKey="auth.reset.newHeadline" components={{ 1: <em /> }} />
    : view === "signup" ? <Trans i18nKey="auth.signup.headline" components={{ 1: <em /> }} />
    : view === "existing" ? <>{t("auth.signup.existingHeadline")}</>
    : view === "verify" ? <Trans i18nKey="auth.signup.verifyHeadline" components={{ 1: <em /> }} />
    : view === "sent" ? <Trans i18nKey="auth.reset.sentHeadline" components={{ 1: <em /> }} />
    : linkExpired ? <Trans i18nKey="auth.reset.expiredHeadline" components={{ 1: <em /> }} />
    : <Trans i18nKey="auth.signin.headline" components={{ 1: <em /> }} />;

  const sub =
    view === "newPassword" ? t("auth.reset.newSub")
    : view === "signup" ? t("auth.signup.sub", { minutesLine: ASSESSMENT_MINUTES_LINE, minutes: ASSESSMENT_MINUTES })
    : view === "existing" ? t("auth.signup.existingSub")
    : view === "verify" ? <Trans i18nKey="auth.signup.verifySub" values={{ email }} components={{ 1: <b dir="ltr" style={{ unicodeBidi: "isolate" }} /> }} />
    : view === "sent" ? <Trans i18nKey="auth.reset.sentSub" values={{ email: resetSentEmail }} components={{ 1: <b dir="ltr" style={{ unicodeBidi: "isolate" }} /> }} />
    : linkExpired ? t("auth.reset.expiredSub")
    : hasEmailParam ? t("auth.signin.subReturning")
    : t("auth.signin.sub");

  return (
    <div className="au" style={{ position: "relative" }}>
      <style>{AU_CSS}</style>
      <div style={{ position: "absolute", top: 8, insetInlineEnd: 8, zIndex: 50 }}><LanguageToggle darkFromPx={901} /></div>

      <div className="au-shell">
        {/* ── LEFT · the form ── */}
        <div className="au-pane">
          <div className="au-form">
            <Link className="au-brandrow" to="/">
              <AuraLogo size={30} variant="auto" title={t("auth.signin.logoTitle")} />
              <span className="au-bn">{t("auth.signin.wordmark")}</span>
              <span className="au-bsub">
                <span className="au-bsub-l">{PRODUCT_DESCRIPTOR.split(" ").slice(0, 2).join(" ")}</span>
                <span className="au-bsub-l">{PRODUCT_DESCRIPTOR.split(" ").slice(2).join(" ")}</span>
              </span>
            </Link>

            <h1 className="au-h1">{headline}</h1>
            <p className="au-sub">{sub}</p>

            {/* ── sign up · the free assessment door ── */}
            {view === "signup" && (
              <form onSubmit={handleSignUp} className="au-fields" noValidate>
                <div>
                  <label htmlFor="au-suemail">{t("auth.signup.emailLabel")}</label>
                  <input
                    id="au-suemail" ref={emailRef} type="email" value={email} required
                    autoComplete="email" inputMode="email" autoCapitalize="off"
                    autoCorrect="off" spellCheck={false}
                    placeholder={t("auth.signin.emailPlaceholder")} className="au-field"
                    aria-invalid={!!emailError}
                    aria-describedby={emailError ? "au-suemail-err" : undefined}
                    onChange={(e) => { setEmail(e.target.value); setSignUpError(null); setEmailError(null); }}
                  />
                  <p className="au-err" id="au-suemail-err" aria-live="polite">{emailError || ""}</p>
                </div>
                <div>
                  <label htmlFor="au-supwd">{t("auth.signup.passwordLabel")}</label>
                  <div className="au-pwwrap">
                    <input
                      id="au-supwd" ref={pwdRef} type={showLoginPwd ? "text" : "password"} value={password}
                      required minLength={8} autoComplete="new-password"
                      className="au-field au-haspeek"
                      aria-describedby="au-supwd-help"
                      aria-invalid={!!signUpError}
                      onChange={(e) => { setPassword(e.target.value); setSignUpError(null); }}
                    />
                    <button
                      type="button" className="au-peek"
                      aria-label={showLoginPwd ? t("auth.signin.hidePassword") : t("auth.signin.showPassword")}
                      aria-pressed={showLoginPwd}
                      onClick={() => setShowLoginPwd((s) => !s)}
                    >
                      {showLoginPwd ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                  <p className="au-help" id="au-supwd-help">{t("auth.signup.passwordHelp")}</p>
                </div>

                <div aria-live="polite">
                  {signUpError && <div className="au-note warn">{signUpError}</div>}
                </div>

                <label className="au-consent" htmlFor="au-consent">
                  <input
                    id="au-consent" type="checkbox" checked={consent}
                    onChange={(e) => setConsent(e.target.checked)}
                  />
                  <span>
                    <Trans i18nKey="auth.signup.consent" components={{ 1: <Link to="/terms" />, 2: <Link to="/privacy" /> }} />
                  </span>
                </label>

                <button type="submit" disabled={signingUp || !consent} className="au-btn">
                  {signingUp
                    ? (<><Loader2 className="au-spin" size={16} /> {t("auth.signup.opening")}</>)
                    : (<>{t("auth.signup.submit")} <span className="au-a">↗</span></>)}
                </button>
                <p className="au-trust">
                  {t("auth.signup.trust")}
                </p>

                <div className="au-center">
                  <button type="button" className="au-linkbtn quiet" onClick={() => setView("signin")}>
                    {t("auth.signup.haveAccount")}
                  </button>
                </div>
              </form>
            )}

            {/* ── waiting on the confirmation link ── */}
            {view === "verify" && (
              <div className="au-fields">
                <div className="au-note">
                  {t("auth.signup.verifySpam")}
                </div>
                <div className="au-note">
                  <Trans i18nKey="auth.signup.verifyFrom" components={{ 1: <b /> }} />
                </div>
                <button
                  type="button" className="au-btn"
                  onClick={handleResendConfirmation}
                  disabled={confirmResending || confirmCooldown > 0}
                >
                  {confirmResending
                    ? (<><Loader2 className="au-spin" size={16} /> {t("auth.signin.sending")}</>)
                    : confirmCooldown > 0
                      ? t("auth.signup.resendIn", { count: confirmCooldown })
                      : (<>{t("auth.signup.resend")} <span className="au-a">↗</span></>)}
                </button>
                <div aria-live="polite">
                  {confirmResendNote && (
                    <div className={confirmResendNote.kind === "error" ? "au-note warn" : "au-note"}>
                      {confirmResendNote.text}
                    </div>
                  )}
                </div>
                <div className="au-center">
                  <button
                    type="button" className="au-linkbtn"
                    onClick={() => { setConfirmResendNote(null); setView("signup"); }}
                  >
                    {t("auth.signup.differentEmail")}
                  </button>
                </div>
              </div>
            )}

            {view === "existing" && (
              <div className="au-fields">
                <div className="au-note">
                  {t("auth.signup.existingNote")}
                </div>
                <button type="button" className="au-btn" onClick={() => setView("signin")}>
                  {t("auth.signin.submit")} <span className="au-a">↗</span>
                </button>
                <div className="au-center">
                  <button
                    type="button" className="au-linkbtn"
                    onClick={() => { setPassword(""); setEmail(""); setView("signup"); }}
                  >
                    {t("auth.signup.differentEmail")}
                  </button>
                </div>
                <div className="au-center">
                  <button type="button" className="au-linkbtn quiet" onClick={handleForgotPassword} disabled={resetting}>
                    {resetting ? t("auth.signin.sending") : t("auth.reset.setOrReset")}
                  </button>
                </div>
              </div>
            )}

            {/* ── sign in ── */}
            {view === "signin" && (
              <form onSubmit={handleSubmit} className="au-fields" noValidate>
                {linkExpired ? (
                  <div className="au-note warn" role="status">
                    {t("auth.reset.expiredNote")}
                  </div>
                ) : (
                  <div className="au-note">
                    <Trans i18nKey="auth.signin.firstTime" components={{ 1: <a href="/auth?intent=assessment" />, 2: <b /> }} />
                  </div>
                )}

                <div>
                  <label htmlFor="au-email">{t("auth.signin.emailLabel")}</label>
                  <input
                    id="au-email" ref={emailRef} type="email" value={email} required
                    autoComplete="email" inputMode="email" autoCapitalize="off"
                    autoCorrect="off" spellCheck={false}
                    placeholder={t("auth.signin.emailPlaceholder")} className="au-field"
                    aria-invalid={!!emailError}
                    aria-describedby="au-email-err"
                    onChange={(e) => { setEmail(e.target.value); setEmailError(null); setSignInError(null); }}
                  />
                  <p className="au-err" id="au-email-err" aria-live="polite">{emailError || ""}</p>
                </div>

                <div>
                  <label htmlFor="au-password">{t("auth.signin.passwordLabel")}</label>
                  <div className="au-pwwrap">
                    <input
                      id="au-password" ref={pwdRef} type={showLoginPwd ? "text" : "password"}
                      value={password} required minLength={6} autoComplete="current-password"
                      placeholder="••••••••" className="au-field au-haspeek"
                      aria-invalid={!!signInError}
                      aria-describedby="au-password-err"
                      onChange={(e) => { setPassword(e.target.value); setSignInError(null); }}
                    />
                    <button
                      type="button" className="au-peek"
                      aria-label={showLoginPwd ? t("auth.signin.hidePassword") : t("auth.signin.showPassword")}
                      aria-pressed={showLoginPwd}
                      onClick={() => setShowLoginPwd((s) => !s)}
                    >
                      {showLoginPwd ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                  <div id="au-password-err" aria-live="polite">
                    {signInError && <p className="au-err">{signInError}</p>}
                  </div>
                </div>

                <button type="submit" disabled={loading} className="au-btn">
                  {loading ? (
                    <><Loader2 className="au-spin" size={16} /> {t("auth.signin.signingIn")}</>
                  ) : (
                    <>{t("auth.signin.submit")} <span className="au-a">↗</span></>
                  )}
                </button>

                <div className="au-center">
                  <button type="button" onClick={handleForgotPassword} disabled={resetting} className="au-linkbtn">
                    {resetting
                      ? t("auth.signin.sending")
                      : linkExpired
                        ? t("auth.reset.sendNew")
                        : t("auth.reset.setOrReset")}
                  </button>
                </div>
              </form>
            )}

            {/* ── link sent ── */}
            {view === "sent" && (
              <div className="au-fields">
                <div className="au-note">
                  <Trans i18nKey="auth.reset.sentNote" components={{ 1: <b dir="ltr" style={{ unicodeBidi: "isolate" }} />, 2: <b dir="ltr" style={{ unicodeBidi: "isolate" }} /> }} />
                </div>
                <button type="button" onClick={handleResend} disabled={resending} className="au-btn">
                  {resending ? (<><Loader2 className="au-spin" size={16} /> {t("auth.signin.sending")}</>) : (<>{t("auth.reset.sendAgain")} <span className="au-a">↗</span></>)}
                </button>
                <div className="au-center">
                  <button
                    type="button" className="au-linkbtn"
                    onClick={() => { setView("signin"); setResetSentEmail(""); }}
                  >
                    {t("auth.signup.differentEmail")}
                  </button>
                </div>
                <div className="au-center">
                  <button type="button" className="au-linkbtn quiet" onClick={() => setView("signin")}>
                    {t("auth.reset.back")}
                  </button>
                </div>
              </div>
            )}

            {/* ── set a new password ── */}
            {view === "newPassword" && (
              <div className="au-fields">
                <div>
                  <label htmlFor="au-new">{t("auth.reset.newLabel")}</label>
                  <div className="au-pwwrap">
                    <input
                      id="au-new" type={showPwd ? "text" : "password"} value={newPassword}
                      autoComplete="new-password" placeholder="••••••••" className="au-field au-haspeek"
                      onChange={(e) => setNewPassword(e.target.value)}
                    />
                    <button
                      type="button" className="au-peek"
                      aria-label={showPwd ? t("auth.signin.hidePassword") : t("auth.signin.showPassword")}
                      onClick={() => setShowPwd((s) => !s)}
                    >
                      {showPwd ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>

                <div>
                  <label htmlFor="au-confirm">{t("auth.reset.confirmLabel")}</label>
                  <input
                    id="au-confirm" type={showPwd ? "text" : "password"} value={newPasswordConfirm}
                    autoComplete="new-password" placeholder="••••••••" className="au-field"
                    onChange={(e) => setNewPasswordConfirm(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleResetPassword(); }}
                  />
                </div>

                {/* stated as facts, checked live — never a scolding */}
                <ul className="au-reqs" aria-live="polite">
                  <li className={longEnough ? "met" : ""}>
                    <i />{t("auth.reset.reqLength")}
                  </li>
                  <li className={matches ? "met" : ""}>
                    <i />{t("auth.reset.reqMatch")}
                  </li>
                </ul>

                <button
                  type="button" onClick={handleResetPassword}
                  disabled={updatingPwd || !longEnough || !matches} className="au-btn"
                >
                  {updatingPwd ? (<><Loader2 className="au-spin" size={16} /> {t("auth.reset.updating")}</>) : (<>{t("auth.reset.submit")} <span className="au-a">↗</span></>)}
                </button>
              </div>
            )}

            <p className="au-legal au-legal-top">
              <Trans i18nKey="auth.signin.legal" components={{ 1: <Link to="/privacy" />, 2: <Link to="/terms" />, 3: <Link to="/trust" />, 4: <a href="mailto:support@aura-intel.org" /> }} />
            </p>
          </div>
        </div>

        {/* ── RIGHT · the instrument ── */}
        <div className="au-night" aria-hidden="true">
          <div className="au-stars" />
          {isAssessment ? (
            <div className="au-nwrap">
              <p className="au-neyebrow">{t("auth.night.assessEyebrow", { minutes: ASSESSMENT_MINUTES_WORD })}</p>
              <h2 className="au-nh"><Trans i18nKey="auth.night.assessHeadline" components={{ 1: <em /> }} /></h2>

              <div className="au-card">
                <div className="au-ctop"><span>{t("auth.night.cardTop")}</span></div>
                <p className="au-arch">{t("auth.night.archetype")}</p>
                <ul className="au-bars">
                  <li>
                    <span className="au-blab">{t("auth.night.barProven")}</span>
                    <span className="au-btrack"><i className="au-bfill cy" style={{ width: "85%" }} /></span>
                  </li>
                  <li>
                    <span className="au-blab">{t("auth.night.barInvisible")}</span>
                    <span className="au-btrack"><i className="au-bfill bl" style={{ width: "55%" }} /></span>
                  </li>
                  <li>
                    <span className="au-blab">{t("auth.night.barNotVisible")}</span>
                    <span className="au-btrack"><i className="au-bfill gy" style={{ width: "25%" }} /></span>
                  </li>
                </ul>
                <div className="au-ctop au-cmid"><span>{t("auth.night.spaceTop")}</span></div>
                <p className="au-claim">{t("auth.night.claim")}</p>
              </div>

              <p className="au-illus">{t("auth.night.assessIllus")}</p>
              <p className="au-ar" dir="rtl">ليعرفك السوق قبل أن يراك ✦</p>
            </div>
          ) : (
          <div className="au-nwrap">
            <p className="au-neyebrow">{t("auth.night.eyebrow")}</p>
            <h2 className="au-nh"><Trans i18nKey="auth.night.headline" components={{ 1: <em /> }} /></h2>

            <div className="au-card">
              <div className="au-ctop"><span>{t("auth.night.cardTitle")}</span><span dir="ltr" style={{ unicodeBidi: "isolate" }}>02:00 → 03:12</span></div>
              <ul className="au-tl">
                <li><i className="au-tdot" /><div><span className="au-tt">02:04</span><span className="au-tx">{t("auth.night.step1")}</span></div></li>
                <li><i className="au-tdot" /><div><span className="au-tt">02:31</span><span className="au-tx">{t("auth.night.step2")}</span></div></li>
                <li><i className="au-tdot" /><div><span className="au-tt">03:12</span><span className="au-tx">{t("auth.night.step3")}</span></div></li>
              </ul>
              <div className="au-agents">
                <span className="au-ag">{t("auth.night.agentReader")}</span><span className="au-ag">{t("auth.night.agentSignal")}</span>
                <span className="au-ag">{t("auth.night.agentVoice")}</span><span className="au-ag">{t("auth.night.agentEditor")}</span>
              </div>
            </div>

            <p className="au-illus">{t("auth.night.illus")}</p>
            <p className="au-ar" dir="rtl">ليعرفك السوق قبل أن يراك ✦</p>
          </div>
          )}
          {!isAssessment && <p className="au-nfoot">{t("auth.night.foot")}</p>}
        </div>
      </div>
    </div>
  );
};

export default Auth;

/* ── styles · every selector scoped under .au ── */

const AU_CSS = `
.au{
  --page:#F2F5F9; --n0:#FFFFFF; --n100:#EEF2F7; --n200:#E2E7EE; --n300:#D6DCE4;
  --n400:#98A2AE; --n500:#5B6673; --n700:#3A434E; --n900:#0F1519;
  --night:#0F1519; --nline:#26313A; --ncard:#151C22;
  --act:#0670C4; --act-50:#E6F2FD; --cy:#00CEC9; --cy-b:#5EE3DC; --cy-t:#00807B;
  --err:#C0392B; --err-50:#FCEAE6;
  --ui:'Inter',ui-sans-serif,system-ui,-apple-system,sans-serif;
  --ser:'Inter',ui-sans-serif,system-ui,sans-serif;
  --mono:'IBM Plex Mono',ui-monospace,Menlo,monospace;
  --ar:'Cairo','CairoAR',sans-serif;
  background:var(--page); color:var(--n900);
  font-family:var(--ui); font-size:16px; line-height:1.6;
  -webkit-font-smoothing:antialiased; min-height:100vh;
}
.au *,.au *::before,.au *::after{box-sizing:border-box;}
.au p,.au h1,.au h2,.au ul,.au li{margin:0;padding:0;list-style:none;}
.au a{color:inherit;text-decoration:none;}
.au :focus-visible{outline:2px solid var(--act);outline-offset:3px;border-radius:6px;}

.au-shell{display:grid;grid-template-columns:44fr 56fr;min-height:100vh;}
.au-pane{display:flex;align-items:center;justify-content:center;padding:40px clamp(22px,4vw,56px);}
.au-form{width:100%;max-width:400px;}

.au-brandrow{display:flex;align-items:center;gap:10px;margin-bottom:26px;}
.au-bn{font-family:var(--ser);font-weight:700;font-size:26px;line-height:1;}
/* Two lines, never four: "AI PROFESSIONAL" / "IDENTITY PLATFORM", centred on the wordmark. */
.au-bsub{font-family:var(--mono);font-size:9px;letter-spacing:.18em;text-transform:uppercase;
  color:var(--n400);padding-inline-start:11px;border-inline-start:1px solid var(--n200);line-height:1.25;
  width:128px;max-width:128px;align-self:center;display:flex;flex-direction:column;}
.au-bsub-l{display:block;white-space:nowrap;}
.au-pill{display:inline-flex;align-items:center;gap:8px;border:1px solid rgba(0,128,123,.28);
  background:rgba(0,206,201,.07);border-radius:999px;padding:7px 13px;margin-bottom:22px;
  font-family:var(--mono);font-size:9px;letter-spacing:.18em;text-transform:uppercase;color:var(--cy-t);}
.au-dot{width:6px;height:6px;border-radius:50%;background:var(--cy);animation:au-pulse 2.2s ease-in-out infinite;}
@keyframes au-pulse{0%,100%{opacity:1;}50%{opacity:.4;}}

.au-h1{font-family:var(--ser);font-weight:700;font-size:clamp(34px,3.6vw,46px);
  line-height:1;letter-spacing:-.028em;}
.au-h1 em{font-style:italic;color:var(--n400);}
.au-sub{font-size:15px;color:var(--n500);margin:14px 0 0;line-height:1.55;max-width:38ch;}
.au-sub b{color:var(--n900);font-weight:600;}
/* Breathing room so the intro never butts into the first field label. */
.au-sub + form,.au-sub + .au-fields,.au-sub + div{margin-top:26px;}

.au-fields{display:flex;flex-direction:column;gap:16px;}
.au label{display:block;font-family:var(--mono);font-size:9.5px;letter-spacing:.16em;
  text-transform:uppercase;color:var(--n500);margin-bottom:7px;}
.au-field{width:100%;background:var(--page);border:1px solid var(--n200);color:var(--n900);
  font-size:15.5px;font-family:inherit;padding:14px 16px;border-radius:12px;outline:none;
  transition:border-color .25s ease,box-shadow .25s ease,background .25s ease;}
.au-field::placeholder{color:var(--n400);}
.au-field:focus{border-color:var(--act);background:var(--n0);box-shadow:0 0 0 4px var(--act-50);}
.au-field[aria-invalid="true"]{border-color:var(--err);}
.au-haspeek{padding-inline-end:46px;}
.au-pwwrap{position:relative;}
.au-peek{position:absolute;inset-inline-end:6px;top:50%;transform:translateY(-50%);background:transparent;
  border:0;cursor:pointer;color:var(--n400);padding:10px;display:flex;align-items:center;}
.au-peek:hover{color:var(--n700);}
.au-err{margin-top:7px;font-size:12.5px;color:var(--err);}
.au-err:empty{display:none;}
.au-help{margin-top:7px;font-size:12.5px;color:var(--n500);}
.au-trust{margin-top:2px;font-size:12.5px;line-height:1.5;color:var(--n500);text-align:center;}
.au-consent{display:flex !important;align-items:flex-start;gap:10px;font-family:var(--ui) !important;
  font-size:13px !important;line-height:1.55;letter-spacing:normal !important;text-transform:none !important;
  color:var(--n700) !important;margin-bottom:0 !important;cursor:pointer;}
.au-consent input{width:18px;height:18px;flex:0 0 18px;margin-top:2px;accent-color:var(--act);cursor:pointer;}
.au-consent a{color:var(--act);font-weight:600;text-decoration:underline;}
.au-arch{font-size:17px;font-weight:600;color:#fff;margin:10px 0 16px !important;}
.au-bars{display:grid;gap:12px;margin-bottom:20px;}
.au-bars li{display:grid;gap:6px;}
.au-blab{font-family:var(--mono);font-size:9px;letter-spacing:.16em;text-transform:uppercase;
  color:rgba(255,255,255,.55);}
.au-btrack{display:block;height:6px;border-radius:999px;background:rgba(255,255,255,.09);overflow:hidden;}
.au-bfill{display:block;height:100%;border-radius:999px;}
.au-bfill.cy{background:var(--cy);}
.au-bfill.bl{background:var(--act);}
.au-bfill.gy{background:rgba(255,255,255,.28);}
.au-cmid{padding-top:16px;border-top:1px solid var(--nline);}
.au-claim{font-size:13.5px;line-height:1.55;color:rgba(255,255,255,.5);margin-top:9px !important;}
.au-note{padding:13px 15px;border-radius:12px;font-size:13.5px;line-height:1.6;color:var(--n700);
  background:var(--n100);border:1px solid var(--n200);}
.au-note b{color:var(--n900);font-weight:600;}
.au-note.warn{background:var(--err-50);border-color:color-mix(in srgb,var(--err) 32%,transparent);color:var(--err);}
.au-note.warn b{color:var(--err);}

.au-reqs{display:flex;flex-direction:column;gap:8px;}
.au-reqs li{display:flex;align-items:center;gap:10px;font-size:13px;color:var(--n400);
  transition:color .25s ease;}
.au-reqs li i{width:15px;height:15px;border-radius:50%;border:1px solid var(--n300);flex:0 0 15px;
  transition:background .25s ease,border-color .25s ease;position:relative;}
.au-reqs li.met{color:var(--n700);}
.au-reqs li.met i{background:var(--cy);border-color:var(--cy);}
.au-reqs li.met i::after{content:'';position:absolute;left:4.5px;top:2px;width:4px;height:8px;
  border:solid #04302F;border-width:0 1.5px 1.5px 0;transform:rotate(45deg);}

.au-btn{display:inline-flex;align-items:center;justify-content:center;gap:10px;min-height:54px;
  width:100%;border-radius:999px;font-size:16px;font-weight:600;font-family:inherit;
  border:1px solid transparent;background:var(--n900);color:#fff;cursor:pointer;margin-top:4px;
  transition:transform .2s ease,box-shadow .25s ease,opacity .2s ease;}
.au-btn:hover:not(:disabled){transform:translateY(-2px);box-shadow:0 16px 34px -16px rgba(15,21,25,.7);}
/* A disabled control still has to be readable: dark ink on a light neutral. */
.au-btn:disabled{cursor:not-allowed;opacity:1;background:var(--n100,#EDEFF2);color:#4A5563;
  box-shadow:none;transform:none;border:1px solid var(--n200);}
.au-btn:disabled .au-a{color:#4A5563;}
.au-a{width:24px;height:24px;border-radius:50%;background:rgba(255,255,255,.15);display:grid;
  place-items:center;font-size:11px;transition:transform .22s cubic-bezier(.2,.7,.3,1);}
.au-btn:hover:not(:disabled) .au-a{transform:translate(2px,-2px);}
.au-spin{animation:au-spin 1s linear infinite;}
@keyframes au-spin{to{transform:rotate(360deg);}}

.au-center{text-align:center;}
.au-linkbtn{background:none;border:0;cursor:pointer;font-family:inherit;font-size:14.5px;
  font-weight:600;color:var(--act);padding:8px;min-height:44px;}
.au-linkbtn:hover:not(:disabled){text-decoration:underline;}
.au-linkbtn:disabled{opacity:.6;cursor:default;}
.au-linkbtn.quiet{color:var(--n500);font-weight:400;}

.au-legal{margin-top:14px;font-family:var(--mono);font-size:9px;letter-spacing:.14em;
  text-transform:uppercase;color:var(--n400);}
.au-legal-top{margin-top:30px;padding-top:22px;border-top:1px solid var(--n200);}
.au-legal a:hover{color:var(--n700);}

.au-night{background:var(--night);position:relative;overflow:hidden;display:flex;
  align-items:center;justify-content:center;padding:48px clamp(22px,4vw,56px);}
.au-night::before{content:'';position:absolute;inset:0;background:
  radial-gradient(680px 380px at 78% 12%,rgba(0,206,201,.15),transparent 62%),
  radial-gradient(520px 340px at 12% 92%,rgba(6,112,196,.20),transparent 64%);
  animation:au-aurora 30s ease-in-out infinite alternate;will-change:transform,opacity;}
@keyframes au-aurora{
  0%{transform:translate3d(0,0,0) scale(1);opacity:1;}
  50%{transform:translate3d(-3%,2%,0) scale(1.08);opacity:.85;}
  100%{transform:translate3d(2%,-2%,0) scale(1.03);opacity:1;}
}
.au-stars{position:absolute;inset:0;pointer-events:none;background-image:
  radial-gradient(1.4px 1.4px at 18% 22%,rgba(238,242,247,.7),transparent),
  radial-gradient(1.2px 1.2px at 72% 16%,rgba(238,242,247,.55),transparent),
  radial-gradient(1.2px 1.2px at 40% 48%,rgba(0,206,201,.6),transparent),
  radial-gradient(1.3px 1.3px at 86% 62%,rgba(238,242,247,.4),transparent),
  radial-gradient(1.2px 1.2px at 26% 78%,rgba(0,206,201,.4),transparent);}
.au-nwrap{position:relative;z-index:1;max-width:400px;width:100%;}
.au-neyebrow{font-family:var(--mono);font-size:9.5px;letter-spacing:.2em;text-transform:uppercase;
  color:rgba(255,255,255,.42);margin-bottom:16px;}
.au-nh{font-family:var(--ser);font-weight:700;font-size:clamp(26px,2.6vw,34px);line-height:1.06;
  letter-spacing:-.022em;color:#fff;}
.au-nh em{font-style:italic;color:rgba(255,255,255,.42);}
.au-card{background:var(--ncard);border:1px solid var(--nline);border-radius:18px;padding:22px;margin-top:26px;}
.au-ctop{display:flex;justify-content:space-between;font-family:var(--mono);font-size:9.5px;
  letter-spacing:.16em;text-transform:uppercase;color:rgba(255,255,255,.42);}
.au-tl{display:grid;gap:15px;margin:20px 0 18px;}
.au-tl li{display:grid;grid-template-columns:auto 1fr;gap:11px;align-items:start;
  opacity:0;transform:translateY(6px);animation:au-log .5s ease forwards;}
.au-tl li:nth-child(1){animation-delay:.4s;}
.au-tl li:nth-child(2){animation-delay:1.4s;}
.au-tl li:nth-child(3){animation-delay:2.4s;}
@keyframes au-log{to{opacity:1;transform:none;}}
.au-tdot{width:8px;height:8px;border-radius:50%;background:var(--cy);margin-top:6px;}
.au-tt{font-family:var(--mono);font-size:9.5px;letter-spacing:.16em;color:var(--cy-b);
  display:block;margin-bottom:3px;}
.au-tx{font-size:14px;line-height:1.5;color:#EEF2F7;}
.au-agents{display:flex;flex-wrap:wrap;gap:7px;}
.au-ag{font-family:var(--mono);font-size:9.5px;letter-spacing:.14em;text-transform:uppercase;
  padding:7px 10px;border-radius:8px;border:1px solid var(--nline);color:rgba(255,255,255,.6);}
.au-illus{margin-top:14px;font-family:var(--mono);font-size:9px;letter-spacing:.14em;
  text-transform:uppercase;color:rgba(255,255,255,.3);}
.au-ar{font-family:var(--ar);direction:rtl;line-height:1.9;margin-top:24px;font-size:18px;color:var(--cy-b);}
.au-nfoot{position:absolute;bottom:22px;left:0;right:0;text-align:center;font-family:var(--mono);
  font-size:9px;letter-spacing:.16em;text-transform:uppercase;color:rgba(255,255,255,.3);z-index:1;}

.au input:-webkit-autofill,
.au input:-webkit-autofill:hover,
.au input:-webkit-autofill:focus,
.au input:-webkit-autofill:active{
  -webkit-box-shadow:0 0 0 1000px #F2F5F9 inset !important;
  -webkit-text-fill-color:#0F1519 !important;
  caret-color:#0F1519 !important;
  transition:background-color 9999s ease-in-out 0s;
}

@media (max-width:900px){
  .au-shell{grid-template-columns:1fr;}
  .au-night{display:none;}
  .au-pane{padding:36px 22px 48px;}
}
@media (prefers-reduced-motion:reduce){
  .au *,.au *::before,.au *::after{animation:none !important;transition:none !important;}
  .au-tl li{opacity:1;transform:none;}
}
`;
