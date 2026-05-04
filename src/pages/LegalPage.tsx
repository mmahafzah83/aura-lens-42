import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

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
  const navigate = useNavigate();
  const location = useLocation();
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setAuthed(!!session));
  }, []);

  const handleBack = () => {
    if (window.history.length > 1) window.history.back();
    else navigate(authed ? "/home" : "/");
  };

  const isTerms = location.pathname.startsWith("/terms");
  const isPrivacy = location.pathname.startsWith("/privacy");
  const homeHref = authed ? "/home" : "/";

  return (
    <div
      style={{
        background: "var(--paper)",
        color: "var(--ink)",
        minHeight: "100vh",
        fontFamily: "var(--font-body)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Sticky top nav */}
      <header
        className="flex items-center justify-between px-5 sm:px-10 py-4 sticky top-0 z-40"
        style={{
          borderBottom: "1px solid var(--surface-ink-subtle)",
          background: "rgba(255,255,255,0.92)",
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
        }}
      >
        <Link
          to={homeHref}
          className="text-sm font-bold tracking-[0.15em]"
          style={{ color: "var(--brand)", fontFamily: "var(--font-display)" }}
        >
          AURA
        </Link>
        <nav className="hidden sm:flex items-center gap-5 text-xs" aria-label="Legal navigation">
          <Link
            to="/terms"
            style={{
              color: isTerms ? "var(--brand)" : "var(--ink-4)",
              fontWeight: isTerms ? 600 : 400,
              transition: "color 150ms ease",
            }}
          >
            Terms
          </Link>
          <span style={{ color: "var(--ink-5)" }}>·</span>
          <Link
            to="/privacy"
            style={{
              color: isPrivacy ? "var(--brand)" : "var(--ink-4)",
              fontWeight: isPrivacy ? 600 : 400,
              transition: "color 150ms ease",
            }}
          >
            Privacy
          </Link>
        </nav>
        <Link
          to={authed ? "/home" : "/auth"}
          className="text-xs"
          style={{ color: "var(--ink-3)", fontWeight: 500 }}
        >
          {authed ? "← Back to Aura" : "Sign in"}
        </Link>
      </header>

      <main
        className="mx-auto px-5 sm:px-10 flex-1 w-full"
        style={{ maxWidth: 720, paddingTop: 80, paddingBottom: 60 }}
      >
        <button
          type="button"
          onClick={handleBack}
          className="inline-flex items-center gap-1.5 mb-8"
          style={{
            fontSize: 12,
            color: "var(--ink-3)",
            background: "transparent",
            border: 0,
            padding: 0,
            cursor: "pointer",
            transition: "color 150ms ease",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "var(--brand)")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "var(--ink-3)")}
        >
          <ArrowLeft size={13} /> Back
        </button>

        <h1
          className="text-3xl sm:text-4xl mb-2"
          style={{ fontFamily: "var(--font-display)", color: "var(--ink)" }}
        >
          {title}
        </h1>
        <p className="text-xs mb-12" style={{ color: "var(--ink-4)" }}>
          Last updated: {updated}
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
                <span style={{ color: "var(--brand)", marginRight: 8 }}>{i + 1}.</span>
                {s.title}
              </h2>
              <p style={{ color: "var(--ink)", fontSize: 15, lineHeight: 1.8 }}>
                {s.body}
              </p>
            </section>
          ))}
        </div>

        {/* Cross-link between legal pages */}
        <div
          className="mt-16 pt-8 flex items-center justify-between gap-4 flex-wrap"
          style={{ borderTop: "1px solid var(--surface-ink-subtle)" }}
        >
          <button
            type="button"
            onClick={handleBack}
            className="inline-flex items-center gap-1.5"
            style={{
              fontSize: 12,
              color: "var(--ink-3)",
              background: "transparent",
              border: 0,
              padding: 0,
              cursor: "pointer",
            }}
          >
            <ArrowLeft size={13} /> Back
          </button>
          <Link
            to={isTerms ? "/privacy" : "/terms"}
            style={{ fontSize: 12, color: "var(--brand)", fontWeight: 500 }}
          >
            {isTerms ? "Read our Privacy Policy →" : "Read our Terms of Service →"}
          </Link>
        </div>
      </main>

      <footer
        className="py-10 px-5 sm:px-10 text-center mt-auto"
        style={{ borderTop: "1px solid var(--surface-ink-subtle)" }}
      >
        <span
          className="text-sm font-bold tracking-[0.15em]"
          style={{ color: "var(--brand)", fontFamily: "var(--font-display)" }}
        >
          AURA
        </span>
        <p className="mt-2 text-[11px]" style={{ color: "var(--ink-4)" }}>
          Strategic intelligence for senior professionals.
        </p>
        <div
          className="mt-3 flex justify-center items-center gap-3 text-[11px] flex-wrap"
          style={{ color: "var(--ink-4)" }}
        >
          <Link to="/terms" style={{ color: "var(--ink-4)" }}>Terms</Link>
          <span>·</span>
          <Link to="/privacy" style={{ color: "var(--ink-4)" }}>Privacy</Link>
          <span>·</span>
          <Link to="/guide" style={{ color: "var(--ink-4)" }}>Guide</Link>
          <span>·</span>
          <Link to="/request-access" style={{ color: "var(--ink-4)" }}>Request access</Link>
          <span>·</span>
          <a href="mailto:mohammad.mahafdhah@aura-intel.org" style={{ color: "var(--ink-4)" }}>Contact</a>
        </div>
        <p className="mt-3 text-[10px]" style={{ color: "var(--ink-5)" }}>
          © {new Date().getFullYear()} Aura Intelligence. All rights reserved.
        </p>
      </footer>
    </div>
  );
};

export default LegalPage;
