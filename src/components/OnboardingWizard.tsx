import { useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, X } from "lucide-react";

interface Props {
  userId: string;
  onComplete: () => void;
}

const SECTORS = [
  "Technology & IT",
  "Financial Services",
  "Energy & Utilities",
  "Healthcare & Pharma",
  "Government & Public Sector",
  "Education & Academia",
  "Real Estate & Construction",
  "Telecommunications",
  "Oil & Gas",
  "Retail & E-commerce",
  "Manufacturing",
  "Professional Services & Consulting",
  "Transportation & Logistics",
  "Media & Entertainment",
  "Hospitality & Tourism",
  "Agriculture & Food",
  "Defense & Security",
  "Non-profit & Development",
  "Other",
];

const PILLARS = [
  "Digital Transformation",
  "Strategy & Planning",
  "Operations Excellence",
  "Innovation & R&D",
  "Data & Analytics",
  "Cybersecurity & Risk",
  "Finance & Investment",
  "People & Culture",
  "Governance & Compliance",
  "Supply Chain & Procurement",
  "Customer Experience",
  "Sustainability & ESG",
  "AI & Automation",
  "Business Development",
  "Project & Program Management",
  "Change Management",
  "Other",
];

const OnboardingWizard = ({ userId, onComplete }: Props) => {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [saving, setSaving] = useState(false);

  // Step 1
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [firm, setFirm] = useState("");
  const [sector, setSector] = useState("");
  const [sectorOther, setSectorOther] = useState("");

  // Step 2
  const [pillars, setPillars] = useState<string[]>([]);
  const [pillarOther, setPillarOther] = useState("");
  const [northStar, setNorthStar] = useState("");
  const [audience, setAudience] = useState("");

  // Step 3
  const [post1, setPost1] = useState("");
  const [post2, setPost2] = useState("");
  const [post3, setPost3] = useState("");

  const togglePillar = (p: string) => {
    setPillars((prev) => {
      if (prev.includes(p)) return prev.filter((x) => x !== p);
      if (prev.length >= 4) {
        toast.message("Pick up to 4 pillars");
        return prev;
      }
      return [...prev, p];
    });
  };

  const resolvedSector = sector === "Other" ? sectorOther.trim() : sector;
  const resolvedPillars = pillars
    .map((p) => (p === "Other" ? pillarOther.trim() : p))
    .filter(Boolean);

  const step1Valid =
    name.trim().length > 0 &&
    role.trim().length > 0 &&
    firm.trim().length > 0 &&
    resolvedSector.length > 0;

  const step2Valid =
    resolvedPillars.length >= 2 &&
    northStar.trim().length > 0 &&
    audience.trim().length > 0;

  const saveStep1 = async () => {
    if (!step1Valid) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("diagnostic_profiles").upsert(
        {
          user_id: userId,
          first_name: name.trim(),
          level: role.trim(),
          firm: firm.trim(),
          sector_focus: resolvedSector,
        } as any,
        { onConflict: "user_id" },
      );
      if (error) throw error;
      setStep(2);
    } catch (e: any) {
      toast.error("Could not save: " + (e.message || "try again"));
    } finally {
      setSaving(false);
    }
  };

  const saveStep2 = async () => {
    if (!step2Valid) return;
    setSaving(true);
    try {
      // Read existing identity_intelligence so we don't clobber other fields
      const { data: existing } = await supabase
        .from("diagnostic_profiles")
        .select("identity_intelligence")
        .eq("user_id", userId)
        .maybeSingle();
      const identity = (existing as any)?.identity_intelligence || {};
      identity.target_audience = audience.trim();

      const { error } = await supabase
        .from("diagnostic_profiles")
        .update({
          brand_pillars: resolvedPillars,
          north_star_goal: northStar.trim(),
          identity_intelligence: identity,
        } as any)
        .eq("user_id", userId);
      if (error) throw error;
      setStep(3);
    } catch (e: any) {
      toast.error("Could not save: " + (e.message || "try again"));
    } finally {
      setSaving(false);
    }
  };

  const finish = async (skipPosts: boolean) => {
    setSaving(true);
    try {
      const posts = skipPosts
        ? []
        : [post1, post2, post3].map((p) => p.trim()).filter((p) => p.length > 30);

      if (posts.length > 0) {
        await (supabase as any)
          .from("authority_voice_profiles")
          .upsert(
            {
              user_id: userId,
              example_posts: posts.map((content) => ({ content, source: "onboarding" })),
            },
            { onConflict: "user_id" },
          );
      }

      const { error } = await supabase
        .from("diagnostic_profiles")
        .update({
          onboarding_completed: true,
          completed: true,
          last_visit_at: new Date().toISOString(),
        } as any)
        .eq("user_id", userId);
      if (error) throw error;

      // Welcome email (best-effort)
      try {
        supabase.functions.invoke("send-lifecycle-email", {
          body: { user_id: userId, email_type: "welcome" },
        });
      } catch {}

      localStorage.setItem("aura_onboarding_complete", "true");
      onComplete();
    } catch (e: any) {
      toast.error("Could not finish: " + (e.message || "try again"));
    } finally {
      setSaving(false);
    }
  };

  const inputCls =
    "w-full rounded-lg border bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[var(--brand)]/40 transition-colors";
  const inputStyle: React.CSSProperties = { borderColor: "hsl(var(--border))" };

  const Label = ({ children, hint }: { children: React.ReactNode; hint?: string }) => (
    <div className="mb-1.5">
      <p className="text-xs font-medium text-foreground">{children}</p>
      {hint && (
        <p className="text-[11px] mt-0.5" style={{ color: "hsl(var(--muted-foreground))" }}>
          {hint}
        </p>
      )}
    </div>
  );

  const progressPct = (step / 3) * 100;

  const stepLabels = { 1: "Who you are", 2: "What drives you", 3: "Your voice" } as const;
  const stepTitles = {
    1: "Who are you?",
    2: "What drives you?",
    3: "Your voice",
  } as const;
  const stepIntros = {
    1: "Let's set up your intelligence profile. This takes 2 minutes and shapes everything Aura does for you.",
    2: "These shape the lens Aura uses to filter the noise from the signals that matter to you.",
    3: "Aura writes in YOUR voice, not AI voice. Paste a few posts you're proud of and Aura learns your rhythm.",
  } as const;

  const content = (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center px-4 py-8 overflow-y-auto"
      style={{
        background: "hsl(var(--background) / 0.78)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
      }}
    >
      <div
        className="relative w-full overflow-hidden my-auto"
        style={{
          maxWidth: 620,
          background: "hsl(var(--card))",
          color: "hsl(var(--card-foreground))",
          borderRadius: 16,
          border: "1px solid hsl(var(--border))",
          padding: "44px 40px 32px",
          boxShadow: "0 20px 60px -10px rgba(0,0,0,0.4)",
        }}
      >
        {/* Progress bar */}
        <div
          className="absolute top-0 left-0 right-0"
          style={{ height: 3, background: "hsl(var(--muted))" }}
        >
          <div
            className="h-full transition-all duration-500"
            style={{ width: `${progressPct}%`, background: "var(--brand)" }}
          />
        </div>

        <p
          className="text-[11px] tracking-[0.18em] uppercase mb-2 font-medium"
          style={{ color: "var(--brand)" }}
        >
          Step {step} of 3 — {stepLabels[step]}
        </p>

        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
          >
            <h2
              style={{
                fontFamily: "var(--font-display)",
                fontSize: 26,
                lineHeight: 1.2,
                color: "hsl(var(--foreground))",
              }}
            >
              {stepTitles[step]}
            </h2>
            <p
              className="mt-2 text-sm"
              style={{ color: "hsl(var(--muted-foreground))" }}
            >
              {stepIntros[step]}
            </p>

            {/* === STEP 1 === */}
            {step === 1 && (
              <div className="mt-6 space-y-4">
                <div>
                  <Label hint="How Aura will address you in your briefings.">Your name</Label>
                  <input
                    className={inputCls}
                    style={inputStyle}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="First name"
                  />
                </div>
                <div>
                  <Label hint="Your current role — e.g. Director of Digital Transformation.">
                    Title
                  </Label>
                  <input
                    className={inputCls}
                    style={inputStyle}
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    placeholder="Director of Digital Transformation"
                  />
                </div>
                <div>
                  <Label hint="Where you work today — company, firm, or organisation.">Firm</Label>
                  <input
                    className={inputCls}
                    style={inputStyle}
                    value={firm}
                    onChange={(e) => setFirm(e.target.value)}
                    placeholder="EY, Aramco, Ministry of Energy…"
                  />
                </div>
                <div>
                  <Label hint="The sector your work focuses on. Aura uses this to filter signals.">
                    Sector
                  </Label>
                  <select
                    className={inputCls}
                    style={inputStyle}
                    value={sector}
                    onChange={(e) => setSector(e.target.value)}
                  >
                    <option value="">Select your sector…</option>
                    {SECTORS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                  {sector === "Other" && (
                    <input
                      className={inputCls + " mt-2"}
                      style={inputStyle}
                      value={sectorOther}
                      onChange={(e) => setSectorOther(e.target.value)}
                      placeholder="Type your sector"
                    />
                  )}
                </div>
              </div>
            )}

            {/* === STEP 2 === */}
            {step === 2 && (
              <div className="mt-6 space-y-5">
                <div>
                  <Label hint="The 3–4 themes you want to be known for. Pick what matches your professional ambitions.">
                    Expertise pillars (pick 2–4)
                  </Label>
                  <div className="flex flex-wrap gap-2">
                    {PILLARS.map((p) => {
                      const active = pillars.includes(p);
                      return (
                        <button
                          key={p}
                          type="button"
                          onClick={() => togglePillar(p)}
                          className="px-3 py-1.5 rounded-full text-xs transition-all"
                          style={{
                            background: active ? "var(--brand)" : "hsl(var(--muted) / 0.4)",
                            color: active ? "var(--brand-foreground, #1A1916)" : "hsl(var(--foreground))",
                            border: `1px solid ${active ? "var(--brand)" : "hsl(var(--border))"}`,
                          }}
                        >
                          {p}
                        </button>
                      );
                    })}
                  </div>
                  {pillars.includes("Other") && (
                    <input
                      className={inputCls + " mt-2"}
                      style={inputStyle}
                      value={pillarOther}
                      onChange={(e) => setPillarOther(e.target.value)}
                      placeholder="Type your pillar"
                    />
                  )}
                </div>
                <div>
                  <Label hint="The single outcome you're working toward. Example: 'Lead the region's first fully digital water utility'.">
                    North star goal
                  </Label>
                  <input
                    className={inputCls}
                    style={inputStyle}
                    value={northStar}
                    onChange={(e) => setNorthStar(e.target.value)}
                    placeholder="Lead the region's first fully digital water utility"
                  />
                </div>
                <div>
                  <Label hint="Who needs to see your expertise? CIOs? Board members? Industry regulators?">
                    Target audience
                  </Label>
                  <input
                    className={inputCls}
                    style={inputStyle}
                    value={audience}
                    onChange={(e) => setAudience(e.target.value)}
                    placeholder="CIOs in regulated industries across the GCC"
                  />
                </div>
              </div>
            )}

            {/* === STEP 3 === */}
            {step === 3 && (
              <div className="mt-6 space-y-3">
                <Label hint="Paste 2–3 posts you've written. Optional — you can add these later from My Story.">
                  Your LinkedIn posts
                </Label>
                {[post1, post2, post3].map((val, i) => (
                  <textarea
                    key={i}
                    className={inputCls}
                    style={{ ...inputStyle, minHeight: 90, resize: "vertical" } as React.CSSProperties}
                    value={val}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (i === 0) setPost1(v);
                      if (i === 1) setPost2(v);
                      if (i === 2) setPost3(v);
                    }}
                    placeholder={`Paste post ${i + 1}…`}
                  />
                ))}
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        {/* CTA */}
        <div className="mt-7 flex flex-col gap-3">
          {step === 1 && (
            <button
              onClick={saveStep1}
              disabled={!step1Valid || saving}
              className="w-full py-3.5 rounded-full text-sm font-medium transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              style={{ background: "var(--brand)", color: "var(--brand-foreground, #1A1916)" }}
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              Continue
            </button>
          )}
          {step === 2 && (
            <button
              onClick={saveStep2}
              disabled={!step2Valid || saving}
              className="w-full py-3.5 rounded-full text-sm font-medium transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              style={{ background: "var(--brand)", color: "var(--brand-foreground, #1A1916)" }}
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              Continue
            </button>
          )}
          {step === 3 && (
            <>
              <button
                onClick={() => finish(false)}
                disabled={saving}
                className="w-full py-3.5 rounded-full text-sm font-medium transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                style={{ background: "var(--brand)", color: "var(--brand-foreground, #1A1916)" }}
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                Finish setup
              </button>
              <button
                onClick={() => finish(true)}
                disabled={saving}
                className="w-full text-center text-xs py-2 transition-colors"
                style={{ color: "hsl(var(--muted-foreground))", background: "transparent" }}
              >
                I'll do this later →
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
};

export default OnboardingWizard;
