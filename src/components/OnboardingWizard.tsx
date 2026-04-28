import { useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Chrome, Check, Loader2, ExternalLink, Zap, BarChart3, Radio } from "lucide-react";

interface Props {
  userId: string;
  onComplete: () => void;
}

const OnboardingWizard = ({ userId, onComplete }: Props) => {
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);

  // Step 1 fields
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [industry, setIndustry] = useState("");
  const [careerTarget, setCareerTarget] = useState("");
  const [firm, setFirm] = useState("");
  const [roleError, setRoleError] = useState("");

  // Step 2
  const [captureText, setCaptureText] = useState("");
  const [capturing, setCapturing] = useState(false);
  const [captured, setCaptured] = useState(false);

  const finish = () => {
    localStorage.setItem("aura_onboarding_complete", "true");
    toast("Welcome to Aura. Your intelligence engine is ready.");
    onComplete();
  };

  const skip = () => {
    localStorage.setItem("aura_onboarding_complete", "true");
    onComplete();
  };

  const handleStep1Continue = async () => {
    if (!role.trim()) {
      setRoleError("Role is required");
      return;
    }
    setRoleError("");
    setSaving(true);
    try {
      const { error } = await supabase.from("diagnostic_profiles").upsert(
        {
          user_id: userId,
          first_name: name.trim() || null,
          level: role.trim(),
          sector_focus: industry.trim() || null,
          north_star_goal: careerTarget.trim() || null,
          firm: firm.trim() || null,
          onboarding_completed: true,
        },
        { onConflict: "user_id" }
      );
      if (error) throw error;
      setStep(2);
    } catch (e: any) {
      toast.error("Failed to save profile: " + (e.message || "Unknown error"));
    } finally {
      setSaving(false);
    }
  };

  const handleStep2Continue = async () => {
    if (captureText.trim().length > 10) {
      setCapturing(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const resp = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ingest-capture`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${session?.access_token}`,
              apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            },
            body: JSON.stringify({
              user_id: userId,
              type: "text",
              content: captureText.trim(),
            }),
          }
        );
        if (!resp.ok) throw new Error("Capture failed");
        setCaptured(true);
        setTimeout(() => setStep(3), 2000);
      } catch {
        toast.error("Capture failed. You can try again later from the dashboard.");
        setStep(3);
      } finally {
        setCapturing(false);
      }
    } else {
      setStep(3);
    }
  };

  const progressPct = (step / 3) * 100;

  const inputClass =
    "w-full rounded-lg border border-ink-3 bg-surface-ink-subtle px-4 py-3 text-sm text-ink-7 placeholder:text-ink-5 focus:outline-none focus:border-brand transition-colors";

  const content = (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.85)", backdropFilter: "blur(8px)" }}
    >
      <div
        className="relative w-full mx-4"
        style={{
          maxWidth: 560,
          background: "var(--surface-ink-raised)",
          borderRadius: 12,
          border: "1px solid var(--ink-3)",
          padding: 40,
        }}
      >
        {/* Progress bar */}
        <div className="absolute top-0 left-0 right-0 h-[3px] rounded-t-xl overflow-hidden" style={{ background: "var(--ink-3)" }}>
          <div
            className="h-full transition-all duration-500"
            style={{ width: `${progressPct}%`, background: "var(--brand)" }}
          />
        </div>

        {/* Step indicator */}
        <p className="text-xs tracking-[0.15em] uppercase mb-6" style={{ color: "var(--brand)" }}>
          Step {step} of 3
        </p>

        {/* === STEP 1 === */}
        {step === 1 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-xl font-semibold text-ink-7">Tell Aura who you are</h2>
              <p className="text-sm mt-1" style={{ color: "var(--ink-5)" }}>
                This shapes every signal and piece of content Aura creates for you.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs uppercase tracking-wider text-ink-5 mb-1.5">Name</label>
                <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
              </div>
              <div>
                <label className="block text-xs uppercase tracking-wider text-ink-5 mb-1.5">
                  Role <span style={{ color: "var(--brand)" }}>*</span>
                </label>
                <input
                  className={`${inputClass} ${roleError ? "border-red-500" : ""}`}
                  value={role}
                  onChange={(e) => { setRole(e.target.value); setRoleError(""); }}
                  placeholder="e.g. Senior Manager, Digital Transformation"
                />
                {roleError && <p className="text-xs text-red-400 mt-1">{roleError}</p>}
              </div>
              <div>
                <label className="block text-xs uppercase tracking-wider text-ink-5 mb-1.5">Industry</label>
                <input className={inputClass} value={industry} onChange={(e) => setIndustry(e.target.value)} placeholder="e.g. Utilities, Consulting, Technology" />
              </div>
              <div>
                <label className="block text-xs uppercase tracking-wider text-ink-5 mb-1.5">Career target</label>
                <input className={inputClass} value={careerTarget} onChange={(e) => setCareerTarget(e.target.value)} placeholder="e.g. Partner at Big 4, Build a $10M practice" />
              </div>
              <div>
                <label className="block text-xs uppercase tracking-wider text-ink-5 mb-1.5">Firm</label>
                <input className={inputClass} value={firm} onChange={(e) => setFirm(e.target.value)} placeholder="Your company or firm" />
              </div>
            </div>

            <button
              onClick={handleStep1Continue}
              disabled={saving}
              className="w-full mt-2 py-3 rounded-xl text-sm font-medium transition-all"
              style={{
                background: "linear-gradient(180deg, hsl(43 80% 55%), hsl(43 80% 45%))",
                color: "var(--surface-ink-subtle)",
              }}
            >
              {saving ? "Saving..." : "Continue"}
            </button>
          </div>
        )}

        {/* === STEP 2 === */}
        {step === 2 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-xl font-semibold text-ink-7">Capture your first insight</h2>
              <p className="text-sm mt-1" style={{ color: "var(--ink-5)" }}>
                Paste any article, report, or idea you've been reading lately.
              </p>
            </div>

            <div>
              <textarea
                className={`${inputClass} min-h-[120px] resize-none`}
                value={captureText}
                onChange={(e) => setCaptureText(e.target.value)}
                placeholder="Paste a URL, or type a thought, insight, or article title..."
              />
              <p className="text-xs mt-2" style={{ color: "var(--ink-5)" }}>
                Aura will find the strategic pattern inside.
              </p>
            </div>

            {capturing && (
              <div className="flex items-center gap-2 text-sm" style={{ color: "var(--brand)" }}>
                <Loader2 className="w-4 h-4 animate-spin" /> Processing your capture...
              </div>
            )}
            {captured && (
              <div className="flex items-center gap-2 text-sm text-green-400">
                <Check className="w-4 h-4" /> Source saved. Your first signal will appear shortly.
              </div>
            )}

            {!capturing && !captured && (
              <>
                <button
                  onClick={handleStep2Continue}
                  className="w-full py-3 rounded-xl text-sm font-medium transition-all"
                  style={{
                    background: "linear-gradient(180deg, hsl(43 80% 55%), hsl(43 80% 45%))",
                    color: "var(--surface-ink-subtle)",
                  }}
                >
                  {captureText.trim().length > 10 ? "Save & Continue" : "Continue"}
                </button>
                <button
                  onClick={() => setStep(3)}
                  className="w-full text-center text-xs py-1"
                  style={{ color: "var(--ink-5)" }}
                >
                  Skip this step
                </button>
              </>
            )}
          </div>
        )}

        {/* === STEP 3 === */}
        {step === 3 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-xl font-semibold text-ink-7">Supercharge Aura with LinkedIn</h2>
              <p className="text-sm mt-1" style={{ color: "var(--ink-5)" }}>
                The Chrome extension captures posts, articles, and metrics directly from your LinkedIn feed.
              </p>
            </div>

            <div className="flex items-center gap-3 p-4 rounded-lg" style={{ background: "var(--surface-ink-subtle)", border: "1px solid var(--ink-3)" }}>
              <Chrome className="w-8 h-8 text-brand shrink-0" />
              <div className="flex-1">
                <p className="text-sm text-ink-7 font-medium">Install the Aura Chrome Extension</p>
                <p className="text-xs mt-0.5" style={{ color: "var(--ink-5)" }}>Already installed? You're good to go.</p>
              </div>
              <a
                href="https://chrome.google.com/webstore"
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium transition-colors"
                style={{ border: "1px solid var(--brand)", color: "var(--brand)" }}
              >
                Install <ExternalLink className="w-3 h-3" />
              </a>
            </div>

            <ul className="space-y-2.5 pl-1">
              {[
                { icon: Zap, text: "Capture LinkedIn posts in one click" },
                { icon: BarChart3, text: "Track your post performance automatically" },
                { icon: Radio, text: "Feed your signal engine with industry content" },
              ].map(({ icon: Icon, text }) => (
                <li key={text} className="flex items-center gap-2.5 text-sm" style={{ color: "var(--ink-6)" }}>
                  <Icon className="w-4 h-4 text-brand shrink-0" />
                  {text}
                </li>
              ))}
            </ul>

            <button
              onClick={finish}
              className="w-full py-3.5 rounded-xl text-sm font-medium transition-all mt-2"
              style={{
                background: "linear-gradient(180deg, hsl(43 80% 55%), hsl(43 80% 45%))",
                color: "var(--surface-ink-subtle)",
              }}
            >
              Enter Aura →
            </button>
          </div>
        )}

        {/* Skip link — not shown on step 1 */}
        {step > 1 && (
          <button
            onClick={skip}
            className="absolute bottom-3 right-5 text-[11px] transition-colors"
            style={{ color: "var(--ink-5)" }}
          >
            Skip wizard
          </button>
        )}
      </div>
    </div>
  );

  return createPortal(content, document.body);
};

export default OnboardingWizard;
