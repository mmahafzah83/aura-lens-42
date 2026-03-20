import { useState } from "react";
import { Building2, Loader2, FileText, AlertTriangle, Lightbulb, HelpCircle, ChevronDown } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/contexts/LanguageContext";
import jsPDF from "jspdf";

const FOCUS_ACCOUNTS = [
  { value: "SWA", label: "SWA" },
  { value: "NWC", label: "NWC" },
  { value: "MEWA", label: "MEWA" },
];

interface SynthesisData {
  account: string;
  synthesis_en: string;
  synthesis_ar: string;
  key_themes_en: string[];
  key_themes_ar: string[];
  strategic_questions_en: string[];
  strategic_questions_ar: string[];
  risk_factors: string[];
  opportunity_areas: string[];
  entries_count: number;
  docs_count: number;
}

const AccountIntelligence = () => {
  const [selectedAccount, setSelectedAccount] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [synthesis, setSynthesis] = useState<SynthesisData | null>(null);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const { toast } = useToast();
  const { t, lang } = useLanguage();

  const handleSynthesize = async () => {
    if (!selectedAccount) {
      toast({ title: t("account.selectFirst"), variant: "destructive" });
      return;
    }

    setLoading(true);
    setSynthesis(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/account-brief`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({ account: selectedAccount }),
        }
      );

      if (!resp.ok) {
        const err = await resp.json();
        throw new Error(err.error || "Synthesis failed");
      }

      const data = await resp.json();
      if (data.error) throw new Error(data.error);
      setSynthesis(data);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
    setLoading(false);
  };

  const handleGeneratePdf = async () => {
    if (!synthesis) return;
    setGeneratingPdf(true);

    try {
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = 15;
      const contentWidth = pageWidth - margin * 2;
      let y = margin;

      // Header bar
      doc.setFillColor(30, 30, 30);
      doc.rect(0, 0, pageWidth, 28, "F");
      doc.setFillColor(201, 163, 76);
      doc.rect(0, 28, pageWidth, 1.5, "F");

      doc.setTextColor(201, 163, 76);
      doc.setFontSize(16);
      doc.setFont("helvetica", "bold");
      doc.text("AURA", margin, 12);
      doc.setFontSize(8);
      doc.setTextColor(180, 180, 180);
      doc.text("EXECUTIVE INTELLIGENCE PLATFORM", margin, 18);

      doc.setFontSize(10);
      doc.setTextColor(255, 255, 255);
      doc.text(`Account: ${synthesis.account}`, pageWidth - margin, 12, { align: "right" });
      doc.text(`Meeting Brief — ${new Date().toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric" })}`, pageWidth - margin, 18, { align: "right" });

      y = 35;

      // English Section
      doc.setTextColor(201, 163, 76);
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.text("STRATEGIC SYNTHESIS", margin, y);
      y += 6;

      doc.setTextColor(60, 60, 60);
      doc.setFontSize(8.5);
      doc.setFont("helvetica", "normal");
      const synthLines = doc.splitTextToSize(synthesis.synthesis_en, contentWidth);
      doc.text(synthLines, margin, y);
      y += synthLines.length * 3.5 + 4;

      // Key Themes
      if (synthesis.key_themes_en.length > 0) {
        doc.setTextColor(201, 163, 76);
        doc.setFontSize(9);
        doc.setFont("helvetica", "bold");
        doc.text("KEY THEMES", margin, y);
        y += 5;

        doc.setTextColor(60, 60, 60);
        doc.setFontSize(8);
        doc.setFont("helvetica", "normal");
        synthesis.key_themes_en.forEach((theme) => {
          doc.text(`• ${theme}`, margin + 2, y);
          y += 3.5;
        });
        y += 3;
      }

      // Strategic Questions
      if (synthesis.strategic_questions_en.length > 0) {
        doc.setTextColor(201, 163, 76);
        doc.setFontSize(9);
        doc.setFont("helvetica", "bold");
        doc.text("STRATEGIC QUESTIONS FOR GM DISCUSSION", margin, y);
        y += 5;

        doc.setTextColor(60, 60, 60);
        doc.setFontSize(8);
        doc.setFont("helvetica", "normal");
        synthesis.strategic_questions_en.forEach((q, i) => {
          const qLines = doc.splitTextToSize(`${i + 1}. ${q}`, contentWidth - 4);
          doc.text(qLines, margin + 2, y);
          y += qLines.length * 3.5 + 1;
        });
        y += 3;
      }

      // Risk & Opportunity columns
      const colWidth = (contentWidth - 6) / 2;
      const colStartY = y;

      if (synthesis.risk_factors.length > 0) {
        doc.setTextColor(180, 80, 60);
        doc.setFontSize(8);
        doc.setFont("helvetica", "bold");
        doc.text("RISK FACTORS", margin, y);
        y += 4;
        doc.setTextColor(60, 60, 60);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7.5);
        synthesis.risk_factors.forEach((r) => {
          const rLines = doc.splitTextToSize(`▸ ${r}`, colWidth);
          doc.text(rLines, margin, y);
          y += rLines.length * 3 + 1;
        });
      }

      let y2 = colStartY;
      if (synthesis.opportunity_areas.length > 0) {
        doc.setTextColor(60, 150, 80);
        doc.setFontSize(8);
        doc.setFont("helvetica", "bold");
        doc.text("OPPORTUNITIES", margin + colWidth + 6, y2);
        y2 += 4;
        doc.setTextColor(60, 60, 60);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7.5);
        synthesis.opportunity_areas.forEach((o) => {
          const oLines = doc.splitTextToSize(`▸ ${o}`, colWidth);
          doc.text(oLines, margin + colWidth + 6, y2);
          y2 += oLines.length * 3 + 1;
        });
      }

      y = Math.max(y, y2) + 4;

      // Divider
      doc.setDrawColor(201, 163, 76);
      doc.setLineWidth(0.3);
      doc.line(margin, y, pageWidth - margin, y);
      y += 5;

      // Arabic Section
      doc.setTextColor(201, 163, 76);
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.text("ARABIC BRIEFING", margin, y);
      y += 5;

      doc.setTextColor(60, 60, 60);
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      // Note: jsPDF basic doesn't support Arabic shaping; we output LTR
      const arLines = doc.splitTextToSize(synthesis.synthesis_ar, contentWidth);
      doc.text(arLines, margin, y);
      y += arLines.length * 3.5 + 4;

      if (synthesis.key_themes_ar.length > 0) {
        synthesis.key_themes_ar.forEach((theme) => {
          doc.text(`• ${theme}`, margin + 2, y);
          y += 3.5;
        });
        y += 3;
      }

      if (synthesis.strategic_questions_ar.length > 0) {
        synthesis.strategic_questions_ar.forEach((q, i) => {
          const qLines = doc.splitTextToSize(`${i + 1}. ${q}`, contentWidth - 4);
          doc.text(qLines, margin + 2, y);
          y += qLines.length * 3.5 + 1;
        });
      }

      // Footer
      const footerY = doc.internal.pageSize.getHeight() - 8;
      doc.setFillColor(30, 30, 30);
      doc.rect(0, footerY - 4, pageWidth, 12, "F");
      doc.setTextColor(120, 120, 120);
      doc.setFontSize(6);
      doc.text("Generated by Aura — Executive Intelligence Platform", margin, footerY);
      doc.text(`${synthesis.entries_count} entries · ${synthesis.docs_count} document chunks analyzed`, pageWidth - margin, footerY, { align: "right" });

      doc.save(`${synthesis.account}_Meeting_Brief_${new Date().toISOString().slice(0, 10)}.pdf`);
      toast({ title: t("account.pdfGenerated") });
    } catch (e: any) {
      toast({ title: "PDF Error", description: e.message, variant: "destructive" });
    }
    setGeneratingPdf(false);
  };

  return (
    <div className="space-y-5">
      {/* Header & Account Selector */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <Building2 className="w-5 h-5 text-primary" />
          <h3 className="text-lg font-semibold text-foreground">{t("account.title")}</h3>
        </div>
        <div className="flex items-center gap-3">
          <Select value={selectedAccount} onValueChange={setSelectedAccount}>
            <SelectTrigger className="w-40 bg-secondary border-border/30 text-sm">
              <SelectValue placeholder={t("account.selectAccount")} />
            </SelectTrigger>
            <SelectContent>
              {FOCUS_ACCOUNTS.map((acc) => (
                <SelectItem key={acc.value} value={acc.value}>{acc.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            onClick={handleSynthesize}
            disabled={!selectedAccount || loading}
            size="sm"
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin me-1" /> : null}
            {t("account.synthesize")}
          </Button>
        </div>
      </div>

      {/* Synthesis Card */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
          <span className="ms-3 text-sm text-muted-foreground">{t("account.analyzing")}</span>
        </div>
      )}

      {synthesis && !loading && (
        <ScrollArea className="max-h-[600px]">
          <div className="space-y-4">
            {/* Stats bar */}
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span className="px-2 py-1 rounded-md bg-secondary">{synthesis.entries_count} {t("account.entries")}</span>
              <span className="px-2 py-1 rounded-md bg-secondary">{synthesis.docs_count} {t("account.docChunks")}</span>
            </div>

            {/* Synthesis */}
            <div className="glass-card rounded-xl p-5 border border-border/20">
              <h4 className="text-sm font-semibold text-primary uppercase tracking-wider mb-3">{t("account.strategicSynthesis")}</h4>
              <p className="text-sm text-foreground leading-relaxed whitespace-pre-line">
                {synthesis.synthesis_en}
              </p>
            </div>

            {/* Key Themes */}
            <div className="glass-card rounded-xl p-5 border border-border/20">
              <h4 className="text-sm font-semibold text-primary uppercase tracking-wider mb-3">{t("account.keyThemes")}</h4>
              <div className="flex flex-wrap gap-2">
                {synthesis.key_themes_en.map((theme, i) => (
                  <span key={i} className="text-xs px-3 py-1.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                    {theme}
                  </span>
                ))}
              </div>
            </div>

            {/* Strategic Questions */}
            <div className="glass-card rounded-xl p-5 border border-border/20">
              <div className="flex items-center gap-2 mb-3">
                <HelpCircle className="w-4 h-4 text-primary" />
                <h4 className="text-sm font-semibold text-primary uppercase tracking-wider">{t("account.strategicQuestions")}</h4>
              </div>
              <ul className="space-y-2">
                {synthesis.strategic_questions_en.map((q, i) => (
                  <li key={i} className="text-sm text-foreground flex gap-2">
                    <span className="text-primary font-bold">{i + 1}.</span>
                    {q}
                  </li>
                ))}
              </ul>
            </div>

            {/* Risk & Opportunities */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="glass-card rounded-xl p-5 border border-destructive/20">
                <div className="flex items-center gap-2 mb-3">
                  <AlertTriangle className="w-4 h-4 text-destructive" />
                  <h4 className="text-sm font-semibold text-destructive uppercase tracking-wider">{t("account.risks")}</h4>
                </div>
                <ul className="space-y-1.5">
                  {synthesis.risk_factors.map((r, i) => (
                    <li key={i} className="text-xs text-foreground">▸ {r}</li>
                  ))}
                </ul>
              </div>
              <div className="glass-card rounded-xl p-5 border border-green-500/20">
                <div className="flex items-center gap-2 mb-3">
                  <Lightbulb className="w-4 h-4 text-green-400" />
                  <h4 className="text-sm font-semibold text-green-400 uppercase tracking-wider">{t("account.opportunities")}</h4>
                </div>
                <ul className="space-y-1.5">
                  {synthesis.opportunity_areas.map((o, i) => (
                    <li key={i} className="text-xs text-foreground">▸ {o}</li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Generate PDF Button */}
            <Button
              onClick={handleGeneratePdf}
              disabled={generatingPdf}
              className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
              size="lg"
            >
              {generatingPdf ? <Loader2 className="w-4 h-4 animate-spin me-2" /> : <FileText className="w-4 h-4 me-2" />}
              {t("account.architectBrief")}
            </Button>
          </div>
        </ScrollArea>
      )}
    </div>
  );
};

export default AccountIntelligence;
