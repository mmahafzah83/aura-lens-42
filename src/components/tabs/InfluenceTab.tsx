import { useState } from "react";
import { Linkedin, Languages, Loader2, Copy, Check, Megaphone } from "lucide-react";
import { formatSmartDate } from "@/lib/formatDate";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/contexts/LanguageContext";
import type { Database } from "@/integrations/supabase/types";

type Entry = Database["public"]["Tables"]["entries"]["Row"];

const SummaryText = ({ text }: { text: string }) => {
  const [expanded, setExpanded] = useState(false);
  const isLong = text.length > 160;

  return (
    <div>
      <p className={`text-xs text-muted-foreground mt-1 ${!expanded && isLong ? "line-clamp-2" : ""}`}>
        {text}
      </p>
      {isLong && (
        <button
          onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
          className="text-[10px] text-primary hover:text-primary/80 mt-0.5 font-medium"
        >
          {expanded ? "Less" : "Read more"}
        </button>
      )}
    </div>
  );
};

const InfluenceTab = ({ entries, onRefresh }: { entries: Entry[]; onRefresh?: () => void }) => {
  const [draftingId, setDraftingId] = useState<string | null>(null);
  const [draftingArId, setDraftingArId] = useState<string | null>(null);
  const [translatingId, setTranslatingId] = useState<string | null>(null);
  const [draftPost, setDraftPost] = useState("");
  const [draftOpen, setDraftOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();
  const { t } = useLanguage();

  const brandReady = entries.filter(e => e.summary && e.summary.trim().length > 0);

  const handleDraft = async (entry: Entry, arStyle?: boolean) => {
    if (arStyle) setDraftingArId(entry.id);
    else setDraftingId(entry.id);
    try {
      const { data, error } = await supabase.functions.invoke("draft-post", {
        body: {
          title: entry.title || "",
          summary: entry.summary || "",
          content: entry.content,
          type: arStyle ? "arabic-executive" : entry.type,
        },
      });
      if (error || data?.error) {
        toast({ title: "Draft failed", description: data?.error || error?.message, variant: "destructive" });
      } else {
        setDraftPost(data.post);
        setDraftOpen(true);
      }
    } catch {
      toast({ title: "Error", description: "Could not generate draft.", variant: "destructive" });
    }
    setDraftingId(null);
    setDraftingArId(null);
  };

  const handleTranslate = async (entry: Entry) => {
    setTranslatingId(entry.id);
    try {
      const { data, error } = await supabase.functions.invoke("draft-post", {
        body: {
          title: entry.title || "",
          summary: entry.summary || "",
          content: entry.content,
          type: "translate-executive-ar",
        },
      });
      if (error || data?.error) {
        toast({ title: "Translation failed", description: data?.error || error?.message, variant: "destructive" });
      } else {
        setDraftPost(data.post);
        setDraftOpen(true);
      }
    } catch {
      toast({ title: "Error", description: "Could not translate.", variant: "destructive" });
    }
    setTranslatingId(null);
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(draftPost);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      <div className="glass-card rounded-2xl p-5 sm:p-8">
        <div className="flex items-center gap-2 mb-1">
          <Megaphone className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold text-foreground">{t("influence.title")}</h2>
        </div>
        <p className="text-xs text-muted-foreground mb-6">{t("influence.subtitle")}</p>

        {brandReady.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">{t("influence.empty")}</p>
        ) : (
          <ScrollArea className="max-h-[600px]">
            <div className="space-y-3 pr-3">
              {brandReady.map((entry) => {
                const isDrafting = draftingId === entry.id;
                const isDraftingAr = draftingArId === entry.id;
                const isTranslating = translatingId === entry.id;

                return (
                  <div
                    key={entry.id}
                    className="p-4 rounded-xl bg-secondary/30 border border-border/20 hover:bg-secondary/50 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground break-words">
                          {entry.title || entry.content.slice(0, 80)}
                        </p>
                        {entry.summary && <SummaryText text={entry.summary} />}
                        <div className="flex items-center gap-2 mt-2">
                          {entry.skill_pillar && (
                            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-primary/15 text-primary">
                              {entry.skill_pillar}
                            </span>
                          )}
                          <span className="text-[10px] text-muted-foreground">
                            {new Date(entry.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border/10 flex-wrap">
                      <button
                        onClick={() => handleTranslate(entry)}
                        disabled={isTranslating}
                        className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground hover:text-primary transition-colors disabled:opacity-50 px-2 py-1 rounded-md bg-secondary/50"
                      >
                        {isTranslating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Languages className="w-3.5 h-3.5" />}
                        {t("entries.translate")}
                      </button>
                      <button
                        onClick={() => handleDraft(entry, true)}
                        disabled={isDraftingAr}
                        className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground hover:text-primary transition-colors disabled:opacity-50 px-2 py-1 rounded-md bg-secondary/50"
                      >
                        {isDraftingAr ? <Loader2 className="w-3 h-3 animate-spin" /> : <span className="text-[10px]">عر</span>}
                        {t("entries.linkedinAr")}
                      </button>
                      <button
                        onClick={() => handleDraft(entry)}
                        disabled={isDrafting}
                        className="flex items-center gap-1 text-[10px] font-medium text-primary/80 hover:text-primary transition-colors disabled:opacity-50 px-2 py-1 rounded-md bg-primary/10"
                      >
                        {isDrafting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Linkedin className="w-3.5 h-3.5" />}
                        {t("entries.linkedinPost")}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </div>

      <Dialog open={draftOpen} onOpenChange={setDraftOpen}>
        <DialogContent className="glass-card border-border/30 sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-gradient-gold text-lg">{t("draft.title")}</DialogTitle>
          </DialogHeader>
          <div className="bg-secondary/50 rounded-xl p-5 mt-2 text-sm text-foreground leading-relaxed whitespace-pre-line max-h-[400px] overflow-y-auto break-words">
            {draftPost}
          </div>
          <Button onClick={handleCopy} variant="outline" className="w-full mt-2 border-border/30">
            {copied ? <Check className="w-4 h-4 mr-2" /> : <Copy className="w-4 h-4 mr-2" />}
            {copied ? t("draft.copied") : t("draft.copy")}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default InfluenceTab;
