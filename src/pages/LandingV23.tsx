import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import usePageMeta from "@/hooks/usePageMeta";
import {
  Card,
  Kicker,
  Lede,
  Reveal,
  Section,
  SectionTitle,
  SoonChip,
  grid,
} from "@/components/landing-v23/primitives";

/* ────────────────────────────────────────────────────────────────
   Landing — V23 s-land. Public, logged-out surface. Tokens only.
   Every number on this page is either founder-owned static copy or
   a cited third-party statistic. Nothing here reads the database.
   ──────────────────────────────────────────────────────────────── */

const NIGHT_TEXT = "var(--v23-on-night)";

/* ── shared CTA links ── */

const CtaPrimary: React.FC<{ to: string; children: React.ReactNode; small?: boolean }> = ({
  to,
  children,
  small,
}) => (
  <Link
    to={to}
    style={{
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      background: "var(--v23-btn-bg)",
      color: "var(--text-inverse)",
      boxShadow: "var(--v23-btn-inset), var(--v23-btn-shadow)",
      borderRadius: 8,
      padding: small ? "9px 14px" : "13px 22px",
      fontFamily: "var(--font-body)",
      fontSize: small ? 12.5 : 14,
      fontWeight: 600,
      textDecoration: "none",
      whiteSpace: "nowrap",
    }}
  >
    {children}
  </Link>
);

const CtaGhost: React.FC<{
  href?: string;
  to?: string;
  night?: boolean;
  children: React.ReactNode;
  small?: boolean;
}> = ({ href, to, night, children, small }) => {
  const style: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    background: "transparent",
    color: night ? "var(--text-inverse)" : "var(--text-primary)",
    border: `1px solid ${night ? "var(--v23-night-line)" : "var(--border-default)"}`,
    borderRadius: 8,
    padding: small ? "9px 14px" : "13px 22px",
    fontFamily: "var(--font-body)",
    fontSize: small ? 12.5 : 14,
    fontWeight: 600,
    textDecoration: "none",
    whiteSpace: "nowrap",
  };
  if (to) return <Link to={to} style={style}>{children}</Link>;
  return <a href={href} style={style}>{children}</a>;
};

/* ── 1 · NAV ── */

const ANCHORS = [
  { href: "#how", label: "How it works" },
  { href: "#overnight", label: "The Overnight" },
  { href: "#founding", label: "Founding Circle" },
];

const Nav: React.FC = () => {
  const [solid, setSolid] = useState(false);
  useEffect(() => {
    const onScroll = () => setSolid(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 40,
        background: solid ? "var(--v23-night)" : "transparent",
        borderBottom: `1px solid ${solid ? "var(--v23-night-line)" : "transparent"}`,
        transition: "background 200ms ease, border-color 200ms ease",
      }}
    >
      <nav
        style={{
          maxWidth: 1120,
          margin: "0 auto",
          padding: "14px 20px",
          display: "flex",
          alignItems: "center",
          gap: 18,
        }}
      >
        <Link
          to="/"
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 18,
            fontWeight: 600,
            letterSpacing: "-0.01em",
            color: "var(--text-inverse)",
            textDecoration: "none",
          }}
        >
          Aura
        </Link>

        <div style={{ flex: 1 }} />

        <div className="hidden md:flex" style={{ alignItems: "center", gap: 22 }}>
          {ANCHORS.map((a) => (
            <a
              key={a.href}
              href={a.href}
              style={{
                fontSize: 13,
                color: NIGHT_TEXT,
                textDecoration: "none",
                fontFamily: "var(--font-body)",
              }}
            >
              {a.label}
            </a>
          ))}
        </div>

        <Link
          to="/auth"
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: "var(--text-inverse)",
            textDecoration: "none",
            fontFamily: "var(--font-body)",
          }}
        >
          Sign in
        </Link>
        <CtaPrimary to="/request-access" small>
          Request access
        </CtaPrimary>
      </nav>
    </header>
  );
};

/* ── 2 · HERO ── */

