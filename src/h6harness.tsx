// TEMPORARY test harness for batch 6 screenshots — delete after use.
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { LanguageProvider } from "@/contexts/LanguageContext";
import ReportDocument from "@/components/ReportDocument";

export function mount(data: any) {
  const el = document.createElement("div");
  el.id = "h6";
  document.getElementById("root")!.style.display = "none";
  document.body.appendChild(el);
  createRoot(el).render(
    <BrowserRouter>
      <LanguageProvider>
        <ReportDocument data={data} />
      </LanguageProvider>
    </BrowserRouter>,
  );
}
