import { Sparkles } from "lucide-react";
import { ButtonAI } from "@/components/systemb";
import { useTranslation } from "react-i18next";

/**
 * AskAuraButton — the single sanctioned cyan→blue gradient in the system.
 * Lives in the page header and opens the existing Aura chat sidebar.
 */
export default function AskAuraButton({ onClick }: { onClick: () => void }) {
  const { t } = useTranslation();
  return (
    <ButtonAI
      onClick={onClick}
      data-tour="nav-ask-aura"
      data-testid="header-ask-aura"
      aria-label={t("frame.header.yourDesk")}
    >
      <Sparkles size={15} strokeWidth={2} />
      <span className="hidden sm:inline">{t("frame.header.yourDesk")}</span>
    </ButtonAI>
  );
}