/** Honest product frame: real chrome, no invented data inside. */
const BrowserFrame: React.FC = () => (
  <div
    style={{
      border: "1px solid var(--v23-night-line)",
      borderRadius: 12,
      overflow: "hidden",
      background: "var(--v23-night-lift)",
      boxShadow: "0 24px 60px rgba(0,0,0,.38)",
    }}
  >
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 14px",
        borderBottom: "1px solid var(--v23-night-line)",
        background: "var(--v23-night)",
      }}
    >
      <div style={{ display: "flex", gap: 6 }}>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            style={{
              width: 9,
              height: 9,
              borderRadius: 999,
              background: "var(--v23-night-hover)",
              display: "block",
            }}
          />
        ))}
      </div>
      <div
        style={{
          flex: 1,
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          color: NIGHT_TEXT,
          background: "var(--v23-night-lift)",
          border: "1px solid var(--v23-night-line)",
          borderRadius: 6,
          padding: "5px 10px",
          textAlign: "center",
        }}
      >
        aura-intel.org/home
      </div>
    </div>
    <div
      aria-hidden="true"
      style={{
        height: "clamp(220px, 30vw, 340px)",
        background:
          "linear-gradient(180deg, var(--v23-night-lift), var(--v23-night))",
      }}
    />
  </div>
);

const Hero: React.FC = () => (
  <div
    style={{
      background: "var(--v23-night)",
      padding: "clamp(48px, 8vw, 96px) 20px clamp(56px, 8vw, 104px)",
    }}
  >
    <div style={{ maxWidth: 1120, margin: "0 auto" }}>
      <Reveal>
        <Kicker tone="machine">
          The Overnight — your personal intelligence team — worked while you slept
        </Kicker>

        <h1
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "clamp(38px, 7vw, 82px)",
            lineHeight: 1.02,
            letterSpacing: "-0.035em",
            fontWeight: 600,
            color: "var(--text-inverse)",
            margin: 0,
            maxWidth: "16ch",
          }}
        >
          Your name should <em style={{ fontStyle: "italic" }}>arrive</em> before you do.
        </h1>

        <p
          style={{
            marginTop: 26,
            maxWidth: "62ch",
            fontSize: "clamp(15px, 1.6vw, 19px)",
            lineHeight: 1.62,
            color: NIGHT_TEXT,
          }}
        >
          First it works out who you actually are — the subjects you own, the capability you can
          prove, the gaps you cannot see. Then a team of agents builds the evidence, night after
          night, out of work you are already doing. Until the market knows your name before it
          meets you.
        </p>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 32 }}>
          <CtaPrimary to="/request-access">Request a place</CtaPrimary>
          <CtaGhost href="#how" night>
            See how it works
          </CtaGhost>
        </div>

        <div
          style={{
            marginTop: 22,
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            letterSpacing: "0.08em",
            color: "var(--machine)",
          }}
        >
          Invite only · 10 of 50 founding places taken
        </div>
      </Reveal>

      <Reveal delay={120} style={{ marginTop: "clamp(40px, 6vw, 72px)" }}>
        <BrowserFrame />
      </Reveal>
    </div>
  </div>
);

/* ── 3 · VALUE MATH ── */

const MATH = [
  { label: "What you already own", value: "156 hrs", note: "The reading, the calls, the papers you actually got through this year." },
  { label: "What survived", value: "0", note: "None of it is written down anywhere the market can see it." },
  { label: "What it already costs you", value: "$2,460", note: "Time you have already spent, producing nothing that compounds." },
  { label: "What it becomes", value: "Top 3", note: "A named position on the subjects you own.", accent: true },
];

