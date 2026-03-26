import { Search, Lightbulb, Target, PenLine, Layers, Save, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useState } from "react";

/* ═══════════════════════════════════════════════════════
   Canonical Action System
   
   Every object type has a fixed set of actions with
   consistent labels, icons, and ordering:
   
   Signal:    Explore → Create Insight → Develop Framework → Draft Content
   Insight:   Expand → Build Framework → Draft Content
   Framework: Open Framework → Refine Framework → Draft Content
   Content:   Draft Content → Save for Later
   ═══════════════════════════════════════════════════════ */

export type ObjectType = "signal" | "insight" | "framework" | "content";

export interface ActionContext {
  title: string;
  explanation?: string;
  implications?: string;
  summary?: string;
  steps?: string[];
  hook?: string;
  angle?: string;
  context?: string;
}

export interface ActionHandlers {
  onExplore?: () => void;
  onCreateInsight?: () => void;
  onDevelopFramework?: () => void;
  onBuildFramework?: () => void;
  onOpenFramework?: () => void;
  onRefineFramework?: () => void;
  onExpand?: () => void;
  onDraftContent?: () => void;
  onSaveForLater?: () => void;
  onDiscussWithAura?: () => void;
}

/* ── Signal Actions ── */
export const SignalActions = ({
  onExplore,
  onCreateInsight,
  onDevelopFramework,
  onDraftContent,
}: Pick<ActionHandlers, "onExplore" | "onCreateInsight" | "onDevelopFramework" | "onDraftContent">) => (
  <div className="flex flex-wrap gap-2">
    {onExplore && (
      <Button variant="outline" size="sm" className="text-xs gap-1.5" onClick={onExplore}>
        <Search className="w-3.5 h-3.5" /> Explore
      </Button>
    )}
    {onCreateInsight && (
      <Button variant="outline" size="sm" className="text-xs gap-1.5" onClick={onCreateInsight}>
        <Lightbulb className="w-3.5 h-3.5" /> Create Insight
      </Button>
    )}
    {onDevelopFramework && (
      <Button variant="outline" size="sm" className="text-xs gap-1.5" onClick={onDevelopFramework}>
        <Target className="w-3.5 h-3.5" /> Develop Framework
      </Button>
    )}
    {onDraftContent && (
      <Button variant="outline" size="sm" className="text-xs gap-1.5" onClick={onDraftContent}>
        <PenLine className="w-3.5 h-3.5" /> Draft Content
      </Button>
    )}
  </div>
);

/* ── Insight Actions ── */
export const InsightActions = ({
  onExpand,
  onBuildFramework,
  onDraftContent,
}: Pick<ActionHandlers, "onExpand" | "onBuildFramework" | "onDraftContent">) => (
  <div className="flex flex-wrap gap-2">
    {onExpand && (
      <Button variant="outline" size="sm" className="text-xs gap-1.5" onClick={onExpand}>
        <Lightbulb className="w-3.5 h-3.5" /> Expand
      </Button>
    )}
    {onBuildFramework && (
      <Button variant="outline" size="sm" className="text-xs gap-1.5" onClick={onBuildFramework}>
        <Layers className="w-3.5 h-3.5" /> Build Framework
      </Button>
    )}
    {onDraftContent && (
      <Button variant="outline" size="sm" className="text-xs gap-1.5" onClick={onDraftContent}>
        <PenLine className="w-3.5 h-3.5" /> Draft Content
      </Button>
    )}
  </div>
);

/* ── Framework Actions ── */
export const FrameworkActions = ({
  onOpenFramework,
  onRefineFramework,
  onDraftContent,
}: Pick<ActionHandlers, "onOpenFramework" | "onRefineFramework" | "onDraftContent">) => (
  <div className="flex flex-wrap gap-2">
    {onOpenFramework && (
      <Button variant="outline" size="sm" className="text-xs gap-1.5" onClick={onOpenFramework}>
        <Layers className="w-3.5 h-3.5" /> Open Framework
      </Button>
    )}
    {onRefineFramework && (
      <Button variant="outline" size="sm" className="text-xs gap-1.5" onClick={onRefineFramework}>
        <Target className="w-3.5 h-3.5" /> Refine Framework
      </Button>
    )}
    {onDraftContent && (
      <Button variant="outline" size="sm" className="text-xs gap-1.5" onClick={onDraftContent}>
        <PenLine className="w-3.5 h-3.5" /> Draft Content
      </Button>
    )}
  </div>
);

/* ── Content / Recommended Move Actions ── */
export const ContentActions = ({
  onDraftContent,
  onSaveForLater,
}: Pick<ActionHandlers, "onDraftContent" | "onSaveForLater">) => {
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    setSaved(true);
    toast.success("Saved for later");
    onSaveForLater?.();
  };

  return (
    <div className="flex flex-wrap gap-2">
      {onDraftContent && (
        <Button variant="outline" size="sm" className="text-xs gap-1.5" onClick={onDraftContent}>
          <PenLine className="w-3.5 h-3.5" /> Draft Content
        </Button>
      )}
      {onSaveForLater && (
        <Button
          variant="ghost"
          size="sm"
          className={`text-xs gap-1.5 ${saved ? "text-primary" : "text-muted-foreground"}`}
          onClick={handleSave}
          disabled={saved}
        >
          <Save className="w-3.5 h-3.5" /> {saved ? "Saved" : "Save for Later"}
        </Button>
      )}
    </div>
  );
};

/* ── Conversational Action (Ask Aura) ── */
export const AuraAction = ({
  label = "Discuss with Aura",
  onClick,
}: {
  label?: "Ask Aura" | "Discuss with Aura" | "Critique with Aura";
  onClick: () => void;
}) => (
  <Button variant="ghost" size="sm" className="text-xs gap-1.5 text-muted-foreground" onClick={onClick}>
    <MessageCircle className="w-3.5 h-3.5" /> {label}
  </Button>
);

/* ── Advisor action type → canonical label map ── */
export const ADVISOR_ACTION_LABELS: Record<string, string> = {
  draft_content: "Draft Content",
  build_framework: "Build Framework",
  develop_insight: "Create Insight",
  explore_signal: "Explore",
  plan_narrative: "Draft Content",
};

export const ADVISOR_ACTION_ICONS: Record<string, typeof PenLine> = {
  draft_content: PenLine,
  build_framework: Layers,
  develop_insight: Lightbulb,
  explore_signal: Search,
  plan_narrative: PenLine,
};
