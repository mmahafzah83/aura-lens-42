import { Link, useLocation } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import AuraLogo from "@/components/brand/AuraLogo";

export interface LegalSection {
  title: string;
  body: string;
}

interface Props {
  title: string;
  updated: string;
  sections: LegalSection[];
}

const LegalPage = ({ title, updated, sections }: Props) => {
  const location = useLocation();
  const path = location.pathname;
  const isTrust = path.startsWith("/trust");
  const isTerms = path.startsWith("/terms");

  const kicker = isTrust ? "TRUST · SECURITY" : isTerms ? "LEGAL · TERMS" : "LEGAL · PRIVACY";
  const crossTo = isTerms ? "/privacy" : "/terms";
  const crossLabel = isTerms ? "Read our Privacy Policy →" : "Read our Terms of Service →";

  return (
    <div
      className="legal-cluster"
      style={{
        ["--lk" as string]: "var(--live)",
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        background: "var(--paper)",
        color: "var(--ink)",
        fontFamily: "var(--font-body)",
      }}
    >
      {/* Dark instrument top bar */}
      <header
        className="flex items-center justify-between px-6 sm:px-10 py-4 sticky top-0 z-40"
        style={{
          background: "var(--ob-bg)",
          borderBottom: "1px solid var(--hair)",
        }}
      >
        <Link
          to="/"
          className="flex items-center gap-2"
          aria-label="Aura home"
        >
          <AuraLogo size={26} variant="dark" />
          <span
            className="text-sm font-bold tracking-[0.2em]"
            style={{ color: "var(--glass)", fontFamily: "var(--font-display)" }}
          >
            AURA
          </span>
        </Link>

        <nav className="flex items-center gap-4 sm:gap-6 text-xs">
          <Link
            to="/auth"
            style={{ color: "var(--glass-2)", fontWeight: 500, transition: "color 150ms ease" }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "var(--live)")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "var(--glass-2)")}
          >
            Log in
          </Link>
          <Link
            to="/request-access"
            className="px-3 py-1.5 rounded-full text-xs font-medium"
            style={{
              background: "var(--paper-2)",
              color: "var(--ink)",
              border: "1px solid var(--hair)",
              transition: "all 150ms ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "var(--paper-3)";
              e.currentTarget.style.borderColor = "var(--live)";
              e.currentTarget.style.color = "var(--ink-2)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "var(--paper-2)";
              e.currentTarget.style.borderColor = "var(--hair)";
              e.currentTarget.style.color = "var(--ink)";
            }}
          >
            Request access
          </Link>
        </nav>
      </header>

      <main
        className="mx-auto px-5 sm:px-10 flex-1 w-full"
        style={{ maxWidth: 720, paddingTop: 64, paddingBottom: 60 }}
      >
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 mb-8"
          style={{
            fontSize: 12,
            color: "var(--ink-3)",
            transition: "color 150ms ease",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "var(--lk)")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "var(--ink-3)")}
        >
          <ArrowLeft size={13} /> Back to home
        </Link>

        <div
          className="mb-2 uppercase tracking-[0.12em]"
          style={{ color: "var(--ink-3)", fontFamily: "var(--font-mono)", fontSize: 12 }}
        >
          {kicker}
        </div>

        <h1
          className="text-3xl sm:text-4xl mb-2"
          style={{ fontFamily: "var(--font-display)", color: "var(--ink)" }}
        >
          {title}
        </h1>
        <p className="text-xs mb-12" style={{ color: "var(--ink-3)" }}>
          Last updated · {updated}
        </p>

        <div className="space-y-10">
          {sections.map((s, i) => (
            <section key={i}>
              <h2
                className="mb-4"
                style={{
                  fontFamily: "var(--font-display)",
                  color: "var(--ink)",
                  fontSize: 22,
                  lineHeight: 1.3,
                  fontWeight: 500,
                }}
              >
                <span style={{ color: "var(--live)", marginRight: 10 }}>
                  {String(i + 1).padStart(2, "0")}
                </span>
                {s.title}
              </h2>
              <p style={{ color: "var(--ink-2)", fontSize: 15, lineHeight: 1.8, whiteSpace: "pre-line" }}>
                {s.body}
              </p>
            </section>
          ))}
        </div>

        <div
          className="mt-16 pt-8 flex items-center justify-between gap-4 flex-wrap"
          style={{ borderTop: "1px solid var(--rule)" }}
        >
          <Link
            to="/"
            className="inline-flex items-center gap-1.5"
            style={{
              fontSize: 12,
              color: "var(--ink-3)",
              transition: "color 150ms ease",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "var(--lk)")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "var(--ink-3)")}
          >
            <ArrowLeft size={13} /> Back to home
          </Link>
          <Link
            to={isTrust ? "/privacy" : crossTo}
            style={{ fontSize: 12, color: "var(--lk)", fontWeight: 500 }}
          >
            {isTrust ? "Read our Privacy Policy →" : crossLabel}
          </Link>
        </div>
      </main>

      {/* Dark instrument footer */}
      <footer
        className="px-6 sm:px-10 py-10"
        style={{ background: "var(--ob-bg)", borderTop: "1px solid var(--hair)" }}
      >
        <div
          className="mx-auto flex flex-col sm:flex-row items-center justify-between gap-4"
          style={{ maxWidth: 720 }}
        >
          <div
            className="flex flex-wrap items-center justify-center gap-3 text-xs"
            style={{ fontFamily: "var(--font-mono)", color: "var(--glass-2)" }}
          >
            <Link
              to="/"
              style={{ color: "var(--glass-2)", transition: "color 150ms ease" }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "var(--glass)")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "var(--glass-2)")}
            >
              Home
            </Link>
            <span style={{ color: "var(--glass-3)" }}>·</span>
            <Link
              to="/trust"
              style={{ color: "var(--glass-2)", transition: "color 150ms ease" }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "var(--glass)")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "var(--glass-2)")}
            >
              Security & Trust
            </Link>
            <span style={{ color: "var(--glass-3)" }}>·</span>
            <Link
              to="/privacy"
              style={{ color: "var(--glass-2)", transition: "color 150ms ease" }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "var(--glass)")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "var(--glass-2)")}
            >
              Privacy
            </Link>
            <span style={{ color: "var(--glass-3)" }}>·</span>
            <Link
              to="/terms"
              style={{ color: "var(--glass-2)", transition: "color 150ms ease" }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "var(--glass)")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "var(--glass-2)")}
            >
              Terms
            </Link>
            <span style={{ color: "var(--glass-3)" }}>·</span>
            <Link
              to="/guide"
              style={{ color: "var(--glass-2)", transition: "color 150ms ease" }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "var(--glass)")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "var(--glass-2)")}
            >
              The Guide
            </Link>
          </div>
          <p
            className="text-xs"
            style={{ color: "var(--glass-3)", fontFamily: "var(--font-mono)" }}
          >
            Aura · Built in Riyadh, for the world.
          </p>
        </div>
      </footer>
    </div>
  );
};

export default LegalPage;
