import { Sparkles } from "lucide-react";

/**
 * AskAuraButton — the single sanctioned cyan→blue gradient in the system.
 * Lives in the page header and opens the existing Aura chat sidebar.
 */
export default function AskAuraButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-tour="nav-ask-aura"
      data-testid="header-ask-aura"
      aria-label="Ask Aura"
      className="cursor-pointer inline-flex items-center"
      style={{
        gap: 7, height: 38, padding: "0 14px", borderRadius: 8, border: 0,
        background: "var(--v23-ask-bg)", color: "var(--text-inverse)",
        boxShadow: "var(--v23-ask-glow)", cursor: "pointer",
        fontFamily: "var(--ff-ui)", fontSize: 13, fontWeight: 600,
        transition: "transform 150ms ease, box-shadow 150ms ease",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-1px)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = "none"; }}
    >
      <Sparkles size={15} strokeWidth={2} />
      <span className="hidden sm:inline">Ask Aura</span>
    </button>
  );
}