const ValueMath: React.FC = () => (
  <Section>
    <Reveal>
      <Kicker>The value math</Kicker>
      <SectionTitle>You are already doing the work. None of it survives.</SectionTitle>
    </Reveal>
    <div style={{ ...grid(240), marginTop: 40 }}>
      {MATH.map((m, i) => (
        <Reveal key={m.label} delay={i * 60}>
          <Card accent={m.accent} style={{ height: "100%" }}>
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10.5,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: m.accent ? "var(--act)" : "var(--text-muted)",
              }}
            >
              {m.accent ? "◆ " : ""}
              {m.label}
            </div>
            <div
              style={{
                fontFamily: "var(--font-display)",
                fontSize: 38,
                fontWeight: 600,
                letterSpacing: "-0.03em",
                marginTop: 12,
                color: m.accent ? "var(--act)" : "var(--text-primary)",
              }}
            >
              {m.value}
            </div>
            <p style={{ marginTop: 10, fontSize: 13.5, lineHeight: 1.55, color: "var(--text-secondary)" }}>
              {m.note}
            </p>
          </Card>
        </Reveal>
      ))}
    </div>
    <Reveal delay={120}>
      <p
        style={{
          marginTop: 32,
          fontSize: "clamp(16px, 2vw, 22px)",
          lineHeight: 1.5,
          color: "var(--text-primary)",
          maxWidth: "52ch",
        }}
      >
        A working month of thinking, written off every year… one tap a link.
      </p>
    </Reveal>
  </Section>
);

/* ── 4 · TWO WAYS IT GOES WRONG ── */

const WrongWays: React.FC = () => (
  <Section>
    <Reveal>
      <Kicker>Two ways it goes wrong</Kicker>
      <SectionTitle>Feast, then famine. Both leave you invisible.</SectionTitle>
    </Reveal>
    <div style={{ ...grid(300), marginTop: 40 }}>
      <Reveal>
        <Card style={{ height: "100%" }}>
          <h3 style={{ fontSize: 19, fontWeight: 600, margin: 0, color: "var(--text-primary)" }}>
            The feast
          </h3>
          <p style={{ marginTop: 12, fontSize: 14.5, lineHeight: 1.6, color: "var(--text-secondary)" }}>
            A good week. Four posts, a talk, a comment thread that goes somewhere. Then the quarter
            closes and none of it is repeated. The market reads it as a mood, not a position.
          </p>
        </Card>
      </Reveal>
      <Reveal delay={80}>
        <Card style={{ height: "100%" }}>
          <h3 style={{ fontSize: 19, fontWeight: 600, margin: 0, color: "var(--text-primary)" }}>
            The famine
          </h3>
          <p style={{ marginTop: 12, fontSize: 14.5, lineHeight: 1.6, color: "var(--text-secondary)" }}>
            Eleven weeks of silence. Not because you stopped thinking — because nothing turned the
            thinking into something publishable while the week was still moving.
          </p>
        </Card>
      </Reveal>
    </div>
    <Reveal delay={120}>
      <p
        style={{
          marginTop: 32,
          fontSize: "clamp(16px, 2vw, 22px)",
          lineHeight: 1.5,
          color: "var(--text-primary)",
          maxWidth: "48ch",
        }}
      >
        That is a systems problem, not a discipline problem.
      </p>
    </Reveal>
  </Section>
);

/* ── 5 · WHAT ONLY YOU HAVE ── */

const ONLY_YOU = [
  {
    title: "The corridor",
    body: "What was actually said after the meeting ended — the part that never made the minutes.",
  },
  {
    title: "The steering committee",
    body: "The decision you watched get made, and the three reasons it nearly went the other way.",
  },
  {
    title: "The report you were sent",
    body: "The document that landed in your inbox because of who you are, not because it was public.",
  },
];

