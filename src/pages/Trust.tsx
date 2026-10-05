import LegalPage from "./LegalPage";
import usePageMeta from "@/hooks/usePageMeta";
import { useLanguage } from "@/contexts/LanguageContext";

const Trust = () => {
  const { t } = useLanguage();
  usePageMeta({
    title: t("trustp.metaTitle"),
    description: t("trustp.metaDesc"),
    path: "/trust",
  });
  return <LegalPage prefix="trustp" count={7} />;
};

export default Trust;
