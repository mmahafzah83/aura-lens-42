import { createRoot } from "react-dom/client";
import html2canvas from "html2canvas";
import NewDoc from "@/components/report/BrandPaperDocument";
import OldDoc from "./old/report/BrandPaperDocument";
import { attachCapabilityNamesAr } from "@/lib/buildBrandPaper";
(window as any).renderPaper = async (paper: any, which: "new" | "old", names: any[]) => {
  const el = document.createElement("div");
  el.style.cssText = "position:absolute;left:0;top:0;width:794px;background:#fff";
  document.body.innerHTML = ""; document.body.appendChild(el);
  paper = { ...paper, capabilities: attachCapabilityNamesAr(paper.capabilities || [], names) };
  const D: any = which === "new" ? NewDoc : OldDoc;
  createRoot(el).render(<D paper={paper} showClosing={false} />);
  await (document as any).fonts.load("400 12px CairoAR", "ب");
  await (document as any).fonts.ready;
  await new Promise((r) => setTimeout(r, 1500));
  return true;
};
(window as any).raster = async (i: number) => {
  const n = document.querySelectorAll("[data-report-page]")[i] as HTMLElement;
  const c = await html2canvas(n, { scale: 2, backgroundColor: "#ffffff", useCORS: true });
  return c.toDataURL("image/jpeg", 0.82);
};
