import { Link } from "react-router-dom";

interface Props {
  forceDark?: boolean;
}

const PublicFooter = ({ forceDark = false }: Props) => {
  const textColor = forceDark ? "rgba(255,255,255,0.4)" : "var(--ink-4)";
  const linkColor = forceDark ? "rgba(255,255,255,0.55)" : "var(--ink-3)";
  const hoverColor = forceDark ? "#D4B056" : "var(--bronze)";
  const borderColor = forceDark
    ? "rgba(212,176,86,0.15)"
    : "var(--brand-line)";

  const linkStyle: React.CSSProperties = {
    color: linkColor,
    transition: "color 150ms ease",
    textDecoration: "none",
  };

  const onEnter = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.currentTarget.style.color = hoverColor;
  };
  const onLeave = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.currentTarget.style.color = linkColor;
  };

  return (
    <footer
      style={{
        marginTop: "auto",
        padding: "24px 16px",
        textAlign: "center",
        fontSize: 12,
        color: textColor,
        borderTop: `1px solid ${borderColor}`,
        background: "transparent",
        fontFamily: "'DM Sans', sans-serif",
      }}
    >
      <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
        <span>© 2026 Aura Intelligence</span>
        <span aria-hidden style={{ opacity: 0.5 }}>·</span>
        <Link to="/terms" style={linkStyle} onMouseEnter={onEnter} onMouseLeave={onLeave}>
          Terms
        </Link>
        <span aria-hidden style={{ opacity: 0.5 }}>·</span>
        <Link to="/privacy" style={linkStyle} onMouseEnter={onEnter} onMouseLeave={onLeave}>
          Privacy
        </Link>
        <span aria-hidden style={{ opacity: 0.5 }}>·</span>
        <Link to="/guide" style={linkStyle} onMouseEnter={onEnter} onMouseLeave={onLeave}>
          Guide
        </Link>
        <span aria-hidden style={{ opacity: 0.5 }}>·</span>
        <a
          href="mailto:support@aura-intel.org"
          style={linkStyle}
          onMouseEnter={onEnter}
          onMouseLeave={onLeave}
        >
          support@aura-intel.org
        </a>
      </div>
    </footer>
  );
};

export default PublicFooter;