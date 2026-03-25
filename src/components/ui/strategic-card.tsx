import * as React from "react";
import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

/* ── Expandable Text ── */
export const ExpandableText = ({ text, lines = 3 }: { text: string; lines?: number }) => {
  const [expanded, setExpanded] = useState(false);
  const isLong = text.length > lines * 60;

  return (
    <div>
      <p className={cn("text-sm text-muted-foreground leading-relaxed", !expanded && isLong && `line-clamp-${lines}`)}>
        {text}
      </p>
      {isLong && (
        <button
          onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
          className="text-xs text-primary/70 hover:text-primary mt-1.5 font-medium transition-colors"
        >
          {expanded ? "Show less" : "Read more"}
        </button>
      )}
    </div>
  );
};

/* ── Strategic Card ── */
interface StrategicCardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Optional icon element rendered top-left */
  icon?: React.ReactNode;
  /** Card title */
  title: string;
  /** Short summary – expandable to full text */
  summary?: string;
  /** Tags / metadata chips */
  tags?: React.ReactNode;
  /** Action buttons row */
  actions?: React.ReactNode;
  /** Collapsible detail content (rendered below summary when expanded) */
  expandableContent?: React.ReactNode;
  /** Accent border color on hover, e.g. "hover:border-amber-500/20" */
  hoverAccent?: string;
  /** Top bar element (e.g. confidence bar) */
  topBar?: React.ReactNode;
}

const StrategicCard = React.forwardRef<HTMLDivElement, StrategicCardProps>(
  ({ icon, title, summary, tags, actions, expandableContent, hoverAccent, topBar, className, children, ...props }, ref) => {
    const [expanded, setExpanded] = useState(false);
    const hasExpandable = !!expandableContent;

    return (
      <div
        ref={ref}
        className={cn(
          "glass-card rounded-2xl border border-border/10 overflow-hidden transition-all",
          hoverAccent || "hover:border-primary/20",
          className
        )}
        {...props}
      >
        {topBar}

        <div className="card-pad">
          {/* Header row */}
          <div className="flex items-start gap-4">
            {icon && (
              <div className="flex-shrink-0 mt-0.5">{icon}</div>
            )}
            <div className="flex-1 min-w-0 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <h4 className="text-sm font-semibold text-foreground leading-snug break-words">{title}</h4>
                {hasExpandable && (
                  <button
                    onClick={() => setExpanded(!expanded)}
                    className="flex-shrink-0 p-1 rounded-md hover:bg-secondary/40 transition-colors"
                  >
                    {expanded
                      ? <ChevronUp className="w-4 h-4 text-muted-foreground/40" />
                      : <ChevronDown className="w-4 h-4 text-muted-foreground/40" />
                    }
                  </button>
                )}
              </div>

              {summary && <ExpandableText text={summary} lines={3} />}
              {tags && <div className="flex flex-wrap items-center gap-1.5 pt-1">{tags}</div>}
              {actions && <div className="flex flex-wrap items-center gap-2 pt-2">{actions}</div>}
              {children}
            </div>
          </div>

          {/* Expandable content */}
          {hasExpandable && expanded && (
            <div className="mt-4 pt-4 border-t border-border/8 space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
              {expandableContent}
            </div>
          )}
        </div>
      </div>
    );
  }
);
StrategicCard.displayName = "StrategicCard";

/* ── Metric Card ── */
interface MetricCardProps {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  active?: boolean;
  onClick?: () => void;
}

export const MetricCard = ({ icon, label, value, active, onClick }: MetricCardProps) => (
  <button
    onClick={onClick}
    className={cn(
      "flex-1 card-pad rounded-2xl border transition-all tactile-press",
      active
        ? "bg-primary/10 border-primary/30 shadow-lg shadow-primary/5"
        : "glass-card"
    )}
  >
    <div className="flex items-center gap-3 mb-2">
      {icon}
      <span className="text-metric text-foreground">{value}</span>
    </div>
    <span className="text-label">{label}</span>
  </button>
);

export default StrategicCard;
