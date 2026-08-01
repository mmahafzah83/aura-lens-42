import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { usePageMeta } from "@/hooks/usePageMeta";
import PublicFooter from "@/components/PublicFooter";
import PublicMasthead from "@/components/PublicMasthead";

const label: React.CSSProperties = {
  fontFamily: "'IBM Plex Mono', ui-monospace, Menlo, monospace",
  fontSize: 10,
  letterSpacing: "0.2em",
  color: "#00807B",
  textTransform: "uppercase",
  margin: "52px 0 18px",
  display: "block",
  fontWeight: 400,
};

const body: React.CSSProperties = {
  fontFamily: "'Inter', ui-sans-serif, system-ui, -apple-system, sans-serif",
  fontSize: 17,
  lineHeight: 1.75,
  color: "#3A434E",
  margin: "0 0 18px",
};

const pull: React.CSSProperties = {
  fontFamily: "'Instrument Serif', Georgia, serif",
  fontStyle: "italic",
  fontSize: "clamp(24px, 3.2vw, 33px)",
  lineHeight: 1.28,
  letterSpacing: "-0.02em",
  color: "#0F1519",
  borderLeft: "2px solid #00CEC9",
  paddingLeft: 24,
  margin: "42px 0",
};

const OurStory = () => {
  usePageMeta({
    title: "Aura — Our Story",
    description:
      "Why Aura exists, from the founder. Your expertise is invisible; Aura fixes that — without the noise, and never in your name without your say.",
    path: "/our-story",
    ogType: "article",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: "Why Aura exists",
      description:
        "Why Aura exists, from the founder. Your expertise is invisible; Aura fixes that — without the noise, and never in your name without your say.",
      author: {
        "@type": "Person",
        name: "Mohammad Mahafdhah",
      },
      publisher: {
        "@type": "Organization",
        name: "Aura",
        url: "https://www.aura-intel.org",
      },
      mainEntityOfPage: "https://www.aura-intel.org/our-story",
    },
  });

  return (
    <div
      className="our-story-page"
      style={{
        ["--lk" as string]: "#0670C4",
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        background: "#F2F5F9",
        color: "#0F1519",
        fontFamily: "'Inter', ui-sans-serif, system-ui, -apple-system, sans-serif",
      }}
    >
      <PublicMasthead />

      <main
        className="mx-auto px-5 sm:px-10 flex-1 w-full"
        style={{ maxWidth: 760, paddingTop: 64, paddingBottom: 60 }}
      >
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 mb-8"
          style={{
            fontSize: 12,
            color: "#98A2AE",
            transition: "color 150ms ease",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "#0670C4")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "#98A2AE")}
        >
          <ArrowLeft size={13} /> Back to home
        </Link>

        <div
          className="mb-2 uppercase tracking-[0.12em]"
          style={{ color: "#5B6673", fontFamily: "'IBM Plex Mono', ui-monospace, Menlo, monospace", fontSize: 12 }}
        >
          OUR STORY
        </div>

        <h1
          className="text-3xl sm:text-4xl mb-2"
          style={{ fontFamily: "'Instrument Serif', Georgia, serif", color: "#0F1519", letterSpacing: "-0.028em", lineHeight: 1.02 }}
        >
          Why Aura exists.
        </h1>

        <h2 style={label}>FROM THE FOUNDER</h2>

        <p style={body}>
          I built Aura because I was tired of watching the most capable people in the room stay invisible.
        </p>

        <p style={body}>You know the feeling.</p>

        <p style={body}>
          You've spent years becoming exceptional — leading teams, shaping strategy, solving problems most people can't even name.
        </p>

        <p style={body}>
          Then someone outside your circle looks you up, and finds your title. Not your thinking. No proof of what you actually know.
        </p>

        <p style={body}>
          Meanwhile, the people who publish — even when they know less than you — get the keynote, the board seat, the "have you seen what they wrote?"
        </p>

        <p style={body}>
          The field judges you on what it can see. For most real experts, that is almost nothing.
        </p>

        <p style={body}>
          The problem was never your expertise. It is that no one ever helped you turn what is in your head into what your field can see.
        </p>

        <h2 style={label}>One of you</h2>

        <p style={body}>I'm not writing this from the outside.</p>

        <p style={body}>
          I read more than thirty things a week, and I see patterns in digital transformation that most reports miss. For years, all of it stayed locked in my notes and my devices — the market had no idea any of it existed.
        </p>

        <p style={body}>I tried the alternatives. A ghostwriter hands you their words, not your mind — and never reads what you read. Generic AI hands you everyone's words.</p>

        <div style={pull}>
          For a real expert, sounding like everyone else is worse than saying nothing at all.
        </div>

        <h2 style={label}>The quieter problem</h2>

        <p style={body}>
          There is a quieter problem underneath the first one — and I know it because I live it too.
        </p>

        <p style={body}>
          When you work this hard, for this long, you can lose sight of your own north star.
        </p>

        <p style={body}>
          The skills accumulate. A dozen things you do better than almost anyone. But somewhere in the rush, they stop adding up to a clear picture.
        </p>

        <p style={body}>
          You could recite your projects. You'd struggle to say, in one clean line, what you stand for now — or how the people around you actually see you.
        </p>

        <p style={body}>The always-on world only deepens it.</p>

        <p style={body}>
          The noise never stops. The feed moves faster than thought. And focus — the very thing your expertise was built on — gets spent in a hundred small directions before noon.
        </p>

        <p style={body}>Your own signal ends up buried under everyone else's.</p>

        <p style={body}>
          So before Aura writes a single word, it does two quiet things.
        </p>

        <p style={body}>
          It holds up a mirror — reading your work back to you and naming what is yours: your themes, your strengths, the outline of you the years had blurred.
        </p>

        <p style={body}>
          And it clears the noise — from everything moving in your field, it surfaces the few signals that are genuinely yours to act on.
        </p>

        <p style={body}>Clarity first. Presence after.</p>

        <h2 style={label}>What I believe</h2>

        <p style={body}>
          Expertise should compound into presence.
        </p>

        <p style={body}>
          The reading you already do — the reports, the articles, the thing you notice on a busy Tuesday — is the raw material of a point of view. It only ever needed a system to carry it into the open.
        </p>

        <p style={body}>And presence should never cost you your dignity, or your week.</p>

        <p style={body}>
          You shouldn't have to become a content creator, or perform a kind of self-promotion you quietly find distasteful, to be known for what you already know.
        </p>

        <h2 style={label}>What Aura refuses to be</h2>

        <p style={body}>Not a ghostwriter — it works from your mind, never borrowed words.</p>

        <p style={body}>Not generic AI — it writes in your voice, on your signal, never everyone's.</p>

        <p style={body}>Not a numbers game that rewards noise over substance.</p>

        <p style={body}>And never a system that speaks in your name without your say.</p>

        <p style={body}>
          What it is: a strategic intelligence that reads what you read, learns how you think and how you sound, watches your field — and turns all of it into things only you could have said.
        </p>

        <p style={body}>Ready the moment you decide to publish. Not a moment before.</p>

        <h2 style={label}>The standard I hold it to</h2>

        <p style={body}>
          Every line Aura writes has to be something you'd genuinely say — in English, or in Arabic with the dignity the language deserves.
        </p>

        <p style={body}>
          Your work stays yours. The system is built so your private content is never placed in front of us — you can read exactly how in{" "}
          <Link to="/trust" style={{ color: "#0670C4", fontWeight: 500, transition: "color 150ms ease" }}>
            Security &amp; Trust
          </Link>
          .
        </p>

        <p style={body}>I built Aura to the standard I'd demand as a user. Because I am one.</p>

        <h2 style={label}>Built for you, too</h2>

        <p style={body}>
          I set out to fix my own invisibility. I found a problem thousands of people across our region live with, quietly.
        </p>

        <p style={body}>
          Aura is in private beta, by invitation, built in Riyadh — for the Arab professional world, and beyond.
        </p>

        <p style={body}>If your expertise has outgrown your visibility, it was built for you.</p>

        <div style={pull}>
          Expertise should compound into presence — without the noise, and never in your name without your say.
        </div>

        <div className="mt-12 mb-10" style={{ borderTop: "1px solid #E2E7EE" }}>
          <div className="pt-8">
            <p
              className="text-xl mb-1"
              style={{ fontFamily: "'Instrument Serif', Georgia, serif", color: "#0F1519" }}
            >
              — Mohammad Mahafzah
            </p>
            <p
              className="text-sm"
              style={{ fontFamily: "'IBM Plex Mono', ui-monospace, Menlo, monospace", color: "#98A2AE" }}
            >
              Building Aura · Riyadh
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mb-6">
          <Link
            to="/request-access"
            className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full text-sm font-medium"
            style={{
              background: "#0F1519",
              color: "#FFFFFF",
              borderRadius: 999,
              transition: "all 150ms ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "#0670C4";
              e.currentTarget.style.color = "#FFFFFF";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "#0F1519";
              e.currentTarget.style.color = "#FFFFFF";
            }}
          >
            Request a founder seat →
          </Link>

          <Link
            to="/"
            className="text-sm font-medium"
            style={{ color: "#0670C4" }}
          >
            New here? See how Aura works →
          </Link>
        </div>
      </main>

      <PublicFooter />
    </div>
  );
};

export default OurStory;
