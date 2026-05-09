import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, ArrowRight, Check, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import BrandAssessmentModal from "@/components/BrandAssessmentModal";

interface Props {
  userId: string;
  onComplete: () => void;
}

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

type Step = 0 | 1 | 2 | 3; // 0=unboxing, 1=profile, 2=article, 3=assessment

type Profile = {
  first_name: string;
  firm: string;
  level: string;
  core_practice: string;
  sector_focus: string;
  north_star_goal: string;
  linkedin_url?: string;
};

const emptyProfile: Profile = {
  first_name: "",
  firm: "",
  level: "",
  core_practice: "",
  sector_focus: "",
  north_star_goal: "",
};

const inputCls =
  "w-full rounded-lg bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[var(--brand)]/40 transition-colors border";
const inputStyle: React.CSSProperties = { borderColor: "hsl(var(--border))", height: 48 };

const FieldLabel = ({ children }: { children: React.ReactNode }) => (
  <p
    className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.05em]"
    style={{ color: "hsl(var(--muted-foreground))" }}
  >
    {children}
  </p>
);

const ProgressDots = ({ step }: { step: Step }) => {
  if (step === 0) return null;
  return (
    <div className="flex justify-center gap-2 mb-5">
      {[1, 2, 3].map((n) => {
        const done = step > n;
        const active = step === n;
        return (
          <div
            key={n}
            className="rounded-full transition-all"
            style={{
              width: active ? 24 : 8,
              height: 8,
              background: done
                ? "#22c55e"
                : active
                  ? "var(--brand)"
                  : "hsl(var(--muted))",
            }}
          />
        );
      })}
    </div>
  );
};

const PrimaryButton: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>> = ({
  children,
  style,
  ...rest
}) => (
  <button
    {...rest}
    className="w-full py-3.5 rounded-[10px] text-sm font-semibold transition-all disabled:opacity-50 flex items-center justify-center gap-2 hover:brightness-95"
    style={{
      background: "var(--brand)",
      color: "var(--brand-foreground, #1A1916)",
      height: 48,
      ...style,
    }}
  >
    {children}
  </button>
);

const SecondaryButton: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>> = ({
  children,
  ...rest
}) => (
  <button
    {...rest}
    className="w-full text-center text-xs py-2 transition-colors hover:underline"
    style={{ color: "var(--brand)", background: "transparent" }}
  >
    {children}
  </button>
);

