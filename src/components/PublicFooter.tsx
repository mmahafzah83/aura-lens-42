import { Link } from "react-router-dom";

/**
 * Canonical public footer — always the dark instrument treatment.
 * Sits at the bottom of any flex-column page via marginTop:auto.
 */
const LINKS: Array<{ label: string; to: string }> = [
  { label: "Home", to: "/" },
  { label: "Our Story", to: "/our-story" },
  { label: "The Guide", to: "/guide" },
  { label: "Security & Trust", to: "/trust" },
  { label: "Privacy", to: "/privacy" },
  { label: "Terms", to: "/terms" },
];

const linkStyle: React.CSSProperties = {
  color: "var(--glass-2)",
  transition: "color 150ms ease",
  textDecoration: "none",
};

const onEnter = (e: React.MouseEvent<HTMLAnchorElement>) => {
  e.currentTarget.style.color = "var(--glass)";
};
const onLeave = (e: React.MouseEvent<HTMLAnchorElement>) => {
  e.currentTarget.style.color = "var(--glass-2)";
};

const PublicFooter = () => {
  return (
    <footer
      className="px-6 sm:px-10 py-10"
      style={{
        marginTop: "auto",
        background: "var(--ob-bg)",
        borderTop: "1px solid var(--hair)",
        fontFamily: "var(--font-mono)",
      }}
    >
      <div
        className="mx-auto flex flex-col sm:flex-row items-center sm:items-start justify-between gap-4"
        style={{ maxWidth: 720 }}
      >
        <div
          className="flex flex-wrap items-center justify-center sm:justify-start gap-x-3 gap-y-2 text-xs"
          style={{ color: "var(--glass-2)" }}
        >
          {LINKS.map((l, i) => (
            <span key={l.to} className="flex items-center gap-3">
              <Link to={l.to} style={linkStyle} onMouseEnter={onEnter} onMouseLeave={onLeave}>
                {l.label}
              </Link>
              {i < LINKS.length - 1 && (
                <span aria-hidden style={{ color: "var(--glass-3)" }}>·</span>
              )}
            </span>
          ))}
        </div>

        <div
          className="flex flex-col items-center sm:items-end gap-1 text-xs"
          style={{ color: "var(--glass-3)" }}
        >
          <a
            href="mailto:support@aura-intel.org"
            style={linkStyle}
            onMouseEnter={onEnter}
            onMouseLeave={onLeave}
          >
            support@aura-intel.org
          </a>
          <span>© 2026 Aura · Built in Riyadh, for the world.</span>
        </div>
      </div>
    </footer>
  );
};

export default PublicFooter;