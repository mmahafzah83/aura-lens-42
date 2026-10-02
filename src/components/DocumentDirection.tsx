import { ReactNode, useLayoutEffect } from "react";
import { useLocation } from "react-router-dom";
import { DirectionProvider } from "@radix-ui/react-direction";
import { useLanguage } from "@/contexts/LanguageContext";
import { effectiveLang } from "@/i18n";

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
  return <DirectionProvider dir={dir}>{children}</DirectionProvider>;
}
