import { Sparkles } from "lucide-react";
import { ButtonAI } from "@/components/systemb";

/**
 * AskAuraButton — the single sanctioned cyan→blue gradient in the system.
 * Lives in the page header and opens the existing Aura chat sidebar.
 */
export default function AskAuraButton({ onClick }: { onClick: () => void }) {
  return (
    <ButtonAI
      onClick={onClick}
      data-tour="nav-ask-aura"
      data-testid="header-ask-aura"
      aria-label="Ask Aura"
    >
      <Sparkles size={15} strokeWidth={2} />
      <span className="hidden sm:inline">Ask Aura</span>
    </ButtonAI>
  );
}
