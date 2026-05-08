import { useState, useEffect } from "react";
import { Loader2, Target, RefreshCw, Check, Plus, Trash2, ImageIcon, Download, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

interface StepDraft {
  step_number: number;
  step_title: string;
  step_description: string;
}

interface FrameworkBuilderInlineProps {
  initialTitle?: string;
  initialDescription?: string;
  initialSteps?: string[];
  onFrameworkCreated?: () => void;
}

const DEFAULT_STEPS: StepDraft[] = [
  { step_number: 1, step_title: "", step_description: "" },
  { step_number: 2, step_title: "", step_description: "" },
  { step_number: 3, step_title: "", step_description: "" },
];

function generateSmartSteps(title: string, description: string): StepDraft[] {
  const t = title.toLowerCase();
  const d = description.toLowerCase();
  const combined = `${t} ${d}`;

  if (combined.includes("transform") || combined.includes("change") || combined.includes("shift")) {
    return [
      { step_number: 1, step_title: "Assess Current State", step_description: "Map the existing situation, gaps, and readiness for change." },
      { step_number: 2, step_title: "Design the Transformation Path", step_description: "Define the target state, key milestones, and success criteria." },
      { step_number: 3, step_title: "Execute & Embed", step_description: "Implement changes systematically and anchor new behaviors." },
    ];
  }
  if (combined.includes("strategy") || combined.includes("strategic") || combined.includes("plan")) {
    return [
      { step_number: 1, step_title: "Define Strategic Intent", step_description: "Clarify the core objective and the problem being solved." },
      { step_number: 2, step_title: "Analyse the Landscape", step_description: "Map stakeholders, constraints, opportunities, and competitive dynamics." },
      { step_number: 3, step_title: "Commit to Action", step_description: "Prioritise initiatives, allocate resources, and set accountability." },
    ];
  }
  if (combined.includes("lead") || combined.includes("leadership") || combined.includes("team")) {
    return [
      { step_number: 1, step_title: "Align on Purpose", step_description: "Create shared clarity on what the team exists to achieve." },
      { step_number: 2, step_title: "Build Trust & Capability", step_description: "Invest in relationships, skills, and psychological safety." },
      { step_number: 3, step_title: "Drive Accountable Execution", step_description: "Set rhythms, track progress, and celebrate wins." },
    ];
  }
  if (combined.includes("client") || combined.includes("customer") || combined.includes("stakeholder")) {
    return [
      { step_number: 1, step_title: "Understand Needs Deeply", step_description: "Listen, observe, and uncover the real priorities behind stated requirements." },
      { step_number: 2, step_title: "Co-Create Solutions", step_description: "Collaborate on options that balance value, feasibility, and risk." },
      { step_number: 3, step_title: "Deliver & Strengthen the Relationship", step_description: "Execute with excellence and build long-term trust." },
    ];
  }
  if (combined.includes("innovat") || combined.includes("create") || combined.includes("build") || combined.includes("design")) {
    return [
      { step_number: 1, step_title: "Identify the Opportunity", step_description: "Define the unmet need or gap that this framework addresses." },
      { step_number: 2, step_title: "Prototype the Approach", step_description: "Develop a lightweight version, test assumptions, and iterate." },
      { step_number: 3, step_title: "Scale & Systematise", step_description: "Refine the approach into a repeatable, teachable process." },
    ];
  }

  // Generic but meaningful fallback
  return [
    { step_number: 1, step_title: "Define the Foundation", step_description: "Establish the core principles, scope, and success criteria." },
    { step_number: 2, step_title: "Develop the Approach", step_description: "Design the key actions, methods, and decision points." },
    { step_number: 3, step_title: "Deliver & Iterate", step_description: "Execute, measure results, and refine based on outcomes." },
  ];
}

const FrameworkBuilderInline = ({
  initialTitle = "",
  initialDescription = "",
  initialSteps = [],
  onFrameworkCreated,
}: FrameworkBuilderInlineProps) => {
  const [title, setTitle] = useState(initialTitle);
  const [summary, setSummary] = useState(initialDescription);
  const [steps, setSteps] = useState<StepDraft[]>(
    initialSteps.length > 0
      ? initialSteps.map((s, i) => ({ step_number: i + 1, step_title: s, step_description: "" }))
      : initialTitle.trim()
        ? generateSmartSteps(initialTitle, initialDescription)
        : [...DEFAULT_STEPS]
  );
  const [saving, setSaving] = useState(false);
  const [generatingDiagram, setGeneratingDiagram] = useState(false);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [diagramUrl, setDiagramUrl] = useState<string | null>(null);
  const [lastArchetype, setLastArchetype] = useState<string | null>(null);
  const [lastStyle, setLastStyle] = useState<string | null>(null);
  const [diagramMeta, setDiagramMeta] = useState<string | null>(null);

  // Sync when initial props change
  useEffect(() => {
    setTitle(initialTitle);
    setSummary(initialDescription);
    setSteps(
      initialSteps.length > 0
        ? initialSteps.map((s, i) => ({ step_number: i + 1, step_title: s, step_description: "" }))
        : initialTitle.trim()
          ? generateSmartSteps(initialTitle, initialDescription)
          : [...DEFAULT_STEPS]
    );
    setCreatedId(null);
    setDiagramUrl(null);
    setLastArchetype(null);
    setLastStyle(null);
    setDiagramMeta(null);
  }, [initialTitle, initialDescription]);

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
        const { error } = await supabase
          .from("master_frameworks")
          .update({
            title: title.trim(),
            summary: summary.trim(),
            framework_steps: cleanSteps as any,
          })
          .eq("id", createdId);
        if (error) throw error;
        toast.success("Framework saved — available in your Library", {
          description: "You can find it anytime in Publish → Library.",
        });
      } else {
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
        toast.success("Framework created — saved to your Library", {
          description: "Generate a diagram or approve to activate it.",
        });
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
        body: {
          framework_id: createdId,
          mode: "framework",
          exclude_archetype: lastArchetype,
          exclude_style: lastStyle,
        },
      });
      if (error) throw error;
      if (data?.diagram_url) {
        setDiagramUrl(data.diagram_url);
        setLastArchetype(data.archetype || null);
        setLastStyle(data.style || null);
        const label = [
          data.archetype?.replace(/_/g, " "),
          data.style?.replace(/_/g, " "),
        ].filter(Boolean).join(" · ");
        setDiagramMeta(label || null);
        toast.success("Diagram generated");
      }
    } catch (e: any) {
      toast.error(e.message || "Failed to generate diagram");
    } finally {
      setGeneratingDiagram(false);
    }
  };

  const handleDownloadDiagram = async () => {
    if (!diagramUrl) return;
    try {
      const response = await fetch(diagramUrl);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${(title || "framework").replace(/\s+/g, "_")}_diagram.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Diagram downloaded");
    } catch {
      toast.error("Failed to download diagram");
    }
  };

  const handleApprove = async () => {
    if (!createdId) return;
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase
        .from("master_frameworks")
        .update({ tags: ["Approved"] })
        .eq("id", createdId);
      if (error) throw error;

      await supabase.functions.invoke("activate-framework", {
        body: { framework_id: createdId, user_id: user.id },
      });

      toast.success("Framework approved & activated!");
      onFrameworkCreated?.();
    } catch (e: any) {
      toast.error(e.message || "Approval failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500/20 to-blue-500/5 flex items-center justify-center">
          <Target className="w-4 h-4 text-blue-400" />
        </div>
        <h3 className="text-base font-semibold text-foreground" style={{ fontFamily: "var(--font-display)" }}>
          {createdId ? "Refine Framework" : "Build Framework"}
        </h3>
        {initialTitle.trim() && !createdId && (
          <span className="flex items-center gap-1 text-[10px] text-primary/60 bg-primary/5 px-2 py-0.5 rounded-full border border-primary/10">
            <Sparkles className="w-2.5 h-2.5" /> Smart steps generated
          </span>
        )}
      </div>

      {/* Title */}
      <div>
        <label className="text-label uppercase tracking-wider text-xs font-semibold mb-1.5 block">Title</label>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Framework title"
          className="text-sm bg-secondary/30 border-border/20"
        />
      </div>

      {/* Description */}
      <div>
        <label className="text-label uppercase tracking-wider text-xs font-semibold mb-1.5 block">Description</label>
        <Textarea
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          placeholder="What problem does this framework solve?"
          rows={2}
          className="text-sm bg-secondary/30 border-border/20"
        />
      </div>

      {/* Steps */}
      <div>
        <label className="text-label uppercase tracking-wider text-xs font-semibold mb-2 block">Steps</label>
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
                  placeholder={step.step_number === 1 ? "e.g., Assess current state" : step.step_number === 2 ? "e.g., Define target architecture" : `Step ${step.step_number} title`}
                  className="text-xs h-8 bg-secondary/30 border-border/20"
                />
                <Textarea
                  value={step.step_description}
                  onChange={(e) => updateStep(idx, "step_description", e.target.value)}
                  placeholder="Step description (optional)"
                  rows={2}
                  className="text-xs bg-secondary/30 border-border/20"
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
        <div className="space-y-2">
          <div className="rounded-xl overflow-hidden border border-border/10 bg-secondary/10">
            <img src={diagramUrl} alt="Framework diagram" className="w-full h-auto max-h-64 object-contain" />
          </div>
          {diagramMeta && (
            <p className="text-[10px] text-muted-foreground text-center capitalize">{diagramMeta}</p>
          )}
          <div className="flex justify-center">
            <Button
              size="sm"
              variant="outline"
              onClick={handleDownloadDiagram}
              className="text-xs border-border/15 gap-1.5"
            >
              <Download className="w-3 h-3" /> Download Diagram
            </Button>
          </div>
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
              variant="outline"
              onClick={handleApprove}
              disabled={saving}
              className="text-xs border-emerald-500/25 bg-emerald-500/10 text-foreground hover:bg-emerald-500/20"
            >
              <Check className="w-3 h-3 mr-1.5 text-emerald-400" /> Approve & Activate
            </Button>
          </>
        )}
      </div>
    </div>
  );
};

export default FrameworkBuilderInline;
