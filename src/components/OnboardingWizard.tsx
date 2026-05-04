import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { AnimatePresence, motion } from "framer-motion";
import { runPostImportPipeline, type PipelineState, PIPELINE_LABELS } from "@/lib/runPostImportPipeline";
import {
  Check,
  Loader2,
  Upload,
  FileSpreadsheet,
  Shield,
  Crown,
  TrendingUp,
} from "lucide-react";

interface Props {
  userId: string;
  onComplete: () => void;
}

const INDUSTRIES = [
  "Energy & Utilities",
  "Financial Services",
  "Government & Public Sector",
  "Healthcare",
  "Real Estate & Construction",
  "Technology",
  "Telecom",
  "Other",
];

type PipeStatus = PipelineState["voice"];

const OnboardingWizard = ({ userId, onComplete }: Props) => {
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);

  // Step 1
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [firm, setFirm] = useState("");
  const [industry, setIndustry] = useState("");
  const [northStar, setNorthStar] = useState("");
  const [nameError, setNameError] = useState("");

  // Step 2 — LinkedIn import
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [importedSummary, setImportedSummary] = useState<string | null>(null);
  const [pipeline, setPipeline] = useState<{
    voice: PipeStatus;
    positioning: PipeStatus;
    score: PipeStatus;
  }>({ voice: "pending", positioning: "pending", score: "pending" });

  // Step 3 — capture
  const [captureUrl, setCaptureUrl] = useState("");
  const [captureText, setCaptureText] = useState("");
  const [capturing, setCapturing] = useState(false);
  const [captureDone, setCaptureDone] = useState(false);

  const finish = () => {
    localStorage.setItem("aura_onboarding_complete", "true");
    onComplete();
  };

  const skipStep = () => {
    if (step < 4) setStep((s) => (s + 1) as any);
    else finish();
  };

  const handleStep1Continue = async () => {
    if (!name.trim()) {
      setNameError("Your name is required");
      return;
    }
    setNameError("");
    setSaving(true);
    try {
      const { error } = await supabase.from("diagnostic_profiles").upsert(
        {
          user_id: userId,
          first_name: name.trim(),
          level: role.trim() || null,
          firm: firm.trim() || null,
          sector_focus: industry || null,
          north_star_goal: northStar.trim() || null,
          onboarding_completed: true,
        },
        { onConflict: "user_id" }
      );
      if (error) throw error;

      // Fire welcome email (best-effort; EF de-dupes)
      try {
        supabase.functions.invoke("send-lifecycle-email", {
          body: { user_id: userId, email_type: "welcome" },
        });
      } catch {}

      // Best-effort milestones (table may not exist — swallow errors).
      try {
        await (supabase as any)
          .from("user_milestones")
          .insert([
            { user_id: userId, milestone_id: "first_login" },
            { user_id: userId, milestone_id: "profile_complete" },
          ]);
      } catch {}

      setStep(2);
    } catch (e: any) {
      toast.error("Failed to save profile: " + (e.message || "Unknown error"));
    } finally {
      setSaving(false);
    }
  };

  const handleFile = async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      toast.error("Please upload a .xlsx file");
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const { data, error } = await supabase.functions.invoke("import-linkedin-analytics", {
        body: form,
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      const imp = (data as any)?.imported || {};
      const days = (imp.engagement_rows || 0) + (imp.follower_rows || 0);
      setImportedSummary(`${days} days of data imported`);
      await runPostImportPipeline(setPipeline);
    } catch (err: any) {
      console.error("XLSX upload failed:", err);
      toast.error(err?.message || "Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  const handleCapture = async () => {
    const url = captureUrl.trim();
    const text = captureText.trim();
    if (!url && text.length < 5) {
      setStep(4);
      return;
    }
    setCapturing(true);
    try {
      const { error } = await supabase.functions.invoke("ingest-capture", {
        body: {
          user_id: userId,
          type: url ? "url" : "text",
          content: url || text,
        },
      });
      if (error) throw error;
      setCaptureDone(true);
      setTimeout(() => setStep(4), 1200);
    } catch {
      toast.error("Capture failed. You can try again later.");
      setStep(4);
    } finally {
      setCapturing(false);
    }
  };

  const progressPct = (step / 4) * 100;

  const inputClass =
    "w-full rounded-lg border bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 transition-colors font-sans";
  const inputStyle: React.CSSProperties = {
    borderColor: "var(--paper-3, hsl(var(--border)))",
  };

  const StepRow = ({ label, status }: { label: string; status: PipeStatus }) => (
    <li className="flex items-center gap-3 text-sm font-sans">
      {status === "done" ? (
        <Check className="w-4 h-4" style={{ color: "var(--brand)" }} />
      ) : status === "running" ? (
        <Loader2 className="w-4 h-4 animate-spin" style={{ color: "var(--brand)" }} />
      ) : status === "error" ? (
        <span className="w-4 h-4 inline-block text-center text-destructive">!</span>
      ) : (
        <span
          className="w-4 h-4 inline-block rounded-full border"
          style={{ borderColor: "var(--paper-3, hsl(var(--border)))" }}
        />
      )}
      <span style={{ color: status === "done" ? "var(--foreground)" : "hsl(var(--muted-foreground))" }}>
        {label}
        {status === "error" && (
          <span className="ml-2 text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
            — Will retry automatically
          </span>
        )}
      </span>
    </li>
  );

  const stepLabels: Record<number, string> = {
    1: "Your Identity",
    2: "Import LinkedIn",
    3: "First Capture",
    4: "Ready",
  };
  const stepTitles: Record<number, string> = {
    1: "Tell Aura who you are",
    2: "Import your LinkedIn history",
    3: "Feed Aura your first insight",
    4: "Your Aura is active",
  };
  const stepSubs: Record<number, string> = {
    1: "This shapes every signal and piece of content Aura creates for you.",
    2: "Aura analyzes your posts to learn your voice and detect initial signals.",
    3: "Paste a URL or type a note. Your first signal appears within 60 seconds.",
    4: `You're now an Observer in ${industry || "your sector"}. Explore your intelligence.`,
  };

  const content = (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center px-4"
      style={{
        background: "hsl(var(--background) / 0.7)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
      }}
    >
      <div
        className="relative w-full overflow-hidden"
        style={{
          maxWidth: 580,
          background: "hsl(var(--card))",
          color: "hsl(var(--card-foreground))",
          borderRadius: 16,
          border: "1px solid hsl(var(--border))",
          padding: 48,
          boxShadow: "0 20px 60px -10px rgba(0,0,0,0.4)",
        }}
      >
        {/* Progress bar */}
        <div
          className="absolute top-0 left-0 right-0 overflow-hidden"
          style={{ height: 3, background: "hsl(var(--muted))" }}
        >
          <div
            className="h-full transition-all duration-500"
            style={{ width: `${progressPct}%`, background: "var(--brand)" }}
          />
        </div>

        {/* Step label */}
        <p
          className="text-[11px] tracking-[0.18em] uppercase mb-3 font-sans font-medium"
          style={{ color: "var(--brand)" }}
        >
          Step {step} of 4 — {stepLabels[step]}
        </p>

        {/* Sliding content */}
        <div className="relative" style={{ minHeight: 360 }}>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
            >
              <h2
                className="font-serif"
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: 24,
                  lineHeight: 1.2,
                  color: "hsl(var(--foreground))",
                }}
              >
                {stepTitles[step]}
              </h2>
              <p
                className="mt-2 font-sans text-sm"
                style={{ color: "hsl(var(--muted-foreground))" }}
              >
                {stepSubs[step]}
              </p>

              {/* === STEP 1 === */}
              {step === 1 && (
                <div className="mt-6 space-y-3">
                  <div>
                    <input
                      className={inputClass}
                      style={inputStyle}
                      value={name}
                      onChange={(e) => { setName(e.target.value); setNameError(""); }}
                      placeholder="Your name *"
                    />
                    {nameError && (
                      <p className="text-xs text-destructive mt-1 font-sans">{nameError}</p>
                    )}
                  </div>
                  <input
                    className={inputClass}
                    style={inputStyle}
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    placeholder="Director of Digital Transformation"
                  />
                  <input
                    className={inputClass}
                    style={inputStyle}
                    value={firm}
                    onChange={(e) => setFirm(e.target.value)}
                    placeholder="EY, McKinsey, ACWA Power"
                  />
                  <select
                    className={inputClass}
                    style={inputStyle}
                    value={industry}
                    onChange={(e) => setIndustry(e.target.value)}
                  >
                    <option value="">Industry focus</option>
                    {INDUSTRIES.map((i) => (
                      <option key={i} value={i}>{i}</option>
                    ))}
                  </select>
                  <input
                    className={inputClass}
                    style={inputStyle}
                    value={northStar}
                    onChange={(e) => setNorthStar(e.target.value)}
                    placeholder="Build a $10M+ advisory practice"
                  />
                </div>
              )}

              {/* === STEP 2 === */}
              {step === 2 && (
                <div className="mt-6 space-y-4">
                  <div
                    onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
                    onDragLeave={() => setDragActive(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragActive(false);
                      const f = e.dataTransfer.files?.[0];
                      if (f) handleFile(f);
                    }}
                    onClick={() => fileRef.current?.click()}
                    className="flex flex-col items-center justify-center text-center cursor-pointer rounded-xl border-2 border-dashed transition-colors py-8 px-4 font-sans"
                    style={{
                      borderColor: dragActive ? "var(--brand)" : "hsl(var(--border))",
                      background: dragActive ? "hsl(var(--muted) / 0.5)" : "hsl(var(--muted) / 0.2)",
                    }}
                  >
                    <FileSpreadsheet className="w-8 h-8 mb-2" style={{ color: "var(--brand)" }} />
                    <p className="text-sm font-medium" style={{ color: "hsl(var(--foreground))" }}>
                      Drop your .xlsx file here or click to browse
                    </p>
                    <p className="text-xs mt-1" style={{ color: "hsl(var(--muted-foreground))" }}>
                      LinkedIn → Settings → Get a copy of your data → Posts
                    </p>
                    <input
                      ref={fileRef}
                      type="file"
                      accept=".xlsx"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleFile(f);
                        if (fileRef.current) fileRef.current.value = "";
                      }}
                    />
                  </div>

                  {uploading && (
                    <div className="flex items-center gap-2 text-sm font-sans" style={{ color: "var(--brand)" }}>
                      <Loader2 className="w-4 h-4 animate-spin" /> Uploading...
                    </div>
                  )}

                  {importedSummary && (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-sm font-sans" style={{ color: "var(--brand)" }}>
                        <Check className="w-4 h-4" /> {importedSummary}
                      </div>
                      <ul className="space-y-2 pl-1">
                        <StepRow label="Analyzing your voice..." status={pipeline.voice} />
                        <StepRow label="Building your positioning..." status={pipeline.positioning} />
                        <StepRow label="Calculating your score..." status={pipeline.score} />
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {/* === STEP 3 === */}
              {step === 3 && (
                <div className="mt-6 space-y-3">
                  <input
                    className={inputClass}
                    style={inputStyle}
                    value={captureUrl}
                    onChange={(e) => setCaptureUrl(e.target.value)}
                    placeholder="Paste a URL"
                    disabled={capturing || captureDone}
                  />
                  <textarea
                    className={`${inputClass} min-h-[100px] resize-none`}
                    style={inputStyle}
                    value={captureText}
                    onChange={(e) => setCaptureText(e.target.value)}
                    placeholder="…or type a note"
                    disabled={capturing || captureDone}
                  />
                  {capturing && (
                    <div className="flex items-center gap-2 text-sm font-sans" style={{ color: "var(--brand)" }}>
                      <Loader2 className="w-4 h-4 animate-spin" /> Processing — your first signal is forming.
                    </div>
                  )}
                  {captureDone && (
                    <div className="flex items-center gap-2 text-sm font-sans" style={{ color: "var(--brand)" }}>
                      <Check className="w-4 h-4" /> Captured.
                    </div>
                  )}
                </div>
              )}

              {/* === STEP 4 === */}
              {step === 4 && (
                <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {[
                    { icon: Shield, title: "Intelligence", sub: "See your signals" },
                    { icon: Crown, title: "Publish", sub: "Create your first post" },
                    { icon: TrendingUp, title: "Impact", sub: "Track authority growth" },
                  ].map(({ icon: Icon, title, sub }) => (
                    <div
                      key={title}
                      className="rounded-xl p-4 font-sans"
                      style={{
                        background: "hsl(var(--muted) / 0.3)",
                        border: "1px solid hsl(var(--border))",
                      }}
                    >
                      <Icon className="w-5 h-5 mb-2" style={{ color: "var(--brand)" }} />
                      <p className="text-sm font-medium" style={{ color: "hsl(var(--foreground))" }}>{title}</p>
                      <p className="text-xs mt-0.5" style={{ color: "hsl(var(--muted-foreground))" }}>{sub}</p>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* CTA */}
        <div className="mt-8">
          {step === 1 && (
            <button
              onClick={handleStep1Continue}
              disabled={saving}
              className="w-full py-3.5 rounded-full text-sm font-medium font-sans transition-all disabled:opacity-60"
              style={{ background: "var(--brand)", color: "var(--brand-foreground, #fff)" }}
            >
              {saving ? "Saving..." : "Continue"}
            </button>
          )}
          {step === 2 && (
            <button
              onClick={() => setStep(3)}
              disabled={uploading}
              className="w-full py-3.5 rounded-full text-sm font-medium font-sans transition-all disabled:opacity-60"
              style={{ background: "var(--brand)", color: "var(--brand-foreground, #fff)" }}
            >
              Continue
            </button>
          )}
          {step === 3 && (
            <button
              onClick={handleCapture}
              disabled={capturing}
              className="w-full py-3.5 rounded-full text-sm font-medium font-sans transition-all disabled:opacity-60"
              style={{ background: "var(--brand)", color: "var(--brand-foreground, #fff)" }}
            >
              {capturing ? "Capturing..." : "Capture"}
            </button>
          )}
          {step === 4 && (
            <button
              onClick={finish}
              className="w-full py-3.5 rounded-full text-sm font-medium font-sans transition-all"
              style={{ background: "var(--brand)", color: "var(--brand-foreground, #fff)" }}
            >
              Go to Dashboard
            </button>
          )}
        </div>

        {/* Skip link — bottom right, not on step 1 or 4 */}
        {step > 1 && step < 4 && (
          <button
            onClick={skipStep}
            className="absolute bottom-4 right-6 text-xs font-sans transition-colors hover:opacity-100"
            style={{ color: "hsl(var(--muted-foreground))" }}
          >
            Skip
          </button>
        )}
      </div>
    </div>
  );

  return createPortal(content, document.body);
};

export default OnboardingWizard;
