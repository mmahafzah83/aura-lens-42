import { ReactNode, useLayoutEffect } from "react";
import { useLocation } from "react-router-dom";
import { DirectionProvider } from "@radix-ui/react-direction";
import { useLanguage } from "@/contexts/LanguageContext";
import { effectiveLang } from "@/i18n";
import { stripArabicControlArrows } from "@/lib/arabicControls";

/**
 * Sits inside the router and reports every route change to LanguageProvider,
 * which sits outside it. Direction is computed from the current pathname here
 * too, so Radix never renders one frame in the previous route's direction.
 */
export default function DocumentDirection({ children }: { children: ReactNode }) {
  const { chosenLang, setPathname } = useLanguage();
  const { pathname } = useLocation();
  useLayoutEffect(() => { setPathname(pathname); }, [pathname, setPathname]);
  const dir = effectiveLang(chosenLang, pathname) === "ar" ? "rtl" : "ltr";
  useLayoutEffect(() => {
    const apply = () => stripArabicControlArrows();
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["dir"] });
    return () => observer.disconnect();
  }, [dir]);
  return <DirectionProvider dir={dir}>{children}</DirectionProvider>;
}