const OnlyYou: React.FC = () => (
  <Section>
    <Reveal>
      <Kicker>What only you have</Kicker>
      <SectionTitle>The material is proprietary. That is the whole advantage.</SectionTitle>
    </Reveal>
    <div style={{ ...grid(280), marginTop: 40 }}>
      {ONLY_YOU.map((o, i) => (
        <Reveal key={o.title} delay={i * 70}>
          <Card style={{ height: "100%" }}>
            <h3 style={{ fontSize: 18, fontWeight: 600, margin: 0, color: "var(--text-primary)" }}>
              {o.title}
            </h3>
            <p style={{ marginTop: 10, fontSize: 14, lineHeight: 1.6, color: "var(--text-secondary)" }}>
              {o.body}
            </p>
          </Card>
        </Reveal>
      ))}
    </div>
    <Reveal delay={120}>
      <p
        style={{
          marginTop: 32,
          fontSize: "clamp(16px, 2vw, 22px)",
          color: "var(--text-primary)",
          maxWidth: "44ch",
        }}
      >
        Nobody can prompt their way to this.
      </p>
    </Reveal>
  </Section>
);

/* ── 6 · MEASURED NOT ASSERTED ── */

const STATS = [
  { value: "54%", label: "of long-form LinkedIn posts were likely AI-generated", source: "Originality.ai · Oct 2024" },
  { value: "41%", label: "of LinkedIn posts over 250 words are fully AI-written", source: "Pangram Labs · Jul 2026" },
  { value: "53.7%", label: "still likely AI a year later — the flood did not recede", source: "Originality.ai · Jan 2026" },
  {
    value: "708 vs 143",
    label: "average likes + comments per post, human vs AI, in innovation & strategy",
    source: "Originality.ai · Jan 2026",
  },
];

const Measured: React.FC = () => (
  <Section night>
    <Reveal>
      <Kicker tone="machine">Measured, not asserted</Kicker>
      <SectionTitle night>The internet already knows what a machine sounds like.</SectionTitle>
    </Reveal>
    <div style={{ ...grid(230), marginTop: 40 }}>
      {STATS.map((s, i) => (
        <Reveal key={s.value} delay={i * 60}>
          <div
            style={{
              background: "var(--v23-night-lift)",
              border: "1px solid var(--v23-night-line)",
              borderRadius: 12,
              padding: 22,
              height: "100%",
            }}
          >
            <div
              style={{
                fontFamily: "var(--font-display)",
                fontSize: 34,
                fontWeight: 600,
                letterSpacing: "-0.03em",
                color: "var(--text-inverse)",
              }}
            >
              {s.value}
            </div>
            <p style={{ marginTop: 10, fontSize: 13.5, lineHeight: 1.55, color: NIGHT_TEXT }}>
              {s.label}
            </p>
            <div
              style={{
                marginTop: 12,
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "var(--machine)",
              }}
            >
              {s.source}
            </div>
          </div>
        </Reveal>
      ))}
    </div>
    <Reveal delay={100}>
      <p
        style={{
          marginTop: 26,
          fontSize: 14,
          lineHeight: 1.65,
          color: NIGHT_TEXT,
          maxWidth: "60ch",
        }}
      >
        The same study found the opposite in motivational content, where AI posts outperformed
        humans by 75%. The penalty is not universal — it lands hardest in the sectors that trade on
        credibility.
      </p>
      <p
        style={{
          marginTop: 34,
          fontSize: "clamp(16px, 2vw, 22px)",
          lineHeight: 1.5,
          color: "var(--text-inverse)",
          maxWidth: "50ch",
        }}
      >
        Read the last number again.
      </p>
    </Reveal>
  </Section>
);

/* ── 7 · HOW IT WORKS ── */

const STEPS = [
  { n: "01", t: "You capture", b: "A link, a document, a voice note. One tap, on the way out of the meeting." },
  { n: "02", t: "Aura finds the signal", b: "It reads across everything you have captured and works out what is actually repeating." },
  { n: "03", t: "The Overnight writes", b: "While you sleep, a draft is built from your own material, in your own register." },
  { n: "04", t: "You publish or bin it", b: "One read. Ship it, edit it, or throw it away — the system learns either way." },
];

