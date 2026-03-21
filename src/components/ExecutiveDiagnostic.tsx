import { useState } from "react";
import { Zap, ChevronRight, Loader2, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Slider } from "@/components/ui/slider";

interface DiagnosticAnswer {
  firm: string;
  level: string;
  core_practice: string;
  sector_focus: string;
  north_star_goal: string;
  years_experience: string;
  leadership_style: string;
  brand_pillars: string;
}

interface GeneratedSkill {
  rank: number;
  name: string;
  category: string;
  description: string;
  korn_ferry_alignment: string;
}

const QUESTIONS = [
  {
    key: "firm" as const,
    question: "What type of firm are you at?",
    subtitle: "This shapes the competency model we'll use.",
    options: ["Big 4 (EY, Deloitte, PwC, KPMG)", "MBB (McKinsey, BCG, Bain)", "Boutique Consultancy", "Corporate / In-house", "Other"],
  },
  {
    key: "level" as const,
    question: "What is your current level?",
    subtitle: "Your seniority defines the leadership competencies that matter most.",
    options: ["Senior Manager", "Director", "Senior Director", "Associate Partner", "Partner / Principal"],
  },
  {
    key: "core_practice" as const,
    question: "What is your core practice area?",
    subtitle: "This determines the technical depth we'll assess.",
    options: ["Strategy & Transactions", "Digital Transformation", "Risk & Compliance", "People & Organization", "Technology Consulting"],
    allowCustom: true,
  },
  {
    key: "sector_focus" as const,
    question: "What sector do you focus on?",
    subtitle: "Sector expertise shapes your market positioning.",
    options: ["Financial Services", "Energy & Utilities", "Government & Public Sector", "Health & Life Sciences", "TMT (Tech, Media, Telecom)"],
    allowCustom: true,
  },
  {
    key: "years_experience" as const,
    question: "How many years in consulting?",
    subtitle: "Experience level calibrates our expectations.",
    options: ["5–8 years", "8–12 years", "12–18 years", "18+ years"],
  },
  {
    key: "leadership_style" as const,
    question: "How would you describe your leadership style?",
    subtitle: "This helps us identify complementary skill gaps.",
    options: ["Analytical / Data-Driven", "Visionary / Strategic", "Collaborative / Empathetic", "Execution-Focused / Operational"],
  },
  {
    key: "north_star_goal" as const,
    question: "What is your 24-month North Star goal?",
    subtitle: "Be specific — this drives everything.",
    options: ["Make Partner / Principal", "Build a $10M+ Practice", "Lead a Major Transformation", "Transition to C-Suite / Industry"],
    allowCustom: true,
  },
  {
    key: "brand_pillars" as const,
    question: "Define your 3 Brand Pillars",
    subtitle: "The core strategic themes that define your personal brand. Separate with commas.",
    options: ["Digital Transformation, Innovation, Future of Work", "Sustainability, ESG, Responsible Growth", "Data-Driven Strategy, AI, Operational Excellence", "Leadership Development, Culture Change, Talent Strategy"],
    allowCustom: true,
  },
];

type Phase = "interview" | "generating" | "assessment" | "saving";

