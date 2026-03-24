import { useState, useEffect } from "react";
import {
  Loader2, Zap, FileText, BookOpen, Target, Lightbulb,
  ArrowLeft, Layers, Hash, BarChart3
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";

interface SignalExplorerProps {
  signal: {
    id: string;
    signal_title: string;
    explanation: string;
    strategic_implications: string;
    supporting_evidence_ids: string[];
    theme_tags: string[];
    skill_pillars: string[];
    confidence: number;
    fragment_count: number;
    framework_opportunity: any;
    content_opportunity: any;
    consulting_opportunity: any;
  } | null;
  open: boolean;
  onClose: () => void;
}

interface EvidenceFragment {
  id: string;
  title: string;
  content: string;
  fragment_type: string;
  tags: string[];
  confidence: number;
  source_registry_id: string;
}

interface SourceInfo {
  id: string;
  title: string | null;
  source_type: string;
  content_preview: string | null;
}

interface RelatedEntry {
  id: string;
  title: string | null;
  content: string;
  type: string;
  created_at: string;
}

interface RelatedFramework {
  id: string;
  title: string;
  summary: string | null;
  tags: string[];
}

const SignalExplorer = ({ signal, open, onClose }: SignalExplorerProps) => {
  const [evidence, setEvidence] = useState<EvidenceFragment[]>([]);
  const [sources, setSources] = useState<SourceInfo[]>([]);
  const [relatedEntries, setRelatedEntries] = useState<RelatedEntry[]>([]);
  const [relatedFrameworks, setRelatedFrameworks] = useState<RelatedFramework[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (signal && open) {
      loadSignalData(signal);
    }
  }, [signal, open]);

  const loadSignalData = async (sig: NonNullable<SignalExplorerProps["signal"]>) => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Fetch supporting evidence fragments
      const evidencePromise = sig.supporting_evidence_ids.length > 0
        ? supabase
            .from("evidence_fragments")
            .select("id, title, content, fragment_type, tags, confidence, source_registry_id")
            .in("id", sig.supporting_evidence_ids)
            .then(r => r.data || [])
        : Promise.resolve([]);

      // Fetch related entries by theme tags (text search)
      const tagQuery = sig.theme_tags.slice(0, 3).join(" | ");
      const entriesPromise = supabase
        .from("entries")
        .select("id, title, content, type, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(8)
        .then(r => {
          const entries = r.data || [];
          // Filter client-side by tag relevance
          const lowerTags = sig.theme_tags.map(t => t.toLowerCase());
          return entries.filter(e => {
            const text = ((e.title || "") + " " + e.content).toLowerCase();
            return lowerTags.some(tag => text.includes(tag));
          }).slice(0, 5);
        });

      // Fetch related frameworks by tags
      const frameworksPromise = supabase
        .from("master_frameworks")
        .select("id, title, summary, tags")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(20)
        .then(r => {
          const frameworks = r.data || [];
          const lowerTags = sig.theme_tags.map(t => t.toLowerCase());
          const lowerPillars = sig.skill_pillars.map(p => p.toLowerCase());
          return frameworks.filter(f => {
            const fTags = (f.tags || []).map((t: string) => t.toLowerCase());
            const titleLower = f.title.toLowerCase();
            return lowerTags.some(tag => fTags.includes(tag) || titleLower.includes(tag))
              || lowerPillars.some(p => titleLower.includes(p));
          }).slice(0, 5);
        });

      const [evidenceData, entriesData, frameworksData] = await Promise.all([
        evidencePromise, entriesPromise, frameworksPromise,
      ]);

      setEvidence(evidenceData as EvidenceFragment[]);
      setRelatedEntries(entriesData as RelatedEntry[]);
      setRelatedFrameworks(frameworksData as RelatedFramework[]);

      // Fetch source registry for evidence
      const sourceIds = [...new Set((evidenceData as EvidenceFragment[]).map(e => e.source_registry_id))];
      if (sourceIds.length > 0) {
        const { data: srcData } = await supabase
          .from("source_registry")
          .select("id, title, source_type, content_preview")
          .in("id", sourceIds);
        setSources((srcData || []) as SourceInfo[]);
      } else {
        setSources([]);
      }
    } finally {
      setLoading(false);
    }
  };

  if (!signal) return null;

  const confidencePct = Math.round(signal.confidence * 100);

  const SectionHeader = ({ icon: Icon, label }: { icon: any; label: string }) => (
    <div className="flex items-center gap-2 mb-3">
      <div className="w-6 h-6 rounded-md bg-primary/10 flex items-center justify-center">
        <Icon className="w-3.5 h-3.5 text-primary/70" />
      </div>
      <h4 className="text-[11px] uppercase tracking-[0.12em] text-primary/60 font-semibold">{label}</h4>
    </div>
  );

  const fragmentTypeColor = (type: string) => {
    const map: Record<string, string> = {
      claim: "bg-blue-500/15 text-blue-400",
      signal: "bg-amber-500/15 text-amber-400",
      insight: "bg-purple-500/15 text-purple-400",
      market_fact: "bg-emerald-500/15 text-emerald-400",
      skill_evidence: "bg-primary/15 text-primary",
      framework_step: "bg-cyan-500/15 text-cyan-400",
      pattern: "bg-rose-500/15 text-rose-400",
      recommendation: "bg-green-500/15 text-green-400",
    };
    return map[type] || "bg-muted/50 text-muted-foreground/60";
  };

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto bg-background/95 backdrop-blur-xl border-primary/10 p-0">
        <div className="p-5 pb-0">
          <SheetHeader>
            <div className="flex items-center gap-3 mb-1">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center border border-primary/10">
                <Zap className="w-4.5 h-4.5 text-primary" />
              </div>
              <div className="flex-1">
                <SheetTitle className="text-base font-bold text-foreground leading-tight">
                  {signal.signal_title}
                </SheetTitle>
                <SheetDescription className="text-[10px] text-muted-foreground/50 mt-0.5">
                  Signal Explorer · {confidencePct}% confidence · {signal.fragment_count} fragments
                </SheetDescription>
              </div>
            </div>
          </SheetHeader>
        </div>

        {/* Confidence Bar */}
        <div className="h-0.5 bg-muted/20 mt-4">
          <div
            className="h-full bg-gradient-to-r from-primary/60 to-primary/30 transition-all duration-500"
            style={{ width: `${confidencePct}%` }}
          />
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16 gap-2">
            <Loader2 className="w-4 h-4 text-primary/60 animate-spin" />
            <span className="text-xs text-muted-foreground/50">Analyzing signal…</span>
          </div>
        ) : (
          <div className="p-5 space-y-6">
            {/* Explanation */}
            <div>
              <SectionHeader icon={Lightbulb} label="Why This Signal" />
              <p className="text-xs text-foreground/80 leading-relaxed">{signal.explanation}</p>
              <div className="flex flex-wrap gap-1.5 mt-3">
                {signal.theme_tags.map((tag, i) => (
                  <span key={i} className="text-[9px] bg-muted/40 text-muted-foreground/60 px-2 py-0.5 rounded-md">
                    <Hash className="w-2.5 h-2.5 inline mr-0.5" />{tag}
                  </span>
                ))}
              </div>
            </div>

            {/* Strategic Implications */}
            <div>
              <SectionHeader icon={Target} label="Strategic Implications" />
              <p className="text-xs text-foreground/70 leading-relaxed">{signal.strategic_implications}</p>
              {signal.skill_pillars.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {signal.skill_pillars.map((p, i) => (
                    <span key={i} className="text-[9px] bg-primary/8 text-primary/60 px-2.5 py-1 rounded-full border border-primary/10 font-medium">
                      {p}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Supporting Evidence */}
            {evidence.length > 0 && (
              <div>
                <SectionHeader icon={Layers} label={`Supporting Evidence (${evidence.length})`} />
                <div className="space-y-2.5">
                  {evidence.map((frag) => (
                    <div
                      key={frag.id}
                      className="rounded-xl bg-card/60 backdrop-blur-sm p-3.5 border border-primary/[0.06] hover:border-primary/15 transition-colors"
                    >
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className={`text-[8px] px-1.5 py-0.5 rounded-md font-semibold uppercase tracking-wider ${fragmentTypeColor(frag.fragment_type)}`}>
                          {frag.fragment_type.replace("_", " ")}
                        </span>
                        <span className="text-[9px] text-muted-foreground/30">
                          {Math.round(frag.confidence * 100)}%
                        </span>
                      </div>
                      <p className="text-[11px] font-medium text-foreground/90 mb-1">{frag.title}</p>
                      <p className="text-[10px] text-muted-foreground/55 leading-relaxed line-clamp-3">{frag.content}</p>
                      {frag.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {frag.tags.slice(0, 4).map((t, i) => (
                            <span key={i} className="text-[8px] bg-muted/30 text-muted-foreground/40 px-1.5 py-0.5 rounded">
                              {t}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Evidence Sources */}
            {sources.length > 0 && (
              <div>
                <SectionHeader icon={FileText} label={`Evidence Sources (${sources.length})`} />
                <div className="space-y-2">
                  {sources.map((src) => (
                    <div
                      key={src.id}
                      className="flex items-start gap-3 rounded-lg bg-card/40 p-3 border border-primary/[0.04]"
                    >
                      <div className="w-5 h-5 rounded-md bg-primary/8 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <FileText className="w-3 h-3 text-primary/50" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[11px] font-medium text-foreground/80 truncate">{src.title || "Untitled source"}</p>
                        <p className="text-[9px] text-muted-foreground/40 uppercase tracking-wider">{src.source_type.replace("_", " ")}</p>
                        {src.content_preview && (
                          <p className="text-[10px] text-muted-foreground/45 line-clamp-2 mt-1 leading-relaxed">{src.content_preview}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Related Captures */}
            {relatedEntries.length > 0 && (
              <div>
                <SectionHeader icon={BookOpen} label={`Related Captures (${relatedEntries.length})`} />
                <div className="space-y-2">
                  {relatedEntries.map((entry) => (
                    <div
                      key={entry.id}
                      className="rounded-lg bg-card/40 p-3 border border-primary/[0.04]"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[8px] bg-muted/40 text-muted-foreground/50 px-1.5 py-0.5 rounded uppercase tracking-wider font-medium">
                          {entry.type}
                        </span>
                      </div>
                      <p className="text-[11px] font-medium text-foreground/80">{entry.title || "Untitled"}</p>
                      <p className="text-[10px] text-muted-foreground/45 line-clamp-2 mt-0.5 leading-relaxed">{entry.content}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Related Frameworks */}
            {relatedFrameworks.length > 0 && (
              <div>
                <SectionHeader icon={BarChart3} label={`Related Frameworks (${relatedFrameworks.length})`} />
                <div className="space-y-2">
                  {relatedFrameworks.map((fw) => (
                    <div
                      key={fw.id}
                      className="rounded-lg bg-card/40 p-3 border border-primary/[0.04]"
                    >
                      <p className="text-[11px] font-medium text-foreground/80">{fw.title}</p>
                      {fw.summary && (
                        <p className="text-[10px] text-muted-foreground/45 line-clamp-2 mt-0.5 leading-relaxed">{fw.summary}</p>
                      )}
                      {fw.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {fw.tags.slice(0, 4).map((t, i) => (
                            <span key={i} className="text-[8px] bg-primary/8 text-primary/50 px-1.5 py-0.5 rounded">
                              {t}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
};

export default SignalExplorer;
