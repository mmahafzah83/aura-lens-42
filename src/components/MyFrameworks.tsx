import { useState, useEffect } from "react";
import { BookOpen, Trash2, ChevronDown, ChevronUp, Loader2, RefreshCw, Check, Pencil, ImageIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { Database } from "@/integrations/supabase/types";

type Framework = Database["public"]["Tables"]["master_frameworks"]["Row"] & {
  diagram_url?: string | null;
  diagram_description?: any;
};
type FrameworkStep = { step_number: number; step_title: string; step_description: string };

const DIAGRAM_TYPE_LABELS: Record<string, string> = {
  sequential_flow: "Sequential Flow",
  layered_architecture: "Layered Architecture",
  circular_model: "Circular Model",
  pyramid: "Pyramid",
  matrix: "Matrix",
  hub_spoke: "Hub & Spoke",
};

const MyFrameworks = () => {
  const [frameworks, setFrameworks] = useState<Framework[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [generatingDiagramId, setGeneratingDiagramId] = useState<string | null>(null);
  const [refineOpen, setRefineOpen] = useState<string | null>(null);
  const [refineTitle, setRefineTitle] = useState("");
  const [refineSummary, setRefineSummary] = useState("");
  const [refineSteps, setRefineSteps] = useState<FrameworkStep[]>([]);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const fetchFrameworks = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("master_frameworks")
      .select("*")
      .order("created_at", { ascending: false });
    if (data) setFrameworks(data as Framework[]);
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

  const handleGenerateDiagram = async (fw: Framework) => {
    setGeneratingDiagramId(fw.id);
    try {
      const { data, error } = await supabase.functions.invoke("generate-framework-diagram", {
        body: { framework_id: fw.id },
      });
      if (error) throw error;
      if (data?.diagram_url) {
        setFrameworks(prev =>
          prev.map(f =>
            f.id === fw.id
              ? { ...f, diagram_url: data.diagram_url, diagram_description: data.diagram_description }
              : f
          )
        );
        toast({ title: "Diagram Generated", description: "Visual representation created." });
      }
    } catch (e: any) {
      toast({ title: "Diagram Error", description: e.message || "Failed to generate diagram", variant: "destructive" });
    }
    setGeneratingDiagramId(null);
  };

  const openRefine = (fw: Framework) => {
    setRefineTitle(fw.title);
    setRefineSummary(fw.summary || "");
    setRefineSteps(steps(fw));
    setRefineOpen(fw.id);
  };

  const handleRefine = async () => {
    if (!refineOpen) return;
    setSaving(true);
    const { error } = await supabase
      .from("master_frameworks")
      .update({
        title: refineTitle,
        summary: refineSummary,
        framework_steps: refineSteps as any,
      })
      .eq("id", refineOpen);

    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
    } else {
      setFrameworks(prev =>
        prev.map(f =>
          f.id === refineOpen
            ? { ...f, title: refineTitle, summary: refineSummary, framework_steps: refineSteps as any }
            : f
        )
      );
      toast({ title: "Framework Updated", description: "Your refinements have been saved." });
      setRefineOpen(null);
    }
    setSaving(false);
  };

  const handleApprove = async (fw: Framework) => {
    const newTags = (fw.tags || []).includes("Approved")
      ? fw.tags
      : [...(fw.tags || []), "Approved"];
    const { error } = await supabase
      .from("master_frameworks")
      .update({ tags: newTags })
      .eq("id", fw.id);
    if (!error) {
      setFrameworks(prev =>
        prev.map(f => (f.id === fw.id ? { ...f, tags: newTags } : f))
      );
      toast({ title: "Framework Approved", description: `"${fw.title}" is now part of your approved vault.` });
    }
  };

  const steps = (fw: Framework): FrameworkStep[] => {
    try {
      return (fw.framework_steps as unknown as FrameworkStep[]) || [];
    } catch { return []; }
  };

  const isExpanded = (id: string) => expandedId === id;
  const isApproved = (fw: Framework) => (fw.tags || []).includes("Approved");

  const getDiagramType = (fw: Framework): string | null => {
    const dd = fw.diagram_description as any;
    return dd?.diagram_type || null;
  };

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
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-foreground leading-relaxed">{fw.title}</p>
                    {isApproved(fw) && (
                      <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/20">
                        APPROVED
                      </span>
                    )}
                  </div>
                  {fw.summary && (
                    <p className="text-xs text-muted-foreground/60 mt-1.5 line-clamp-2 leading-relaxed">{fw.summary}</p>
                  )}
                  <div className="flex items-center gap-2 mt-3 flex-wrap">
                    {getDiagramType(fw) && (
                      <span className="text-[10px] font-medium px-2.5 py-0.5 rounded-full bg-accent/15 text-accent-foreground/70 border border-accent/15">
                        {DIAGRAM_TYPE_LABELS[getDiagramType(fw)!] || getDiagramType(fw)}
                      </span>
                    )}
                    {(fw.tags || []).filter(t => t !== "Approved").map(tag => (
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

              {/* Expanded Content */}
              {isExpanded(fw.id) && (
                <div className="px-5 pb-5 space-y-4 border-t border-border/8 pt-4">
                  {/* Diagram Section */}
                  {(fw as any).diagram_url ? (
                    <div className="rounded-xl overflow-hidden border border-border/10 bg-secondary/10">
                      <img
                        src={(fw as any).diagram_url}
                        alt={`${fw.title} diagram`}
                        className="w-full h-auto max-h-80 object-contain"
                        loading="lazy"
                      />
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed border-border/20 bg-secondary/5 p-6 text-center">
                      <ImageIcon className="w-8 h-8 text-muted-foreground/20 mx-auto mb-2" />
                      <p className="text-xs text-muted-foreground/40 mb-3">No diagram generated yet</p>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleGenerateDiagram(fw)}
                        disabled={generatingDiagramId === fw.id}
                        className="text-xs border-primary/20 text-primary/70 hover:bg-primary/5"
                      >
                        {generatingDiagramId === fw.id ? (
                          <><Loader2 className="w-3 h-3 animate-spin mr-1.5" /> Generating…</>
                        ) : (
                          <><ImageIcon className="w-3 h-3 mr-1.5" /> Generate Diagram</>
                        )}
                      </Button>
                    </div>
                  )}

                  {/* Steps */}
                  <div className="space-y-3">
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
                  </div>

                  {/* Action Bar */}
                  <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-border/8">
                    {(fw as any).diagram_url && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleGenerateDiagram(fw)}
                        disabled={generatingDiagramId === fw.id}
                        className="text-[11px] h-8 border-border/15 text-muted-foreground/70 hover:text-foreground"
                      >
                        {generatingDiagramId === fw.id ? (
                          <Loader2 className="w-3 h-3 animate-spin mr-1.5" />
                        ) : (
                          <RefreshCw className="w-3 h-3 mr-1.5" />
                        )}
                        Regenerate Diagram
                      </Button>
                    )}

                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openRefine(fw)}
                      className="text-[11px] h-8 border-border/15 text-muted-foreground/70 hover:text-foreground"
                    >
                      <Pencil className="w-3 h-3 mr-1.5" />
                      Refine
                    </Button>

                    {!isApproved(fw) && (
                      <Button
                        size="sm"
                        onClick={() => handleApprove(fw)}
                        className="text-[11px] h-8 bg-primary/15 text-primary hover:bg-primary/25 border border-primary/20"
                      >
                        <Check className="w-3 h-3 mr-1.5" />
                        Approve Framework
                      </Button>
                    )}

                    <div className="flex-1" />

                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(fw.id); }}
                      disabled={deletingId === fw.id}
                      className="flex items-center gap-1.5 text-[11px] font-medium text-destructive/70 hover:text-destructive transition-all duration-200 disabled:opacity-40 px-3 py-1.5 rounded-lg bg-destructive/6 hover:bg-destructive/12 tactile-press border border-destructive/8"
                    >
                      {deletingId === fw.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                      Delete
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Refine Dialog */}
      <Dialog open={!!refineOpen} onOpenChange={(v) => !v && setRefineOpen(null)}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-foreground" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
              Refine Framework
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Title</label>
              <Input
                value={refineTitle}
                onChange={(e) => setRefineTitle(e.target.value)}
                className="text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Summary</label>
              <Textarea
                value={refineSummary}
                onChange={(e) => setRefineSummary(e.target.value)}
                rows={2}
                className="text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-2 block">Steps</label>
              <div className="space-y-3">
                {refineSteps.map((step, idx) => (
                  <div key={idx} className="flex gap-2 items-start">
                    <span className="shrink-0 w-6 h-6 rounded-lg bg-primary/10 text-primary text-[11px] font-semibold flex items-center justify-center border border-primary/15 tabular-nums mt-1">
                      {step.step_number}
                    </span>
                    <div className="flex-1 space-y-1">
                      <Input
                        value={step.step_title}
                        onChange={(e) => {
                          const updated = [...refineSteps];
                          updated[idx] = { ...updated[idx], step_title: e.target.value };
                          setRefineSteps(updated);
                        }}
                        placeholder="Step title"
                        className="text-xs h-8"
                      />
                      <Textarea
                        value={step.step_description}
                        onChange={(e) => {
                          const updated = [...refineSteps];
                          updated[idx] = { ...updated[idx], step_description: e.target.value };
                          setRefineSteps(updated);
                        }}
                        placeholder="Step description"
                        rows={2}
                        className="text-xs"
                      />
                    </div>
                  </div>
                ))}
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="mt-2 text-xs text-primary/60"
                onClick={() => setRefineSteps([...refineSteps, { step_number: refineSteps.length + 1, step_title: "", step_description: "" }])}
              >
                + Add Step
              </Button>
            </div>
            <div className="flex gap-2 pt-2">
              <Button
                onClick={handleRefine}
                disabled={saving}
                className="flex-1 bg-primary/20 text-primary hover:bg-primary/30 border border-primary/20"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Save Changes
              </Button>
              <Button variant="outline" onClick={() => setRefineOpen(null)}>
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MyFrameworks;