const ExecutiveDiagnostic = ({ onComplete }: { onComplete: () => void }) => {
  const [phase, setPhase] = useState<Phase>("interview");
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Partial<DiagnosticAnswer>>({});
  const [customInput, setCustomInput] = useState("");
  const [showCustom, setShowCustom] = useState(false);
  const [skills, setSkills] = useState<GeneratedSkill[]>([]);
  const [profileSummary, setProfileSummary] = useState("");
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [exiting, setExiting] = useState(false);

  const currentQ = QUESTIONS[questionIndex];

  const selectOption = (value: string) => {
    const updated = { ...answers, [currentQ.key]: value };
    setAnswers(updated);
    setShowCustom(false);
    setCustomInput("");

    if (questionIndex < QUESTIONS.length - 1) {
      setQuestionIndex((i) => i + 1);
    } else {
      generateProfile(updated as DiagnosticAnswer);
    }
  };

  const submitCustom = () => {
    if (customInput.trim()) {
      selectOption(customInput.trim());
    }
  };

  const generateProfile = async (data: DiagnosticAnswer) => {
    setPhase("generating");
    try {
      const { data: result, error } = await supabase.functions.invoke("generate-skill-profile", {
        body: data,
      });
      if (error) throw error;
      const generated = result.skills || [];
      setSkills(generated);
      setProfileSummary(result.profile_summary || "");
      const initialRatings: Record<string, number> = {};
      generated.forEach((s: GeneratedSkill) => {
        initialRatings[s.name] = 50;
      });
      setRatings(initialRatings);
      setPhase("assessment");
    } catch (err) {
      console.error("Profile generation failed:", err);
      // Fallback with default skills
      const fallback: GeneratedSkill[] = [
        { rank: 1, name: "Strategic Client Advisory", category: "Strategic", description: "Ability to serve as a trusted strategic advisor to C-suite clients", korn_ferry_alignment: "Strategic Mindset" },
        { rank: 2, name: "Revenue Growth Leadership", category: "Commercial", description: "Driving organic revenue growth through client relationships", korn_ferry_alignment: "Business Insight" },
        { rank: 3, name: "Executive Presence", category: "Leadership", description: "Commanding respect and influence in senior stakeholder settings", korn_ferry_alignment: "Courage" },
        { rank: 4, name: "Team Development", category: "Leadership", description: "Building and mentoring high-performing consulting teams", korn_ferry_alignment: "Develops Talent" },
        { rank: 5, name: "Industry Thought Leadership", category: "Strategic", description: "Establishing authority through published perspectives and keynotes", korn_ferry_alignment: "Cultivates Innovation" },
        { rank: 6, name: "Complex Program Delivery", category: "Technical", description: "Leading multi-workstream transformations to successful outcomes", korn_ferry_alignment: "Drives Results" },
        { rank: 7, name: "Stakeholder Management", category: "Relational", description: "Navigating complex political landscapes and building coalitions", korn_ferry_alignment: "Collaborates" },
        { rank: 8, name: "Market Positioning", category: "Commercial", description: "Differentiating your practice in a competitive market", korn_ferry_alignment: "Financial Acumen" },
        { rank: 9, name: "Digital Fluency", category: "Technical", description: "Understanding emerging tech trends and their business implications", korn_ferry_alignment: "Tech Savvy" },
        { rank: 10, name: "Resilience Under Pressure", category: "Leadership", description: "Maintaining composure and decision quality in high-stakes situations", korn_ferry_alignment: "Manages Ambiguity" },
      ];
      setSkills(fallback);
      setProfileSummary("Your executive development path has been mapped using standard consulting competency frameworks.");
      const initialRatings: Record<string, number> = {};
      fallback.forEach((s) => { initialRatings[s.name] = 50; });
      setRatings(initialRatings);
      setPhase("assessment");
    }
  };

  const saveAndComplete = async () => {
    setPhase("saving");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const brandPillarsArr = (answers.brand_pillars || "").split(",").map((s: string) => s.trim()).filter(Boolean).slice(0, 3);

      await supabase.from("diagnostic_profiles").upsert({
        user_id: session.user.id,
        firm: answers.firm || null,
        level: answers.level || null,
        core_practice: answers.core_practice || null,
        sector_focus: answers.sector_focus || null,
        north_star_goal: answers.north_star_goal || null,
        years_experience: answers.years_experience || null,
        leadership_style: answers.leadership_style || null,
        generated_skills: skills,
        skill_ratings: ratings,
        brand_pillars: brandPillarsArr,
        completed: true,
      } as any, { onConflict: "user_id" });

      // Also populate skill_targets from top 5 skills
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
      Relational: "text-rose-400",
    };
    return map[cat] || "text-muted-foreground";
  };

  return (
    <div
      className={`fixed inset-0 z-[100] bg-background flex flex-col transition-all duration-700 ${
        exiting ? "opacity-0 scale-[1.15] pointer-events-none" : "opacity-100 scale-100"
      }`}
    >
      <div className="absolute inset-0 overflow-hidden">
        <div className="onboarding-mesh absolute inset-0" />
      </div>

      {/* Interview Phase */}
      {phase === "interview" && (
        <div className="flex-1 flex flex-col relative z-10 safe-area-container" style={{ paddingTop: "env(safe-area-inset-top)" }}>
          {/* Progress bar */}
          <div className="px-6 pt-6 pb-2">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center border border-primary/15">
                <Zap className="w-3.5 h-3.5 text-primary" />
              </div>
              <span className="text-[10px] text-muted-foreground/50 tracking-[0.3em] uppercase">Executive Diagnostic</span>
            </div>
            <div className="flex gap-1.5">
              {QUESTIONS.map((_, i) => (
                <div
                  key={i}
                  className={`h-1 flex-1 rounded-full transition-all duration-500 ${
                    i < questionIndex ? "bg-primary" : i === questionIndex ? "bg-primary/60" : "bg-muted/20"
                  }`}
                />
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground/40 mt-2 tracking-wide">
              {questionIndex + 1} of {QUESTIONS.length}
            </p>
          </div>

          {/* Question */}
          <div className="flex-1 flex flex-col justify-center px-6 pb-8 animate-onboard-slide-up" key={questionIndex}>
            <h2
              className="text-2xl sm:text-3xl text-foreground/90 tracking-tight mb-2"
              style={{ fontFamily: "'Playfair Display', Georgia, serif", lineHeight: 1.2 }}
            >
              {currentQ.question}
            </h2>
            <p className="text-sm text-muted-foreground/50 mb-8">{currentQ.subtitle}</p>

            <div className="space-y-3">
              {currentQ.options.map((opt) => (
                <button
                  key={opt}
                  onClick={() => selectOption(opt)}
                  className="w-full text-left px-5 py-4 rounded-xl glass-card border border-border/10 text-sm text-foreground/80 hover:border-primary/30 hover:bg-primary/5 transition-all duration-200 tactile-press flex items-center justify-between group"
                >
                  <span>{opt}</span>
                  <ChevronRight className="w-4 h-4 text-muted-foreground/30 group-hover:text-primary transition-colors" />
                </button>
              ))}

              {currentQ.allowCustom && !showCustom && (
                <button
                  onClick={() => setShowCustom(true)}
                  className="w-full text-left px-5 py-4 rounded-xl border border-dashed border-border/20 text-sm text-muted-foreground/50 hover:text-foreground/70 hover:border-primary/20 transition-all duration-200"
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
                    className="flex-1 px-5 py-4 rounded-xl bg-muted/10 border border-border/20 text-sm text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:border-primary/30"
                  />
                  <button
                    onClick={submitCustom}
                    disabled={!customInput.trim()}
                    className="px-5 py-4 rounded-xl bg-primary text-primary-foreground text-sm font-medium disabled:opacity-30 tactile-press"
                  >
                    Next
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Generating Phase */}
      {phase === "generating" && (
        <div className="flex-1 flex flex-col items-center justify-center relative z-10 px-8">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center border border-primary/15 mb-8 onboarding-logo-pulse">
            <Zap className="w-8 h-8 text-primary" />
          </div>
          <h2
            className="text-2xl sm:text-3xl text-foreground/90 tracking-tight mb-3 text-center"
            style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
          >
            Architecting Your Profile
          </h2>
          <p className="text-sm text-muted-foreground/50 text-center max-w-xs mb-8">
            Analyzing your trajectory against MBB and Korn Ferry leadership frameworks...
          </p>
          <Loader2 className="w-6 h-6 text-primary animate-spin" />
        </div>
      )}

      {/* Assessment Phase */}
      {phase === "assessment" && (
        <div className="flex-1 flex flex-col relative z-10 safe-area-container" style={{ paddingTop: "env(safe-area-inset-top)" }}>
          <div className="px-6 pt-6 pb-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center border border-primary/15">
                <Zap className="w-3.5 h-3.5 text-primary" />
              </div>
              <span className="text-[10px] text-muted-foreground/50 tracking-[0.3em] uppercase">Micro-Assessment</span>
            </div>
            <h2
              className="text-xl sm:text-2xl text-foreground/90 tracking-tight mb-1"
              style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
            >
              Rate Your Current Proficiency
            </h2>
            <p className="text-xs text-muted-foreground/50">
              Slide each skill to your honest self-assessment. This creates your Skill Radar baseline.
            </p>
            {profileSummary && (
              <p className="text-xs text-primary/60 mt-2 italic">{profileSummary}</p>
            )}
          </div>

          <div className="flex-1 overflow-y-auto px-6 pb-32">
            <div className="space-y-5">
              {skills.map((skill, i) => (
                <div key={skill.name} className="glass-card rounded-xl p-4 border border-border/10">
                  <div className="flex items-start justify-between mb-1">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-[10px] font-bold text-muted-foreground/40">#{skill.rank}</span>
                        <span className={`text-[9px] tracking-widest uppercase ${categoryColor(skill.category)}`}>
                          {skill.category}
                        </span>
                      </div>
                      <h3 className="text-sm font-semibold text-foreground/90">{skill.name}</h3>
                      <p className="text-[11px] text-muted-foreground/40 mt-0.5 leading-relaxed">{skill.description}</p>
                    </div>
                    <span className="text-lg font-bold text-primary ml-3 tabular-nums min-w-[3ch] text-right">
                      {ratings[skill.name] || 50}%
                    </span>
                  </div>
                  <Slider
                    value={[ratings[skill.name] || 50]}
                    onValueChange={([v]) => setRatings((r) => ({ ...r, [skill.name]: v }))}
                    max={100}
                    min={1}
                    step={1}
                    className="mt-3"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Fixed bottom CTA */}
          <div
            className="fixed bottom-0 left-0 right-0 z-[101] px-6 pb-6 pt-4"
            style={{ paddingBottom: "calc(24px + env(safe-area-inset-bottom))", background: "linear-gradient(to top, hsl(var(--background)) 70%, transparent)" }}
          >
            <button
              onClick={saveAndComplete}
              className="w-full px-8 py-4 rounded-xl bg-primary text-primary-foreground text-sm font-medium tracking-wide tactile-press hover-lift transition-all border border-primary/30 aura-glow flex items-center justify-center gap-2"
            >
              <Check className="w-4 h-4" />
              Lock In My Baseline
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
          <h2
            className="text-2xl text-foreground/90 tracking-tight text-center"
            style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
          >
            Your Aura is Set
          </h2>
          <p className="text-sm text-muted-foreground/50 text-center mt-2">Entering your command center...</p>
        </div>
      )}
    </div>
  );
};

export default ExecutiveDiagnostic;
