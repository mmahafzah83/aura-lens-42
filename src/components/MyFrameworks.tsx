import { useState, useEffect } from "react";
import { BookOpen, Trash2, ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { Database } from "@/integrations/supabase/types";

type Framework = Database["public"]["Tables"]["master_frameworks"]["Row"];
type FrameworkStep = { step_number: number; step_title: string; step_description: string };

const MyFrameworks = () => {
  const [frameworks, setFrameworks] = useState<Framework[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchFrameworks = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("master_frameworks")
      .select("*")
      .order("created_at", { ascending: false });
    if (data) setFrameworks(data);
    if (error) console.error("Fetch frameworks error:", error);
    setLoading(false);
  };

  useEffect(() => { fetchFrameworks(); }, []);

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    const { error } = await supabase.from("master_frameworks").delete().eq("id", id);
    if (error) {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
    } else {
      setFrameworks(f => f.filter(fw => fw.id !== id));
      toast({ title: "Framework deleted" });
    }
    setDeletingId(null);
  };

  const steps = (fw: Framework): FrameworkStep[] => {
    try {
      return (fw.framework_steps as unknown as FrameworkStep[]) || [];
    } catch { return []; }
  };

  const isExpanded = (id: string) => expandedId === id;

  return (
    <div className="glass-card rounded-2xl p-6 sm:p-10">
      <div className="flex items-center gap-3 mb-2">
        <BookOpen className="w-5 h-5 text-primary/70" />
        <h2 className="text-xl font-semibold text-foreground" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
          My Frameworks
        </h2>
      </div>
      <p className="text-xs text-muted-foreground/50 mb-8 tracking-wide">
        Expert systems extracted from your #ExpertSystem captures
      </p>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-5 h-5 animate-spin text-primary/50" />
        </div>
      ) : frameworks.length === 0 ? (
        <div className="text-center py-12">
          <BookOpen className="w-10 h-10 text-muted-foreground/20 mx-auto mb-4" />
          <p className="text-sm text-muted-foreground/40 italic">
            No frameworks yet. Tag a capture with #ExpertSystem to extract one.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {frameworks.map((fw, i) => (
            <div
              key={fw.id}
              className="rounded-xl bg-secondary/15 border border-border/10 hover:border-primary/10 transition-all duration-300 animate-fade-in overflow-hidden"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              {/* Header */}
              <button
                onClick={() => setExpandedId(isExpanded(fw.id) ? null : fw.id)}
                className="w-full flex items-start justify-between gap-4 p-5 text-left tactile-press"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground leading-relaxed">{fw.title}</p>
                  {fw.summary && (
                    <p className="text-xs text-muted-foreground/60 mt-1.5 line-clamp-2 leading-relaxed">{fw.summary}</p>
                  )}
                  <div className="flex items-center gap-2 mt-3 flex-wrap">
                    {(fw.tags || []).map(tag => (
                      <span key={tag} className="text-[10px] font-medium px-2.5 py-0.5 rounded-full bg-primary/8 text-primary/80 border border-primary/10">
                        {tag}
                      </span>
                    ))}
                    <span className="text-[10px] text-muted-foreground/40 tabular-nums">
                      {steps(fw).length} steps
                    </span>
                  </div>
                </div>
                <div className="shrink-0 mt-1">
                  {isExpanded(fw.id) ? (
                    <ChevronUp className="w-4 h-4 text-muted-foreground/40" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-muted-foreground/40" />
                  )}
                </div>
              </button>

              {/* Expanded Steps */}
              {isExpanded(fw.id) && (
                <div className="px-5 pb-5 space-y-3 border-t border-border/8 pt-4">
                  {steps(fw).map(step => (
                    <div key={step.step_number} className="flex gap-3">
                      <span className="shrink-0 w-6 h-6 rounded-lg bg-primary/10 text-primary text-[11px] font-semibold flex items-center justify-center border border-primary/15 tabular-nums">
                        {step.step_number}
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-foreground">{step.step_title}</p>
                        <p className="text-[11px] text-muted-foreground/60 mt-0.5 leading-relaxed">{step.step_description}</p>
                      </div>
                    </div>
                  ))}

                  <div className="flex justify-end pt-3 border-t border-border/8">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(fw.id); }}
                      disabled={deletingId === fw.id}
                      className="flex items-center gap-1.5 text-[11px] font-medium text-destructive/70 hover:text-destructive transition-all duration-200 disabled:opacity-40 px-3 py-1.5 rounded-lg bg-destructive/6 hover:bg-destructive/12 tactile-press border border-destructive/8"
                    >
                      {deletingId === fw.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                      Delete Framework
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default MyFrameworks;
