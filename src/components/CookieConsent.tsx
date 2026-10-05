import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useLanguage } from "@/contexts/LanguageContext";
import i18n from "@/i18n";

const STORAGE_KEY = "aura-cookie-consent";

const CookieConsent = () => {
  const [show, setShow] = useState(false);
  const [closing, setClosing] = useState(false);
  const bar = useRef<HTMLDivElement | null>(null);
  const { lang } = useLanguage();
  const ar = lang === "ar";
  const t = i18n.getFixedT(lang);

  useEffect(() => {
    try {
      if (localStorage.getItem(STORAGE_KEY) !== "true") setShow(true);
    } catch {
      // ignore
    }
  }, []);

  /* The bar is docked: while it is up, the page keeps room for it, so it can
     never come to rest on top of an action — the hero CTA on a phone above all. */
  useEffect(() => {
    const el = bar.current;
    if (!show || closing || !el) {
      document.documentElement.style.removeProperty("--cookie-bar-h");
      document.body.style.paddingBottom = "";
      return;
    }
    const apply = () => {
      const h = Math.ceil(el.getBoundingClientRect().height);
      document.documentElement.style.setProperty("--cookie-bar-h", `${h}px`);
      document.body.style.paddingBottom = `${h}px`;
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    window.addEventListener("resize", apply);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", apply);
      document.documentElement.style.removeProperty("--cookie-bar-h");
      document.body.style.paddingBottom = "";
    };
  }, [show, closing]);

  const accept = () => {
    try {
      localStorage.setItem(STORAGE_KEY, "true");
    } catch {
      // ignore
    }
    setClosing(true);
    setTimeout(() => setShow(false), 300);
  };

  if (!show) return null;

  return (
    <div
      ref={bar}
      role="region"
      aria-label={t("cookie.aria")}
      dir={ar ? "rtl" : undefined}
      className="fixed left-0 right-0 bottom-0 z-50"
      style={{
        background: "var(--vellum)",
        borderTop: "2px solid var(--brand)",
        transform: closing ? "translateY(100%)" : "translateY(0)",
        transition: "transform 300ms ease",
      }}
    >
      <div
        className="mx-auto flex flex-row items-center justify-between gap-3 px-4 sm:px-10 py-2.5 sm:py-4"
        style={{ maxWidth: 1280 }}
      >
        <p
          className="text-xs sm:text-sm text-start"
          style={{ color: "var(--ink)", fontFamily: ar ? "'Cairo','CairoAR',sans-serif" : "var(--font-body)", ...(ar ? { lineHeight: 1.7, letterSpacing: 0 } : {}) }}
        >
          <span className="hidden sm:inline">{t("cookie.full")}</span>
          <span className="sm:hidden">{t("cookie.short")}</span>
          <Link to="/privacy" className="v23-textlink">
            <span className="hidden sm:inline">{t("cookie.linkFull")}</span>
            <span className="sm:hidden">{t("cookie.linkShort")}</span>
          </Link>
          .
        </p>
        <button
          type="button"
          onClick={accept}
          className="px-5 py-2 rounded-md text-sm font-medium transition-opacity hover:opacity-90 shrink-0 v23-tap v23-focus"
          style={{ background: "var(--brand)", color: "var(--paper)", minHeight: 44, ...(ar ? { fontFamily: "'Cairo','CairoAR',sans-serif" } : {}) }}
        >
          {t("cookie.accept")}
        </button>
      </div>
    </div>
  );
};

export default CookieConsent;