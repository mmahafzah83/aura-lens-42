import { useState, useEffect } from "react";
import { Loader2, Target, RefreshCw, Check, Plus, Trash2, ImageIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

interface FrameworkBuilderProps {
  open: boolean;
  onClose: () => void;
  initialTitle: string;
  initialDescription: string;
  initialSteps: string[];
  onFrameworkCreated?: () => void;
}

interface StepDraft {
  step_number: number;
  step_title: string;
  step_description: string;
}

const FrameworkBuilder = ({
  open,
  onClose,
  initialTitle,
  initialDescription,
  initialSteps,
  onFrameworkCreated,
}: FrameworkBuilderProps) => {
  const [title, setTitle] = useState(initialTitle);
  const [summary, setSummary] = useState(initialDescription);
  const [steps, setSteps] = useState<StepDraft[]>(
    initialSteps.length > 0
      ? initialSteps.map((s, i) => ({ step_number: i + 1, step_title: s, step_description: "" }))
      : [{ step_number: 1, step_title: "", step_description: "" }]
  );
  const [saving, setSaving] = useState(false);
  const [generatingDiagram, setGeneratingDiagram] = useState(false);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [diagramUrl, setDiagramUrl] = useState<string | null>(null);
  const [lastArchetype, setLastArchetype] = useState<string | null>(null);
  const [lastStyle, setLastStyle] = useState<string | null>(null);
  const [diagramMeta, setDiagramMeta] = useState<string | null>(null);

  // Reset state when props change
  const resetWithProps = () => {
    setTitle(initialTitle);
    setSummary(initialDescription);
    setSteps(
      initialSteps.length > 0
        ? initialSteps.map((s, i) => ({ step_number: i + 1, step_title: s, step_description: "" }))
        : [{ step_number: 1, step_title: "", step_description: "" }]
    );
    setCreatedId(null);
    setDiagramUrl(null);
  };

  // Sync state when dialog opens with new data
  useEffect(() => {
    if (open) {
      setTitle(initialTitle);
      setSummary(initialDescription);
      setSteps(
        initialSteps.length > 0
          ? initialSteps.map((s, i) => ({ step_number: i + 1, step_title: s, step_description: "" }))
          : [{ step_number: 1, step_title: "", step_description: "" }]
      );
      setCreatedId(null);
      setDiagramUrl(null);
    }
  }, [open, initialTitle, initialDescription]);

  const handleOpenChange = (v: boolean) => {
    if (!v) {
      onClose();
      setTimeout(resetWithProps, 300);
    }
  };

  const addStep = () => {
    setSteps([...steps, { step_number: steps.length + 1, step_title: "", step_description: "" }]);
  };

  const removeStep = (idx: number) => {
    const updated = steps.filter((_, i) => i !== idx).map((s, i) => ({ ...s, step_number: i + 1 }));
    setSteps(updated);
  };

  const updateStep = (idx: number, field: "step_title" | "step_description", value: string) => {
    const updated = [...steps];
    updated[idx] = { ...updated[idx], [field]: value };
    setSteps(updated);
  };

  const handleSave = async () => {
    if (!title.trim()) {
      toast.error("Please enter a framework title");
      return;
    }
    if (steps.filter(s => s.step_title.trim()).length === 0) {
      toast.error("Please add at least one step");
      return;
    }

    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const cleanSteps = steps.filter(s => s.step_title.trim());

      if (createdId) {
        // Update existing
        const { error } = await supabase
          .from("master_frameworks")
          .update({
            title: title.trim(),
            summary: summary.trim(),
            framework_steps: cleanSteps as any,
          })
          .eq("id", createdId);
        if (error) throw error;
        toast.success("Framework updated");
      } else {
        // Create new
        const { data, error } = await supabase
          .from("master_frameworks")
          .insert({
            title: title.trim(),
            summary: summary.trim(),
            framework_steps: cleanSteps as any,
            user_id: user.id,
            tags: ["Draft"],
            source_type: "signal",
          })
          .select("id")
          .single();
        if (error) throw error;
        setCreatedId(data.id);
        toast.success("Framework created — you can now generate a diagram or approve it");
      }
    } catch (e: any) {
      toast.error(e.message || "Failed to save framework");
    } finally {
      setSaving(false);
    }
  };

  const handleGenerateDiagram = async () => {
    if (!createdId) {
      toast.error("Save the framework first");
      return;
    }
    setGeneratingDiagram(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-framework-diagram", {
        body: { framework_id: createdId },
      });
      if (error) throw error;
      if (data?.diagram_url) {
        setDiagramUrl(data.diagram_url);
        toast.success("Diagram generated");
      }
    } catch (e: any) {
      toast.error(e.message || "Failed to generate diagram");
    } finally {
      setGeneratingDiagram(false);
    }
  };

  const handleApprove = async () => {
    if (!createdId) return;
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Tag as approved
      const { error } = await supabase
        .from("master_frameworks")
        .update({ tags: ["Approved"] })
        .eq("id", createdId);
      if (error) throw error;

      // Activate
      await supabase.functions.invoke("activate-framework", {
        body: { framework_id: createdId, user_id: user.id },
      });

      toast.success("Framework approved & activated!");
      onFrameworkCreated?.();
      onClose();
    } catch (e: any) {
      toast.error(e.message || "Approval failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500/20 to-blue-500/5 flex items-center justify-center">
              <Target className="w-4 h-4 text-blue-400" />
            </div>
            <DialogTitle className="text-foreground" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
              {createdId ? "Refine Framework" : "Build Framework"}
            </DialogTitle>
          </div>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* Title */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Title</label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Framework title"
              className="text-sm"
            />
          </div>

          {/* Summary */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Description</label>
            <Textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="What problem does this framework solve?"
              rows={2}
              className="text-sm"
            />
          </div>

          {/* Steps */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-2 block">Steps</label>
            <div className="space-y-3">
              {steps.map((step, idx) => (
                <div key={idx} className="flex gap-2 items-start">
                  <span className="shrink-0 w-6 h-6 rounded-lg bg-primary/10 text-primary text-[11px] font-semibold flex items-center justify-center border border-primary/15 tabular-nums mt-1">
                    {step.step_number}
                  </span>
                  <div className="flex-1 space-y-1">
                    <Input
                      value={step.step_title}
                      onChange={(e) => updateStep(idx, "step_title", e.target.value)}
                      placeholder="Step title"
                      className="text-xs h-8"
                    />
                    <Textarea
                      value={step.step_description}
                      onChange={(e) => updateStep(idx, "step_description", e.target.value)}
                      placeholder="Step description (optional)"
                      rows={2}
                      className="text-xs"
                    />
                  </div>
                  {steps.length > 1 && (
                    <button
                      onClick={() => removeStep(idx)}
                      className="text-muted-foreground/30 hover:text-destructive/60 mt-1.5 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="mt-2 text-xs text-primary/60"
              onClick={addStep}
            >
              <Plus className="w-3 h-3 mr-1" /> Add Step
            </Button>
          </div>

          {/* Diagram Preview */}
          {diagramUrl && (
            <div className="rounded-xl overflow-hidden border border-border/10 bg-secondary/10">
              <img src={diagramUrl} alt="Framework diagram" className="w-full h-auto max-h-64 object-contain" />
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-wrap gap-2 pt-2 border-t border-border/10">
            <Button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 text-xs"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : null}
              {createdId ? "Save Changes" : "Create Framework"}
            </Button>

            {createdId && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleGenerateDiagram}
                  disabled={generatingDiagram}
                  className="text-xs border-border/15"
                >
                  {generatingDiagram ? (
                    <Loader2 className="w-3 h-3 animate-spin mr-1.5" />
                  ) : diagramUrl ? (
                    <RefreshCw className="w-3 h-3 mr-1.5" />
                  ) : (
                    <ImageIcon className="w-3 h-3 mr-1.5" />
                  )}
                  {diagramUrl ? "Regenerate" : "Generate"} Diagram
                </Button>

                <Button
                  size="sm"
                  onClick={handleApprove}
                  disabled={saving}
                  className="text-xs bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 border border-emerald-500/20"
                >
                  <Check className="w-3 h-3 mr-1.5" /> Approve & Activate
                </Button>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default FrameworkBuilder;