const cleanLinkedInUrl = (raw: string) => {
  let u = raw.trim();
  if (!/^https?:\/\//i.test(u)) u = "https://" + u;
  try {
    const parsed = new URL(u);
    return `${parsed.origin}${parsed.pathname.replace(/\/$/, "")}`;
  } catch {
    return u;
  }
};

const isValidLinkedInUrl = (u: string) => /linkedin\.com\/in\/[a-zA-Z0-9_\-%]+/i.test(u);

const OnboardingWizard = ({ userId, onComplete }: Props) => {
  const [step, setStep] = useState<Step>(0);
  const [direction, setDirection] = useState(1);
  const goTo = (s: Step) => {
    setDirection(s > step ? 1 : -1);
    setStep(s);
  };

  // ── Step 1 state ──
  const [linkedinInput, setLinkedinInput] = useState("");
  const [linkedinError, setLinkedinError] = useState<string | null>(null);
  const [prefilling, setPrefilling] = useState(false);
  const [prefillStatus, setPrefillStatus] = useState("Reading your profile…");
  const [prefillSucceeded, setPrefillSucceeded] = useState(false);
  const [showProfileForm, setShowProfileForm] = useState(false);
  const [profile, setProfile] = useState<Profile>(emptyProfile);
  const [savingProfile, setSavingProfile] = useState(false);

  // ── Step 2 state ──
  const [articleLoading, setArticleLoading] = useState(false);
  const [article, setArticle] = useState<null | {
    url: string;
    title: string;
    summary: string | null;
    source: string;
  }>(null);
  const [articleAttempted, setArticleAttempted] = useState(false);
  const [manualUrl, setManualUrl] = useState("");
  const [capturing, setCapturing] = useState(false);
  const [captureCelebrate, setCaptureCelebrate] = useState(false);

  // ── Step 3 state ──
  const [brandOpen, setBrandOpen] = useState(false);

  const finishedRef = useRef(false);

  // staggered prefill status messages
  useEffect(() => {
    if (!prefilling) return;
    setPrefillStatus("Reading your profile…");
    const t1 = setTimeout(() => setPrefillStatus("Extracting your expertise…"), 2000);
    const t2 = setTimeout(() => setPrefillStatus("Almost there…"), 4000);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [prefilling]);

  const handleReadLinkedIn = async () => {
    setLinkedinError(null);
    const cleaned = cleanLinkedInUrl(linkedinInput);
    if (!isValidLinkedInUrl(cleaned)) {
      setLinkedinError("That doesn't look like a LinkedIn profile URL. It should look like linkedin.com/in/yourname");
      return;
    }
    setPrefilling(true);
    setPrefillSucceeded(false);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/onboarding-linkedin-prefill`,
        {
          method: "POST",
          signal: controller.signal,
          headers: {
            "Content-Type": "application/json",
            ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
          },
          body: JSON.stringify({ linkedin_url: cleaned }),
        },
      );
      const data = await resp.json().catch(() => null);
      clearTimeout(timeout);

      if (data?.success && data.profile) {
        const p = data.profile;
        setProfile({
          first_name: p.first_name || "",
          firm: p.firm || "",
          level: p.level || "",
          core_practice: p.core_practice || "",
          sector_focus: SECTORS.includes(p.sector_focus) ? p.sector_focus : (p.sector_focus ? "Other" : ""),
          north_star_goal: "",
          linkedin_url: cleaned,
        });
        setPrefillSucceeded(true);
        setShowProfileForm(true);
      } else {
        toast.message("Couldn't read that profile — it might be private. No problem.");
        setProfile({ ...emptyProfile, linkedin_url: cleaned });
        setShowProfileForm(true);
      }
    } catch (e: any) {
      clearTimeout(timeout);
      const aborted = e?.name === "AbortError";
      toast.message(aborted ? "Taking too long — let's fill this manually." : "Couldn't read that profile. Let's fill it manually.");
      setProfile({ ...emptyProfile, linkedin_url: cleaned });
      setShowProfileForm(true);
    } finally {
      setPrefilling(false);
    }
  };

  const handleManualInstead = () => {
    setProfile(emptyProfile);
    setPrefillSucceeded(false);
    setShowProfileForm(true);
  };

  const profileValid =
    profile.first_name.trim() &&
    profile.firm.trim() &&
    profile.level.trim() &&
    profile.sector_focus.trim() &&
    profile.core_practice.trim() &&
    profile.north_star_goal.trim();

  const saveProfile = async () => {
    if (!profileValid) return;
    setSavingProfile(true);
    try {
      const { error } = await supabase.from("diagnostic_profiles").upsert(
        {
          user_id: userId,
          first_name: profile.first_name.trim(),
          firm: profile.firm.trim(),
          level: profile.level.trim(),
          core_practice: profile.core_practice.trim(),
          sector_focus: profile.sector_focus,
          north_star_goal: profile.north_star_goal.trim(),
          linkedin_url: profile.linkedin_url || null,
        } as any,
        { onConflict: "user_id" },
      );
      if (error) throw error;

      // Background-fetch article
      setArticleLoading(true);
      setArticleAttempted(false);
      goTo(2);
      void fetchArticle();
    } catch (e: any) {
      toast.error("Couldn't save your profile. " + (e.message || "Try again."));
    } finally {
      setSavingProfile(false);
    }
  };

  const fetchArticle = async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/onboarding-find-article`,
        {
          method: "POST",
          signal: controller.signal,
          headers: {
            "Content-Type": "application/json",
            ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
          },
          body: JSON.stringify({
            sector_focus: profile.sector_focus,
            core_practice: profile.core_practice,
            firm: profile.firm,
            level: profile.level,
          }),
        },
      );
      const data = await resp.json().catch(() => null);
      clearTimeout(timeout);
      if (data?.found && data.article?.url) {
        setArticle(data.article);
      }
    } catch {
      // silent fallback
    } finally {
      clearTimeout(timeout);
      setArticleLoading(false);
      setArticleAttempted(true);
    }
  };

  const captureUrl = async (url: string) => {
    setCapturing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Session expired");
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ingest-capture`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            type: "link",
            content: url,
            source_url: url,
            metadata: { source: "onboarding" },
          }),
        },
      );
      const data = await resp.json().catch(() => null);
      if (!resp.ok && data?.error !== "duplicate_url") {
        throw new Error(data?.error_message || data?.error || "Capture failed");
      }
      setCaptureCelebrate(true);
      setTimeout(() => goTo(3), 2500);
    } catch (e: any) {
      toast.error(e.message || "Couldn't capture that one.");
    } finally {
      setCapturing(false);
    }
  };

  const finishOnboarding = async () => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    try {
      await supabase
        .from("diagnostic_profiles")
        .update({
          onboarding_completed: true,
          completed: true,
          last_visit_at: new Date().toISOString(),
        } as any)
        .eq("user_id", userId);
      try {
        supabase.functions.invoke("send-lifecycle-email", {
          body: { user_id: userId, email_type: "welcome" },
        });
      } catch {}
      localStorage.setItem("aura_onboarding_complete", "true");
    } catch (e) {
      console.error("finishOnboarding error", e);
    }
    onComplete();
  };

  // ── Render helpers ──
  const Card = ({ children }: { children: React.ReactNode }) => (
    <div
      className="relative w-full overflow-hidden"
      style={{
        maxWidth: 560,
        background: "hsl(var(--card))",
        color: "hsl(var(--card-foreground))",
        borderRadius: 16,
        border: "1px solid hsl(var(--border))",
        padding: "clamp(28px, 5vw, 48px)",
        boxShadow: "0 8px 32px rgba(0,0,0,0.12)",
      }}
    >
      {children}
    </div>
  );

  const StepLabel = ({ children }: { children: React.ReactNode }) => (
    <p
      className="text-[11px] tracking-[0.1em] uppercase mb-3 font-semibold"
      style={{ color: "var(--brand)" }}
    >
      {children}
    </p>
  );

  const Heading = ({ children }: { children: React.ReactNode }) => (
    <h2
      style={{
        fontFamily: "'Cormorant Garamond', Georgia, serif",
        fontSize: "clamp(20px, 3.5vw, 26px)",
        lineHeight: 1.25,
        color: "hsl(var(--foreground))",
        marginBottom: 12,
      }}
    >
      {children}
    </h2>
  );

  const Body = ({ children }: { children: React.ReactNode }) => (
    <p className="text-sm" style={{ color: "hsl(var(--muted-foreground))", lineHeight: 1.7, marginBottom: 16 }}>
      {children}
    </p>
  );

  const variants = {
    enter: (dir: number) => ({ x: dir > 0 ? 60 : -60, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (dir: number) => ({ x: dir > 0 ? -60 : 60, opacity: 0 }),
  };

  const content = (
    <>
      <style>{`
        @keyframes auraShimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        .aura-shimmer {
          background: linear-gradient(90deg, transparent, rgba(176,141,58,0.10), transparent);
          background-size: 200% 100%;
          animation: auraShimmer 1.6s linear infinite;
        }
      `}</style>
      <div
        className="fixed inset-0 z-[200] flex items-center justify-center px-5 py-8 overflow-y-auto"
        style={{
          background: "hsl(var(--background) / 0.92)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
        }}
      >
        <AnimatePresence custom={direction} mode="wait" initial={false}>
          <motion.div
            key={step}
            custom={direction}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="w-full flex justify-center"
          >
            <Card>
              <ProgressDots step={step} />

              {/* ───── STEP 0 — UNBOXING ───── */}
              {step === 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 1.2, ease: "easeOut" }}
                >
                  <p
                    className="text-[11px] tracking-[0.18em] uppercase font-semibold text-center mb-6"
                    style={{ color: "var(--brand)" }}
                  >
                    Your Intelligence OS Is Live
                  </p>
                  <h1
                    style={{
                      fontFamily: "'Cormorant Garamond', Georgia, serif",
                      fontSize: "clamp(26px, 5vw, 34px)",
                      lineHeight: 1.2,
                      color: "hsl(var(--foreground))",
                      marginBottom: 18,
                      textAlign: "center",
                    }}
                  >
                    Welcome to Aura.
                  </h1>
                  <Body>
                    You have the expertise. The certificates. The years.
                    But right now, to anyone who hasn't met you in person — you're invisible.
                    That changes today.
                  </Body>
                  <p className="text-sm font-medium mb-3" style={{ color: "hsl(var(--foreground))" }}>
                    In the next 3 minutes, Aura will:
                  </p>
                  <div className="space-y-3 mb-7">
                    {[
                      "Read your LinkedIn and understand who you are professionally",
                      "Find a relevant article from your sector — your first intelligence capture",
                      "Begin building your strategic positioning",
                    ].map((line, i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, x: -12 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 1.0 + i * 0.3, duration: 0.5 }}
                        className="flex gap-3 text-sm"
                        style={{ color: "hsl(var(--foreground))", lineHeight: 1.6 }}
                      >
                        <span style={{ color: "var(--brand)", flexShrink: 0 }}>◆</span>
                        <span>{line}</span>
                      </motion.div>
                    ))}
                  </div>
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 2.2, duration: 0.6 }}
                  >
                    <PrimaryButton onClick={() => goTo(1)}>
                      Let's begin <ArrowRight className="w-4 h-4" />
                    </PrimaryButton>
                  </motion.div>
                </motion.div>
              )}

              {/* ───── STEP 1 — LINKEDIN ───── */}
              {step === 1 && (
                <div>
                  <StepLabel>Step 1 of 3 — Tell Aura who you are</StepLabel>

                  {!showProfileForm && (
                    <>
                      <Heading>Paste your LinkedIn profile URL</Heading>
                      <Body>Aura reads it and fills your profile in seconds. No typing.</Body>

                      <div className={prefilling ? "aura-shimmer rounded-lg" : ""} style={{ padding: prefilling ? 1 : 0 }}>
                        <div className="flex gap-2">
                          <input
                            className={inputCls}
                            style={{ ...inputStyle, flex: 1 }}
                            placeholder="https://linkedin.com/in/..."
                            value={linkedinInput}
                            onChange={(e) => setLinkedinInput(e.target.value)}
                            disabled={prefilling}
                            onKeyDown={(e) => { if (e.key === "Enter") handleReadLinkedIn(); }}
                          />
                          <button
                            onClick={handleReadLinkedIn}
                            disabled={prefilling || !linkedinInput.trim()}
                            className="px-5 rounded-lg text-sm font-semibold disabled:opacity-50 flex items-center gap-1.5"
                            style={{
                              background: "var(--brand)",
                              color: "var(--brand-foreground, #1A1916)",
                              height: 48,
                            }}
                          >
                            {prefilling ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Read <ArrowRight className="w-4 h-4" /></>}
                          </button>
                        </div>
                      </div>

                      {linkedinError && (
                        <p className="mt-2 text-xs" style={{ color: "hsl(var(--destructive))" }}>{linkedinError}</p>
                      )}
                      {prefilling && (
                        <p className="mt-3 text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>{prefillStatus}</p>
                      )}

                      <div className="my-6 flex items-center gap-3" style={{ color: "hsl(var(--muted-foreground))" }}>
                        <div className="flex-1 h-px" style={{ background: "hsl(var(--border))" }} />
                        <span className="text-[11px] uppercase tracking-wider">or</span>
                        <div className="flex-1 h-px" style={{ background: "hsl(var(--border))" }} />
                      </div>
                      <SecondaryButton onClick={handleManualInstead}>Fill manually instead</SecondaryButton>
                    </>
                  )}

                  {showProfileForm && (
                    <>
                      {prefillSucceeded && (
                        <div className="mb-5 flex items-center gap-2 text-sm" style={{ color: "#22c55e" }}>
                          <Check className="w-4 h-4" /> Profile read successfully
                        </div>
                      )}
                      <Heading>{prefillSucceeded ? "Confirm what we found" : "Tell us about yourself"}</Heading>

                      <div className="space-y-4">
                        <div className="grid sm:grid-cols-2 gap-3">
                          <div>
                            <FieldLabel>First name</FieldLabel>
                            <input className={inputCls} style={inputStyle} value={profile.first_name}
                              onChange={(e) => setProfile({ ...profile, first_name: e.target.value })} />
                          </div>
                          <div>
                            <FieldLabel>Firm</FieldLabel>
                            <input className={inputCls} style={inputStyle} value={profile.firm}
                              onChange={(e) => setProfile({ ...profile, firm: e.target.value })} />
                          </div>
                        </div>
                        <div className="grid sm:grid-cols-2 gap-3">
                          <div>
                            <FieldLabel>Level / Title</FieldLabel>
                            <input className={inputCls} style={inputStyle} value={profile.level}
                              onChange={(e) => setProfile({ ...profile, level: e.target.value })} />
                          </div>
                          <div>
                            <FieldLabel>Sector</FieldLabel>
                            <select className={inputCls} style={inputStyle} value={profile.sector_focus}
                              onChange={(e) => setProfile({ ...profile, sector_focus: e.target.value })}>
                              <option value="">Select…</option>
                              {SECTORS.map((s) => <option key={s} value={s}>{s}</option>)}
                            </select>
                          </div>
                        </div>
                        <div>
                          <FieldLabel>Core practice</FieldLabel>
                          <input className={inputCls} style={inputStyle} value={profile.core_practice}
                            onChange={(e) => setProfile({ ...profile, core_practice: e.target.value })}
                            placeholder="e.g. Digital Transformation" />
                        </div>
                        <div>
                          <FieldLabel>My 3-year ambition</FieldLabel>
                          <input className={inputCls} style={inputStyle} value={profile.north_star_goal}
                            onChange={(e) => setProfile({ ...profile, north_star_goal: e.target.value })}
                            placeholder="This one's yours — what are you building toward?" />
                        </div>
                      </div>

                      <div className="mt-6">
                        <PrimaryButton onClick={saveProfile} disabled={!profileValid || savingProfile}>
                          {savingProfile && <Loader2 className="w-4 h-4 animate-spin" />}
                          Confirm & continue <ArrowRight className="w-4 h-4" />
                        </PrimaryButton>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* ───── STEP 2 — ARTICLE ───── */}
              {step === 2 && (
                <div>
                  <StepLabel>Step 2 of 3 — Your first intelligence capture</StepLabel>

                  {captureCelebrate ? (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                      <div className="flex items-center gap-2 text-sm mb-3" style={{ color: "#22c55e" }}>
                        <Check className="w-5 h-5" /> First capture complete.
                      </div>
                      <Body>
                        Aura is already detecting strategic patterns. After 3–5 more articles, your first signal will emerge.
                      </Body>
                    </motion.div>
                  ) : (
                    <>
                      {articleLoading && (
                        <div className="flex items-center gap-2 mb-4 text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>
                          <Loader2 className="w-4 h-4 animate-spin" /> Aura is searching your sector…
                        </div>
                      )}

                      {!articleLoading && article && (
                        <>
                          <Heading>Aura found something in your sector.</Heading>
                          <div
                            className="rounded-xl p-5 mb-4"
                            style={{ background: "hsl(var(--muted) / 0.4)", border: "1px solid hsl(var(--border))" }}
                          >
                            <div className="flex items-start gap-2 mb-2">
                              <Sparkles className="w-4 h-4 mt-0.5" style={{ color: "var(--brand)" }} />
                              <div className="flex-1">
                                <p className="font-semibold text-sm leading-snug" style={{ color: "hsl(var(--foreground))" }}>
                                  {article.title}
                                </p>
                                <p className="text-[11px] mt-1" style={{ color: "hsl(var(--muted-foreground))" }}>
                                  {article.source}
                                </p>
                              </div>
                            </div>
                            {article.summary && (
                              <p className="text-xs mt-3 italic" style={{ color: "hsl(var(--muted-foreground))", lineHeight: 1.6 }}>
                                "{article.summary}"
                              </p>
                            )}
                          </div>
                          <PrimaryButton onClick={() => captureUrl(article.url)} disabled={capturing}>
                            {capturing ? <><Loader2 className="w-4 h-4 animate-spin" /> Aura is reading…</> : <>Capture this article <ArrowRight className="w-4 h-4" /></>}
                          </PrimaryButton>
                        </>
                      )}

                      {!articleLoading && !article && articleAttempted && (
                        <>
                          <Heading>Paste one article you read this week.</Heading>
                          <Body>Aura will find the strategic pattern inside it.</Body>
                          <div className="flex gap-2">
                            <input
                              className={inputCls}
                              style={{ ...inputStyle, flex: 1 }}
                              placeholder="https://..."
                              value={manualUrl}
                              onChange={(e) => setManualUrl(e.target.value)}
                            />
                            <button
                              onClick={() => captureUrl(manualUrl.trim())}
                              disabled={capturing || !manualUrl.trim()}
                              className="px-5 rounded-lg text-sm font-semibold disabled:opacity-50"
                              style={{ background: "var(--brand)", color: "var(--brand-foreground, #1A1916)", height: 48 }}
                            >
                              {capturing ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
                            </button>
                          </div>
                        </>
                      )}

                      <div className="mt-4">
                        <SecondaryButton onClick={() => goTo(3)}>Skip for now</SecondaryButton>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* ───── STEP 3 — ASSESSMENT ───── */}
              {step === 3 && (
                <div>
                  <StepLabel>Step 3 of 3 — How the market sees you</StepLabel>
                  <Heading>Discover your market archetype</Heading>
                  <Body>
                    This 5-minute assessment reveals the way a CIO in your sector would describe you to a colleague.
                    It shapes how Aura writes your content and positions your expertise.
                  </Body>
                  <div className="space-y-3 mt-2">
                    <PrimaryButton onClick={() => setBrandOpen(true)}>
                      Discover my market position <ArrowRight className="w-4 h-4" />
                    </PrimaryButton>
                    <SecondaryButton onClick={finishOnboarding}>I'll do this later</SecondaryButton>
                  </div>
                </div>
              )}
            </Card>
          </motion.div>
        </AnimatePresence>
      </div>

      {brandOpen && (
        <BrandAssessmentModal
          open={brandOpen}
          onOpenChange={(o) => {
            setBrandOpen(o);
            if (!o) {
              // Whether user completes or closes, we treat onboarding as done
              finishOnboarding();
            }
          }}
          onComplete={() => {
            setBrandOpen(false);
            finishOnboarding();
          }}
        />
      )}
    </>
  );

  return createPortal(content, document.body);
};

export default OnboardingWizard;