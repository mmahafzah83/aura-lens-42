import { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { X, ArrowLeft, Compass, ChevronDown, Copy, Download, ArrowUpRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import ReactMarkdown from "react-markdown";

// New section headers (must match brand-assessment EF SYSTEM_PROMPT)
const SECTION_DEFS: { key: string; label: string; hint: string }[] = [
  { key: "HOW THE MARKET SEES YOU", label: "How the market sees you", hint: "The way a CIO in your sector would describe you to a colleague" },
  { key: "HOW YOU BUILD TRUST", label: "How you build trust", hint: "Your natural way of earning credibility" },
  { key: "YOUR NATURAL TONE", label: "Your natural tone", hint: "How your communication style lands with senior decision makers" },
  { key: "WHAT ONLY YOU CAN DO", label: "What only you can do", hint: "Where your expertise meets an unmet market need" },
  { key: "THE SPACE NOBODY ELSE OWNS", label: "The space nobody else owns", hint: "The gap in the market that's yours to claim" },
  { key: "YOUR 3 TOPICS", label: "Your 3 topics", hint: "The subjects where you have the most to say and the market needs to hear it" },
  { key: "WHERE TO INVEST NEXT", label: "Where to invest next", hint: "Honest assessment of what's missing and what building it would unlock" },
  { key: "THE HONEST TRUTH", label: "The honest truth", hint: "Why the thing that's holding you back is actually solvable" },
];

function splitInterpretation(raw: string): { prose: string; json: any | null } {
  if (!raw) return { prose: "", json: null };
  const idx = raw.indexOf("---JSON---");
  if (idx === -1) return { prose: raw, json: null };
  const prose = raw.slice(0, idx).trim();
  const jsonText = raw.slice(idx + "---JSON---".length).trim();
  try {
    // Strip code fences if present
    const cleaned = jsonText.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
    return { prose, json: JSON.parse(cleaned) };
  } catch (e) {
    console.warn("Failed to parse brand-assessment JSON tail", e);
    return { prose, json: null };
  }
}

function extractSection(prose: string, header: string): string {
  if (!prose) return "";
  const headers = SECTION_DEFS.map(s => s.key);
  const escapedAll = headers.map(h => h.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const escThis = header.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(?:^|\\n)\\s*(?:#{1,6}\\s*)?\\*{0,2}${escThis}\\*{0,2}\\s*\\n+([\\s\\S]*?)(?=\\n\\s*(?:#{1,6}\\s*)?\\*{0,2}(?:${escapedAll})\\*{0,2}\\s*\\n|$)`, "i");
  const m = prose.match(re);
  return (m?.[1] || "").trim();
}

interface BrandAssessmentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete?: () => void;
  onNavigate?: (target: string) => void;
}

interface Question {
  title: string;
  sub?: string;
  type: "multi" | "single" | "text";
  max?: number;
  options?: string[];
  placeholder?: string;
}

const QUESTIONS: Question[] = [
  {
    title: "How do clients describe you?",
    sub: "Pick up to 3 that feel most accurate.",
    type: "multi",
    max: 3,
    options: [
      "The expert who always has the answer",
      "The strategist who sees what others miss",
      "The leader who brings people with them",
      "The challenger who questions everything",
      "The guide who makes complexity simple",
      "The visionary who sees where things are going",
      "The executor who gets things done",
      "The connector who opens the right doors",
    ],
  },
  {
    title: "What do you want to be known for in 5 years?",
    sub: "Pick one.",
    type: "single",
    options: [
      "The definitive authority on a specific topic",
      "A trusted advisor to C-suite and board leaders",
      "A published thought leader with a global audience",
      "A builder of practices or businesses",
      "A recognised speaker and keynote voice",
      "A pioneer of a new framework or methodology",
    ],
  },
  {
    title: "What feels most natural when you create content?",
    sub: "Pick up to 2.",
    type: "multi",
    max: 2,
    options: [
      "Writing structured frameworks and models",
      "Sharing strong contrarian opinions",
      "Telling stories from real client work",
      "Explaining complex ideas simply",
      "Analysing data and research critically",
      "Challenging what the industry takes for granted",
    ],
  },
  {
    title: "How would you describe your communication style?",
    sub: "Pick up to 2.",
    type: "multi",
    max: 2,
    options: [
      "Direct — I say exactly what I think",
      "Measured — I build the case carefully",
      "Provocative — I like to challenge the room",
      "Empathetic — I meet people where they are",
      "Authoritative — I speak from deep expertise",
      "Inspiring — I connect ideas to a bigger purpose",
    ],
  },
  {
    title: "What topic do you get asked about most?",
    sub: "Type it in your own words.",
    type: "text",
    placeholder: "e.g. Digital transformation in regulated utilities",
  },
  {
    title: "What do you believe that most people in your field do not?",
    sub: "Be honest — this is your contrarian edge.",
    type: "text",
    placeholder: "e.g. Technology is never the real transformation challenge — culture always is",
  },
  {
    title: "What type of content do you most want to be known for?",
    type: "single",
    options: [
      "Long-form frameworks and white papers",
      "Sharp LinkedIn posts with a clear point of view",
      "Data-backed industry analysis",
      "Practical guides from real client experience",
      "Visionary essays about where the industry is heading",
      "Conversations and interviews with other leaders",
    ],
  },
  {
    title: "What gap in your field are you uniquely placed to fill?",
    sub: "The space no one else owns yet.",
    type: "text",
    placeholder: "e.g. No one is connecting geopolitical risk to digital transformation delivery in utilities",
  },
  {
    title: "Which reputation feels closest to your ideal?",
    type: "single",
    options: [
      "The person every serious practitioner follows",
      "The advisor CEOs call when no one else can solve it",
      "The author of the framework my industry uses",
      "The voice that predicted the shift before it happened",
      "The builder who created something that outlasted them",
    ],
  },
  {
    title: "What's held you back from being more visible in your sector?",
    sub: "Pick all that are true.",
    type: "multi",
    options: [
      "I do not have time to write consistently",
      "I do not know what to say that is different",
      "I am not sure my ideas are original enough",
      "I worry about what colleagues will think",
      "I do not know where to start",
      "I have started but cannot maintain momentum",
    ],
  },
];

const BrandAssessmentModal = ({ open, onOpenChange, onComplete, onNavigate }: BrandAssessmentModalProps) => {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string | string[]>>({});
  const [showResults, setShowResults] = useState(false);
  const [loading, setLoading] = useState(false);
  const [interpretation, setInterpretation] = useState("");
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      setStep(0);
      setAnswers({});
      setShowResults(false);
      setLoading(false);
      setInterpretation("");
    }
  }, [open]);

  // Lock body scroll when modal is open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = ""; };
    }
  }, [open]);

  if (!open) return null;

  const q = QUESTIONS[step];
  const currentAnswer = answers[step];

  const canProceed = () => {
    const a = answers[step];
    if (!a) return false;
    if (q.type === "text") return typeof a === "string" && a.trim().length > 0;
    if (q.type === "single") return typeof a === "string" && a.length > 0;
    if (q.type === "multi") return Array.isArray(a) && a.length > 0;
    return false;
  };

  const toggleOption = (opt: string) => {
    if (q.type === "single") {
      setAnswers((prev) => ({ ...prev, [step]: opt }));
      return;
    }
    const current = (answers[step] as string[]) || [];
    if (current.includes(opt)) {
      setAnswers((prev) => ({ ...prev, [step]: current.filter((o) => o !== opt) }));
    } else {
      if (q.max && current.length >= q.max) return;
      setAnswers((prev) => ({ ...prev, [step]: [...current, opt] }));
    }
  };

  const isSelected = (opt: string) => {
    const a = answers[step];
    if (q.type === "single") return a === opt;
    return Array.isArray(a) && a.includes(opt);
  };

  const handleNext = async () => {
    if (step < QUESTIONS.length - 1) {
      setStep((s) => s + 1);
    } else {
      await submitAssessment();
    }
  };

  const submitAssessment = async () => {
    setShowResults(true);
    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Fix 1: Read audit scores from database automatically
      const { data: profile } = await (supabase.from("diagnostic_profiles" as any) as any)
        .select("audit_results")
        .eq("user_id", user.id)
        .maybeSingle();

      const auditScores = profile?.audit_results && Object.keys(profile.audit_results).length > 0
        ? profile.audit_results
        : null;

      const formattedAnswers: Record<string, any> = {};
      QUESTIONS.forEach((qq, i) => {
        formattedAnswers[`Q${i + 1}_${qq.title}`] = answers[i];
      });

      const { data, error } = await supabase.functions.invoke("brand-assessment", {
        body: { answers: formattedAnswers, auditScores: auditScores || "No audit scores available yet" },
      });

      if (error) throw error;
      setInterpretation(data.interpretation || "No analysis returned.");
    } catch (e: any) {
      console.error("Brand assessment error:", e);
      toast({ title: "Error", description: e.message || "Failed to generate brand analysis", variant: "destructive" });
      setInterpretation("Analysis could not be generated. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveToIdentity = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const formattedAnswers: Record<string, any> = {};
      QUESTIONS.forEach((qq, i) => {
        formattedAnswers[`Q${i + 1}`] = answers[i];
      });

      const { prose, json } = splitInterpretation(interpretation);

      // Build the persisted brand_assessment_results object.
      // Prefer structured JSON from new prompt; fall back to legacy header parsing.
      let resultsObj: Record<string, any> = { interpretation: prose || interpretation };
      if (json && typeof json === "object") {
        resultsObj = { ...json, ...resultsObj };
      } else {
        // Legacy fallback — try to extract the old keys from prose.
        const archMatch = interpretation.match(/(?:PRIMARY BRAND ARCHETYPE|HOW (?:THE MARKET SEES YOU|I AM POSITIONED))\s*\n+(.+?)(?:\.|Three|\n)/i);
        const secMatch = interpretation.match(/secondary (?:archetype|positioning)[^.]*?(?:is|:)\s*(?:the\s+)?(.+?)(?:\.|$)/i);
        resultsObj.primary_archetype = archMatch?.[1]?.trim() || "";
        resultsObj.secondary_archetype = secMatch?.[1]?.trim() || "";
      }

      await (supabase.from("diagnostic_profiles" as any) as any)
        .update({
          brand_assessment_answers: formattedAnswers,
          brand_assessment_results: resultsObj,
          brand_assessment_completed_at: new Date().toISOString(),
        })
        .eq("user_id", user.id);

      toast({ title: "Done. Aura sees who you are now — and everything it creates will reflect it." });
      onComplete?.();
      onOpenChange(false);
      onNavigate?.("identity");
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const progress = showResults ? 100 : ((step + 1) / QUESTIONS.length) * 100;

  return createPortal(
    <>
      {/* Full-screen overlay */}
      <div
        className="fixed inset-0"
        style={{ background: "rgba(0,0,0,0.8)", zIndex: 999, pointerEvents: "all" }}
        onClick={() => onOpenChange(false)}
      />

      {/* Centered modal */}
      <div
        className="fixed"
        style={{
          zIndex: 1000,
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: 560,
          maxWidth: "92vw",
          height: "88vh",
          display: "flex",
          flexDirection: "column",
          background: "var(--ink)",
          borderRadius: 16,
          border: "1px solid var(--ink-3)",
          overflow: "hidden",
          willChange: "unset",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header — fixed */}
        <div className="shrink-0 px-4 pt-4 pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {!showResults && step > 0 && (
                <button onClick={() => setStep((s) => s - 1)} className="text-ink-4 hover:text-ink-5 p-1">
                  <ArrowLeft className="w-4 h-4" />
                </button>
              )}
              <div className="flex items-center gap-2">
                <Compass className="w-4 h-4 text-brand" />
                <span className="text-[13px] text-ink-7 font-medium">Brand Assessment</span>
              </div>
            </div>
            <button onClick={() => onOpenChange(false)} className="text-ink-4 hover:text-ink-5 p-1">
              <X className="w-4 h-4" />
            </button>
          </div>

          {!showResults && step === 0 && (
            <p className="text-[11px] text-ink-5 mt-2 mb-1">10 questions · 8 minutes · reveals your positioning</p>
          )}

          {/* Progress bar */}
          <div className="mt-2 pb-1">
            <div className="h-1 bg-surface-ink-subtle rounded-full overflow-hidden">
              <div
                className="h-full bg-brand rounded-full transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </div>

        {/* Content — scrollable */}
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {showResults ? (
            <div className="max-w-2xl mx-auto">
              {loading ? (
                <div className="flex flex-col items-center justify-center py-20 gap-4">
                  <div className="w-3 h-3 rounded-full bg-brand animate-pulse" />
                  <p className="text-[13px] text-ink-5">Building your brand positioning across 6 frameworks...</p>
                </div>
              ) : (
                <div className="space-y-0">
                  <div className="prose prose-sm max-w-none
                    [&_h1]:text-brand [&_h1]:text-base [&_h1]:font-bold [&_h1]:border-b [&_h1]:border-brand/20 [&_h1]:pb-2 [&_h1]:mb-3
                    [&_h2]:text-brand [&_h2]:text-[13px] [&_h2]:font-bold [&_h2]:border-b [&_h2]:border-brand/20 [&_h2]:pb-2 [&_h2]:mb-3 [&_h2]:mt-6
                    [&_h3]:text-brand [&_h3]:text-[13px] [&_h3]:font-bold [&_h3]:mb-2 [&_h3]:mt-5
                    [&_p]:text-ink-5 [&_p]:text-[12px] [&_p]:leading-relaxed [&_p]:mb-3
                    [&_strong]:text-brand [&_strong]:font-semibold
                    [&_li]:text-ink-5 [&_li]:text-[12px]
                    [&_ul]:mb-3 [&_ol]:mb-3
                  ">
                    <ReactMarkdown>{interpretation}</ReactMarkdown>
                  </div>

                  {/* Fix 6: Guided primary action */}
                  <div className="flex flex-col gap-2 pt-6 border-t border-brand/20 mt-6">
                    <button
                      onClick={handleSaveToIdentity}
                      className="w-full py-3 rounded-xl text-[13px] font-medium tracking-wide hover:brightness-110 transition-all active:scale-[0.98]"
                      style={{
                        background: "linear-gradient(to bottom, hsl(43 80% 55%), var(--brand))",
                        color: "var(--ink)",
                      }}
                    >
                      View my complete Strategic Identity →
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="max-w-lg mx-auto pt-4">
              <p className="text-[11px] text-ink-5 mb-1 tracking-wider uppercase">
                Question {step + 1} of {QUESTIONS.length}
              </p>
              <h2 className="text-[18px] text-ink-7 font-medium leading-snug mb-1">
                {q.title}
              </h2>
              {q.sub && <p className="text-[12px] text-ink-5 mb-5">{q.sub}</p>}

              {q.type === "text" ? (
                <textarea
                  value={(currentAnswer as string) || ""}
                  onChange={(e) => setAnswers((prev) => ({ ...prev, [step]: e.target.value }))}
                  placeholder={q.placeholder}
                  className="w-full h-28 bg-surface-ink-raised border border-ink-3 rounded-xl p-3 text-[13px] text-ink-7 placeholder-[#3a3a3a] resize-none focus:outline-none focus:border-brand/40 transition-colors"
                />
              ) : (
                <div className="space-y-2">
                  {q.options?.map((opt) => (
                    <button
                      key={opt}
                      onClick={() => toggleOption(opt)}
                      className={`w-full text-left px-4 py-3 rounded-xl border text-[13px] transition-all duration-200 ${
                        isSelected(opt)
                          ? "border-brand/50 bg-brand/10 text-ink-7"
                          : "border-ink-3 bg-surface-ink-raised text-ink-5 hover:border-ink-4"
                      }`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer — sticky */}
        {!showResults && (
          <div
            className="shrink-0"
            style={{
              background: "var(--ink)",
              borderTop: "0.5px solid var(--surface-ink-subtle)",
              padding: "12px 16px",
            }}
          >
            <button
              onClick={handleNext}
              disabled={!canProceed()}
              className={`w-full py-3.5 rounded-xl text-[13px] font-medium tracking-wide transition-all duration-200 ${
                canProceed()
                  ? "hover:brightness-110 active:scale-[0.98]"
                  : "bg-surface-ink-subtle text-ink-4 cursor-not-allowed"
              }`}
              style={canProceed() ? {
                background: "linear-gradient(to bottom, hsl(43 80% 55%), var(--brand))",
                color: "var(--ink)",
              } : undefined}
            >
              {step < QUESTIONS.length - 1 ? "Next" : "Generate Brand Positioning"}
            </button>
          </div>
        )}
      </div>
    </>,
    document.body
  );
};

export default BrandAssessmentModal;
