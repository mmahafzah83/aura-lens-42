import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Link2, FileText, Loader2 } from "lucide-react";

const STEPS = [
  { label: "You", pct: 25 },
  { label: "Strengths", pct: 50 },
  { label: "Capture", pct: 75 },
  { label: "Ready", pct: 100 },
];

const STEP_NAMES = ["Your foundation", "Your strengths", "Feed Aura", "Complete"];

const ROLE_CHIPS = [
  "Senior Consultant", "Director", "VP", "Partner",
  "Managing Director", "Advisor", "Founder", "C-Suite",
];

const INDUSTRIES = [
  "Utilities and infrastructure",
  "Energy and resources",
  "Financial services",
  "Government and public sector",
  "Technology and digital",
  "Healthcare",
  "Consulting (cross-industry)",
  "Education",
  "Other",
];

const STRENGTHS = [
  "Think strategically — see the big picture first",
  "Go deep into the data and evidence",
  "Work with people to find the answer together",
  "Execute — find the fastest path and move",
];

const Onboarding = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [firstName, setFirstName] = useState("");
  const [role, setRole] = useState("");
  const [industry, setIndustry] = useState<string | null>(null);
  const [industryOther, setIndustryOther] = useState("");
  const [strength, setStrength] = useState<string | null>(null);
  const [captureType, setCaptureType] = useState<"link" | "note">("link");
  const [captureValue, setCaptureValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [captured, setCaptured] = useState(false);
  const [skippedCapture, setSkippedCapture] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [auraScore, setAuraScore] = useState(0);
  const [scoreTier, setScoreTier] = useState("Dormant");
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { navigate("/auth"); return; }
      setUserId(session.user.id);
      setAccessToken(session.access_token);

      const { data: profile } = await supabase
        .from("diagnostic_profiles")
        .select("onboarding_completed")
        .eq("user_id", session.user.id)
        .maybeSingle();
      if (profile && (profile as any).onboarding_completed) {
        navigate("/home");
        return;
      }
      setAuthChecked(true);
    });
  }, [navigate]);

  const resolvedIndustry = industry === "Other" ? industryOther.trim() : industry;

  const saveScreen1 = async () => {
    if (!userId) return;
    await supabase.from("diagnostic_profiles").upsert(
      {
        user_id: userId,
        first_name: firstName.trim() || null,
        level: role.trim() || null,
        sector_focus: resolvedIndustry || null,
      } as any,
      { onConflict: "user_id" }
    );
    setStep(1);
  };

  const saveStrength = async () => {
    if (!strength || !userId) return;
    await supabase.from("diagnostic_profiles").update(
      { primary_strength: strength } as any
    ).eq("user_id", userId);
    setStep(2);
  };

  const doCapture = async () => {
    if (!captureValue.trim() || !accessToken) return;
    setLoading(true);
    try {
      const body: any = {
        type: captureType === "link" ? "link" : "text",
        content: captureValue.trim(),
      };
      if (captureType === "link") body.source_url = captureValue.trim();

      await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ingest-capture`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify(body),
      });
      setCaptured(true);
      await new Promise(r => setTimeout(r, 2500));
      setStep(3);
    } catch {
      toast.error("Capture failed — try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (step === 3 && userId) {
      (async () => {
        try {
          const now = new Date();
          const weekAgo = new Date(now.getTime() - 7 * 86400000);
          const monthAgo = new Date(now.getTime() - 30 * 86400000);

          const [entriesRes, signalsRes, contentRes] = await Promise.all([
            supabase.from("entries").select("id", { count: "exact" }).eq("user_id", userId).gte("created_at", weekAgo.toISOString()),
            supabase.from("strategic_signals").select("confidence").eq("user_id", userId).eq("status", "active"),
            supabase.from("linkedin_posts").select("id", { count: "exact" }).eq("user_id", userId).gte("created_at", monthAgo.toISOString()),
          ]);

          const captureScore = Math.min(100, Math.round(((entriesRes.count || 0) / 7) * 100));
          const signalData = signalsRes.data || [];
          const signalScore = signalData.length > 0
            ? Math.round((signalData.reduce((s, r) => s + Number(r.confidence), 0) / signalData.length) * 100)
            : 0;
          const contentScore = Math.min(100, Math.round(((contentRes.count || 0) / 10) * 100));
          const score = Math.round(captureScore * 0.35 + signalScore * 0.35 + contentScore * 0.3);
          const tier = score >= 85 ? "Authority" : score >= 65 ? "Gaining momentum" : score >= 40 ? "Building" : "Dormant";
          setAuraScore(score);
          setScoreTier(tier);
        } catch {
          setAuraScore(0);
          setScoreTier("Dormant");
        }
      })();
    }
  }, [step, userId]);

  const finishOnboarding = async () => {
    if (!userId) return;
    await supabase.from("diagnostic_profiles").update({
      onboarding_completed: true,
      last_visit_at: new Date().toISOString(),
    } as any).eq("user_id", userId);
    navigate("/home");
  };

  if (!authChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#0d0d0d" }}>
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: "#F97316" }} />
      </div>
    );
  }

  const currentPct = STEPS[step].pct;
  const canContinueScreen1 = firstName.trim().length > 0 || role.trim().length > 0;

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#0d0d0d", color: "#f0f0f0" }}>
      {/* Progress bar */}
      <div className="px-5 pt-5 pb-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            {step > 0 && (
              <button
                onClick={() => setStep(step - 1)}
                className="text-base leading-none"
                style={{ color: "#3a3a3a", background: "transparent", border: "none", padding: "4px 8px", cursor: "pointer" }}
              >
                ←
              </button>
            )}
            <span className="text-xs tracking-wide" style={{ color: "#F97316" }}>
              {step < 4 ? `Step ${step + 1} of 4 · ${STEP_NAMES[step]}` : "Complete ✓"}
            </span>
          </div>
          <span className="text-xs" style={{ color: "#3a3a3a" }}>
            {step === 0 ? "~3 min left" : step === 1 ? "~2 min left" : step === 2 ? "~1 min left" : "Done"}
          </span>
        </div>
        <div className="w-full h-[3px] rounded-full" style={{ background: "#1a1a1a" }}>
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${currentPct}%`,
              background: step === 3 ? "#7ab648" : "#F97316",
            }}
          />
        </div>
        <div className="flex items-center justify-between mt-3 px-2">
          {STEPS.map((s, i) => (
            <div key={s.label} className="flex flex-col items-center gap-1">
              <div
                className="w-3 h-3 rounded-full border-2 transition-all"
                style={{
                  borderColor: i <= step ? (step === 3 && i === 3 ? "#7ab648" : "#F97316") : "#1a1a1a",
                  background: i < step ? (step === 3 && i === 3 ? "#7ab648" : "#F97316") : "transparent",
                }}
              />
              <span className="text-[9px] tracking-wider uppercase" style={{ color: i <= step ? "#F97316" : "#3a3a3a" }}>
                {s.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 px-5 pb-8 overflow-y-auto">
        {/* Screen 1 — Name + Job title + Industry */}
        {step === 0 && (
          <div className="mt-6 space-y-5 max-w-lg mx-auto">
            <p className="text-[10px] uppercase tracking-[0.2em]" style={{ color: "#F97316" }}>Step 1 — Your foundation</p>
            <h1 className="text-xl font-medium" style={{ color: "#f0f0f0" }}>Tell Aura who you are</h1>
            <p className="text-sm" style={{ color: "#666" }}>This takes 60 seconds. It shapes everything Aura generates for you.</p>

            {/* Name */}
            <div className="space-y-1">
              <p className="text-xs font-medium" style={{ color: "#999" }}>What is your name?</p>
              <input
                type="text"
                value={firstName}
                onChange={e => setFirstName(e.target.value)}
                placeholder="Your first name"
                className="w-full px-4 py-3 rounded-lg text-sm outline-none"
                style={{ background: "#141414", border: "1px solid #252525", color: "#f0f0f0" }}
              />
            </div>

            {/* Job title */}
            <div className="space-y-2">
              <p className="text-xs font-medium" style={{ color: "#999" }}>What is your current job title?</p>
              <input
                type="text"
                value={role}
                onChange={e => setRole(e.target.value)}
                placeholder="e.g. Director of Digital Transformation, EY"
                className="w-full px-4 py-3 rounded-lg text-sm outline-none"
                style={{ background: "#141414", border: "1px solid #252525", color: "#f0f0f0" }}
              />
              <div className="flex flex-wrap gap-2">
                {ROLE_CHIPS.map(chip => (
                  <button
                    key={chip}
                    onClick={() => setRole(chip)}
                    className="px-3 py-1.5 rounded-full text-xs transition-all"
                    style={{
                      background: role === chip ? "#1e1a10" : "#141414",
                      border: `1px solid ${role === chip ? "#F97316" : "#252525"}`,
                      color: role === chip ? "#F97316" : "#666",
                    }}
                  >
                    {chip}
                  </button>
                ))}
              </div>
            </div>

            {/* Industry */}
            <div className="space-y-2">
              <p className="text-xs font-medium" style={{ color: "#999" }}>What industry do you work in?</p>
              <div className="flex flex-wrap gap-2">
                {INDUSTRIES.map(ind => (
                  <button
                    key={ind}
                    onClick={() => setIndustry(industry === ind ? null : ind)}
                    className="px-3 py-1.5 rounded-full text-xs transition-all"
                    style={{
                      background: industry === ind ? "#1e1a10" : "#141414",
                      border: `1px solid ${industry === ind ? "#F97316" : "#252525"}`,
                      color: industry === ind ? "#F97316" : "#666",
                    }}
                  >
                    {ind}
                  </button>
                ))}
              </div>
              {industry === "Other" && (
                <input
                  type="text"
                  value={industryOther}
                  onChange={e => setIndustryOther(e.target.value)}
                  placeholder="Your industry"
                  className="w-full px-4 py-3 rounded-lg text-sm outline-none mt-2"
                  style={{ background: "#141414", border: "1px solid #252525", color: "#f0f0f0" }}
                />
              )}
            </div>

            <div className="rounded-lg p-3 text-xs" style={{ background: "#141414", border: "1px solid #252525", color: "#3a3a3a" }}>
              Why this matters: Aura uses your role to filter signals, set the right tone for your content, and benchmark you against your career target.
            </div>
            <button
              onClick={saveScreen1}
              disabled={!canContinueScreen1}
              className="w-full py-3 rounded-xl text-sm font-medium transition-all"
              style={{
                background: canContinueScreen1 ? "#F97316" : "#252525",
                color: canContinueScreen1 ? "#0d0d0d" : "#666",
              }}
            >
              Continue →
            </button>
            <button
              onClick={() => setStep(1)}
              className="w-full text-center text-xs py-2"
              style={{ color: "#3a3a3a" }}
            >
              Skip this step (not recommended)
            </button>
          </div>
        )}

        {/* Screen 2 — Strengths */}
        {step === 1 && (
          <div className="mt-6 space-y-5 max-w-lg mx-auto">
            <div className="rounded-lg p-4 text-sm" style={{ background: "#1e1a10", border: "1px solid #F9731633", color: "#F97316" }}>
              ✓ Great start. Your profile is taking shape. This next step is the one most people skip — and the one that makes the biggest difference.
            </div>
            <p className="text-[10px] uppercase tracking-[0.2em]" style={{ color: "#F97316" }}>Step 2 — Your strengths</p>
            <h1 className="text-xl font-medium" style={{ color: "#f0f0f0" }}>How do you naturally work?</h1>
            <p className="text-sm" style={{ color: "#666" }}>Choose what feels most like you. Aura uses this to find your brand positioning.</p>
            <p className="text-xs font-medium mt-2" style={{ color: "#999" }}>When you solve a problem, you usually...</p>
            <div className="space-y-2">
              {STRENGTHS.map(s => (
                <button
                  key={s}
                  onClick={() => setStrength(s)}
                  className="w-full text-left px-4 py-3 rounded-lg text-sm transition-all"
                  style={{
                    background: "#141414",
                    border: `1px solid ${strength === s ? "#F97316" : "#252525"}`,
                    color: strength === s ? "#F97316" : "#f0f0f0",
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
            <div className="rounded-lg p-3 text-xs" style={{ background: "#1a1515", border: "1px solid #3a2020", color: "#994444" }}>
              If you skip this: Aura will generate generic content that sounds like anyone. Your content will not reflect your real strengths or voice.
            </div>
            <button
              onClick={saveStrength}
              disabled={!strength}
              className="w-full py-3 rounded-xl text-sm font-medium transition-all"
              style={{
                background: strength ? "#F97316" : "#252525",
                color: strength ? "#0d0d0d" : "#666",
              }}
            >
              Continue →
            </button>
            <button
              onClick={() => setStep(2)}
              className="w-full text-center text-xs py-2"
              style={{ color: "#3a3a3a" }}
            >
              Skip (your content will be less personalised)
            </button>
          </div>
        )}

        {/* Screen 3 — First capture */}
        {step === 2 && (
          <div className="mt-6 space-y-5 max-w-lg mx-auto">
            <div className="rounded-lg p-4 text-sm" style={{ background: "#1e1a10", border: "1px solid #F9731633", color: "#F97316" }}>
              ◈ Almost there — you are doing great. One last step. This is where Aura comes alive. Your first capture generates your first signal in under 60 seconds.
            </div>
            <p className="text-[10px] uppercase tracking-[0.2em]" style={{ color: "#F97316" }}>Step 3 — Feed Aura</p>
            <h1 className="text-xl font-medium" style={{ color: "#f0f0f0" }}>Add your first source</h1>
            <p className="text-sm" style={{ color: "#666" }}>Paste a link to any article you read recently. Aura will read it and find your first signal.</p>

            <div className="flex gap-2">
              {(["link", "note"] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setCaptureType(t)}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-all"
                  style={{
                    background: captureType === t ? "#1e1a10" : "#141414",
                    border: `1px solid ${captureType === t ? "#F97316" : "#252525"}`,
                    color: captureType === t ? "#F97316" : "#666",
                  }}
                >
                  {t === "link" ? <Link2 className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
                  {t === "link" ? "Link" : "Note"}
                </button>
              ))}
            </div>

            {captureType === "link" ? (
              <div className="space-y-1">
                <input
                  type="url"
                  value={captureValue}
                  onChange={e => setCaptureValue(e.target.value)}
                  placeholder="Paste a link — any article you read today"
                  className="w-full px-4 py-3 rounded-lg text-sm outline-none"
                  style={{ background: "#141414", border: "1px solid #252525", color: "#f0f0f0" }}
                />
                <p className="text-[10px]" style={{ color: "#3a3a3a" }}>Any article, report, or LinkedIn post that matters to you</p>
              </div>
            ) : (
              <textarea
                value={captureValue}
                onChange={e => setCaptureValue(e.target.value)}
                placeholder="Type a thought, an idea, or something you want to remember."
                rows={4}
                className="w-full px-4 py-3 rounded-lg text-sm outline-none resize-none"
                style={{ background: "#141414", border: "1px solid #252525", color: "#f0f0f0" }}
              />
            )}

            <div className="rounded-lg p-3 text-xs" style={{ background: "#141414", border: "1px solid #252525", color: "#3a3a3a" }}>
              Why this matters: Without a capture, your home screen will be empty. One link takes 10 seconds and generates your first signal.
            </div>

            <button
              onClick={doCapture}
              disabled={!captureValue.trim() || loading}
              className="w-full py-3 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2"
              style={{
                background: captureValue.trim() ? "#F97316" : "#252525",
                color: captureValue.trim() ? "#0d0d0d" : "#666",
              }}
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Reading your source...
                </>
              ) : (
                "Capture and finish →"
              )}
            </button>
            <button
              onClick={() => { setSkippedCapture(true); setStep(3); }}
              className="w-full text-center text-xs py-2"
              style={{ color: "#3a3a3a" }}
            >
              Skip (your home screen will start empty)
            </button>
          </div>
        )}

        {/* Screen 4 — Ready */}
        {step === 3 && (
          <div className="mt-10 space-y-6 max-w-lg mx-auto flex flex-col items-center text-center">
            <div className="text-[56px] font-medium" style={{ color: "#F97316" }}>
              {auraScore}
            </div>
            <p className="text-[10px] uppercase tracking-[0.2em]" style={{ color: "#3a3a3a" }}>
              Your Aura score · {scoreTier}
            </p>
            <h1 className="text-lg font-medium" style={{ color: "#f0f0f0" }}>Your Aura is ready.</h1>
            <p className="text-sm" style={{ color: "#666" }}>Here is what was built from your inputs.</p>

            <div className="w-full space-y-3 text-left">
              {[
                { done: true, text: "Your identity profile saved — role, strengths, and career focus" },
                {
                  done: !skippedCapture && captured,
                  text: !skippedCapture && captured
                    ? "1 source captured and analysed"
                    : "No source added yet — capture one from Home",
                },
                {
                  done: !skippedCapture && captured,
                  text: !skippedCapture && captured
                    ? "First signal detected — visible in Intelligence"
                    : "No signals yet — add your first capture",
                },
                { done: true, text: "Personal brand brief started — grows as you capture more" },
              ].map((item, i) => (
                <div
                  key={i}
                  className="flex items-start gap-3 p-3 rounded-lg"
                  style={{ background: "#141414", border: "1px solid #252525" }}
                >
                  <div
                    className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0"
                    style={{ background: item.done ? "#7ab648" : "#3a3a3a" }}
                  />
                  <span className="text-sm" style={{ color: item.done ? "#f0f0f0" : "#666" }}>
                    {item.text}
                  </span>
                </div>
              ))}
            </div>

            <button
              onClick={finishOnboarding}
              className="w-full py-3 rounded-xl text-sm font-medium mt-4"
              style={{ background: "#F97316", color: "#0d0d0d" }}
            >
              Go to my Aura →
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default Onboarding;
