import { useCallback, useMemo } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { isolateLatin } from "@/lib/arDisplay";

/**
 * Text for the six public pages. In Arabic, every Latin run is isolated
 * left-to-right, and the four shared names come from their existing keys.
 */
export function usePublicText() {
  const { lang, t } = useLanguage();
  const ar = lang === "ar";
  const shared = useMemo(() => ({
    imprint: t("frame.header.kpiImprint"),
    desk: t("frame.header.yourDesk"),
    seatCta: t("seatOffer.cta"),
    trustLabel: t("pub.footer.trust"),
  }), [t]);
  const T = useCallback((key: string, vars?: Record<string, unknown>) => {
    const s = t(key, { ...shared, ...vars });
    return ar ? isolateLatin(s) : s;
  }, [t, ar, shared]);
  return { ar, lang, T, shared };
}