const HowItWorks: React.FC = () => (
  <Section id="how">
    <Reveal>
      <Kicker>How it works</Kicker>
      <SectionTitle>Four steps. Three of them happen without you.</SectionTitle>
    </Reveal>
    <div style={{ ...grid(240), marginTop: 40 }}>
      {STEPS.map((s, i) => (
        <Reveal key={s.n} delay={i * 60}>
          <Card style={{ height: "100%" }}>
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                letterSpacing: "0.12em",
                color: "var(--machine-text)",
              }}
            >
              {s.n}
            </div>
            <h3 style={{ marginTop: 12, fontSize: 18, fontWeight: 600, color: "var(--text-primary)" }}>
              {s.t}
            </h3>
            <p style={{ marginTop: 8, fontSize: 13.5, lineHeight: 1.6, color: "var(--text-secondary)" }}>
              {s.b}
            </p>
          </Card>
        </Reveal>
      ))}
    </div>
  </Section>
);

/* ── 8 · WHY IT WORKS IN THIS ORDER ── */

const LADDER = [
  { n: "05", t: "The market knows your name before it meets you." },
  { n: "04", t: "Because you publish something worth reading, repeatedly." },
  { n: "03", t: "Because a draft exists on the morning you have time for it." },
  { n: "02", t: "Because the system found the signal in what you captured." },
  { n: "01", t: "Because you captured the thing at all." },
];

const SOON_ROWS = [
  { t: "What you are worth", b: "A read on the market value of the position you have built." },
  { t: "Gap to the role above", b: "The capability evidence you are missing for the next seat." },
  { t: "CV from evidence", b: "A record assembled from what you proved, not what you claimed." },
];

const Ladder: React.FC = () => (
  <Section>
    <Reveal>
      <Kicker>Why it works in this order</Kicker>
      <SectionTitle>Read it upwards. Every rung depends on the one below.</SectionTitle>
    </Reveal>

    <div style={{ marginTop: 40, maxWidth: 780 }}>
      <Reveal>
        <Card accent>
          <div style={{ display: "flex", gap: 12, alignItems: "baseline" }}>
            <span style={{ color: "var(--act)", fontSize: 14 }}>◆</span>
            <span style={{ fontSize: 17, fontWeight: 600, color: "var(--text-primary)" }}>
              A named position on the subjects you own.
            </span>
          </div>
        </Card>
      </Reveal>

      {LADDER.map((r, i) => (
        <Reveal key={r.n} delay={i * 50}>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10.5,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "var(--text-muted)",
              padding: "12px 0 12px 14px",
            }}
          >
            Which is only true if ↓
          </div>
          <Card>
            <div style={{ display: "flex", gap: 14, alignItems: "baseline" }}>
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  color: "var(--machine-text)",
                }}
              >
                {r.n}
              </span>
              <span style={{ fontSize: 15.5, lineHeight: 1.5, color: "var(--text-primary)" }}>
                {r.t}
              </span>
            </div>
          </Card>
        </Reveal>
      ))}
    </div>

    <Reveal delay={80} style={{ marginTop: 64 }}>
      <Kicker>Where this goes next — Coming soon · shaped by the founding fifty</Kicker>
      <div style={{ ...grid(260), marginTop: 8 }}>
        {SOON_ROWS.map((s) => (
          <Card key={s.t} style={{ height: "100%" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "start" }}>
              <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0, color: "var(--text-primary)" }}>
                {s.t}
              </h3>
              <SoonChip />
            </div>
            <p style={{ marginTop: 10, fontSize: 13.5, lineHeight: 1.6, color: "var(--text-secondary)" }}>
              {s.b}
            </p>
          </Card>
        ))}
      </div>
    </Reveal>
  </Section>
);

/* ── 9 · WHAT AURA WORKS OUT ABOUT YOU ── */

const QUESTIONS = [
  { n: "01", q: "Which subjects do you actually own?" },
  { n: "02", q: "What capability can you prove, with evidence?" },
  { n: "03", q: "Where are you repeating yourself without noticing?" },
  { n: "04", q: "Which of your themes is accelerating right now?" },
  { n: "05", q: "What does your writing sound like when it is really you?" },
  { n: "06", q: "Which gaps are visible to the market but not to you?" },
  { n: "07", q: "How does your position compare to your peer set?", soon: true },
  { n: "08", q: "What would close the distance to the role above?", soon: true },
];

