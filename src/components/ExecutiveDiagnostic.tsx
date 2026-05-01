import { useState } from "react";
import { Zap, ChevronLeft, ChevronRight, Loader2, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { EVIDENCE_MATRIX, calculateScore } from "@/components/diagnostic/EvidenceMatrix";

interface DiagnosticAnswer {
  firm: string;
  level: string;
  core_practice: string;
  sector_focus: string;
  north_star_goal: string[];
  total_experience: number;
  consulting_experience: number;
  leadership_style: string;
  brand_pillars: string;
  challenges: string[];
}

type Phase = "interview" | "generating" | "assessment" | "saving";

interface QuestionDef {
  key: keyof DiagnosticAnswer;
  question: string;
  subtitle: string;
  options?: string[];
  allowCustom?: boolean;
  multiSelect?: boolean;
  type?: "experience";
}

const QUESTIONS: QuestionDef[] = [
  {
    key: "firm",
    question: "What type of firm are you at?",
    subtitle: "This shapes the competency model we'll use.",
    options: ["Big 4 (EY, Deloitte, PwC, KPMG)", "MBB (McKinsey, BCG, Bain)", "Boutique Consultancy", "Corporate / In-house", "Other"],
  },
  {
    key: "level",
    question: "What is your current level?",
    subtitle: "Your seniority defines the leadership competencies that matter most.",
    options: ["Senior Manager", "Director", "Senior Director", "Associate Partner", "Partner / Principal"],
  },
  {
    key: "core_practice",
    question: "What is your core practice area?",
    subtitle: "This determines the technical depth we'll assess.",
    options: ["Strategy & Transactions", "Digital Transformation", "Risk & Compliance", "People & Organization", "Technology Consulting"],
    allowCustom: true,
  },
  {
    key: "sector_focus",
    question: "What sector do you focus on?",
    subtitle: "Sector expertise shapes your market positioning.",
    options: ["Financial Services", "Energy & Utilities", "Government & Public Sector", "Health & Life Sciences", "TMT (Tech, Media, Telecom)"],
    allowCustom: true,
  },
  {
    key: "total_experience",
    question: "Your Professional Experience",
    subtitle: "Enter your total years and consulting-specific years. This calibrates your profile.",
    type: "experience",
  },
  {
    key: "leadership_style",
    question: "How would you describe your leadership style?",
    subtitle: "This helps us identify complementary skill gaps.",
    options: ["Analytical / Data-Driven", "Visionary / Strategic", "Collaborative / Empathetic", "Execution-Focused / Operational"],
  },
  {
    key: "north_star_goal",
    question: "What are your 24-month North Star goals?",
    subtitle: "Select all that apply — this creates a hybrid roadmap.",
    options: ["Make Partner / Principal", "Build a $10M+ Practice", "Lead a Major Transformation", "Transition to C-Suite / Industry"],
    allowCustom: true,
    multiSelect: true,
  },
  {
    key: "challenges",
    question: "What are your biggest challenges right now?",
    subtitle: "Select all that apply — Aura will prioritize these gaps.",
    options: ["Building Executive Presence", "Originating New Revenue", "Managing Stakeholder Conflict", "Scaling Team Performance", "Developing Thought Leadership", "Navigating Organizational Politics"],
    multiSelect: true,
  },
  {
    key: "brand_pillars",
    question: "Define your 3 Brand Pillars",
    subtitle: "The core strategic themes that define your personal brand. Separate with commas.",
    options: ["Digital Transformation, Innovation, Future of Work", "Sustainability, ESG, Responsible Growth", "Data-Driven Strategy, AI, Operational Excellence", "Leadership Development, Culture Change, Talent Strategy"],
    allowCustom: true,
  },
];

const ExecutiveDiagnostic = ({ onComplete }: { onComplete: () => void }) => {
  const [phase, setPhase] = useState<Phase>("interview");
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Partial<DiagnosticAnswer>>({});
  const [customInput, setCustomInput] = useState("");
  const [showCustom, setShowCustom] = useState(false);
  const [multiSelections, setMultiSelections] = useState<string[]>([]);
  const [totalExp, setTotalExp] = useState("");
  const [consultingExp, setConsultingExp] = useState("");
  const [profileSummary, setProfileSummary] = useState("");
  // Evidence matrix: skillName -> [q1, q2, q3] booleans
  const [evidenceChecks, setEvidenceChecks] = useState<Record<string, boolean[]>>(() => {
    const init: Record<string, boolean[]> = {};
    EVIDENCE_MATRIX.forEach((s) => { init[s.name] = [false, false, false]; });
    return init;
  });
  const [assessmentSkillIndex, setAssessmentSkillIndex] = useState(0);
  const [exiting, setExiting] = useState(false);

  const currentQ = QUESTIONS[questionIndex];
  const totalSteps = QUESTIONS.length;
  const progressPct = phase === "interview"
    ? ((questionIndex + 1) / totalSteps) * 60
    : phase === "assessment"
      ? 60 + ((assessmentSkillIndex + 1) / EVIDENCE_MATRIX.length) * 35
      : phase === "saving" ? 100 : 50;

  const goBack = () => {
    if (phase === "assessment") {
      if (assessmentSkillIndex > 0) {
        setAssessmentSkillIndex((i) => i - 1);
      } else {
        setPhase("interview");
        setQuestionIndex(QUESTIONS.length - 1);
      }
      return;
    }
    if (questionIndex > 0) {
      setQuestionIndex((i) => i - 1);
      setShowCustom(false);
      setCustomInput("");
      setMultiSelections([]);
    }
  };

  const selectOption = (value: string) => {
    const updated = { ...answers, [currentQ.key]: value };
    setAnswers(updated);
    setShowCustom(false);
    setCustomInput("");
    advance(updated);
  };

  const confirmMultiSelect = () => {
    if (multiSelections.length === 0) return;
    const updated = { ...answers, [currentQ.key]: multiSelections };
    setAnswers(updated);
    setMultiSelections([]);
    advance(updated);
  };

  const confirmExperience = () => {
    const t = parseInt(totalExp) || 0;
    const c = parseInt(consultingExp) || 0;
    if (t <= 0) return;
    const updated = {
      ...answers,
      total_experience: t,
      consulting_experience: c,
    };
    setAnswers(updated);
    advance(updated);
  };

  const advance = (updated: Partial<DiagnosticAnswer>) => {
    if (questionIndex < QUESTIONS.length - 1) {
      setQuestionIndex((i) => i + 1);
    } else {
      startAssessment();
    }
  };

  const submitCustom = () => {
    if (!customInput.trim()) return;
    if (currentQ.multiSelect) {
      setMultiSelections((prev) => [...prev, customInput.trim()]);
      setCustomInput("");
      setShowCustom(false);
    } else {
      selectOption(customInput.trim());
    }
  };

  const toggleMulti = (opt: string) => {
    setMultiSelections((prev) =>
      prev.includes(opt) ? prev.filter((o) => o !== opt) : [...prev, opt]
    );
  };

  const startAssessment = () => {
    setPhase("assessment");
    setAssessmentSkillIndex(0);
  };

  const toggleEvidence = (skillName: string, qIndex: number) => {
    setEvidenceChecks((prev) => {
      const arr = [...(prev[skillName] || [false, false, false])];
      arr[qIndex] = !arr[qIndex];
      return { ...prev, [skillName]: arr };
    });
  };

  const nextSkill = () => {
    if (assessmentSkillIndex < EVIDENCE_MATRIX.length - 1) {
      setAssessmentSkillIndex((i) => i + 1);
    }
  };

  const isLastSkill = assessmentSkillIndex === EVIDENCE_MATRIX.length - 1;

  const computeRatings = (): Record<string, number> => {
    const r: Record<string, number> = {};
    EVIDENCE_MATRIX.forEach((s) => {
      r[s.name] = calculateScore(evidenceChecks[s.name] || [false, false, false]);
    });
    return r;
  };

  const saveAndComplete = async () => {
    setPhase("saving");
    const ratings = computeRatings();
    const skills = EVIDENCE_MATRIX.map((s) => ({
      rank: s.rank,
      name: s.name,
      category: s.category,
      description: `${s.tier}-tier competency`,
      korn_ferry_alignment: s.category,
    }));

    // Determine Industry Expert Pivot tag
    const totalYears = (answers.total_experience as number) || 0;
    const consultYears = (answers.consulting_experience as number) || 0;
    const isIndustryPivot = totalYears > 15 && consultYears < 10;
    const yearsLabel = isIndustryPivot
      ? `${totalYears}y total / ${consultYears}y consulting (Industry Expert Pivot)`
      : `${totalYears}y total / ${consultYears}y consulting`;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const brandPillarsArr = (typeof answers.brand_pillars === "string" ? answers.brand_pillars : "")
        .split(",").map((s: string) => s.trim()).filter(Boolean).slice(0, 3);

      const northStarArr = Array.isArray(answers.north_star_goal) ? answers.north_star_goal : [answers.north_star_goal].filter(Boolean);

      await supabase.from("diagnostic_profiles").upsert({
        user_id: session.user.id,
        firm: (answers.firm as string) || null,
        level: (answers.level as string) || null,
        core_practice: (answers.core_practice as string) || null,
        sector_focus: (answers.sector_focus as string) || null,
        north_star_goal: northStarArr.join(" | "),
        years_experience: yearsLabel,
        leadership_style: (answers.leadership_style as string) || null,
        generated_skills: skills,
        skill_ratings: ratings,
        brand_pillars: brandPillarsArr,
        completed: true,
      } as any, { onConflict: "user_id" });

      const topSkills = skills.slice(0, 5);
      for (const skill of topSkills) {
        await supabase.from("skill_targets").upsert({
          user_id: session.user.id,
          pillar: skill.name,
          target_hours: 100,
        } as any, { onConflict: "user_id,pillar" }).select();
      }
    } catch (err) {
      console.error("Save failed:", err);
    }

    setExiting(true);
    setTimeout(onComplete, 700);
  };

  const categoryColor = (cat: string) => {
    const map: Record<string, string> = {
      Strategic: "text-amber-400",
      Commercial: "text-emerald-400",
      Leadership: "text-blue-400",
      Technical: "text-purple-400",
    };
    return map[cat] || "text-muted-foreground";
  };

  const levelBadge = (level: string) => {
    if (level === "Base") return "bg-emerald-500/20 text-emerald-400";
    if (level === "Intermediate") return "bg-amber-500/20 text-amber-400";
    return "bg-rose-500/20 text-rose-400";
  };

  const currentSkill = EVIDENCE_MATRIX[assessmentSkillIndex];

  return (
    <div
      className={`fixed inset-0 z-[100] bg-background flex flex-col transition-all duration-700 ${
        exiting ? "opacity-0 scale-[1.15] pointer-events-none" : "opacity-100 scale-100"
      }`}
    >
      <div className="absolute inset-0 overflow-hidden">
        <div className="onboarding-mesh absolute inset-0" />
      </div>

      {/* Global Progress Bar */}
      <div className="relative z-20 px-4 pt-2" style={{ paddingTop: "calc(8px + env(safe-area-inset-top))" }}>
        <Progress value={progressPct} className="h-1.5 bg-muted/20" />
      </div>

      {/* Interview Phase */}
      {phase === "interview" && (
        <div className="flex-1 flex flex-col relative z-10 overflow-y-auto">
          <div className="px-5 pt-4 pb-2">
            <div className="flex items-center gap-3 mb-3">
              {questionIndex > 0 && (
                <button onClick={goBack} className="w-9 h-9 rounded-xl bg-muted/10 flex items-center justify-center border border-border/10 tactile-press">
                  <ChevronLeft className="w-5 h-5 text-foreground/60" />
                </button>
              )}
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center border border-primary/15">
                  <Zap className="w-3.5 h-3.5 text-primary" />
                </div>
                <span className="text-xs text-muted-foreground/50 tracking-[0.2em] uppercase">Executive Diagnostic</span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground/40 tracking-wide">
              {questionIndex + 1} of {totalSteps}
            </p>
          </div>

          <div className="flex-1 px-5 pb-8 animate-onboard-slide-up" key={questionIndex}>
            <h2
              className="text-2xl sm:text-3xl text-foreground/90 tracking-tight mb-2 leading-tight"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {currentQ.question}
            </h2>
            <p className="text-base text-muted-foreground/50 mb-6">{currentQ.subtitle}</p>

            {/* Experience Input */}
            {currentQ.type === "experience" && (
              <div className="space-y-5">
                <div>
                  <label className="text-sm font-medium text-foreground/70 mb-2 block">Total Professional Experience (years)</label>
                  <input
                    type="number"
                    min={0}
                    max={50}
                    value={totalExp}
                    onChange={(e) => setTotalExp(e.target.value)}
                    placeholder="e.g. 18"
                    className="w-full px-5 py-4 rounded-xl bg-muted/10 border border-border/20 text-lg text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:border-primary/30"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground/70 mb-2 block">Consulting-Specific Experience (years)</label>
                  <input
                    type="number"
                    min={0}
                    max={50}
                    value={consultingExp}
                    onChange={(e) => setConsultingExp(e.target.value)}
                    placeholder="e.g. 12"
                    className="w-full px-5 py-4 rounded-xl bg-muted/10 border border-border/20 text-lg text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:border-primary/30"
                  />
                </div>
                {parseInt(totalExp) > 15 && parseInt(consultingExp) < 10 && (
                  <div className="px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
                    <p className="text-sm text-amber-400 font-medium">🏷️ Industry Expert Pivot detected</p>
                    <p className="text-xs text-amber-400/60 mt-1">Your deep industry experience will shape a unique consulting trajectory.</p>
                  </div>
                )}
                <button
                  onClick={confirmExperience}
                  disabled={!totalExp || parseInt(totalExp) <= 0}
                  className="w-full px-6 py-4 rounded-xl bg-primary text-primary-foreground text-base font-medium disabled:opacity-30 tactile-press flex items-center justify-center gap-2"
                >
                  Continue <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Multi-Select */}
            {currentQ.multiSelect && currentQ.options && (
              <div className="space-y-3">
                {currentQ.options.map((opt) => (
                  <button
                    key={opt}
                    onClick={() => toggleMulti(opt)}
                    className={`w-full text-left px-5 py-4 rounded-xl border text-base transition-all duration-200 tactile-press flex items-center gap-3 ${
                      multiSelections.includes(opt)
                        ? "border-primary/40 bg-primary/10 text-foreground"
                        : "border-border/10 glass-card text-foreground/80 hover:border-primary/20"
                    }`}
                  >
                    <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all ${
                      multiSelections.includes(opt) ? "border-primary bg-primary" : "border-muted-foreground/30"
                    }`}>
                      {multiSelections.includes(opt) && <Check className="w-3 h-3 text-primary-foreground" />}
                    </div>
                    <span>{opt}</span>
                  </button>
                ))}

                {currentQ.allowCustom && !showCustom && (
                  <button
                    onClick={() => setShowCustom(true)}
                    className="w-full text-left px-5 py-4 rounded-xl border border-dashed border-border/20 text-base text-muted-foreground/50 hover:text-foreground/70 hover:border-primary/20 transition-all"
                  >
                    + Type my own
                  </button>
                )}
                {showCustom && (
                  <div className="flex gap-2">
                    <input
                      autoFocus
                      value={customInput}
                      onChange={(e) => setCustomInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && submitCustom()}
                      placeholder="Type your answer..."
                      className="flex-1 px-5 py-4 rounded-xl bg-muted/10 border border-border/20 text-base text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:border-primary/30"
                    />
                    <button onClick={submitCustom} disabled={!customInput.trim()} className="px-5 py-4 rounded-xl bg-primary text-primary-foreground text-base font-medium disabled:opacity-30 tactile-press">Add</button>
                  </div>
                )}

                <button
                  onClick={confirmMultiSelect}
                  disabled={multiSelections.length === 0}
                  className="w-full mt-4 px-6 py-4 rounded-xl bg-primary text-primary-foreground text-base font-medium disabled:opacity-30 tactile-press flex items-center justify-center gap-2"
                >
                  Continue ({multiSelections.length} selected) <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Single Select */}
            {!currentQ.multiSelect && !currentQ.type && currentQ.options && (
              <div className="space-y-3">
                {currentQ.options.map((opt) => (
                  <button
                    key={opt}
                    onClick={() => selectOption(opt)}
                    className="w-full text-left px-5 py-4 rounded-xl glass-card border border-border/10 text-base text-foreground/80 hover:border-primary/30 hover:bg-primary/5 transition-all duration-200 tactile-press flex items-center justify-between group"
                  >
                    <span>{opt}</span>
                    <ChevronRight className="w-4 h-4 text-muted-foreground/30 group-hover:text-primary transition-colors" />
                  </button>
                ))}

                {currentQ.allowCustom && !showCustom && (
                  <button
                    onClick={() => setShowCustom(true)}
                    className="w-full text-left px-5 py-4 rounded-xl border border-dashed border-border/20 text-base text-muted-foreground/50 hover:text-foreground/70 hover:border-primary/20 transition-all"
                  >
                    + Type my own answer
                  </button>
                )}
                {showCustom && (
                  <div className="flex gap-2">
                    <input
                      autoFocus
                      value={customInput}
                      onChange={(e) => setCustomInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && submitCustom()}
                      placeholder="Type your answer..."
                      className="flex-1 px-5 py-4 rounded-xl bg-muted/10 border border-border/20 text-base text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:border-primary/30"
                    />
                    <button onClick={submitCustom} disabled={!customInput.trim()} className="px-5 py-4 rounded-xl bg-primary text-primary-foreground text-base font-medium disabled:opacity-30 tactile-press">Next</button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Generating Phase */}
      {phase === "generating" && (
        <div className="flex-1 flex flex-col items-center justify-center relative z-10 px-8">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center border border-primary/15 mb-8 onboarding-logo-pulse">
            <Zap className="w-8 h-8 text-primary" />
          </div>
          <h2 className="text-2xl sm:text-3xl text-foreground/90 tracking-tight mb-3 text-center" style={{ fontFamily: "var(--font-display)" }}>
            Architecting Your Profile
          </h2>
          <p className="text-base text-muted-foreground/50 text-center max-w-xs mb-8">
            Analyzing your trajectory against MBB and Korn Ferry leadership frameworks...
          </p>
          <Loader2 className="w-6 h-6 text-primary animate-spin" />
        </div>
      )}

      {/* Assessment Phase — Evidence Matrix, one skill at a time */}
      {phase === "assessment" && currentSkill && (
        <div className="flex-1 flex flex-col relative z-10 overflow-y-auto">
          <div className="px-5 pt-4 pb-3">
            <div className="flex items-center gap-3 mb-3">
              <button onClick={goBack} className="w-9 h-9 rounded-xl bg-muted/10 flex items-center justify-center border border-border/10 tactile-press">
                <ChevronLeft className="w-5 h-5 text-foreground/60" />
              </button>
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center border border-primary/15">
                  <Zap className="w-3.5 h-3.5 text-primary" />
                </div>
                <span className="text-xs text-muted-foreground/50 tracking-[0.2em] uppercase">Evidence Matrix</span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground/40">
              Skill {assessmentSkillIndex + 1} of {EVIDENCE_MATRIX.length}
            </p>
          </div>

          <div className="flex-1 px-5 pb-32 animate-onboard-slide-up" key={currentSkill.name}>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-bold text-muted-foreground/40">#{currentSkill.rank}</span>
              <span className={`text-xs tracking-widest uppercase ${categoryColor(currentSkill.category)}`}>
                {currentSkill.category}
              </span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-muted/20 text-muted-foreground/50">{currentSkill.tier}</span>
            </div>

            <h2
              className="text-2xl sm:text-3xl text-foreground/90 tracking-tight mb-2 leading-tight"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {currentSkill.name}
            </h2>
            <p className="text-base text-muted-foreground/50 mb-6">
              Answer honestly — your score is calculated from evidence, not self-perception.
            </p>

            {/* Score display */}
            <div className="flex items-center gap-3 mb-6">
              <div className="text-3xl font-bold text-primary tabular-nums">
                {calculateScore(evidenceChecks[currentSkill.name] || [false, false, false])}%
              </div>
              <div className="flex-1">
                <Progress
                  value={calculateScore(evidenceChecks[currentSkill.name] || [false, false, false])}
                  className="h-2.5 bg-muted/20"
                />
              </div>
            </div>

            {/* 3 evidence questions */}
            <div className="space-y-4">
              {currentSkill.questions.map((eq, qi) => {
                const checked = (evidenceChecks[currentSkill.name] || [false, false, false])[qi];
                return (
                  <button
                    key={qi}
                    onClick={() => toggleEvidence(currentSkill.name, qi)}
                    className={`w-full text-left px-5 py-4 rounded-xl border transition-all duration-200 tactile-press ${
                      checked
                        ? "border-primary/40 bg-primary/10"
                        : "border-border/10 glass-card hover:border-primary/20"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`mt-0.5 w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all ${
                        checked ? "border-primary bg-primary" : "border-muted-foreground/30"
                      }`}>
                        {checked && <Check className="w-3 h-3 text-primary-foreground" />}
                      </div>
                      <div className="flex-1">
                        <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full mb-2 ${levelBadge(eq.level)}`}>
                          {eq.level}
                        </span>
                        <p className="text-base text-foreground/80 leading-relaxed">{eq.question}</p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Fixed bottom CTA */}
          <div
            className="fixed bottom-0 left-0 right-0 z-[101] px-5 pb-5 pt-4"
            style={{ paddingBottom: "calc(20px + env(safe-area-inset-bottom))", background: "linear-gradient(to top, hsl(var(--background)) 70%, transparent)" }}
          >
            <button
              onClick={isLastSkill ? saveAndComplete : nextSkill}
              className="w-full px-8 py-4 rounded-xl bg-primary text-primary-foreground text-base font-medium tracking-wide tactile-press hover-lift transition-all border border-primary/30 aura-glow flex items-center justify-center gap-2"
            >
              {isLastSkill ? (
                <>
                  <Check className="w-4 h-4" />
                  Lock In My Baseline
                </>
              ) : (
                <>
                  Next Skill <ChevronRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Saving Phase */}
      {phase === "saving" && (
        <div className="flex-1 flex flex-col items-center justify-center relative z-10 px-8">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center border border-primary/15 mb-8">
            <Check className="w-8 h-8 text-primary" />
          </div>
          <h2 className="text-2xl text-foreground/90 tracking-tight text-center" style={{ fontFamily: "var(--font-display)" }}>
            Your Aura is Set
          </h2>
          <p className="text-base text-muted-foreground/50 text-center mt-2">Entering your command center...</p>
        </div>
      )}
    </div>
  );
};

export default ExecutiveDiagnostic;
