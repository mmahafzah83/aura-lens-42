import { useState } from "react";
import {
  Linkedin, Users, TrendingUp, MessageSquare, Target,
  Eye, BarChart3, Zap, ArrowUpRight, ArrowDownRight,
  Minus, ChevronRight, Lightbulb
} from "lucide-react";
import { Progress } from "@/components/ui/progress";

/* ── Mock Data ── */
const PROFILE_ANALYSIS = {
  headline_score: 62,
  positioning_score: 48,
  narrative_score: 71,
  insights: [
    "Your headline is too generic — add a distinctive point of view.",
    "Profile positioning is too broad for strong authority development.",
    "Narrative consistency is good but lacks a clear signature framework.",
  ],
};

const AUDIENCE_DATA = {
  total_followers: 4_820,
  growth_30d: 312,
  growth_pct: 6.9,
  industries: [
    { name: "Energy & Utilities", pct: 34 },
    { name: "Technology", pct: 22 },
    { name: "Consulting", pct: 18 },
    { name: "Government", pct: 14 },
    { name: "Other", pct: 12 },
  ],
  seniority: [
    { name: "C-Suite / VP", pct: 28 },
    { name: "Director", pct: 31 },
    { name: "Manager", pct: 24 },
    { name: "Individual Contributor", pct: 17 },
  ],
  geography: [
    { name: "UAE", pct: 38 },
    { name: "Saudi Arabia", pct: 24 },
    { name: "United Kingdom", pct: 12 },
    { name: "United States", pct: 10 },
    { name: "Other", pct: 16 },
  ],
};

const CONTENT_PERFORMANCE = [
  { topic: "Framework Posts", engagement: 8.4, trend: "up", posts: 12 },
  { topic: "Strategic Insights", engagement: 6.1, trend: "up", posts: 18 },
  { topic: "Industry Commentary", engagement: 3.5, trend: "flat", posts: 24 },
  { topic: "Personal Stories", engagement: 5.2, trend: "down", posts: 8 },
  { topic: "Carousel Posts", engagement: 9.1, trend: "up", posts: 6 },
];

const TONE_DATA = [
  { tone: "Analytical", score: 82, impact: "high" as const },
  { tone: "Educational", score: 74, impact: "high" as const },
  { tone: "Contrarian", score: 61, impact: "medium" as const },
  { tone: "Storytelling", score: 56, impact: "medium" as const },
  { tone: "Reflective", score: 43, impact: "low" as const },
];

const RECOMMENDATIONS = [
  {
    title: "Double down on Framework posts",
    description: "Framework posts generate 2.4× more engagement than commentary. Increase frequency to 2/week.",
    type: "content",
  },
  {
    title: "Shift from commentary to insight",
    description: "Pure commentary gets 3.5% engagement vs 8.4% for frameworks. Reframe opinions as structured models.",
    type: "tone",
  },
  {
    title: "Target Energy & Utilities audience",
    description: "34% of your audience is in Energy. Create sector-specific frameworks to deepen authority.",
    type: "audience",
  },
  {
    title: "Sharpen headline positioning",
    description: "Replace generalist headline with a specific authority claim tied to your strongest framework.",
    type: "profile",
  },
  {
    title: "Leverage carousel format",
    description: "Carousels achieve 9.1% engagement — the highest across all formats. Aim for 1 carousel per week.",
    type: "content",
  },
];

/* ── Sub-components ── */
const ScoreRing = ({ score, label, size = 56 }: { score: number; label: string; size?: number }) => {
  const color = score >= 70 ? "text-emerald-400" : score >= 50 ? "text-amber-400" : "text-red-400";
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div
        className={`relative rounded-full border-2 border-border/20 flex items-center justify-center ${color}`}
        style={{ width: size, height: size }}
      >
        <span className="text-sm font-bold">{score}</span>
      </div>
      <span className="text-[10px] text-muted-foreground/60 text-center leading-tight">{label}</span>
    </div>
  );
};

const TrendIcon = ({ trend }: { trend: string }) => {
  if (trend === "up") return <ArrowUpRight className="w-3 h-3 text-emerald-400" />;
  if (trend === "down") return <ArrowDownRight className="w-3 h-3 text-red-400" />;
  return <Minus className="w-3 h-3 text-muted-foreground/40" />;
};

