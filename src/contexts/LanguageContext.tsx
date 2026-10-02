import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, ReactNode } from "react";
import { PRODUCT_DESCRIPTOR } from "@/lib/brand";
import i18n, {
  applyDocumentLang, effectiveLang, readPending, readStoredLang, resolveSignInLang,
  setPending, storeLang, type UiLang,
} from "@/i18n";
import { supabase } from "@/integrations/supabase/client";
import { writeProfile } from "@/lib/profileWrite";

interface LanguageContextType {
  /** The language this route renders in (English on routes not yet Arabic-ready). */
  lang: UiLang;
  /** The member's stored choice, whatever the route. */
  chosenLang: UiLang;
  setLang: (lang: UiLang) => void;
  t: (key: string, vars?: Record<string, unknown>) => string;
  isRTL: boolean;
  /** Called by DocumentDirection (inside the router) on every route change. */
  setPathname: (pathname: string) => void;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

const PENDING_RETRY_MS = 3000;
const PENDING_RETRIES = 10;

export const LanguageProvider = ({ children }: { children: ReactNode }) => {
  const [chosenLang, setChosen] = useState<UiLang>(readStoredLang);
  const [pathname, setPathname] = useState<string>(() => window.location.pathname);
  const [userId, setUserId] = useState<string | null>(null);
  const retryRef = useRef<number | null>(null);

  const lang = effectiveLang(chosenLang, pathname);

  // Everything that renders follows the EFFECTIVE language.
  useEffect(() => {
    if (i18n.language !== lang) void i18n.changeLanguage(lang);
    applyDocumentLang(chosenLang, pathname);
  }, [lang, chosenLang, pathname]);

  const adopt = useCallback((next: UiLang) => {
    setChosen(next);
    storeLang(next);
  }, []);

  useEffect(() => {
    const clearRetry = () => { if (retryRef.current) { window.clearTimeout(retryRef.current); retryRef.current = null; } };

    /* Pending visitor choice → profile, once. The profile row is created by the
       sign-up path, possibly a moment after SIGNED_IN; until it exists we do NOT
       create it from here — we keep the flag and look again. */
    const pushPending = async (uid: string, attempt: number) => {
      const { data } = await (supabase.from("diagnostic_profiles" as any) as any)
        .select("user_id").eq("user_id", uid).maybeSingle();
      if (data) {
        const ok = await writeProfile(uid, { ui_language: readStoredLang() }, "LanguageContext.pending");
        if (ok) { setPending(false); return; }
      }
      if (attempt < PENDING_RETRIES) {
        retryRef.current = window.setTimeout(() => void pushPending(uid, attempt + 1), PENDING_RETRY_MS);
      } // else: the flag stays; the next load of the app tries again.
    };

    const load = async (uid: string | null) => {
      clearRetry();
      setUserId(uid);
      if (!uid) return;
      const pending = readPending();
      let profile: string | null = null;
      if (!pending) {
        const { data } = await (supabase.from("diagnostic_profiles" as any) as any)
          .select("ui_language").eq("user_id", uid).maybeSingle();
        profile = (data as any)?.ui_language ?? null;
      }
      const r = resolveSignInLang({ pending, browser: readStoredLang(), profile });
      if (r.writeProfile) { void pushPending(uid, 0); return; }
      if (r.lang) adopt(r.lang);
    };
    void supabase.auth.getSession().then(({ data }) => load(data.session?.user?.id ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT") {
        setTimeout(() => void load(session?.user?.id ?? null), 0);
      }
    });
    return () => { clearRetry(); sub.subscription.unsubscribe(); };
  }, [adopt]);

  const setLang = useCallback((next: UiLang) => {
    adopt(next);
    if (userId) void writeProfile(userId, { ui_language: next }, "LanguageContext.setLang");
    else setPending(true);
  }, [adopt, userId]);

  const t = useCallback((key: string, vars?: Record<string, unknown>): string => {
    if (key === "app.subtitle") return PRODUCT_DESCRIPTOR;
    return i18n.exists(key, vars as any) ? String(i18n.t(key, vars as any)) : key;
  }, [lang]); // eslint-disable-line react-hooks/exhaustive-deps

  const value = useMemo(
    () => ({ lang, chosenLang, setLang, t, isRTL: lang === "ar", setPathname }),
    [lang, chosenLang, setLang, t],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) throw new Error("useLanguage must be used within LanguageProvider");
  return context;
};
