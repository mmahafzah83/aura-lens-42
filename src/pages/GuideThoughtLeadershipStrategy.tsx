import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import usePageMeta from "@/hooks/usePageMeta";
import AuraLogo from "@/components/brand/AuraLogo";
import PublicFooter from "@/components/PublicFooter";

export default function GuideThoughtLeadershipStrategy() {
  usePageMeta({
    title: "Thought Leadership Strategy: A Practical Executive Guide",
    description:
      "A practical thought leadership strategy for executives — turn what you read into a clear point of view, cadence, and measurable market presence.",
    path: "/guide/thought-leadership-strategy",
    ogType: "article",
    jsonLd: [
      {
        "@context": "https://schema.org",
        "@type": "Article",
        headline: "Thought Leadership Strategy: A Practical Guide for Executives",
        description:
          "A systematic thought leadership strategy: define your point of view, build a signal-driven publishing cadence, and measure influence.",
        author: { "@type": "Organization", name: "Aura" },
        publisher: { "@type": "Organization", name: "Aura" },
        mainEntityOfPage: "https://www.aura-intel.org/guide/thought-leadership-strategy",
      },
      {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Guide", item: "https://www.aura-intel.org/guide" },
          {
            "@type": "ListItem",
            position: 2,
            name: "Thought Leadership Strategy",
            item: "https://www.aura-intel.org/guide/thought-leadership-strategy",
          },
        ],
      },
    ],
  });

  return (
    <div style={{ background: "var(--paper)", color: "var(--ink)", minHeight: "100vh" }}>
      <header
        style={{
          borderBottom: "1px solid var(--rule)",
          padding: "18px 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          maxWidth: 1080,
          margin: "0 auto",
        }}
      >
        <Link to="/" style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--ink)", textDecoration: "none" }}>
          <AuraLogo size={28} />
          <span style={{ fontFamily: "var(--serif)", fontSize: 20 }}>Aura</span>
        </Link>
        <Link
          to="/guide"
          style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            fontSize: 14, color: "var(--ink-3)", textDecoration: "none",
          }}
        >
          <ArrowLeft size={14} /> All guides
        </Link>
      </header>

      <main style={{ maxWidth: 760, margin: "0 auto", padding: "48px 24px 72px" }}>
        <div style={{ fontSize: 13, color: "var(--ink-3)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 12 }}>
          Guide · Strategy
        </div>
        <h1 style={{ fontFamily: "var(--serif)", fontSize: 42, lineHeight: 1.15, margin: "0 0 16px" }}>
          Thought leadership strategy: a practical guide for executives
        </h1>
        <p style={{ fontSize: 18, lineHeight: 1.6, color: "var(--ink-2)", marginBottom: 32 }}>
          Most executives read constantly and post rarely. This guide is the bridge — a repeatable
          system to turn what you already read, notice, and decide into a defensible market presence.
          No hacks, no ghostwriter theatre. Just a strategy you can run every week.
        </p>

        <section style={sec}>
          <h2 style={h2}>What thought leadership actually is</h2>
          <p style={p}>
            Thought leadership is not volume, and it is not opinion for its own sake. It is a
            <em> compounding record of judgement</em> on a narrow set of questions your market cares
            about. The people who become known for a topic share three traits: a clear point of view,
            a consistent cadence, and a body of specific evidence.
          </p>
          <p style={p}>
            Formatting-first tools like Taplio or AuthoredUp help you polish a post. That is a tactic,
            not a strategy. A strategy answers: <strong>what am I known for, to whom, and why should
            they trust me over the next voice in the feed?</strong>
          </p>
        </section>

        <section style={sec}>
          <h2 style={h2}>The five-part strategy</h2>
          <ol style={{ ...p, paddingLeft: 20 }}>
            <li style={li}><strong>Territory.</strong> Pick one narrow domain where you have earned the right to speak. "AI in healthcare" is too broad; "clinical AI adoption in mid-sized hospitals" is a territory.</li>
            <li style={li}><strong>Point of view.</strong> Write one paragraph that says what you believe, what the market gets wrong, and what changes if you are right. This is the spine every post hangs from.</li>
            <li style={li}><strong>Signal diet.</strong> Curate 8–15 sources — analysts, operators, primary data — that feed your territory. Read with a pen. Extract claims, not headlines.</li>
            <li style={li}><strong>Publishing cadence.</strong> Two posts a week beats seven. One long-form piece a month anchors the archive. Predictability builds an audience; sporadic brilliance does not.</li>
            <li style={li}><strong>Measurement.</strong> Track influence, not vanity. Inbound conversations, invitations, and citations matter more than likes.</li>
          </ol>
        </section>

        <section style={sec}>
          <h2 style={h2}>From passive reading to active presence</h2>
          <p style={p}>
            The gap most executives fall into is the space between <em>reading</em> and
            <em> writing</em>. Reading feels productive; writing feels exposed. The bridge is
            <strong> capture</strong>: whenever a source, a meeting, or a data point sharpens your
            view, write a two-sentence note the same day. Over a quarter, those notes become the
            raw material for every post — no blank page, no ghostwriter.
          </p>
          <p style={p}>
            This is the loop Aura is built around. Capture what you notice, cluster it into strategic
            signals, and draft in your own voice from those signals rather than from a blinking
            cursor. Formatting tools optimise the last 5% of a post; the first 95% is having
            something specific to say.
          </p>
        </section>

        <section style={sec}>
          <h2 style={h2}>A weekly operating rhythm</h2>
          <ul style={{ ...p, paddingLeft: 20 }}>
            <li style={li}><strong>Monday (20 min):</strong> Skim your signal diet. Capture 3–5 notes.</li>
            <li style={li}><strong>Wednesday (45 min):</strong> Pick one note, draft a 150–250 word post around your point of view.</li>
            <li style={li}><strong>Friday (30 min):</strong> Publish. Reply to comments as an editor, not a performer.</li>
            <li style={li}><strong>Monthly (2 hours):</strong> Compile the month's posts into one long-form piece — an essay, a memo, or a briefing.</li>
          </ul>
          <p style={p}>
            Ninety-five minutes a week. Done consistently for two quarters, it produces a body of
            work no competitor can copy without also doing the reading.
          </p>
        </section>

        <section style={sec}>
          <h2 style={h2}>How to measure it</h2>
          <p style={p}>
            Reach and impressions are lagging, noisy, and mostly outside your control. The metrics
            that predict authority are:
          </p>
          <ul style={{ ...p, paddingLeft: 20 }}>
            <li style={li}><strong>Inbound conversations</strong> — DMs, intros, meeting requests that reference a specific post.</li>
            <li style={li}><strong>Citation</strong> — being quoted, shared with attribution, or invited to speak on your territory.</li>
            <li style={li}><strong>Depth of engagement</strong> — the quality of the reply thread, not the like count.</li>
            <li style={li}><strong>Search presence</strong> — whether your name appears when someone searches your territory.</li>
          </ul>
        </section>

        <section style={sec}>
          <h2 style={h2}>Common failure modes</h2>
          <ul style={{ ...p, paddingLeft: 20 }}>
            <li style={li}><strong>Chasing formats.</strong> Hooks, carousels, and templates without a point of view produce noise, not authority.</li>
            <li style={li}><strong>Outsourcing voice.</strong> Ghostwriters can polish; they cannot originate judgement. Readers can tell.</li>
            <li style={li}><strong>Sporadic bursts.</strong> Six posts in a week followed by two months of silence resets the compounding clock every time.</li>
            <li style={li}><strong>Breadth over depth.</strong> Ten opinions on ten topics build no reputation. One thesis on one territory does.</li>
          </ul>
        </section>

        <section style={{ ...sec, borderTop: "1px solid var(--rule)", paddingTop: 32 }}>
          <h2 style={h2}>Where Aura fits</h2>
          <p style={p}>
            Aura is a strategy layer, not a formatting layer. It captures what you read, clusters it
            into signals, tracks the evolution of your point of view, and helps you draft in your
            own voice from real material. If the guide above describes the system you want to run,
            Aura is the tool built to run it.
          </p>
          <div style={{ marginTop: 20, display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Link
              to="/request-access"
              style={{
                padding: "10px 18px", background: "var(--ink)", color: "var(--paper)",
                borderRadius: 6, textDecoration: "none", fontSize: 14,
              }}
            >
              Request access
            </Link>
            <Link
              to="/guide"
              style={{
                padding: "10px 18px", border: "1px solid var(--rule)", color: "var(--ink)",
                borderRadius: 6, textDecoration: "none", fontSize: 14,
              }}
            >
              Read the full guide
            </Link>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}

const sec: React.CSSProperties = { marginBottom: 36 };
const h2: React.CSSProperties = {
  fontFamily: "var(--serif)", fontSize: 26, lineHeight: 1.25, margin: "0 0 12px",
};
const p: React.CSSProperties = { fontSize: 16, lineHeight: 1.7, color: "var(--ink-2)", margin: "0 0 12px" };
const li: React.CSSProperties = { marginBottom: 8 };