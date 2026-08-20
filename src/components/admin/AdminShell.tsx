import { ReactNode, useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import AuraLogo from "@/components/brand/AuraLogo";
import { supabase } from "@/integrations/supabase/client";

/**
 * AdminShell — System-B "Signal" console chrome.
 *
 * Two bands: a Night masthead (identity, build, back door, avatar) and a
 * light section bar holding the console nav. Content logic stays inside the
 * page; this is chrome only.
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
  { to: "/admin/people", label: "People" },
  { to: "/admin/journey", label: "Journey" },
  { to: "/admin/cost", label: "Cost" },
  { to: "/admin/crons", label: "Crons" },
  { to: "/admin/access", label: "Access" },
  { to: "/admin/qa", label: "QA" },
  { to: "/admin/guide-health", label: "Guide health" },
  { to: "/admin/appearance", label: "Appearance" },
  { to: "/admin/standard", label: "Standard" },
];

const INTER = "Inter, ui-sans-serif, system-ui, -apple-system, sans-serif";
const MONO = "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace";

const env = (import.meta as any).env ?? {};
const injectedSha = typeof __BUILD_SHA__ !== "undefined" ? __BUILD_SHA__ : "";
const injectedTime = typeof __BUILD_TIME__ !== "undefined" ? __BUILD_TIME__ : "";
const SHA = String(env.VITE_COMMIT_SHA ?? env.VITE_GIT_SHA ?? injectedSha ?? "").slice(0, 7);
const BRANCH = String(env.VITE_GIT_BRANCH ?? (env.DEV ? "local" : "main"));
function buildStamp(): string {
  const iso = String(injectedTime || "");
  const d = iso ? new Date(iso) : new Date();
  if (isNaN(d.getTime())) return "built just now";
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  const day = d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return `built ${time} · ${day}`;
}
const BUILD_ID = SHA ? `${SHA} · ${BRANCH}` : buildStamp();


const SHELL_CSS = `
.ac-shell a:focus-visible, .ac-shell button:focus-visible {
  outline: 2px solid #0670C4; outline-offset: 2px; border-radius: 6px;
}
.ac-navbar { overflow-x: auto; overflow-y: hidden; -webkit-overflow-scrolling: touch; scrollbar-width: none; }
.ac-navbar::-webkit-scrollbar { display: none; }
.ac-link { transition: color 160ms ease, border-color 160ms ease; }
.ac-link:hover { color: #0F1519; }
.ac-back:hover { background: rgba(255,255,255,.08); }
.ac-body { padding: 32px 24px 80px; }
@media (max-width: 860px) {
  .ac-sha { display: none; }
  .ac-body { padding: 24px 16px 64px; }
}
@media (prefers-reduced-motion: reduce) {
  .ac-shell *, .ac-shell *::before, .ac-shell *::after {
    transition-duration: .01ms !important; animation-duration: .01ms !important;
  }
}
`;

function useInitials() {
  const [initials, setInitials] = useState("A");
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (cancelled) return;
      const u = session?.user;
      const name = String(
        (u?.user_metadata as any)?.full_name ?? (u?.user_metadata as any)?.name ?? u?.email ?? "A",
      );
      const parts = name.replace(/@.*/, "").split(/[\s._-]+/).filter(Boolean);
      const ini = ((parts[0]?.[0] ?? "A") + (parts[1]?.[0] ?? "")).toUpperCase();
      setInitials(ini);
    })();
    return () => { cancelled = true; };
  }, []);
  return initials;
}

