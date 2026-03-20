import { useState, useEffect } from "react";
import { Building2, Loader2, FileText, AlertTriangle, Lightbulb, HelpCircle, Plus, Pencil, Trash2, X } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/contexts/LanguageContext";
import jsPDF from "jspdf";
import type { Database } from "@/integrations/supabase/types";

type Entry = Database["public"]["Tables"]["entries"]["Row"];

interface AccountRow {
  id: string;
  name: string;
}

interface SynthesisData {
  account: string;
  synthesis_en: string;
  key_themes_en: string[];
  strategic_questions_en: string[];
  risk_factors: string[];
  opportunity_areas: string[];
  entries_count: number;
  docs_count: number;
}

interface AccountIntelligenceProps {
  entries?: Entry[];
}

const AccountIntelligence = ({ entries = [] }: AccountIntelligenceProps) => {
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [synthesis, setSynthesis] = useState<SynthesisData | null>(null);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [newAccountName, setNewAccountName] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const { toast } = useToast();
  const { t } = useLanguage();

  // Fetch accounts
  const fetchAccounts = async () => {
    const { data } = await supabase
      .from("focus_accounts")
      .select("id, name")
      .order("created_at", { ascending: true });
    if (data) setAccounts(data);
  };

  useEffect(() => {
    fetchAccounts();
  }, []);

  // CRUD
  const addAccount = async () => {
    const trimmed = newAccountName.trim();
    if (!trimmed) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const { error } = await supabase.from("focus_accounts").insert({ name: trimmed, user_id: session.user.id });
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setNewAccountName("");
      fetchAccounts();
    }
  };

  const deleteAccount = async (id: string) => {
    await supabase.from("focus_accounts").delete().eq("id", id);
    fetchAccounts();
    if (accounts.find(a => a.id === id)?.name === selectedAccount) {
      setSelectedAccount("");
      setSynthesis(null);
    }
  };

  const renameAccount = async (id: string) => {
    const trimmed = renameValue.trim();
    if (!trimmed) return;
    await supabase.from("focus_accounts").update({ name: trimmed }).eq("id", id);
    setRenamingId(null);
    setRenameValue("");
    fetchAccounts();
  };

  // Filter entries by selected account
  const filteredEntries = selectedAccount
    ? entries.filter(e =>
        (e as any).account_name === selectedAccount ||
        e.title?.toLowerCase().includes(selectedAccount.toLowerCase()) ||
        e.content.toLowerCase().includes(selectedAccount.toLowerCase())
      )
    : [];

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

      // Header
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
          <Select value={selectedAccount} onValueChange={(v) => { setSelectedAccount(v); setSynthesis(null); }}>
            <SelectTrigger className="w-40 bg-secondary border-border/30 text-sm">
              <SelectValue placeholder={t("account.selectAccount")} />
            </SelectTrigger>
            <SelectContent>
              {accounts.map((acc) => (
                <SelectItem key={acc.id} value={acc.name}>{acc.name}</SelectItem>
              ))}
              {accounts.length === 0 && (
                <div className="px-3 py-2 text-xs text-muted-foreground">No accounts yet</div>
              )}
            </SelectContent>
          </Select>
          <Button onClick={() => setEditOpen(true)} size="sm" variant="outline" className="border-border/30">
            <Pencil className="w-3.5 h-3.5 mr-1" />
            Edit
          </Button>
          <Button
            onClick={handleSynthesize}
            disabled={!selectedAccount || loading}
            size="sm"
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
            {t("account.synthesize")}
          </Button>
        </div>
      </div>

      {/* Account Memory — filtered captures */}
      {selectedAccount && !loading && !synthesis && (
        <div className="glass-card rounded-xl p-5 border border-border/20">
          <h4 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-3">
            Captures for {selectedAccount}
          </h4>
          {filteredEntries.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">No captures found for this account. Tag entries or capture insights mentioning "{selectedAccount}".</p>
          ) : (
            <div className="space-y-2">
              {filteredEntries.slice(0, 8).map((entry) => (
                <div key={entry.id} className="flex items-start gap-3 p-3 rounded-lg bg-secondary/30 border border-border/15">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate">{entry.title || entry.content.slice(0, 60)}</p>
                    {entry.summary && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{entry.summary}</p>}
                    <div className="flex items-center gap-2 mt-1">
                      {entry.skill_pillar && (
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-primary/15 text-primary">{entry.skill_pillar}</span>
                      )}
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(entry.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
              {filteredEntries.length > 8 && (
                <p className="text-xs text-muted-foreground text-center pt-1">+{filteredEntries.length - 8} more captures</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <Loader2 className="w-10 h-10 text-primary animate-spin" />
          <span className="text-sm text-muted-foreground">{t("account.analyzing")}</span>
          <p className="text-xs text-muted-foreground/60">Searching entries & documents for {selectedAccount}…</p>
        </div>
      )}

      {/* Synthesis Card */}
      {synthesis && !loading && (
        <ScrollArea className="max-h-[600px]">
          <div className="space-y-4">
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span className="px-2 py-1 rounded-md bg-secondary">{synthesis.entries_count} {t("account.entries")}</span>
              <span className="px-2 py-1 rounded-md bg-secondary">{synthesis.docs_count} {t("account.docChunks")}</span>
            </div>

            <div className="glass-card rounded-xl p-5 border border-border/20">
              <h4 className="text-sm font-semibold text-primary uppercase tracking-wider mb-3">{t("account.strategicSynthesis")}</h4>
              <p className="text-sm text-foreground leading-relaxed whitespace-pre-line">{synthesis.synthesis_en}</p>
            </div>

            <div className="glass-card rounded-xl p-5 border border-border/20">
              <h4 className="text-sm font-semibold text-primary uppercase tracking-wider mb-3">{t("account.keyThemes")}</h4>
              <div className="flex flex-wrap gap-2">
                {synthesis.key_themes_en.map((theme, i) => (
                  <span key={i} className="text-xs px-3 py-1.5 rounded-full bg-primary/10 text-primary border border-primary/20">{theme}</span>
                ))}
              </div>
            </div>

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

            <Button
              onClick={handleGeneratePdf}
              disabled={generatingPdf}
              className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
              size="lg"
            >
              {generatingPdf ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <FileText className="w-4 h-4 mr-2" />}
              {t("account.architectBrief")}
            </Button>
          </div>
        </ScrollArea>
      )}

      {/* Edit Accounts Modal */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="bg-card border-border/30 max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-foreground">Manage Focus Accounts</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Add new */}
            <div className="flex gap-2">
              <Input
                placeholder="New account name…"
                value={newAccountName}
                onChange={(e) => setNewAccountName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addAccount()}
                className="bg-secondary border-border/30 text-sm"
              />
              <Button size="sm" onClick={addAccount} disabled={!newAccountName.trim()}>
                <Plus className="w-4 h-4" />
              </Button>
            </div>

            {/* List */}
            <div className="space-y-2">
              {accounts.length === 0 && (
                <p className="text-xs text-muted-foreground italic py-4 text-center">No accounts yet. Add one above.</p>
              )}
              {accounts.map((acc) => (
                <div key={acc.id} className="flex items-center gap-2 p-2 rounded-lg bg-secondary/30 border border-border/15">
                  {renamingId === acc.id ? (
                    <>
                      <Input
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && renameAccount(acc.id)}
                        className="h-7 text-sm bg-secondary border-border/30 flex-1"
                        autoFocus
                      />
                      <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => renameAccount(acc.id)}>Save</Button>
                      <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setRenamingId(null)}>
                        <X className="w-3 h-3" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <span className="text-sm text-foreground flex-1">{acc.name}</span>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-muted-foreground hover:text-foreground"
                        onClick={() => { setRenamingId(acc.id); setRenameValue(acc.name); }}
                      >
                        <Pencil className="w-3 h-3" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-muted-foreground hover:text-destructive"
                        onClick={() => deleteAccount(acc.id)}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AccountIntelligence;
