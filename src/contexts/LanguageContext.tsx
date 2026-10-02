import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from "react";
import { PRODUCT_DESCRIPTOR } from "@/lib/brand";
import i18n, { applyDocumentLang, readStoredLang, storeLang, type UiLang } from "@/i18n";
import { supabase } from "@/integrations/supabase/client";
import { writeProfile } from "@/lib/profileWrite";

interface LanguageContextType {
  lang: UiLang;
  setLang: (lang: UiLang) => void;
  t: (key: string, vars?: Record<string, unknown>) => string;
  isRTL: boolean;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider = ({ children }: { children: ReactNode }) => {
  const [lang, setLangState] = useState<UiLang>(readStoredLang);
  const [userId, setUserId] = useState<string | null>(null);

  const adopt = useCallback((next: UiLang) => {
    setLangState(next);
    storeLang(next);
    void i18n.changeLanguage(next);
    applyDocumentLang(next);
  }, []);

  // After sign-in, the profile value wins and is copied to localStorage.
  useEffect(() => {
    const load = async (uid: string | null) => {
      setUserId(uid);
      if (!uid) return;
      const { data } = await (supabase.from("diagnostic_profiles" as any) as any)
        .select("ui_language").eq("user_id", uid).maybeSingle();
      const v = (data as any)?.ui_language;
      if (v === "en" || v === "ar") adopt(v);
    };
    void supabase.auth.getSession().then(({ data }) => load(data.session?.user?.id ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT") {
        setTimeout(() => void load(session?.user?.id ?? null), 0);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [adopt]);

  const setLang = useCallback((next: UiLang) => {
    adopt(next);
    if (userId) void writeProfile(userId, { ui_language: next }, "LanguageContext.setLang");
  }, [adopt, userId]);

  const t = useCallback((key: string, vars?: Record<string, unknown>): string => {
    if (key === "app.subtitle") return PRODUCT_DESCRIPTOR;
    return i18n.exists(key, vars as any) ? String(i18n.t(key, vars as any)) : key;
  }, [lang]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <LanguageContext.Provider value={{ lang, setLang, t, isRTL: lang === "ar" }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) throw new Error("useLanguage must be used within LanguageProvider");
  return context;
};
