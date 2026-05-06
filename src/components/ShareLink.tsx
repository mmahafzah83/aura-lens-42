import { Linkedin } from "lucide-react";

interface Props {
  label: string;
  onClick: () => void;
  ariaLabel?: string;
}

/**
 * Small subtle inline share link — used across the app where users have a
 * shareable achievement (positioning, milestone, score jump, etc.).
 */
const ShareLink = ({ label, onClick, ariaLabel }: Props) => (
  <button
    type="button"
    onClick={onClick}
    aria-label={ariaLabel || label}
    className="aura-share-link"
    data-external="true"
    style={{
      background: "transparent",
      border: 0,
      padding: 0,
      cursor: "pointer",
      color: "var(--ink-3)",
      fontSize: 11,
      display: "inline-flex",
      alignItems: "center",
      gap: 5,
      transition: "color 150ms ease",
    }}
    onMouseEnter={(e) => (e.currentTarget.style.color = "var(--brand)")}
    onMouseLeave={(e) => (e.currentTarget.style.color = "var(--ink-3)")}
  >
    <Linkedin size={11} />
    {label}
  </button>
);

export default ShareLink;