const ImpactBadge = ({ impact }: { impact: "high" | "medium" | "low" }) => {
  const styles = {
    high: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    medium: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    low: "bg-muted/30 text-muted-foreground/50 border-border/10",
  };
  return (
    <span className={`text-[9px] font-medium px-2 py-0.5 rounded-full border ${styles[impact]}`}>
      {impact}
    </span>
  );
};

const TypeBadge = ({ type }: { type: string }) => {
  const colors: Record<string, string> = {
    content: "bg-primary/10 text-primary/80 border-primary/15",
    tone: "bg-violet-500/10 text-violet-400 border-violet-500/15",
    audience: "bg-cyan-500/10 text-cyan-400 border-cyan-500/15",
    profile: "bg-amber-500/10 text-amber-400 border-amber-500/15",
  };
  return (
    <span className={`text-[9px] font-medium px-2 py-0.5 rounded-full border ${colors[type] || colors.content}`}>
      {type}
    </span>
  );
};

/* ── Main Component ── */
const LinkedInIntelligence = () => {
  const [activeSection, setActiveSection] = useState<"profile" | "audience" | "content" | "tone" | "recommendations">("profile");

  const sections = [
    { key: "profile" as const, label: "Profile", icon: Eye },
    { key: "audience" as const, label: "Audience", icon: Users },
    { key: "content" as const, label: "Content", icon: BarChart3 },
    { key: "tone" as const, label: "Tone", icon: MessageSquare },
    { key: "recommendations" as const, label: "Strategy", icon: Target },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="glass-card rounded-2xl p-6 sm:p-8">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-8 h-8 rounded-xl bg-[#0A66C2]/15 flex items-center justify-center border border-[#0A66C2]/20">
            <Linkedin className="w-4 h-4 text-[#0A66C2]" />
          </div>
          <h2 className="text-lg font-semibold text-foreground" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
            LinkedIn Intelligence
          </h2>
        </div>
        <p className="text-[11px] text-muted-foreground/50 tracking-wide ml-11">
          Strategic analysis of your LinkedIn authority signals · Simulated Data
        </p>

        {/* Follower Summary */}
        <div className="mt-6 flex items-center gap-6 flex-wrap">
          <div>
            <p className="text-2xl font-bold text-foreground tabular-nums">{AUDIENCE_DATA.total_followers.toLocaleString()}</p>
            <p className="text-[10px] text-muted-foreground/50">Followers</p>
          </div>
          <div className="flex items-center gap-1.5">
            <ArrowUpRight className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-sm font-semibold text-emerald-400">+{AUDIENCE_DATA.growth_30d}</span>
            <span className="text-[10px] text-muted-foreground/40">last 30d ({AUDIENCE_DATA.growth_pct}%)</span>
          </div>
        </div>

        {/* Section Nav */}
        <div className="flex gap-1.5 mt-6 overflow-x-auto pb-1 -mx-1 px-1">
          {sections.map((s) => (
            <button
              key={s.key}
              onClick={() => setActiveSection(s.key)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-medium transition-all whitespace-nowrap tactile-press ${
                activeSection === s.key
                  ? "bg-primary/10 text-primary border border-primary/20"
                  : "text-muted-foreground/60 hover:text-foreground hover:bg-secondary/30"
              }`}
            >
              <s.icon className="w-3.5 h-3.5" />
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Section Content */}
      {activeSection === "profile" && (
        <div className="glass-card rounded-2xl p-6 sm:p-8 animate-fade-in space-y-6">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Eye className="w-4 h-4 text-primary/70" />
            Profile Authority Analysis
          </h3>
          <div className="flex items-center justify-center gap-8 py-4">
            <ScoreRing score={PROFILE_ANALYSIS.headline_score} label="Headline" />
            <ScoreRing score={PROFILE_ANALYSIS.positioning_score} label="Positioning" />
            <ScoreRing score={PROFILE_ANALYSIS.narrative_score} label="Narrative" />
          </div>
          <div className="space-y-3">
            {PROFILE_ANALYSIS.insights.map((insight, i) => (
              <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-secondary/15 border border-border/10">
                <Lightbulb className="w-3.5 h-3.5 text-amber-400 mt-0.5 shrink-0" />
                <p className="text-xs text-muted-foreground/70 leading-relaxed">{insight}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeSection === "audience" && (
        <div className="glass-card rounded-2xl p-6 sm:p-8 animate-fade-in space-y-6">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Users className="w-4 h-4 text-primary/70" />
            Audience Intelligence
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            {[
              { title: "Industries", data: AUDIENCE_DATA.industries },
              { title: "Seniority", data: AUDIENCE_DATA.seniority },
              { title: "Geography", data: AUDIENCE_DATA.geography },
            ].map((group) => (
              <div key={group.title} className="space-y-3">
                <p className="text-[10px] font-semibold text-muted-foreground/50 tracking-widest uppercase">{group.title}</p>
                {group.data.map((item) => (
                  <div key={item.name} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-foreground/80">{item.name}</span>
                      <span className="text-[10px] text-muted-foreground/50 tabular-nums">{item.pct}%</span>
                    </div>
                    <Progress value={item.pct} className="h-1" />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {activeSection === "content" && (
        <div className="glass-card rounded-2xl p-6 sm:p-8 animate-fade-in space-y-5">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-primary/70" />
            Content Performance
          </h3>
          <div className="space-y-3">
            {CONTENT_PERFORMANCE.map((item) => (
              <div key={item.topic} className="flex items-center gap-4 p-3 rounded-xl bg-secondary/15 border border-border/10">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-medium text-foreground">{item.topic}</p>
                    <TrendIcon trend={item.trend} />
                  </div>
                  <p className="text-[10px] text-muted-foreground/40 mt-0.5">{item.posts} posts analyzed</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold text-foreground tabular-nums">{item.engagement}%</p>
                  <p className="text-[9px] text-muted-foreground/40">engagement</p>
                </div>
              </div>
            ))}
          </div>
          <div className="p-3 rounded-xl bg-primary/5 border border-primary/10">
            <div className="flex items-start gap-2">
              <Zap className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
              <p className="text-[11px] text-foreground/70 leading-relaxed">
                <strong>Key insight:</strong> Framework posts generate <strong>2.4×</strong> more engagement than commentary posts. Carousels outperform all formats at 9.1%.
              </p>
            </div>
          </div>
        </div>
      )}

      {activeSection === "tone" && (
        <div className="glass-card rounded-2xl p-6 sm:p-8 animate-fade-in space-y-5">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-primary/70" />
            Tone Intelligence
          </h3>
          <div className="space-y-3">
            {TONE_DATA.map((item) => (
              <div key={item.tone} className="p-3 rounded-xl bg-secondary/15 border border-border/10">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-foreground">{item.tone}</span>
                    <ImpactBadge impact={item.impact} />
                  </div>
                  <span className="text-xs font-bold text-foreground tabular-nums">{item.score}</span>
                </div>
                <Progress value={item.score} className="h-1.5" />
              </div>
            ))}
          </div>
          <div className="p-3 rounded-xl bg-primary/5 border border-primary/10">
            <div className="flex items-start gap-2">
              <Zap className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
              <p className="text-[11px] text-foreground/70 leading-relaxed">
                <strong>Tone insight:</strong> Analytical tone produces stronger authority signals than provocative tone. Educational content builds trust with senior audiences.
              </p>
            </div>
          </div>
        </div>
      )}

      {activeSection === "recommendations" && (
        <div className="glass-card rounded-2xl p-6 sm:p-8 animate-fade-in space-y-5">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Target className="w-4 h-4 text-primary/70" />
            Strategic Recommendations
          </h3>
          <div className="space-y-3">
            {RECOMMENDATIONS.map((rec, i) => (
              <div
                key={i}
                className="p-4 rounded-xl bg-secondary/15 border border-border/10 hover:border-primary/15 transition-all duration-300"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1.5">
                      <p className="text-xs font-semibold text-foreground">{rec.title}</p>
                      <TypeBadge type={rec.type} />
                    </div>
                    <p className="text-[11px] text-muted-foreground/60 leading-relaxed">{rec.description}</p>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/30 shrink-0 mt-0.5" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default LinkedInIntelligence;
