import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { usePageMeta } from "@/hooks/usePageMeta";
import PublicFooter from "@/components/PublicFooter";
import PublicMasthead from "@/components/PublicMasthead";
import { SEAT_CTA } from "@/lib/seatCopy";
import { useLanguage } from "@/contexts/LanguageContext";
import { usePublicText } from "@/hooks/usePublicText";

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
  fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif",
  fontStyle: "italic",
  fontSize: "clamp(24px, 3.2vw, 33px)",
  lineHeight: 1.28,
  letterSpacing: "-0.02em",
  color: "#0F1519",
  borderInlineStart: "2px solid #00CEC9",
  paddingInlineStart: 24,
  margin: "42px 0",
};

/* Arabic: Cairo, open line height, no tracking, capitals or italics. */
const AR_FONT = "var(--font-arabic)";
const arLabel: React.CSSProperties = { ...label, fontFamily: AR_FONT, letterSpacing: 0, textTransform: "none", fontSize: 14, fontWeight: 600, lineHeight: 1.7 };
const arBody: React.CSSProperties = { ...body, fontFamily: AR_FONT, lineHeight: 1.9 };
const arPull: React.CSSProperties = { ...pull, fontFamily: AR_FONT, fontStyle: "normal", fontWeight: 600, letterSpacing: 0, lineHeight: 1.7 };

const SECTIONS: { id: string; n: number }[] = [
  { id: "founder", n: 7 },
  { id: "oneOf", n: 3 },
  { id: "quieter", n: 11 },
  { id: "believe", n: 4 },
  { id: "refuses", n: 6 },
  { id: "standard", n: 1 },
  { id: "forYou", n: 3 },
];

const OurStory = () => {
  const { t } = useLanguage();
  const { ar, T, shared } = usePublicText();
  const L = ar ? arLabel : label;
  const B = ar ? arBody : body;
  const Q = ar ? arPull : pull;
  usePageMeta({
    title: t("story.metaTitle"),
    description: t("story.metaDesc"),
    path: "/our-story",
    ogType: "article",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: t("story.headline"),
      description: t("story.metaDesc"),
      author: {
        "@type": "Person",
        name: ar ? "محمد محافظة" : "Mohammad Mahafzah",
      },
      publisher: {
        "@type": "Organization",
        name: "KnownBy",
        url: "https://www.aura-intel.org",
      },
      mainEntityOfPage: "https://www.aura-intel.org/our-story",
    },
  });

  const paras = (id: string, n: number) =>
    Array.from({ length: n }, (_, i) => <p key={i} style={B}>{T(`story.${id}.p${i + 1}`)}</p>);

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
        fontFamily: ar ? AR_FONT : "'Inter', ui-sans-serif, system-ui, -apple-system, sans-serif",
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
            fontSize: ar ? 14 : 12,
            color: "#98A2AE",
            transition: "color 150ms ease",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "#0670C4")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "#98A2AE")}
        >
          <ArrowLeft size={13} style={ar ? { transform: "scaleX(-1)" } : undefined} /> {T("pubpg.backHome")}
        </Link>

        <div
          className="mb-2 uppercase tracking-[0.12em]"
          style={ar
            ? { color: "#5B6673", fontFamily: AR_FONT, fontSize: 14, letterSpacing: 0, textTransform: "none", lineHeight: 1.7 }
            : { color: "#5B6673", fontFamily: "'IBM Plex Mono', ui-monospace, Menlo, monospace", fontSize: 12 }}
        >
          {T("story.kicker")}
        </div>

        <h1
          className="text-3xl sm:text-4xl mb-2"
          style={ar
            ? { fontFamily: AR_FONT, color: "#0F1519", letterSpacing: 0, lineHeight: 1.7, fontWeight: 700 }
            : { fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif", color: "#0F1519", letterSpacing: "-0.028em", lineHeight: 1.02 }}
        >
          {T("story.h1")}
        </h1>

        {SECTIONS.map(({ id, n }) => (
          <div key={id}>
            <h2 style={L}>{T(`story.${id}.h`)}</h2>
            {paras(id, n)}
            {id === "oneOf" && <div style={Q}>{T("story.pull1")}</div>}
            {id === "standard" && (
              <>
                <p style={B}>
                  {T("story.trustPre")}
                  <Link to="/trust" style={{ color: "#0670C4", fontWeight: 500, transition: "color 150ms ease" }}>
                    {ar ? shared.trustLabel : "Security & Trust"}
                  </Link>
                  {T("story.trustPost")}
                </p>
                <p style={B}>{T("story.standard.p3")}</p>
              </>
            )}
            {id === "forYou" && <div style={Q}>{T("story.pull2")}</div>}
          </div>
        ))}

        <div className="mt-12 mb-10" style={{ borderTop: "1px solid #E2E7EE" }}>
          <div className="pt-8">
            <p
              className="text-xl mb-1"
              style={{ fontFamily: ar ? AR_FONT : "'Inter', ui-sans-serif, system-ui, sans-serif", color: "#0F1519", lineHeight: ar ? 1.7 : undefined }}
            >
              {T("story.signature")}
            </p>
            <p
              className="text-sm"
              style={{ fontFamily: ar ? AR_FONT : "'IBM Plex Mono', ui-monospace, Menlo, monospace", color: "#98A2AE", lineHeight: ar ? 1.7 : undefined }}
            >
              {T("story.building")}
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
            {ar ? shared.seatCta : `${SEAT_CTA} →`}
          </Link>

          <Link
            to="/"
            className="text-sm font-medium"
            style={{ color: "#0670C4" }}
          >
            {T("story.newHere")}
          </Link>
        </div>
      </main>

      <PublicFooter />
    </div>
  );
};

export default OurStory;
