import LegalPage from "./LegalPage";
import usePageMeta from "@/hooks/usePageMeta";
import { useLanguage } from "@/contexts/LanguageContext";

const Terms = () => {
  const { t } = useLanguage();
  usePageMeta({
    title: t("terms.metaTitle"),
    description: t("terms.metaDesc"),
    path: "/terms",
  });
  return <LegalPage prefix="terms" count={14} translationNote />;
};

export default Terms;
