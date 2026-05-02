import { HelpCircle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface Props {
  text: string;
  label?: string;
  className?: string;
}

const InfoTooltip = ({ text, label, className }: Props) => (
  <TooltipProvider delayDuration={150}>
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label ? `Info: ${label}` : "More info"}
          className={"inline-flex items-center justify-center align-middle " + (className || "")}
          style={{
            background: "none",
            border: 0,
            padding: 2,
            marginLeft: 6,
            color: "hsl(var(--muted-foreground))",
            cursor: "help",
            lineHeight: 0,
          }}
          onClick={(e) => e.preventDefault()}
        >
          <HelpCircle size={14} strokeWidth={1.75} />
        </button>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        align="center"
        collisionPadding={12}
        className="max-w-[280px] text-xs leading-relaxed"
        style={{ fontFamily: "'DM Sans', sans-serif" }}
      >
        {text}
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>
);

export default InfoTooltip;