const Questions: React.FC = () => (
  <Section>
    <Reveal>
      <Kicker>What Aura works out about you</Kicker>
      <SectionTitle>Eight questions, answered from your own material.</SectionTitle>
    </Reveal>
    <div style={{ ...grid(300), marginTop: 40 }}>
      {QUESTIONS.map((q, i) => (
        <Reveal key={q.n} delay={Math.min(i, 6) * 45}>
          <Card style={{ height: "100%" }}>
            <div style={{ display: "flex", gap: 14, alignItems: "start" }}>
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  color: "var(--machine-text)",
                  paddingTop: 3,
                }}
              >
                {q.n}
              </span>
              <span style={{ flex: 1, fontSize: 15, lineHeight: 1.55, color: "var(--text-primary)" }}>
                {q.q}
              </span>
              {q.soon ? <SoonChip /> : null}
            </div>
          </Card>
        </Reveal>
      ))}
    </div>
  </Section>
);

/* ── 10 · DATA TRUST ── */

const READS = [
  "The links, documents and notes you choose to capture",
  "Your own published posts and their public performance",
  "The profile and positioning you fill in yourself",
];
const NEVER = [
  "Your inbox, calendar or private messages",
  "Your employer's systems or internal drives",
  "Anything you have not explicitly handed over",
];

const DataTrust: React.FC = () => (
  <Section>
    <Reveal>
      <Kicker>Data trust</Kicker>
      <SectionTitle>Your material stays yours.</SectionTitle>
    </Reveal>
    <div style={{ ...grid(320), marginTop: 40 }}>
      <Reveal>
        <Card style={{ height: "100%" }}>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10.5,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "var(--machine-text)",
            }}
          >
            What Aura reads
          </div>
          <ul style={{ marginTop: 14, paddingLeft: 18, display: "grid", gap: 10 }}>
            {READS.map((r) => (
              <li key={r} style={{ fontSize: 14, lineHeight: 1.55, color: "var(--text-secondary)" }}>
                {r}
              </li>
            ))}
          </ul>
        </Card>
      </Reveal>
      <Reveal delay={80}>
        <Card style={{ height: "100%" }}>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10.5,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "var(--text-muted)",
            }}
          >
            What it never touches
          </div>
          <ul style={{ marginTop: 14, paddingLeft: 18, display: "grid", gap: 10 }}>
            {NEVER.map((r) => (
              <li key={r} style={{ fontSize: 14, lineHeight: 1.55, color: "var(--text-secondary)" }}>
                {r}
              </li>
            ))}
          </ul>
        </Card>
      </Reveal>
    </div>
    <Reveal delay={120}>
      <p style={{ marginTop: 28, fontSize: 14, color: "var(--text-secondary)" }}>
        <Link to="/privacy" style={{ color: "var(--act)", textDecoration: "underline" }}>
          Read the data terms
        </Link>
      </p>
    </Reveal>
  </Section>
);

/* ── 11 · ONE SUBSCRIPTION ── */

const STACK = [
  { t: "Read-later app", v: "$10" },
  { t: "Note system", v: "$15" },
  { t: "AI writing tool", v: "$20" },
  { t: "Scheduling tool", v: "$60" },
  { t: "Analytics tool", v: "$100" },
];

