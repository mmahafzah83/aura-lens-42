import i18n from "./i18n";
import { createRoot } from "react-dom/client";
import "./index.css";
import { supabase } from "@/integrations/supabase/client";
import HowYouAppear from "@/components/identity/HowYouAppear";
import MarketMirror from "@/components/MarketMirror";
import BrandReportSection from "@/components/identity/BrandReportSection";
import ReportVersions from "@/components/identity/ReportVersions";
const q = new URLSearchParams(location.search);
void i18n.changeLanguage("ar");
document.documentElement.lang = "ar"; document.documentElement.dir = "rtl";
(supabase.auth as any).getSession = async () => ({ data: { session: { user: { id: "u1" }, access_token: "x" } }, error: null });
const results = {
  primary_archetype: "المستشار الاستراتيجي", secondary_archetype: "المهندس المنظِّم",
  positioning_statement: "تقود التحول المؤسسي في قطاع الطاقة بلغة يفهمها مجلس الإدارة.",
  market_read: "يراك السوق خبيراً تشغيلياً أكثر منه صاحب رأي.", honest_truth: "صوتك أهدأ مما تستحقه خبرتك.",
  topics: [{ title: "حوكمة التحول", description: "كيف تُدار برامج التحول الكبيرة." }],
  growth_areas: ["الظهور العام", "الكتابة المنتظمة"], key_barrier: "تتردد في إعلان موقف.",
};
const v = q.get("v");
createRoot(document.getElementById("root")!).render(
  <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 16, background: "#F2F5F9" }}>
    {v === "appear" ? (<><HowYouAppear userId="u1" /><MarketMirror userId="u1" hideHeader /></>) : null}
    {v === "empty" ? <HowYouAppear userId="u1" /> : null}
    {v === "show" ? (<><BrandReportSection results={results} hasAssessment assessedAt="2026-08-10T10:00:00Z" onCompleteAssessment={() => {}} /><ReportVersions firstName="سلمان" lastName="الدوسري" onCompleteAssessment={() => {}} /></>) : null}
  </div>,
);
