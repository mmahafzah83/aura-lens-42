import { useSearchParams } from "react-router-dom";
import BrandAssessmentModal, { ResultsView, CinematicLoading } from "@/components/BrandAssessmentModal";

const INTERP = `HOW THE MARKET SEES YOU
The pragmatic modernizer who makes legacy banks move.

YOUR 3 TOPICS
Core migration risk
Regulatory tailwinds
Platform economics

THE HONEST TRUTH
You under-publish relative to what you know.

---JSON---
{"primary_archetype":"The Pragmatic Modernizer","positioning_statement":"I help GCC banks retire legacy cores without stopping the business.","content_pillars":["Core migration risk","Regulatory tailwinds","Platform economics"]}`;

export default function BAPreview() {
  const [sp] = useSearchParams();
  const mode = sp.get("m") || "q";
  if (mode === "results") {
    return (
      <div style={{ minHeight: "100vh", background: "#FFFFFF", padding: 16 }}>
        <ResultsView interpretation={INTERP} onSaveAndContinue={() => {}} onCopyToast={() => {}} />
      </div>
    );
  }
  if (mode === "loading") {
    return <div style={{ minHeight: "100vh", background: "#FFFFFF" }}><CinematicLoading stage={1} /></div>;
  }
  return <div style={{ minHeight: "100vh", background: "#F2F5F9" }}><BrandAssessmentModal open onOpenChange={() => {}} sector="banking" /></div>;
}