const OneSubscription: React.FC = () => (
  <Section>
    <Reveal>
      <Kicker>One subscription</Kicker>
      <SectionTitle>Five tools that do not talk to each other.</SectionTitle>
    </Reveal>
    <div style={{ ...grid(320), marginTop: 40 }}>
      <Reveal>
        <Card style={{ height: "100%" }}>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10.5,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "var(--text-muted)",
            }}
          >
            The stack today
          </div>
          <div style={{ marginTop: 14, display: "grid", gap: 0 }}>
            {STACK.map((s) => (
              <div
                key={s.t}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "11px 0",
                  borderBottom: "1px solid var(--rule-divider)",
                  fontSize: 14,
                  color: "var(--text-secondary)",
                }}
              >
                <span>{s.t}</span>
                <span style={{ fontFamily: "var(--font-mono)" }}>{s.v}</span>
              </div>
            ))}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                paddingTop: 14,
                fontSize: 16,
                fontWeight: 600,
                color: "var(--text-primary)",
              }}
            >
              <span>Every month</span>
              <span style={{ fontFamily: "var(--font-mono)" }}>$205</span>
            </div>
          </div>
        </Card>
      </Reveal>
      <Reveal delay={80}>
        <Card accent style={{ height: "100%" }}>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10.5,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "var(--act)",
            }}
          >
            Aura
          </div>
          <p
            style={{
              marginTop: 14,
              fontSize: 17,
              lineHeight: 1.55,
              color: "var(--text-primary)",
            }}
          >
            One loop. Capture, signal, draft, publish, learn — inside a single system that keeps the
            context between each step.
          </p>
          <p style={{ marginTop: 14, fontSize: 14, lineHeight: 1.6, color: "var(--text-secondary)" }}>
            The tools above each hold one fragment of the work. None of them know what you captured
            last Tuesday, and none of them will write from it.
          </p>
        </Card>
      </Reveal>
    </div>
  </Section>
);

/* ── 12 · BUILT BY ── */

const BUILT_STATS = [
  { v: "20 yrs", l: "In the rooms where these decisions get made" },
  { v: "GCC", l: "Built for the region it was designed in" },
  { v: "3 sectors", l: "Energy, financial services, government" },
];

const BuiltBy: React.FC = () => (
  <Section>
    <Reveal>
      <Kicker>Built by</Kicker>
      <SectionTitle>Built by people who sit in the rooms this is for.</SectionTitle>
    </Reveal>
    <div style={{ ...grid(240), marginTop: 40 }}>
      {BUILT_STATS.map((s, i) => (
        <Reveal key={s.v} delay={i * 60}>
          <Card style={{ height: "100%" }}>
            <div
              style={{
                fontFamily: "var(--font-display)",
                fontSize: 32,
                fontWeight: 600,
                letterSpacing: "-0.03em",
                color: "var(--text-primary)",
              }}
            >
              {s.v}
            </div>
            <p style={{ marginTop: 10, fontSize: 13.5, lineHeight: 1.55, color: "var(--text-secondary)" }}>
              {s.l}
            </p>
          </Card>
        </Reveal>
      ))}
    </div>
  </Section>
);

/* ── The Overnight anchor section ── */

const Overnight: React.FC = () => (
  <Section id="overnight" night>
    <Reveal>
      <Kicker tone="machine">The Overnight</Kicker>
      <SectionTitle night>It works the shift you cannot.</SectionTitle>
      <Lede night>
        Every night the agents re-read what you captured, look for what is moving, and leave one
        draft waiting. You read it over coffee and decide. Nothing is published without you.
      </Lede>
    </Reveal>
  </Section>
);

/* ── 14 · FOUNDING CIRCLE ── */

const PROMISES = [
  "You keep founding terms for as long as you stay.",
  "You shape what gets built next, directly.",
  "Your material is never used to train anything shared.",
  "You can take your data out, whole, at any time.",
];

const TERMS = [
  { k: "Price", v: "Set with the founding fifty, not before." },
  { k: "Commitment", v: "None. Ninety days, then you decide." },
  { k: "Your data", v: "Exportable in full, whenever you ask." },
  { k: "If you leave", v: "Your account closes and the material is deleted." },
];

