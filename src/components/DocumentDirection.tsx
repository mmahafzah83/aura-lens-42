import { ReactNode, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { DirectionProvider } from "@radix-ui/react-direction";
import { useLanguage } from "@/contexts/LanguageContext";
import { applyDocumentLang } from "@/i18n";

/** Keeps <html lang/dir> and Radix direction in step with the UI language. /admin is always English, LTR. */
export default function DocumentDirection({ children }: { children: ReactNode }) {
  const { lang } = useLanguage();
  const { pathname } = useLocation();
  const admin = pathname === "/admin" || pathname.startsWith("/admin/");
  const dir = !admin && lang === "ar" ? "rtl" : "ltr";
  useEffect(() => { applyDocumentLang(lang, pathname); }, [lang, pathname]);
  return <DirectionProvider dir={dir}>{children}</DirectionProvider>;
}
