import { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import AuraLogo from "@/components/brand/AuraLogo";

/**
 * AdminShell — System-A dark instrument shell for the /admin/* surfaces.
 * Provides a uniform top bar (logo + admin-nav) and an optional page title
 * block. Content logic stays inside the page; this is chrome only.
 */

type AdminShellProps = {
  title?: string;
  subtitle?: string;
  children: ReactNode;
  /**
   * When the page renders an edge-to-edge surface (e.g. AdminStandard's
   * iframe) the inner content padding/centering is suppressed.
   */
  bleed?: boolean;
};

const NAV: { to: string; label: string }[] = [
  { to: "/admin", label: "Overview" },
  { to: "/admin/access", label: "Access" },
  { to: "/admin/experience", label: "Experience" },
  { to: "/admin/design-system", label: "Design system" },
  { to: "/admin/qa", label: "QA" },
  { to: "/admin/guide-health", label: "Guide health" },
  { to: "/admin/standard", label: "Standard" },
];

export default function AdminShell({ title, subtitle, children, bleed = false }: AdminShellProps) {
  const { pathname } = useLocation();

  return (
    <div
      className="observatory-page"
      style={{
        minHeight: "100vh",
        width: "100%",
        background: "var(--ob-bg)",
        color: "var(--glass)",
        fontFamily: "DM Sans, system-ui, sans-serif",
      }}
    >
      <header
        style={{
          borderBottom: "1px solid var(--hair)",
          background: "var(--ob-bg)",
          position: "sticky",
          top: 0,
          zIndex: 20,
          backdropFilter: "saturate(140%)",
        }}
      >
        <div
          style={{
            maxWidth: 1280,
            margin: "0 auto",
            padding: "14px 24px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 24,
          }}
        >
          <Link to="/admin" style={{ display: "inline-flex", alignItems: "center" }}>
            <AuraLogo size={26} variant="dark" withWordmark />
          </Link>
          <nav style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {NAV.map((item) => {
              const active =
                item.to === "/admin"
                  ? pathname === "/admin"
                  : pathname === item.to || pathname.startsWith(item.to + "/");
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  style={{
                    fontSize: 12,
                    padding: "6px 12px",
                    borderRadius: 6,
                    letterSpacing: "0.02em",
                    border: `1px solid ${active ? "var(--hair)" : "transparent"}`,
                    background: active ? "var(--ob-panel)" : "transparent",
                    color: active ? "var(--glass)" : "var(--glass-2)",
                    textDecoration: "none",
                    transition: "background-color .2s ease, color .2s ease",
                  }}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      {bleed ? (
        <>{children}</>
      ) : (
        <div style={{ maxWidth: 1280, margin: "0 auto", padding: "32px 24px 80px" }}>
          {title && (
            <div style={{ marginBottom: 28 }}>
              <h1
                style={{
                  fontFamily: "'Cormorant Garamond', Georgia, serif",
                  fontSize: 36,
                  letterSpacing: "0.01em",
                  margin: 0,
                  color: "var(--glass)",
                  fontWeight: 500,
                }}
              >
                {title}
              </h1>
              {subtitle && (
                <p style={{ marginTop: 6, fontSize: 14, color: "var(--glass-2)" }}>{subtitle}</p>
              )}
            </div>
          )}
          {children}
        </div>
      )}
    </div>
  );
}