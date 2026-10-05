import { useLocation, Link } from "react-router-dom";
import { useEffect } from "react";
import AuraLogo from "@/components/brand/AuraLogo";
import i18n, { readStoredLang } from "@/i18n";

const AR_FONT = "'Cairo','CairoAR',sans-serif";

const NotFound = () => {
  const location = useLocation();
  const lang = readStoredLang();
  const ar = lang === "ar";
  const t = i18n.getFixedT(lang);

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
    document.title = t("notFound.docTitle");
  }, [location.pathname, t]);

  return (
    <div
      className="flex min-h-screen items-center justify-center px-6"
      style={{ background: "var(--paper)" }}
    >
      <div className="text-center max-w-md" dir={ar ? "rtl" : undefined}>
        <div className="flex justify-center mb-6" style={{ color: "var(--ink-5)" }}>
          <AuraLogo size={48} />
        </div>
        <h1
          className="mb-3"
          style={{
            fontFamily: ar ? AR_FONT : "var(--font-display)",
            fontSize: 32,
            fontWeight: 500,
            color: "var(--ink)",
            letterSpacing: ar ? 0 : "-0.01em",
            lineHeight: ar ? 1.7 : 1.2,
          }}
        >
          {t("notFound.title")}
        </h1>
        <p
          className="mb-8"
          style={{
            color: "var(--ink-4)",
            fontSize: 15,
            lineHeight: ar ? 1.7 : 1.6,
            ...(ar ? { fontFamily: AR_FONT } : {}),
          }}
        >
          {t("notFound.body")}
        </p>
        <Link
          to="/home"
          className="inline-block transition-opacity hover:opacity-90"
          style={{
            background: "var(--brand)",
            color: "var(--paper)",
            borderRadius: 8,
            padding: "12px 28px",
            fontSize: 14,
            fontWeight: 600,
            textDecoration: "none",
            ...(ar ? { fontFamily: AR_FONT } : {}),
          }}
        >
          {t("notFound.cta")}
        </Link>
      </div>
    </div>
  );
};

export default NotFound;
