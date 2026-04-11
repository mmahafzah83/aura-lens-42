import { useState, useEffect } from "react";
import { Crown, ArrowRight, Loader2, Bell, Sparkles, FileText, LayoutGrid } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import LinkedInDraftPanel from "./LinkedInDraftPanel";

interface AuthorityOpp {
  id: string;
  signal_title: string;
  explanation: string;
  content_opportunity: {
    title?: string;
    hook?: string;
    angle?: string;
  };
  framework_opportunity: {
    title?: string;
    description?: string;
  };
  confidence: number;
  theme_tags: string[];
}

interface AuthorityOpportunitiesProps {
  onDraftToStudio?: (prefill: { topic: string; context: string; signalTitle?: string; contentFormat?: string }) => void;
}

const AuthorityOpportunities = ({ onDraftToStudio }: AuthorityOpportunitiesProps) => {
  const [opps, setOpps] = useState<AuthorityOpp[]>([]);
  const [loading, setLoading] = useState(true);
  const [draftData, setDraftData] = useState<{ title: string; hook?: string; context?: string } | null>(null);

  useEffect(() => {
    const fetchOpps = async () => {
      const { data, error } = await supabase
        .from("strategic_signals")
        .select("id, signal_title, explanation, content_opportunity, framework_opportunity, confidence, theme_tags")
        .eq("status", "active")
        .gte("confidence", 0.7)
        .order("confidence", { ascending: false })
        .limit(5);

      if (!error && data) {
        const filtered = (data as unknown as AuthorityOpp[]).filter(
          d => d.content_opportunity && (d.content_opportunity as any).title
        );
        setOpps(filtered);
      }
      setLoading(false);
    };
    fetchOpps();
  }, []);

  if (loading) {
    return (
      <div className="glass-card rounded-2xl p-6 border border-amber-500/[0.08]">
        <div className="flex items-center gap-3 justify-center py-3">
          <Loader2 className="w-4 h-4 text-amber-400/60 animate-spin" />
          <span className="text-sm text-muted-foreground">Scanning authority opportunities…</span>
        </div>
      </div>
    );
  }

  if (opps.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2.5">
        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-500/20 to-amber-500/5 flex items-center justify-center">
          <Crown className="w-3.5 h-3.5 text-amber-400" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-foreground tracking-tight">Authority Opportunities</h3>
          <p className="text-[10px] text-muted-foreground/50">Ideas strong enough to publish</p>
        </div>
        <span className="text-[10px] bg-amber-500/15 text-amber-400 px-2 py-0.5 rounded-full font-semibold ml-auto">
          {opps.length}
        </span>
      </div>

      {opps.map((opp) => {
        const ct = opp.content_opportunity || {};
        const confidencePct = Math.round(opp.confidence * 100);

        return (
          <div key={opp.id} className="glass-card rounded-xl border border-amber-500/10 overflow-hidden hover:border-amber-500/20 transition-colors">
            <div className="h-0.5 bg-gradient-to-r from-amber-500/40 to-transparent" />
            <div className="p-4">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500/15 to-amber-500/5 flex items-center justify-center flex-shrink-0">
                  <Sparkles className="w-4 h-4 text-amber-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-xs font-semibold text-foreground leading-snug">{ct.title || opp.signal_title}</p>
                    <span className={`text-[8px] px-1.5 py-0.5 rounded-full font-bold flex-shrink-0 ${
                      confidencePct >= 85 ? "bg-green-500/15 text-green-400" : "bg-amber-500/15 text-amber-400"
                    }`}>
                      {confidencePct}%
                    </span>
                  </div>
                  {ct.hook && (
                    <p className="text-[11px] text-primary/50 italic mb-1.5 border-l-2 border-primary/15 pl-2">
                      "{ct.hook}"
                    </p>
                  )}
                  <p className="text-[10px] text-muted-foreground/50 leading-relaxed line-clamp-2">{opp.explanation}</p>

                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {opp.theme_tags?.slice(0, 3).map((t, i) => (
                      <span key={i} className="text-[8px] bg-muted/30 text-muted-foreground/40 px-1.5 py-0.5 rounded">
                        {t}
                      </span>
                    ))}
                  </div>

                  <div className="flex items-center gap-2 mt-3">
                    <button
                      onClick={() => setDraftData({
                        title: ct.title || opp.signal_title,
                        hook: ct.hook,
                        context: opp.explanation,
                      })}
                      className="text-[10px] text-primary/60 hover:text-primary flex items-center gap-1 transition-colors bg-primary/5 hover:bg-primary/10 rounded-lg px-2.5 py-1"
                    >
                      <FileText className="w-3 h-3" /> Draft Content
                    </button>
                    <button
                      onClick={() => onDraftToStudio?.({
                        topic: ct.title || opp.signal_title,
                        context: `${opp.explanation}\n\n${opp.framework_opportunity?.description || ""}`,
                        signalTitle: ct.title || opp.signal_title,
                        contentFormat: "carousel",
                      })}
                      className="text-[10px] text-amber-400/60 hover:text-amber-400 flex items-center gap-1 transition-colors bg-amber-500/5 hover:bg-amber-500/10 rounded-lg px-2.5 py-1"
                    >
                      <LayoutGrid className="w-3 h-3" /> Carousel
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })}

      <LinkedInDraftPanel
        open={!!draftData}
        onClose={() => setDraftData(null)}
        title={draftData?.title || ""}
        hook={draftData?.hook}
        context={draftData?.context}
      />
    </div>
  );
};

export default AuthorityOpportunities;
