import { useLocation } from "react-router-dom";
import { useLanguage } from "@/contexts/LanguageContext";
import { isArabicReadyRoute } from "@/i18n";

/**
 * The one language switch. Shows the OTHER language in its own name.
 * Renders nothing on routes that are not Arabic-ready.
 */
export type LanguageToggleTone = "onLight" | "onDark";

export default function LanguageToggle({
  className,
  tone = "onLight",
  darkFromPx,
}: {
  className?: string;
  /** Surface the switch sits on. "onDark" meets AA on Night (#0F1519). */
  tone?: LanguageToggleTone;
  /** When set, the switch takes the dark tone from this viewport width up (CSS media query). */
  darkFromPx?: number;
}) {
  const { lang, setLang, t } = useLanguage();
  const { pathname } = useLocation();
  if (!isArabicReadyRoute(pathname)) return null;
  const next = lang === "ar" ? "en" : "ar";
  return (
    <>
      <style>{LT_CSS}</style>
      {darkFromPx ? <style>{`@media (min-width:${darkFromPx}px){${DARK_RULES(`.kb-lt-dark-${darkFromPx}`)}}`}</style> : null}
      <button
        type="button"
        className={`kb-lt${tone === "onDark" ? " kb-lt-dark" : ""}${darkFromPx ? ` kb-lt-dark-${darkFromPx}` : ""}${className ? ` ${className}` : ""}`}
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

/* rgba(255,255,255,.78) on #0F1519 composites to #C8CACB: 11.4:1. */
const DARK_RULES = (sel: string) =>
  `${sel}{color:rgba(255,255,255,.78);}${sel}:hover{color:#FFFFFF;}${sel}:focus-visible{outline-color:#FFFFFF;}`;

const LT_CSS = `
.kb-lt{display:inline-flex;align-items:center;justify-content:center;min-height:44px;min-width:44px;
  padding:0 12px;background:transparent;border:0;border-radius:8px;cursor:pointer;
  color:#5B6673;font-size:14px;font-weight:500;transition:color .2s ease;}
.kb-lt:hover{color:#0F1519;}
.kb-lt:focus-visible{outline:2px solid #0670C4;outline-offset:2px;}
${DARK_RULES(".kb-lt-dark")}
.kb-lt-ar{font-family:'Cairo',ui-sans-serif,system-ui,sans-serif;line-height:1;}
.kb-lt-en{font-family:'Inter',ui-sans-serif,system-ui,sans-serif;line-height:1;}
`;
