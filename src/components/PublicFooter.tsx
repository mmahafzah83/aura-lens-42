import { Link } from "react-router-dom";

interface Props {
  forceDark?: boolean;
}

const PublicFooter = ({ forceDark = false }: Props) => {
  // System-A: forceDark → dark Instrument (--ob-bg/--glass); default → bone.
  const textColor = forceDark ? "var(--glass-3)" : "var(--ink-3)";
  const linkColor = forceDark ? "var(--glass-2)" : "var(--ink-3)";
  const hoverColor = "var(--action)";
  const borderColor = forceDark ? "var(--hair)" : "var(--rule)";
  const bgColor = forceDark ? "var(--ob-bg)" : "transparent";

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
        background: bgColor,
        fontFamily: "var(--font-body)",
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