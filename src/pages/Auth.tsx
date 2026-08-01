import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate, Link } from "react-router-dom";
import { Loader2, Eye, EyeOff } from "lucide-react";
import AuraLogo from "@/components/brand/AuraLogo";
import { useToast } from "@/hooks/use-toast";
import usePageMeta from "@/hooks/usePageMeta";
import { isProfileComplete } from "@/lib/onboarding";

/* ────────────────────────────────────────────────────────────────
   /auth — "The Return".
   Left: the form. Fast, nothing to read, one job.
   Right: the dark instrument — the night that ran while they were
   away. Labelled illustrative, because before sign-in we know
   nothing about this person and must not imply that we do.

   Every rule is scoped under .au. Palette is System-B verbatim.

   All recovery logic is carried over unchanged: PASSWORD_RECOVERY
   events, expired-hash detection, returnTo, the isProfileComplete
   gate, forced sign-out after a password change.
   ──────────────────────────────────────────────────────────────── */

type View = "signin" | "sent" | "newPassword";

const Auth = () => {
  usePageMeta({
    title: "Aura — Sign in",
    description: "Sign in to Aura — your signals, your drafts, and the work that ran overnight.",
    path: "/auth",
  });

  const readParam = (key: string) => {
    if (typeof window === "undefined") return "";
    try { return new URLSearchParams(window.location.search).get(key) ?? ""; }
    catch { return ""; }
  };

  const [email, setEmail] = useState(() => readParam("email"));
  const [hasEmailParam] = useState(() => !!readParam("email"));
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resending, setResending] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [signInError, setSignInError] = useState<string | null>(null);
  const [showLoginPwd, setShowLoginPwd] = useState(false);
  const [resetSentEmail, setResetSentEmail] = useState("");
  const [linkExpired, setLinkExpired] = useState(false);

  // password recovery
  const [view, setView] = useState<View>("signin");
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordConfirm, setNewPasswordConfirm] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [updatingPwd, setUpdatingPwd] = useState(false);
  const inRecoveryRef = useRef(false);

  const emailRef = useRef<HTMLInputElement>(null);
  const pwdRef = useRef<HTMLInputElement>(null);

  const navigate = useNavigate();
  const { toast } = useToast();

  const longEnough = newPassword.length >= 8;
  const matches = newPassword.length > 0 && newPassword === newPasswordConfirm;

  /* ── land the cursor where the work is ── */
  useEffect(() => {
    if (view !== "signin") return;
    const t = window.setTimeout(() => {
      (hasEmailParam ? pwdRef.current : emailRef.current)?.focus();
    }, 60);
    return () => window.clearTimeout(t);
  }, [view, hasEmailParam]);

  const checkOnboardingAndRedirect = async (session: any) => {
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
      .select("first_name, firm, level, sector_focus")
      .eq("user_id", session.user.id)
      .maybeSingle();

    // Field-based gate — a row alone is not "onboarded". Anyone missing
    // first_name / firm / level / sector_focus goes to /onboarding.
    if (!isProfileComplete(profile)) {
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
        toast({ title: "Password updated", description: "Sign in with your new password." });
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
        "That email and password don't match. If you've never set a password, use \u201cSet or reset your password\u201d below.",
      );
      setLoading(false);
      pwdRef.current?.focus();
      return;
    }
    // Leave the button in its loading state — onAuthStateChange navigates.
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
      setEmailError("Enter your email first");
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
      toast({ title: "Couldn't send the link", description: "Please try again.", variant: "destructive" });
    } finally {
      setResetting(false);
    }
  };

  const handleResend = async () => {
    if (!resetSentEmail) return;
    setResending(true);
    try {
      await sendReset(resetSentEmail);
      toast({ title: "Sent again", description: `Another link is on its way to ${resetSentEmail}.` });
    } catch {
      toast({ title: "Couldn't resend", description: "Please try again.", variant: "destructive" });
    } finally {
      setResending(false);
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
        title: "Couldn't update the password",
        description: e?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setUpdatingPwd(false);
    }
  };

  const headline =
    view === "newPassword" ? <>Set your <em>password.</em></>
    : view === "sent" ? <>Check your <em>email.</em></>
    : linkExpired ? <>That link <em>has expired.</em></>
    : <>Welcome <em>back.</em></>;

  const sub =
    view === "newPassword" ? "Eight characters or more. You'll sign in with it straight after."
    : view === "sent" ? <>A link is on its way to <b>{resetSentEmail}</b>. It opens once and expires in twenty-four hours.</>
    : linkExpired ? "They last twenty-four hours. Enter your email and a fresh one is on its way."
    : hasEmailParam ? "Sign in to pick up where the night left off."
    : "The night shift ran while you were gone. Everything it found is inside.";

  return (
    <div className="au">
      <style>{AU_CSS}</style>

      <div className="au-shell">
        {/* ── LEFT · the form ── */}
        <div className="au-pane">
          <div className="au-form">
            <Link className="au-brandrow" to="/">
              <AuraLogo size={30} variant="auto" />
              <span className="au-bn">Aura</span>
              <span className="au-bsub">Personal professional intelligence</span>
            </Link>

            {view === "signin" && (
              <span className="au-pill"><i className="au-dot" /> Closed beta</span>
            )}

            <h1 className="au-h1">{headline}</h1>
            <p className="au-sub">{sub}</p>

            {/* ── sign in ── */}
            {view === "signin" && (
              <form onSubmit={handleSubmit} className="au-fields" noValidate>
                {linkExpired ? (
                  <div className="au-note warn" role="status">
                    This reset link is no longer valid. Nothing is wrong with your seat.
                  </div>
                ) : (
                  <div className="au-note">
                    First time here? Use <b>Set or reset your password</b> below — enter the
                    email your invitation was sent to.
                  </div>
                )}

                <div>
                  <label htmlFor="au-email">Email</label>
                  <input
                    id="au-email" ref={emailRef} type="email" value={email} required
                    autoComplete="username" placeholder="you@company.com" className="au-field"
                    aria-invalid={!!emailError}
                    onChange={(e) => { setEmail(e.target.value); setEmailError(null); setSignInError(null); }}
                  />
                  {emailError && <p className="au-err" role="alert">{emailError}</p>}
                </div>

                <div>
                  <label htmlFor="au-password">Password</label>
                  <div className="au-pwwrap">
                    <input
                      id="au-password" ref={pwdRef} type={showLoginPwd ? "text" : "password"}
                      value={password} required minLength={6} autoComplete="current-password"
                      placeholder="••••••••" className="au-field au-haspeek"
                      aria-invalid={!!signInError}
                      onChange={(e) => { setPassword(e.target.value); setSignInError(null); }}
                    />
                    <button
                      type="button" className="au-peek"
                      aria-label={showLoginPwd ? "Hide password" : "Show password"}
                      onClick={() => setShowLoginPwd((s) => !s)}
                    >
                      {showLoginPwd ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>

                {signInError && <div className="au-note warn" role="alert">{signInError}</div>}

                <button type="submit" disabled={loading} className="au-btn">
                  {loading ? (
                    <><Loader2 className="au-spin" size={16} /> Signing you in…</>
                  ) : (
                    <>Sign in <span className="au-a">↗</span></>
                  )}
                </button>

                <div className="au-center">
                  <button type="button" onClick={handleForgotPassword} disabled={resetting} className="au-linkbtn">
                    {resetting
                      ? "Sending…"
                      : linkExpired
                        ? "Send a new link →"
                        : "Set or reset your password →"}
                  </button>
                </div>
              </form>
            )}

            {/* ── link sent ── */}
            {view === "sent" && (
              <div className="au-fields">
                <div className="au-note">
                  Nothing after a minute or two? Check spam. Look for the subject{" "}
                  <b>Reset your Aura password</b>, from <b>Aura</b>.
                </div>
                <button type="button" onClick={handleResend} disabled={resending} className="au-btn">
                  {resending ? (<><Loader2 className="au-spin" size={16} /> Sending…</>) : (<>Send it again <span className="au-a">↗</span></>)}
                </button>
                <div className="au-center">
                  <button
                    type="button" className="au-linkbtn"
                    onClick={() => { setView("signin"); setResetSentEmail(""); }}
                  >
                    Use a different email →
                  </button>
                </div>
                <div className="au-center">
                  <button type="button" className="au-linkbtn quiet" onClick={() => setView("signin")}>
                    ← Back to sign in
                  </button>
                </div>
              </div>
            )}

            {/* ── set a new password ── */}
            {view === "newPassword" && (
              <div className="au-fields">
                <div>
                  <label htmlFor="au-new">New password</label>
                  <div className="au-pwwrap">
                    <input
                      id="au-new" type={showPwd ? "text" : "password"} value={newPassword}
                      autoComplete="new-password" placeholder="••••••••" className="au-field au-haspeek"
                      onChange={(e) => setNewPassword(e.target.value)}
                    />
                    <button
                      type="button" className="au-peek"
                      aria-label={showPwd ? "Hide password" : "Show password"}
                      onClick={() => setShowPwd((s) => !s)}
                    >
                      {showPwd ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>

                <div>
                  <label htmlFor="au-confirm">Confirm password</label>
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
                    <i />At least 8 characters
                  </li>
                  <li className={matches ? "met" : ""}>
                    <i />Both entries match
                  </li>
                </ul>

                <button
                  type="button" onClick={handleResetPassword}
                  disabled={updatingPwd || !longEnough || !matches} className="au-btn"
                >
                  {updatingPwd ? (<><Loader2 className="au-spin" size={16} /> Updating…</>) : (<>Update password <span className="au-a">↗</span></>)}
                </button>
              </div>
            )}

            <p className="au-foot">
              No seat yet? <Link to="/request-access">Request a founder seat →</Link>
            </p>
            <p className="au-legal">
              <Link to="/privacy">Privacy</Link> · <Link to="/terms">Terms</Link> ·{" "}
              <Link to="/trust">Security</Link> ·{" "}
              <a href="mailto:support@aura-intel.org">Support</a>
            </p>
          </div>
        </div>

        {/* ── RIGHT · the instrument ── */}
        <div className="au-night" aria-hidden="true">
          <div className="au-stars" />
          <div className="au-nwrap">
            <p className="au-neyebrow">While you were away</p>
            <h2 className="au-nh">The night shift <em>doesn't take nights off.</em></h2>

            <div className="au-card">
              <div className="au-ctop"><span>A night inside Aura</span><span>02:00 → 03:12</span></div>
              <ul className="au-tl">
                <li><i className="au-tdot" /><div><span className="au-tt">02:04</span><span className="au-tx">Read every capture from the week.</span></div></li>
                <li><i className="au-tdot" /><div><span className="au-tt">02:31</span><span className="au-tx">Found a pattern — three sources agree.</span></div></li>
                <li><i className="au-tdot" /><div><span className="au-tt">03:12</span><span className="au-tx">Built the evidence, in your voice.</span></div></li>
              </ul>
              <div className="au-agents">
                <span className="au-ag">Reader</span><span className="au-ag">Signal</span>
                <span className="au-ag">Voice</span><span className="au-ag">Editor</span>
              </div>
            </div>

            <p className="au-illus">Illustrative — your own log is waiting inside</p>
            <p className="au-ar" dir="rtl">حتى السوق يعرفك قبل ما يشوفك ✦</p>
          </div>
          <p className="au-nfoot">Founding circle · 2026</p>
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
  --ser:'Instrument Serif',Georgia,serif;
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
.au-bn{font-family:var(--ser);font-size:26px;line-height:1;}
.au-bsub{font-family:var(--mono);font-size:9px;letter-spacing:.18em;text-transform:uppercase;
  color:var(--n400);padding-left:11px;border-left:1px solid var(--n200);line-height:1.4;max-width:11ch;}
.au-pill{display:inline-flex;align-items:center;gap:8px;border:1px solid rgba(0,128,123,.28);
  background:rgba(0,206,201,.07);border-radius:999px;padding:7px 13px;margin-bottom:22px;
  font-family:var(--mono);font-size:9px;letter-spacing:.18em;text-transform:uppercase;color:var(--cy-t);}
.au-dot{width:6px;height:6px;border-radius:50%;background:var(--cy);animation:au-pulse 2.2s ease-in-out infinite;}
@keyframes au-pulse{0%,100%{opacity:1;}50%{opacity:.4;}}

.au-h1{font-family:var(--ser);font-weight:400;font-size:clamp(34px,3.6vw,46px);
  line-height:1;letter-spacing:-.028em;}
.au-h1 em{font-style:italic;color:var(--n400);}
.au-sub{font-size:15px;color:var(--n500);margin:14px 0 28px;line-height:1.55;max-width:38ch;}
.au-sub b{color:var(--n900);font-weight:600;}

.au-fields{display:flex;flex-direction:column;gap:16px;}
.au label{display:block;font-family:var(--mono);font-size:9.5px;letter-spacing:.16em;
  text-transform:uppercase;color:var(--n500);margin-bottom:7px;}
.au-field{width:100%;background:var(--page);border:1px solid var(--n200);color:var(--n900);
  font-size:15.5px;font-family:inherit;padding:14px 16px;border-radius:12px;outline:none;
  transition:border-color .25s ease,box-shadow .25s ease,background .25s ease;}
.au-field::placeholder{color:var(--n400);}
.au-field:focus{border-color:var(--act);background:var(--n0);box-shadow:0 0 0 4px var(--act-50);}
.au-field[aria-invalid="true"]{border-color:var(--err);}
.au-haspeek{padding-right:46px;}
.au-pwwrap{position:relative;}
.au-peek{position:absolute;right:6px;top:50%;transform:translateY(-50%);background:transparent;
  border:0;cursor:pointer;color:var(--n400);padding:10px;display:flex;align-items:center;}
.au-peek:hover{color:var(--n700);}
.au-err{margin-top:7px;font-size:12.5px;color:var(--err);}
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
.au-btn:disabled{cursor:not-allowed;opacity:.5;}
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

.au-foot{margin-top:30px;padding-top:22px;border-top:1px solid var(--n200);
  font-size:14.5px;color:var(--n500);}
.au-foot a{color:var(--act);font-weight:600;}
.au-legal{margin-top:14px;font-family:var(--mono);font-size:9px;letter-spacing:.14em;
  text-transform:uppercase;color:var(--n400);}
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
.au-nh{font-family:var(--ser);font-weight:400;font-size:clamp(26px,2.6vw,34px);line-height:1.06;
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
