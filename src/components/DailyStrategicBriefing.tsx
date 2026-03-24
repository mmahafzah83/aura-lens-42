import { useState, useEffect } from "react";
import { Loader2, Zap, Target, Crown, ArrowRight, RefreshCw, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import FrameworkBuilder from "./FrameworkBuilder";
import LinkedInDraftPanel from "./LinkedInDraftPanel";
import ActionWorkspace from "./ActionWorkspace";

interface Briefing {
  date: string;
  headline: string;
  strategic_signal: { title: string; description: string };
  framework_opportunity: { title: string; description: string };
  authority_opportunity: { title: string; hook: string };
  recommended_action: { action: string; rationale: string };
}

interface DailyStrategicBriefingProps {
  onOpenChat?: (msg?: string) => void;
}

const CACHE_KEY = "aura-strategic-briefing";
const CACHE_DATE_KEY = "aura-strategic-briefing-date";

const DailyStrategicBriefing = ({ onOpenChat }: DailyStrategicBriefingProps) => {
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [builderData, setBuilderData] = useState({ title: "", description: "" });
  const [draftOpen, setDraftOpen] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftHook, setDraftHook] = useState("");
  const [actionWorkspaceOpen, setActionWorkspaceOpen] = useState(false);

  const today = new Date().toDateString();

  const loadBriefing = async (force = false) => {
    // Check cache
    if (!force) {
      const cachedDate = sessionStorage.getItem(CACHE_DATE_KEY);
      const cached = sessionStorage.getItem(CACHE_KEY);
      if (cachedDate === today && cached) {
        try {
          setBriefing(JSON.parse(cached));
          setLoading(false);
          return;
        } catch { /* regenerate */ }
      }
    }

    if (force) setRefreshing(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase.functions.invoke("strategic-briefing", {
        body: { user_id: user.id },
      });

      if (error) throw error;

      if (data?.briefing) {
        setBriefing(data.briefing);
        sessionStorage.setItem(CACHE_KEY, JSON.stringify(data.briefing));
        sessionStorage.setItem(CACHE_DATE_KEY, today);
      }
    } catch (err: any) {
      console.error("Briefing error:", err);
      if (force) toast.error("Failed to generate briefing");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { loadBriefing(); }, []);

  if (loading) {
    return (
      <div className="glass-card rounded-2xl p-6 border border-primary/[0.06]">
        <div className="flex items-center gap-3 justify-center py-4">
          <Loader2 className="w-4 h-4 text-primary/60 animate-spin" />
          <span className="text-sm text-muted-foreground">Synthesizing your strategic briefing…</span>
        </div>
      </div>
    );
  }

  if (!briefing) return null;

  const sections = [
    {
      icon: Zap,
      label: "Strategic Signal",
      title: briefing.strategic_signal.title,
      body: briefing.strategic_signal.description,
      accent: "from-amber-500/20 to-amber-500/5",
      iconColor: "text-amber-400",
      action: () => onOpenChat?.(`Analyze this strategic signal in depth: "${briefing.strategic_signal.title}" — ${briefing.strategic_signal.description}`),
      actionLabel: "Explore Signal",
    },
    {
      icon: Target,
      label: "Framework Opportunity",
      title: briefing.framework_opportunity.title,
      body: briefing.framework_opportunity.description,
      accent: "from-blue-500/20 to-blue-500/5",
      iconColor: "text-blue-400",
      action: () => {
        setBuilderData({ title: briefing.framework_opportunity.title, description: briefing.framework_opportunity.description });
        setBuilderOpen(true);
      },
      actionLabel: "Build Framework",
    },
    {
      icon: Crown,
      label: "Authority Opportunity",
      title: briefing.authority_opportunity.title,
      body: briefing.authority_opportunity.hook,
      accent: "from-primary/20 to-primary/5",
      iconColor: "text-primary",
      action: () => {
        setDraftTitle(briefing.authority_opportunity.title);
        setDraftHook(briefing.authority_opportunity.hook);
        setDraftOpen(true);
      },
      actionLabel: "Draft Post",
    },
  ];

  return (
    <div className="space-y-3">
      {/* Headline Card */}
      <div className="glass-card rounded-2xl border border-primary/10 overflow-hidden">
        <div className="h-0.5 bg-gradient-to-r from-primary/60 via-amber-500/40 to-primary/20" />
        <div className="p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
                <Sparkles className="w-3.5 h-3.5 text-primary" />
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-[0.15em] text-primary/50 font-semibold">Daily Strategic Briefing</p>
                <p className="text-[10px] text-muted-foreground/40">{briefing.date}</p>
              </div>
            </div>
            <button
              onClick={() => loadBriefing(true)}
              disabled={refreshing}
              className="text-muted-foreground/30 hover:text-primary/60 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
            </button>
          </div>
          <h2
            className="text-lg sm:text-xl font-bold text-foreground leading-snug tracking-tight"
            style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
          >
            {briefing.headline}
          </h2>
        </div>
      </div>

      {/* Opportunity Sections */}
      <div className="grid gap-2.5">
        {sections.map(({ icon: Icon, label, title, body, accent, iconColor, action, actionLabel }) => (
          <div key={label} className="glass-card rounded-xl border border-primary/[0.06] p-4 hover:border-primary/15 transition-colors duration-300">
            <div className="flex items-start gap-3">
              <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${accent} flex items-center justify-center flex-shrink-0`}>
                <Icon className={`w-4 h-4 ${iconColor}`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[9px] uppercase tracking-[0.15em] text-muted-foreground/40 font-semibold mb-0.5">{label}</p>
                <p className="text-xs font-semibold text-foreground mb-1 leading-snug">{title}</p>
                <p className="text-[11px] text-muted-foreground/60 leading-relaxed">{body}</p>
                <button
                  onClick={action}
                  className="text-[10px] text-primary/60 hover:text-primary flex items-center gap-1 mt-2 transition-colors"
                >
                  <ArrowRight className="w-3 h-3" /> {actionLabel}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Recommended Action */}
      <button
        onClick={() => setActionWorkspaceOpen(true)}
        className="w-full glass-card rounded-xl border border-emerald-500/15 bg-emerald-500/[0.03] p-4 hover:border-emerald-500/25 transition-colors text-left group"
      >
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500/20 to-emerald-500/5 flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform">
            <ArrowRight className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="flex-1">
            <p className="text-[9px] uppercase tracking-[0.15em] text-emerald-400/60 font-semibold mb-0.5">Recommended Action</p>
            <p className="text-xs font-semibold text-foreground leading-snug mb-1">{briefing.recommended_action.action}</p>
            <p className="text-[11px] text-muted-foreground/50 leading-relaxed">{briefing.recommended_action.rationale}</p>
            <p className="text-[10px] text-emerald-400/50 mt-2 flex items-center gap-1 group-hover:text-emerald-400 transition-colors">
              <ArrowRight className="w-3 h-3" /> Open Action Workspace
            </p>
          </div>
        </div>
      </button>
      <FrameworkBuilder
        open={builderOpen}
        onClose={() => setBuilderOpen(false)}
        initialTitle={builderData.title}
        initialDescription={builderData.description}
        initialSteps={[]}
      />
      <LinkedInDraftPanel
        open={draftOpen}
        onClose={() => setDraftOpen(false)}
        title={draftTitle}
        hook={draftHook}
      />
      <ActionWorkspace
        open={actionWorkspaceOpen}
        onClose={() => setActionWorkspaceOpen(false)}
        action={briefing.recommended_action.action}
        rationale={briefing.recommended_action.rationale}
      />
    </div>
  );
};

export default DailyStrategicBriefing;
