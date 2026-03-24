import { useState } from "react";
import {
  Loader2, FileText, Users, Briefcase, Presentation,
  Copy, Check, RefreshCw, Pencil, Eye, ArrowRight,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface ActionWorkspaceProps {
  open: boolean;
  onClose: () => void;
  action: string;
  rationale: string;
}

const OUTPUT_TYPES = [
  {
    key: "executive_memo",
    label: "Executive Memo",
    description: "Internal leadership memo with situation, insight, and recommended action",
    icon: FileText,
    accent: "from-amber-500/20 to-amber-500/5",
    iconColor: "text-amber-400",
  },
  {
    key: "meeting_prep",
    label: "Meeting Prep",
    description: "Talking points, data references, and anticipated pushback",
    icon: Users,
    accent: "from-blue-500/20 to-blue-500/5",
    iconColor: "text-blue-400",
  },
  {
    key: "strategy_brief",
    label: "Strategy Brief",
    description: "One-page brief with challenge, approach, and expected outcomes",
    icon: Briefcase,
    accent: "from-emerald-500/20 to-emerald-500/5",
    iconColor: "text-emerald-400",
  },
  {
    key: "presentation_slide",
    label: "Presentation Slide",
    description: "Slide content with headline, supporting points, and speaker notes",
    icon: Presentation,
    accent: "from-purple-500/20 to-purple-500/5",
    iconColor: "text-purple-400",
  },
] as const;

type OutputKey = typeof OUTPUT_TYPES[number]["key"];

const ActionWorkspace = ({ open, onClose, action, rationale }: ActionWorkspaceProps) => {
  const [selectedType, setSelectedType] = useState<OutputKey | null>(null);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [copied, setCopied] = useState(false);

  const generateOutput = async (type: OutputKey) => {
    setSelectedType(type);
    setLoading(true);
    setContent("");
    setEditing(false);
    try {
      const { data, error } = await supabase.functions.invoke("generate-action-output", {
        body: { action, rationale, output_type: type },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setContent(data.content || "");
    } catch (e: any) {
      toast.error(e.message || "Failed to generate output");
      setSelectedType(null);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleBack = () => {
    setSelectedType(null);
    setContent("");
    setEditing(false);
  };

  const handleClose = () => {
    onClose();
    setTimeout(() => {
      setSelectedType(null);
      setContent("");
      setEditing(false);
      setCopied(false);
    }, 300);
  };

  const activeConfig = selectedType
    ? OUTPUT_TYPES.find(o => o.key === selectedType)
    : null;

  return (
    <Sheet open={open} onOpenChange={(v) => !v && handleClose()}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto bg-background/95 backdrop-blur-xl border-primary/10 p-0">
        <div className="p-5 pb-0">
          <SheetHeader>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500/20 to-emerald-500/5 flex items-center justify-center border border-emerald-500/10">
                <ArrowRight className="w-4.5 h-4.5 text-emerald-400" />
              </div>
              <div className="flex-1">
                <SheetTitle className="text-base font-bold text-foreground leading-tight">
                  Action Workspace
                </SheetTitle>
                <SheetDescription className="text-[10px] text-muted-foreground/50 mt-0.5">
                  Generate strategic outputs from your recommended action
                </SheetDescription>
              </div>
            </div>
          </SheetHeader>
        </div>

        <div className="h-0.5 bg-gradient-to-r from-emerald-500/40 via-primary/30 to-transparent mt-4" />

        {/* Action Context */}
        <div className="px-5 pt-4 pb-3 border-b border-primary/[0.06]">
          <p className="text-[10px] uppercase tracking-[0.12em] text-emerald-400/50 font-semibold mb-1">Recommended Action</p>
          <p className="text-xs font-medium text-foreground/80 leading-snug">{action}</p>
          {rationale && (
            <p className="text-[10px] text-muted-foreground/40 mt-1 leading-relaxed">{rationale}</p>
          )}
        </div>

        <div className="px-5 py-4">
          {!selectedType ? (
            /* Output Type Selection */
            <div className="space-y-2.5">
              <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground/40 font-semibold mb-3">
                Choose Output Type
              </p>
              {OUTPUT_TYPES.map(({ key, label, description, icon: Icon, accent, iconColor }) => (
                <button
                  key={key}
                  onClick={() => generateOutput(key)}
                  className="w-full flex items-start gap-3 p-4 rounded-xl border border-primary/[0.06] hover:border-primary/15 bg-card/40 hover:bg-card/60 transition-all duration-200 text-left group"
                >
                  <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${accent} flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform`}>
                    <Icon className={`w-4.5 h-4.5 ${iconColor}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-foreground mb-0.5">{label}</p>
                    <p className="text-[10px] text-muted-foreground/50 leading-relaxed">{description}</p>
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-muted-foreground/20 group-hover:text-primary/50 mt-1 flex-shrink-0 transition-colors" />
                </button>
              ))}
            </div>
          ) : loading ? (
            /* Loading State */
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Loader2 className="w-5 h-5 text-primary/60 animate-spin" />
              <div className="text-center">
                <p className="text-xs text-muted-foreground/60">
                  Generating {activeConfig?.label?.toLowerCase()}…
                </p>
                <p className="text-[10px] text-muted-foreground/30 mt-1">
                  Applying strategic context and executive formatting
                </p>
              </div>
            </div>
          ) : (
            /* Generated Content */
            <div className="space-y-4">
              {/* Type Header */}
              {activeConfig && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleBack}
                    className="text-[10px] text-muted-foreground/40 hover:text-primary transition-colors"
                  >
                    ← Back
                  </button>
                  <div className="flex-1" />
                  <div className="flex items-center gap-1.5">
                    <activeConfig.icon className={`w-3.5 h-3.5 ${activeConfig.iconColor}`} />
                    <span className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider">
                      {activeConfig.label}
                    </span>
                  </div>
                </div>
              )}

              {/* Content */}
              <div className="rounded-xl border border-primary/[0.08] bg-card/60 backdrop-blur-sm overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-primary/[0.06]">
                  <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground/40 font-semibold">
                    {editing ? "Edit Mode" : "Preview"}
                  </p>
                  <button
                    onClick={() => setEditing(!editing)}
                    className="text-[10px] text-primary/60 hover:text-primary flex items-center gap-1 transition-colors"
                  >
                    {editing ? (
                      <><Eye className="w-3 h-3" /> Preview</>
                    ) : (
                      <><Pencil className="w-3 h-3" /> Edit</>
                    )}
                  </button>
                </div>

                {editing ? (
                  <Textarea
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    className="border-0 rounded-none min-h-[350px] text-sm leading-relaxed resize-none focus-visible:ring-0 bg-transparent"
                  />
                ) : (
                  <div
                    className="p-4 text-sm text-foreground/85 leading-relaxed whitespace-pre-line max-h-[450px] overflow-y-auto"
                    dir="auto"
                    style={{ wordBreak: "break-word", overflowWrap: "anywhere" }}
                  >
                    {content}
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <Button
                  onClick={handleCopy}
                  className="flex-1 bg-primary/15 text-primary hover:bg-primary/25 border border-primary/20 text-xs"
                >
                  {copied ? (
                    <><Check className="w-3.5 h-3.5 mr-1.5" /> Copied!</>
                  ) : (
                    <><Copy className="w-3.5 h-3.5 mr-1.5" /> Copy to Clipboard</>
                  )}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => generateOutput(selectedType!)}
                  disabled={loading}
                  className="text-xs border-border/15"
                >
                  <RefreshCw className="w-3 h-3 mr-1.5" /> Regenerate
                </Button>
              </div>

              {/* Word count */}
              <p className="text-[9px] text-muted-foreground/30 text-right">
                {content.split(/\s+/).filter(Boolean).length} words
              </p>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default ActionWorkspace;
