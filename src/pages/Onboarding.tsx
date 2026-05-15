import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, ArrowRight, FileText, Check, Eye, EyeOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import BrandAssessmentModal from "@/components/BrandAssessmentModal";

const SECTORS = [
  "Energy & Utilities",
  "Financial Services",
  "Government",
  "Healthcare",
  "Technology",
  "Consulting",
  "Manufacturing",
  "Real Estate",
  "Telecommunications",
  "Education",
  "Other",
];

type Step = 0 | 1 | 2 | 3;

interface Prefill {
  first_name?: string;
  firm?: string;
  level?: string;
  core_practice?: string;
  sector_focus?: string;
}

interface FoundArticle {
  url: string;
  title: string;
  summary?: string;
  source?: string;
}

const Onboarding = () => {
  const navigate = useNavigate();

  // Suppress the home first-visit hint for users who just completed onboarding.
  const goHome = () => {
    try {
      const raw = localStorage.getItem("aura_visited_pages");
      const arr: string[] = raw ? JSON.parse(raw) : [];
      if (!arr.includes("home")) {
        arr.push("home");
        localStorage.setItem("aura_visited_pages", JSON.stringify(arr));
      }
    } catch { /* ignore */ }
    navigate("/home", { replace: true });
  };
  const [step, setStep] = useState<Step>(0);
  const [direction, setDirection] = useState(1);
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);

  // Step -1: password setup gate
  const [needsPassword, setNeedsPassword] = useState(false);
  const [pwd, setPwd] = useState("");
  const [pwdConfirm, setPwdConfirm] = useState("");
  const [pwdShow, setPwdShow] = useState(false);
  const [settingPwd, setSettingPwd] = useState(false);

  // Step 0
  const [revealCount, setRevealCount] = useState(0);

  // Step 1
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [linkedinText, setLinkedinText] = useState("");
  const [linkedinError, setLinkedinError] = useState("");
  const [readingLi, setReadingLi] = useState(false);
  const [liStatusIdx, setLiStatusIdx] = useState(0);
  const [showForm, setShowForm] = useState(false);
  const [usedLinkedIn, setUsedLinkedIn] = useState(false);
  const [describeMode, setDescribeMode] = useState(false);
  const [helperOpen, setHelperOpen] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [firm, setFirm] = useState("");
  const [level, setLevel] = useState("");
  const [sectorFocus, setSectorFocus] = useState("");
  const [corePractice, setCorePractice] = useState("");
  const [northStar, setNorthStar] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  // Step 2
  const [foundArticle, setFoundArticle] = useState<FoundArticle | null>(null);
  const [articleSearchDone, setArticleSearchDone] = useState(false);
  const [manualUrl, setManualUrl] = useState("");
  const [capturing, setCapturing] = useState(false);
  const [captureSuccess, setCaptureSuccess] = useState(false);
  const articleSearchStartRef = useRef<number>(0);

  // Step 3
  const [assessmentOpen, setAssessmentOpen] = useState(false);

  // Auth + gate: if user already onboarded, send them home.
  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate("/auth", { replace: true });
        return;
      }
      setUserId(session.user.id);
      setUserEmail(session.user.email ?? null);
      const passwordAlreadySet = Boolean((session.user.user_metadata as any)?.password_set);
      if (!passwordAlreadySet) setNeedsPassword(true);
      const { data: profile } = await supabase
        .from("diagnostic_profiles" as any)
        .select("first_name, onboarding_completed")
        .eq("user_id", session.user.id)
        .maybeSingle();
      if (profile && (profile as any).onboarding_completed && (profile as any).first_name) {
        goHome();
        return;
      }
      setChecking(false);
    })();
  }, [navigate]);

  // Step 0: stagger reveal of the 3 bullet items
  useEffect(() => {
    if (step !== 0 || checking) return;
    setRevealCount(0);
    const timers = [500, 1000, 1500].map((ms, i) =>
      window.setTimeout(() => setRevealCount(i + 1), ms),
    );
    return () => timers.forEach(clearTimeout);
  }, [step, checking]);

  // Step 1: rotating loading status
  useEffect(() => {
    if (!readingLi) return;
    setLiStatusIdx(0);
    const t1 = window.setTimeout(() => setLiStatusIdx(1), 2000);
    const t2 = window.setTimeout(() => setLiStatusIdx(2), 4000);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [readingLi]);

  const goStep = (next: Step) => {
    setDirection(next > step ? 1 : -1);
    setStep(next);
  };

  // ─── Step 1: LinkedIn pre-fill ───
  const handleReadLinkedIn = async () => {
    setLinkedinError("");
    if (linkedinText.trim().length < 10) {
      setLinkedinError("Tell us a bit more — paste your headline or describe your role");
      return;
    }
    setReadingLi(true);
    let timedOut = false;
    const timeout = window.setTimeout(() => {
      timedOut = true;
      setReadingLi(false);
      toast.message("Taking too long — let's fill this manually");
      setShowForm(true);
    }, 15000);

    try {
      const { data, error } = await supabase.functions.invoke("onboarding-linkedin-prefill", {
        body: { linkedin_text: linkedinText.trim() },
      });
      clearTimeout(timeout);
      if (timedOut) return;

      if (error) throw error;
      const p: Prefill = (data && (data.profile || (data.success ? data : null))) || {};
      const hasData = !!(p && (p.first_name || p.firm || p.level || p.core_practice));
      if (!hasData) {
        toast.message("Couldn't extract from that text. No problem — fill it in manually.");
        setShowForm(true);
      } else {
        setFirstName(p.first_name || "");
        setFirm(p.firm || "");
        setLevel(p.level || "");
        setCorePractice(p.core_practice || "");
        const s = p.sector_focus || "";
        setSectorFocus(SECTORS.includes(s) ? s : (s ? "Other" : ""));
        setUsedLinkedIn(true);
        setShowForm(true);
        // Successful extraction — show inline confirmation only, no error toast.
      }
    } catch (e) {
      clearTimeout(timeout);
      if (timedOut) return;
      toast.message("Couldn't read that. No problem — fill it in manually.");
      setShowForm(true);
    } finally {
      setReadingLi(false);
    }
  };

  const profileValid = !!(firstName.trim() && firm.trim() && level.trim() && sectorFocus);

  const handleSaveProfile = async () => {
    if (!userId || !profileValid) return;
    setSavingProfile(true);
    try {
      const payload: any = {
        user_id: userId,
        first_name: firstName.trim(),
        firm: firm.trim(),
        level: level.trim(),
        sector_focus: sectorFocus,
        core_practice: corePractice.trim() || null,
        north_star_goal: northStar.trim() || null,
        onboarding_completed: true,
        completed: true,
      };
      if (usedLinkedIn && linkedinUrl.trim()) payload.linkedin_url = linkedinUrl.trim();

      const { error } = await supabase
        .from("diagnostic_profiles" as any)
        .upsert(payload, { onConflict: "user_id" });
      if (error) throw error;
      try { localStorage.setItem("aura_onboarding_complete", "true"); } catch {}

      // Kick off article search in the background — don't await
      articleSearchStartRef.current = Date.now();
      setArticleSearchDone(false);
      setFoundArticle(null);
      supabase.functions
        .invoke("onboarding-find-article", {
          body: {
            sector_focus: sectorFocus,
            core_practice: corePractice.trim(),
            firm: firm.trim(),
            level: level.trim(),
          },
        })
        .then(({ data }) => {
          if (data?.found && data?.article) setFoundArticle(data.article);
        })
        .catch(() => {})
        .finally(() => setArticleSearchDone(true));

      goStep(2);
    } catch (e: any) {
      toast.error(e.message || "Could not save profile");
    } finally {
      setSavingProfile(false);
    }
  };

  // ─── Step 2: capture article ───
  const captureArticle = async (url: string, articleMeta?: { title?: string; summary?: string; source?: string }) => {
    if (!url.trim()) return;
    try {
      new URL(url.trim());
    } catch {
      toast.error("That doesn't look like a valid URL");
      return;
    }
    setCapturing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Session expired");
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ingest-capture`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          type: "link",
          content: url.trim(),
          source_url: url.trim(),
          metadata: articleMeta
            ? {
                title: articleMeta.title,
                summary: articleMeta.summary,
                source: "onboarding_exa",
              }
            : {},
        }),
      });
      const data = await resp.json().catch(() => null);
      if (!resp.ok && data?.error !== "duplicate_url") {
        throw new Error(data?.error_message || data?.message || "Capture failed");
      }
      // ingest-capture creates the entry server-side — no client-side insert needed.
      setCaptureSuccess(true);
      window.setTimeout(() => goStep(3), 2500);
    } catch (e: any) {
      toast.error(e.message || "Couldn't capture that one");
    } finally {
      setCapturing(false);
    }
  };

  // ─── Render helpers ───
  const ProgressDots = () => (
    <div className="flex items-center justify-center gap-2 mb-6">
      {[0, 1, 2, 3].map((i) => {
        const isCurrent = i === step;
        const isDone = i < step;
        return (
          <div
            key={i}
            className="rounded-full transition-all duration-300 flex items-center justify-center"
            style={{
              width: 8,
              height: 8,
              background: isCurrent
                ? "var(--brand)"
                : isDone
                ? "hsl(142 60% 45%)"
                : "transparent",
              border: isCurrent || isDone ? "none" : "1px solid hsl(var(--border))",
            }}
          />
        );
      })}
    </div>
  );

  const cardShell = (children: React.ReactNode) => (
    <div
      className="min-h-screen w-full flex items-center justify-center px-5 py-10"
      style={{ background: "hsl(var(--background))" }}
    >
      <div
        className="w-full"
        style={{
          maxWidth: 560,
          background: "hsl(var(--card))",
          color: "hsl(var(--card-foreground))",
          borderRadius: 16,
          boxShadow: "0 8px 32px rgba(0,0,0,0.08), 0 8px 32px rgba(0,0,0,0.3)",
          padding: "clamp(32px, 6vw, 48px)",
          border: "1px solid hsl(var(--border))",
        }}
      >
        <ProgressDots />
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={step}
            custom={direction}
            initial={{ opacity: 0, x: direction * 30 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: direction * -30 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );

  const eyebrow = (text: string) => (
    <p
      className="font-semibold mb-3"
      style={{
        fontSize: 11,
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        color: "var(--brand)",
      }}
    >
      {text}
    </p>
  );

  const heading = (text: string) => (
    <h1
      className="font-semibold mb-3"
      style={{
        fontFamily: "var(--font-display, 'Cormorant Garamond', serif)",
        fontSize: 28,
        lineHeight: 1.2,
        color: "hsl(var(--foreground))",
      }}
    >
      {text}
    </h1>
  );

  const body = (text: React.ReactNode) => (
    <p style={{ fontSize: 15, lineHeight: 1.7, color: "hsl(var(--foreground))" }}>
      {text}
    </p>
  );

  const primaryBtn = (label: React.ReactNode, onClick: () => void, opts: { disabled?: boolean; loading?: boolean } = {}) => (
    <button
      onClick={onClick}
      disabled={opts.disabled || opts.loading}
      className="w-full font-semibold transition-all disabled:opacity-50 flex items-center justify-center gap-2"
      style={{
        height: 48,
        background: "var(--brand)",
        color: "var(--brand-foreground, #1A1916)",
        borderRadius: 10,
        fontSize: 14,
      }}
    >
      {opts.loading && <Loader2 className="w-4 h-4 animate-spin" />}
      {label}
    </button>
  );

  const ghostLink = (label: string, onClick: () => void) => (
    <button
      onClick={onClick}
      className="w-full text-sm py-2 transition-colors"
      style={{ color: "hsl(var(--muted-foreground))", background: "transparent" }}
    >
      {label}
    </button>
  );

  const inputCls = "w-full rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand)]/40 transition-colors";
  const inputStyle: React.CSSProperties = {
    border: "1px solid hsl(var(--border))",
    background: "hsl(var(--muted) / 0.4)",
    color: "hsl(var(--foreground))",
  };

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "hsl(var(--background))" }}>
        <Loader2 className="w-5 h-5 animate-spin" style={{ color: "var(--brand)" }} />
      </div>
    );
  }

  // ───── STEP -1: Password gate ─────
  const handleSetPassword = async () => {
    if (!pwd || pwd.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    if (pwd !== pwdConfirm) {
      toast.error("Passwords don't match");
      return;
    }
    setSettingPwd(true);
    try {
      // Step 1: Update the password
      const { data: updateData, error: updateError } = await supabase.auth.updateUser({
        password: pwd,
      });
      if (updateError) {
        console.error("Password update failed:", updateError);
        toast.error("Failed to set password: " + (updateError.message || "Unknown error"));
        setSettingPwd(false);
        return;
      }
      console.log("Password update succeeded:", updateData);

      // Step 2: Verify session is still valid after password change
      const { data: { user: verifiedUser }, error: verifyError } = await supabase.auth.getUser();
      if (verifyError || !verifiedUser) {
        console.error("User verification after password set failed:", verifyError);
        toast.error("Password may not have saved. Please try again.");
        setSettingPwd(false);
        return;
      }

      // Step 3: Mark password_set in metadata (non-critical)
      const { error: metaError } = await supabase.auth.updateUser({
        data: { password_set: true },
      });
      if (metaError) {
        console.warn("Metadata update failed (non-critical):", metaError);
      }

      toast.success(`Password set for ${verifiedUser.email}. You can now log in anytime.`);

      // Step 5: Notify (non-blocking)
      try {
        await supabase.functions.invoke("send-account-notification", {
          body: { type: "password_set", email: verifiedUser.email, first_name: null },
        });
      } catch (e) {
        console.warn("password_set notification failed:", e);
      }

      setNeedsPassword(false);
      setPwd(""); setPwdConfirm("");
    } catch (e: any) {
      console.error("Unexpected error in password setup:", e);
      toast.error(e?.message || "Something went wrong. Please try again.");
      setSettingPwd(false);
    }
  };

  if (needsPassword) {
    const pwdInputStyle: React.CSSProperties = {
      width: "100%",
      padding: "12px 40px 12px 14px",
      fontSize: 14,
      background: "hsl(var(--muted) / 0.4)",
      border: "1px solid hsl(var(--border))",
      borderRadius: 10,
      color: "hsl(var(--foreground))",
      outline: "none",
    };
    const checks = {
      length: pwd.length >= 8,
      uppercase: /[A-Z]/.test(pwd),
      lowercase: /[a-z]/.test(pwd),
      number: /[0-9]/.test(pwd),
      special: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/.test(pwd),
      match: pwd.length > 0 && pwdConfirm.length > 0 && pwd === pwdConfirm,
    };
    const allValid = Object.values(checks).every(Boolean);
    const checklist: { key: keyof typeof checks; label: string }[] = [
      { key: "length", label: "At least 8 characters" },
      { key: "uppercase", label: "One uppercase letter (A–Z)" },
      { key: "lowercase", label: "One lowercase letter (a–z)" },
      { key: "number", label: "One number (0–9)" },
      { key: "special", label: "One special character (!@#$%)" },
      { key: "match", label: "Passwords match" },
    ];
    return cardShell(
      <>
        {eyebrow("Secure your account")}
        {heading("Set your password.")}
        <p className="mb-6" style={{ fontSize: 15, lineHeight: 1.7, color: "hsl(var(--muted-foreground))" }}>
          Set a password so you can always come back to Aura from any device.
        </p>
        <div style={{ position: "relative", marginBottom: 12 }}>
          <input
            type={pwdShow ? "text" : "password"}
            value={pwd}
            onChange={(e) => setPwd(e.target.value)}
            placeholder="Create a password"
            style={pwdInputStyle}
            autoComplete="new-password"
          />
          <button
            type="button" onClick={() => setPwdShow((s) => !s)}
            aria-label={pwdShow ? "Hide password" : "Show password"}
            style={{
              position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
              background: "transparent", border: 0, cursor: "pointer",
              color: "hsl(var(--muted-foreground))", padding: 4,
            }}
          >{pwdShow ? <EyeOff size={16} /> : <Eye size={16} />}</button>
        </div>
        <div style={{ position: "relative", marginBottom: 8 }}>
          <input
            type={pwdShow ? "text" : "password"}
            value={pwdConfirm}
            onChange={(e) => setPwdConfirm(e.target.value)}
            placeholder="Confirm password"
            style={pwdInputStyle}
            autoComplete="new-password"
            onKeyDown={(e) => { if (e.key === "Enter") handleSetPassword(); }}
          />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, margin: "10px 0 18px" }}>
          {checklist.map(({ key, label }) => {
            const ok = checks[key];
            return (
              <div key={key} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                {ok ? (
                  <Check size={14} style={{ color: "hsl(142 70% 45%)" }} />
                ) : (
                  <span style={{ width: 14, height: 14, borderRadius: 999, border: "1.5px solid hsl(var(--border))", display: "inline-block" }} />
                )}
                <span style={{ color: ok ? "hsl(var(--foreground))" : "hsl(var(--muted-foreground))" }}>{label}</span>
              </div>
            );
          })}
        </div>
        {primaryBtn(
          <>Set password & continue <ArrowRight className="w-4 h-4" /></>,
          handleSetPassword,
          { loading: settingPwd, disabled: !allValid },
        )}
      </>,
    );
  }

  // ───── STEP 0 ─────
  if (step === 0) {
    const items = [
      "Read your LinkedIn and understand who you are professionally",
      "Find a relevant article from your sector — your first intelligence capture",
      "Begin building your strategic positioning",
    ];
    return cardShell(
      <>
        {eyebrow("Your intelligence OS is live")}
        {heading("Welcome to Aura.")}
        <div className="space-y-4 mb-8">
          {body(<>You have the expertise. The certificates. The years. But right now, to anyone who hasn't met you in person — you're invisible.</>)}
          {body(<>That changes today.</>)}
          {body(<>In the next 3 minutes, Aura will:</>)}
        </div>
        <ul className="space-y-3 mb-8">
          {items.map((it, i) => (
            <motion.li
              key={i}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: i < revealCount ? 1 : 0, y: i < revealCount ? 0 : 8 }}
              transition={{ duration: 0.4, ease: "easeOut" }}
              className="flex items-start gap-3"
              style={{ fontSize: 14, lineHeight: 1.6, color: "hsl(var(--foreground))" }}
            >
              <span style={{ color: "var(--brand)", fontSize: 14, lineHeight: 1.6 }}>◆</span>
              <span>{it}</span>
            </motion.li>
          ))}
        </ul>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: revealCount >= 3 ? 1 : 0 }}
          transition={{ duration: 0.5 }}
        >
          {primaryBtn(<>Let's begin <ArrowRight className="w-4 h-4" /></>, () => goStep(1), { disabled: revealCount < 3 })}
        </motion.div>
      </>,
    );
  }

  // ───── STEP 1 ─────
  if (step === 1) {
    return cardShell(
      <>
        {eyebrow("Step 1 of 3 — Tell Aura who you are")}
        {!showForm ? (
          <>
            {heading("Paste your LinkedIn headline and About section")}
            <p className="mb-4" style={{ fontSize: 15, lineHeight: 1.7, color: "hsl(var(--muted-foreground))" }}>
              Aura extracts your profile in seconds.
            </p>
            <label className="text-xs font-medium block mb-1" style={{ color: "hsl(var(--muted-foreground))" }}>
              Paste your LinkedIn headline and About section
            </label>
            <div className="relative mb-2">
              <textarea
                rows={5}
                className={inputCls}
                style={{
                  ...inputStyle,
                  resize: "vertical",
                  minHeight: 120,
                  ...(readingLi ? { backgroundImage: "linear-gradient(90deg, transparent, rgba(176,141,58,0.08), transparent)", backgroundSize: "200% 100%", animation: "auraShimmer 1.6s linear infinite" } : {}),
                } as React.CSSProperties}
                placeholder="Copy your headline and About section from LinkedIn — or just describe what you do and your sector in a few sentences"
                value={linkedinText}
                onChange={(e) => setLinkedinText(e.target.value)}
                disabled={readingLi}
              />
              <style>{`@keyframes auraShimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`}</style>
            </div>
            {linkedinError && <p className="text-xs mb-3" style={{ color: "hsl(0 70% 55%)" }}>{linkedinError}</p>}
            {readingLi && (
              <div className="mb-4 text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>
                {liStatusIdx === 0 && "Reading what you pasted..."}
                {liStatusIdx === 1 && "Extracting your expertise..."}
                {liStatusIdx === 2 && "Almost there..."}
              </div>
            )}
            <div className="mt-4 mb-4">
              {primaryBtn(<>Read my profile <ArrowRight className="w-4 h-4" /></>, handleReadLinkedIn, { loading: readingLi, disabled: linkedinText.trim().length < 10 })}
            </div>
            <div className="flex items-center gap-3 my-4" style={{ color: "hsl(var(--muted-foreground))", fontSize: 12 }}>
              <div className="flex-1 h-px" style={{ background: "hsl(var(--border))" }} />
              <span>or</span>
              <div className="flex-1 h-px" style={{ background: "hsl(var(--border))" }} />
            </div>
            {ghostLink("Fill manually instead", () => { setShowForm(true); setUsedLinkedIn(false); })}
          </>
        ) : (
          <>
            {heading("Confirm your profile")}
            {usedLinkedIn && (
              <p className="mb-5 flex items-center gap-2 text-sm" style={{ color: "hsl(142 60% 45%)" }}>
                <Check className="w-4 h-4" /> Profile read successfully — edit anything that's not quite right.
              </p>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
              <div>
                <label className="text-xs font-medium block mb-1" style={{ color: "hsl(var(--muted-foreground))" }}>First name</label>
                <input className={inputCls} style={inputStyle} value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Mohammad" />
              </div>
              <div>
                <label className="text-xs font-medium block mb-1" style={{ color: "hsl(var(--muted-foreground))" }}>Firm</label>
                <input className={inputCls} style={inputStyle} value={firm} onChange={(e) => setFirm(e.target.value)} placeholder="EY" />
              </div>
              <div>
                <label className="text-xs font-medium block mb-1" style={{ color: "hsl(var(--muted-foreground))" }}>Level / title</label>
                <input className={inputCls} style={inputStyle} value={level} onChange={(e) => setLevel(e.target.value)} placeholder="Director" />
              </div>
              <div>
                <label className="text-xs font-medium block mb-1" style={{ color: "hsl(var(--muted-foreground))" }}>Sector focus</label>
                <select className={inputCls} style={inputStyle} value={sectorFocus} onChange={(e) => setSectorFocus(e.target.value)}>
                  <option value="">Select…</option>
                  {SECTORS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <div className="mb-3">
              <label className="text-xs font-medium block mb-1" style={{ color: "hsl(var(--muted-foreground))" }}>Core practice</label>
              <input className={inputCls} style={inputStyle} value={corePractice} onChange={(e) => setCorePractice(e.target.value)} placeholder="Digital Transformation" />
            </div>
            <div className="mb-5">
              <label className="text-xs font-medium block mb-1" style={{ color: "hsl(var(--muted-foreground))" }}>My 3-year ambition</label>
              <input className={inputCls} style={inputStyle} value={northStar} onChange={(e) => setNorthStar(e.target.value)} placeholder="This one's yours — what are you building toward?" />
            </div>
            {primaryBtn(<>Confirm & continue <ArrowRight className="w-4 h-4" /></>, handleSaveProfile, { loading: savingProfile, disabled: !profileValid })}
          </>
        )}
      </>,
    );
  }

  // ───── STEP 2 ─────
  if (step === 2) {
    const elapsed = Date.now() - articleSearchStartRef.current;
    const stillSearching = !articleSearchDone && elapsed < 10000;

    if (captureSuccess) {
      return cardShell(
        <>
          {eyebrow("Step 2 of 3 — Your first intelligence capture")}
          {heading("First capture complete.")}
          <p className="mb-6" style={{ fontSize: 15, lineHeight: 1.7, color: "hsl(var(--foreground))" }}>
            Aura is already detecting strategic patterns. After 3-5 more articles, your first signal emerges.
          </p>
          {primaryBtn(<>Continue <ArrowRight className="w-4 h-4" /></>, () => goStep(3))}
        </>,
      );
    }

    return cardShell(
      <>
        {eyebrow("Step 2 of 3 — Your first intelligence capture")}
        {stillSearching ? (
          <>
            {heading("Finding something relevant in your sector...")}
            <div className="flex items-center gap-3 py-4" style={{ color: "hsl(var(--muted-foreground))" }}>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">Aura is searching trusted sources...</span>
            </div>
            <ArticleManualPaste url={manualUrl} setUrl={setManualUrl} onSave={() => captureArticle(manualUrl)} loading={capturing} inputCls={inputCls} inputStyle={inputStyle} />
            <div className="mt-3">{ghostLink("Skip for now", () => goStep(3))}</div>
          </>
        ) : foundArticle ? (
          <>
            {heading("Aura found something in your sector.")}
            <div
              className="rounded-xl p-4 mb-5 mt-2"
              style={{ border: "1px solid hsl(var(--border))", background: "hsl(var(--muted) / 0.3)" }}
            >
              <div className="flex items-start gap-3 mb-2">
                <FileText className="w-4 h-4 mt-0.5 shrink-0" style={{ color: "var(--brand)" }} />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm mb-1" style={{ color: "hsl(var(--foreground))" }}>{foundArticle.title}</p>
                  <p className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>{foundArticle.source || (() => { try { return new URL(foundArticle.url).hostname; } catch { return ""; } })()}</p>
                </div>
              </div>
              {foundArticle.summary && (
                <p className="text-sm italic mb-3" style={{ color: "hsl(var(--muted-foreground))", lineHeight: 1.5 }}>
                  "{foundArticle.summary}"
                </p>
              )}
              {primaryBtn(
                <>Capture this article <ArrowRight className="w-4 h-4" /></>,
                () => captureArticle(foundArticle.url, {
                  title: foundArticle.title,
                  summary: foundArticle.summary,
                  source: "onboarding_exa",
                }),
                { loading: capturing }
              )}
            </div>
            <div className="my-4 text-xs text-center" style={{ color: "hsl(var(--muted-foreground))" }}>Or paste your own URL:</div>
            <ArticleManualPaste url={manualUrl} setUrl={setManualUrl} onSave={() => captureArticle(manualUrl)} loading={capturing} inputCls={inputCls} inputStyle={inputStyle} compact />
            <div className="mt-3">{ghostLink("Skip for now", () => goStep(3))}</div>
          </>
        ) : (
          <>
            {heading("Save your first article")}
            <p className="mb-5" style={{ fontSize: 15, lineHeight: 1.7, color: "hsl(var(--muted-foreground))" }}>
              Paste one article you read this week. Aura will find the strategic pattern inside it.
            </p>
            <ArticleManualPaste url={manualUrl} setUrl={setManualUrl} onSave={() => captureArticle(manualUrl)} loading={capturing} inputCls={inputCls} inputStyle={inputStyle} />
            <div className="mt-3">{ghostLink("Skip for now", () => goStep(3))}</div>
          </>
        )}
      </>,
    );
  }

  // ───── STEP 3 ─────
  return (
    <>
      {cardShell(
        <>
          {eyebrow("Step 3 of 3 — How the market sees you")}
          {heading("Discover your market archetype.")}
          <p className="mb-3" style={{ fontSize: 15, lineHeight: 1.7, color: "hsl(var(--foreground))" }}>
            This 5-minute assessment reveals your market archetype — the way a CIO in your sector would describe you to a colleague.
          </p>
          <p className="mb-6" style={{ fontSize: 15, lineHeight: 1.7, color: "hsl(var(--muted-foreground))" }}>
            It shapes how Aura writes your content and positions your expertise.
          </p>
          {primaryBtn(<>Discover my market position <ArrowRight className="w-4 h-4" /></>, () => setAssessmentOpen(true))}
          <div className="mt-3">{ghostLink("I'll do this later", () => goHome())}</div>
        </>,
      )}
      <BrandAssessmentModal
        open={assessmentOpen}
        onOpenChange={(o) => {
          setAssessmentOpen(o);
          if (!o) {
            // closed — assessment may or may not be complete; either way, hand off to home.
          }
        }}
        onComplete={async () => {
          try {
            if (userId) {
              await supabase.functions.invoke("send-lifecycle-email", {
                body: { user_id: userId, email_type: "welcome" },
              });
            }
          } catch (e) {
            console.warn("welcome email failed:", e);
          }
          goHome();
        }}
      />
    </>
  );
};

const ArticleManualPaste = ({
  url, setUrl, onSave, loading, inputCls, inputStyle, compact,
}: {
  url: string;
  setUrl: (v: string) => void;
  onSave: () => void;
  loading: boolean;
  inputCls: string;
  inputStyle: React.CSSProperties;
  compact?: boolean;
}) => (
  <div className={compact ? "" : "mt-2"}>
    <input
      className={inputCls + " mb-2"}
      style={inputStyle}
      placeholder="https://..."
      value={url}
      onChange={(e) => setUrl(e.target.value)}
      disabled={loading}
    />
    <button
      onClick={onSave}
      disabled={loading || !url.trim()}
      className="w-full font-semibold transition-all disabled:opacity-50 flex items-center justify-center gap-2"
      style={{
        height: 44,
        background: "transparent",
        color: "var(--brand)",
        border: "1px solid var(--brand)",
        borderRadius: 10,
        fontSize: 13,
      }}
    >
      {loading && <Loader2 className="w-4 h-4 animate-spin" />}
      Save capture
    </button>
  </div>
);

export default Onboarding;