import LegalPage from "./LegalPage";
import usePageMeta from "@/hooks/usePageMeta";
import { useLanguage } from "@/contexts/LanguageContext";

const Privacy = () => {
  const { t } = useLanguage();
  usePageMeta({
    title: t("privacy.metaTitle"),
    description: t("privacy.metaDesc"),
    path: "/privacy",
  });
  return <LegalPage prefix="privacy" count={12} translationNote />;
};

export default Privacy;
