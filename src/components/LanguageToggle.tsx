import { useLocation } from "react-router-dom";
import { useLanguage } from "@/contexts/LanguageContext";
import { isArabicReadyRoute } from "@/i18n";

/**
 * The one language switch. Shows the OTHER language in its own name.
 * Renders nothing on routes that are not Arabic-ready.
 */
export default function LanguageToggle({ className }: { className?: string }) {
  const { lang, setLang, t } = useLanguage();
  const { pathname } = useLocation();
  if (!isArabicReadyRoute(pathname)) return null;
  const next = lang === "ar" ? "en" : "ar";
  return (
    <>
      <style>{LT_CSS}</style>
      <button
        type="button"
        className={`kb-lt${className ? ` ${className}` : ""}`}
        onClick={() => setLang(next)}
        aria-label={t(next === "ar" ? "lang.switchToArabic" : "lang.switchToEnglish")}
      >
        <span lang={next} dir={next === "ar" ? "rtl" : "ltr"} className={next === "ar" ? "kb-lt-ar" : "kb-lt-en"}>
          {next === "ar" ? "العربية" : "English"}
        </span>
      </button>
    </>
  );
}

const LT_CSS = `
.kb-lt{display:inline-flex;align-items:center;justify-content:center;min-height:44px;min-width:44px;
  padding:0 12px;background:transparent;border:0;border-radius:8px;cursor:pointer;
  color:#5B6673;font-size:14px;font-weight:500;transition:color .2s ease;}
.kb-lt:hover{color:#0F1519;}
.kb-lt:focus-visible{outline:2px solid #0670C4;outline-offset:2px;}
.kb-lt-ar{font-family:'Cairo',ui-sans-serif,system-ui,sans-serif;line-height:1;}
.kb-lt-en{font-family:'Inter',ui-sans-serif,system-ui,sans-serif;line-height:1;}
`;
