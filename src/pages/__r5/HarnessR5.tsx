import ReportDocument from "@/components/ReportDocument";
import OldReportDocument from "./OldReportDocument";
import ar from "./ar.json";
import en from "./en.json";
import html2canvas from "html2canvas";

(window as any).__raster = async () => {
  try { await Promise.all([(document as any).fonts.load("400 12px Cairo"), (document as any).fonts.load("600 12px Cairo")]); } catch { /* */ }
  await (document as any).fonts.ready;
  await new Promise((r) => setTimeout(r, 150));
  const out: string[] = [];
  for (const el of Array.from(document.querySelectorAll("[data-report-page]")) as HTMLElement[]) {
    const c = await html2canvas(el, { scale: 2, backgroundColor: "#ffffff", useCORS: true });
    out.push(c.toDataURL("image/jpeg", 0.82));
  }
  return out;
};

export default function HarnessR5() {
  const q = new URLSearchParams(location.search);
  const which = q.get("r") || "ar";
  const data: any = which === "ar" ? ar : en;
  return (
    <div style={{ width: 794 }}>
      {q.get("old") ? <OldReportDocument data={data} /> : <ReportDocument data={data} lang={which === "ar" ? "ar" : "en"} />}
    </div>
  );
}