export default function AdminShell({ title, subtitle, children, bleed = false }: AdminShellProps) {
  const { pathname } = useLocation();
  const initials = useInitials();

  return (
    <div
      className="ac-shell"
      style={{
        minHeight: "100vh",
        width: "100%",
        background: "#F2F5F9",
        color: "#0F1519",
        fontFamily: INTER,
      }}
    >
      <style>{SHELL_CSS}</style>

      {/* Band 1 — Night masthead */}
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 40,
          height: 52,
          background: "#0F1519",
        }}
      >
        <div
          style={{
            maxWidth: 1240,
            margin: "0 auto",
            padding: "0 24px",
            height: 52,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            <Link
              to="/admin"
              style={{ display: "inline-flex", alignItems: "center", gap: 8, textDecoration: "none" }}
            >
              <AuraLogo size={20} variant="dark" />
              <span style={{ fontFamily: INTER, fontWeight: 700, fontSize: 15, color: "#FFFFFF" }}>Aura</span>
            </Link>
            <span
              style={{
                fontFamily: MONO,
                fontSize: 10,
                letterSpacing: ".16em",
                textTransform: "uppercase",
                padding: "3px 8px",
                borderRadius: 4,
                background: "rgba(255,255,255,.10)",
                color: "#CFE3F5",
              }}
            >
              Console
            </span>
            <span
              className="ac-sha"
              style={{
                fontFamily: MONO,
                fontSize: 10,
                fontVariantNumeric: "tabular-nums",
                color: "#8A94A3",
                whiteSpace: "nowrap",
              }}
            >
              {SHA ? `${SHA} · ${BRANCH}` : BRANCH}
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span
              aria-hidden
              style={{
                width: 6,
                height: 6,
                borderRadius: 999,
                background: "#00CEC9",
                boxShadow: "0 0 0 4px rgba(0,206,201,.20)",
              }}
            />
            <Link
              to="/home"
              className="ac-back"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                height: 32,
                minHeight: 32,
                padding: "0 12px",
                border: "1px solid rgba(255,255,255,.18)",
                borderRadius: 8,
                color: "#C3CBD4",
                fontFamily: INTER,
                fontSize: 13,
                textDecoration: "none",
                transition: "background 160ms ease",
              }}
            >
              <ArrowLeft size={14} strokeWidth={1.75} />
              <span>Back to Aura</span>
            </Link>
            <span
              aria-label="Signed in as admin"
              style={{
                width: 26,
                height: 26,
                borderRadius: 999,
                background: "#0670C4",
                color: "#FFFFFF",
                fontFamily: INTER,
                fontSize: 11,
                fontWeight: 700,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {initials}
            </span>
          </div>
        </div>
      </header>

      {/* Band 2 — section bar */}
      <div
        style={{
          position: "sticky",
          top: 52,
          zIndex: 30,
          background: "#FFFFFF",
          borderBottom: "1px solid #E2E7EE",
        }}
      >
        <div className="ac-navbar" style={{ maxWidth: 1240, margin: "0 auto", padding: "0 24px" }}>
          <nav style={{ display: "flex", alignItems: "stretch", gap: 4, minWidth: "max-content" }}>
            {NAV.map((item) => {
              const active =
                item.to === "/admin"
                  ? pathname === "/admin"
                  : pathname === item.to || pathname.startsWith(item.to + "/");
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className="ac-link"
                  aria-current={active ? "page" : undefined}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    height: 48,
                    padding: "0 12px",
                    fontFamily: INTER,
                    fontSize: 14,
                    fontWeight: active ? 600 : 500,
                    color: active ? "#0F1519" : "#5B6673",
                    borderBottom: `2px solid ${active ? "#0670C4" : "transparent"}`,
                    textDecoration: "none",
                    whiteSpace: "nowrap",
                  }}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>

      {bleed ? (
        <>{children}</>
      ) : (
        <div className="ac-body" style={{ maxWidth: 1240, margin: "0 auto" }}>
          {title && (
            <div style={{ marginBottom: 28 }}>
              <h1
                style={{
                  fontFamily: INTER,
                  fontSize: 26,
                  fontWeight: 700,
                  letterSpacing: "-0.02em",
                  margin: 0,
                  color: "#0F1519",
                }}
              >
                {title}
              </h1>
              {subtitle && (
                <p style={{ marginTop: 6, fontSize: 14, color: "#5B6673" }}>{subtitle}</p>
              )}
            </div>
          )}
          {children}
        </div>
      )}
    </div>
  );
}