const FoundingCircle: React.FC = () => (
  <Section id="founding" night>
    <Reveal>
      <Kicker tone="machine">Founding Circle</Kicker>
      <SectionTitle night>Fifty people. No price yet, and that&rsquo;s deliberate.</SectionTitle>
    </Reveal>

    <Reveal delay={80} style={{ marginTop: 34, maxWidth: 520 }}>
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "var(--machine)",
          marginBottom: 10,
        }}
      >
        10 of 50 founding places taken
      </div>
      <div
        style={{
          height: 6,
          borderRadius: 999,
          background: "var(--v23-night-lift)",
          border: "1px solid var(--v23-night-line)",
          overflow: "hidden",
        }}
      >
        <div style={{ width: "20%", height: "100%", background: "var(--machine)" }} />
      </div>
    </Reveal>

    <div style={{ ...grid(260), marginTop: 40 }}>
      {PROMISES.map((p, i) => (
        <Reveal key={p} delay={i * 55}>
          <div
            style={{
              background: "var(--v23-night-lift)",
              border: "1px solid var(--v23-night-line)",
              borderRadius: 12,
              padding: 20,
              fontSize: 14.5,
              lineHeight: 1.6,
              color: NIGHT_TEXT,
              height: "100%",
            }}
          >
            {p}
          </div>
        </Reveal>
      ))}
    </div>

    <Reveal delay={90} style={{ marginTop: 56 }}>
      <h3
        style={{
          fontSize: 20,
          fontWeight: 600,
          color: "var(--text-inverse)",
          margin: 0,
        }}
      >
        What happens at the end of the ninety days
      </h3>
      <div style={{ marginTop: 18, maxWidth: 720 }}>
        {TERMS.map((t) => (
          <div
            key={t.k}
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 12,
              justifyContent: "space-between",
              padding: "14px 0",
              borderBottom: "1px solid var(--v23-night-line)",
            }}
          >
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10.5,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: "var(--machine)",
              }}
            >
              {t.k}
            </span>
            <span style={{ fontSize: 14.5, color: NIGHT_TEXT, flex: "1 1 320px" }}>{t.v}</span>
          </div>
        ))}
      </div>
    </Reveal>

    <Reveal delay={120} style={{ marginTop: 40 }}>
      <CtaPrimary to="/request-access">Request a place</CtaPrimary>
    </Reveal>
  </Section>
);

/* ── 15 · FOOTER ── */

const Footer: React.FC = () => (
  <footer
    style={{
      background: "var(--v23-night)",
      borderTop: "1px solid var(--v23-night-line)",
      padding: "28px 20px 44px",
    }}
  >
    <div
      style={{
        maxWidth: 1120,
        margin: "0 auto",
        display: "flex",
        flexWrap: "wrap",
        gap: 18,
        alignItems: "center",
      }}
    >
      <span
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 16,
          fontWeight: 600,
          color: "var(--text-inverse)",
        }}
      >
        Aura
      </span>
      <div style={{ flex: 1 }} />
      {[
        { to: "/auth", l: "Sign in" },
        { to: "/request-access", l: "Request access" },
        { to: "/terms", l: "Terms" },
        { to: "/privacy", l: "Privacy" },
      ].map((f) => (
        <Link
          key={f.to}
          to={f.to}
          style={{ fontSize: 13, color: NIGHT_TEXT, textDecoration: "none" }}
        >
          {f.l}
        </Link>
      ))}
    </div>
  </footer>
);

/* ── page ── */

export default function LandingV23() {
  usePageMeta({
    title: "Aura — Personal Intelligence System",
    description: "Your expertise is invisible. Aura fixes that.",
    path: "/",
  });

  useEffect(() => {
    const prev = document.documentElement.style.scrollBehavior;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (!reduced) document.documentElement.style.scrollBehavior = "smooth";
    return () => {
      document.documentElement.style.scrollBehavior = prev;
    };
  }, []);

  return (
    <main style={{ background: "var(--surface-page)", overflowX: "hidden" }}>
      <div style={{ background: "var(--v23-night)" }}>
        <Nav />
        <Hero />
      </div>
      <ValueMath />
      <WrongWays />
      <OnlyYou />
      <Measured />
      <HowItWorks />
      <Overnight />
      <Ladder />
      <Questions />
      <DataTrust />
      <OneSubscription />
      <BuiltBy />
      <FoundingCircle />
      <Footer />
    </main>
  );
}