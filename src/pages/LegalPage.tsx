import { Link } from "react-router-dom";

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
  return (
    <div style={{ background: "var(--paper)", color: "var(--ink)", minHeight: "100vh", fontFamily: "var(--font-body)" }}>
      <header
        className="flex items-center justify-between px-5 sm:px-10 py-5"
        style={{ borderBottom: "1px solid var(--surface-ink-subtle)" }}
      >
        <Link
          to="/"
          className="text-sm font-bold tracking-[0.15em]"
          style={{ color: "var(--brand)", fontFamily: "var(--font-display)" }}
        >
          AURA
        </Link>
        <nav className="flex gap-6 text-xs" style={{ color: "var(--ink-4)" }}>
          <Link to="/terms">Terms</Link>
          <Link to="/privacy">Privacy</Link>
          <Link to="/auth">Sign in</Link>
        </nav>
      </header>

      <main className="max-w-2xl mx-auto px-5 sm:px-10 py-16">
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
                className="text-lg mb-3"
                style={{ fontFamily: "var(--font-display)", color: "var(--ink)" }}
              >
                {i + 1}. {s.title}
              </h2>
              <p className="text-sm leading-relaxed" style={{ color: "var(--ink-2, var(--ink))" }}>
                {s.body}
              </p>
            </section>
          ))}
        </div>
      </main>

      <footer
        className="py-10 px-5 sm:px-10 text-center"
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
        <div className="mt-3 flex justify-center gap-4 text-[11px]" style={{ color: "var(--ink-4)" }}>
          <Link to="/terms">Terms</Link>
          <Link to="/privacy">Privacy</Link>
        </div>
      </footer>
    </div>
  );
};

export default LegalPage;