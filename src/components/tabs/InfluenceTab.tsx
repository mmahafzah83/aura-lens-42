import { useState } from "react";
import { Linkedin, Loader2, Copy, Check, Megaphone } from "lucide-react";
import { formatSmartDate } from "@/lib/formatDate";
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
      <p className={`text-xs text-muted-foreground/60 mt-1.5 leading-relaxed ${!expanded && isLong ? "line-clamp-2" : ""}`}>
        {text}
      </p>
      {isLong && (
        <button
          onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
          className="text-[10px] text-primary/70 hover:text-primary mt-1 font-medium transition-colors duration-200"
        >
          {expanded ? "Less" : "Read more"}
        </button>
      )}
    </div>
  );
};

const InfluenceTab = ({ entries, onRefresh }: { entries: Entry[]; onRefresh?: () => void }) => {
  const [draftingId, setDraftingId] = useState<string | null>(null);
  const [draftPost, setDraftPost] = useState("");
  const [draftOpen, setDraftOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();
  const { t } = useLanguage();

  const brandReady = entries.filter(e => e.summary && e.summary.trim().length > 0);

  const handleDraft = async (entry: Entry) => {
    setDraftingId(entry.id);
    try {
      const { data, error } = await supabase.functions.invoke("draft-post", {
        body: {
          title: entry.title || "",
          summary: entry.summary || "",
          content: entry.content,
          type: entry.type,
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
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(draftPost);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="h-[calc(100dvh-180px)] overflow-y-auto overscroll-contain space-y-8 pb-36">
      <div className="glass-card rounded-2xl p-6 sm:p-10">
        <div className="flex items-center gap-3 mb-2">
          <Megaphone className="w-5 h-5 text-primary/70" />
          <h2 className="text-xl font-semibold text-foreground" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>{t("influence.title")}</h2>
        </div>
        <p className="text-xs text-muted-foreground/50 mb-8 tracking-wide">{t("influence.subtitle")}</p>

        {brandReady.length === 0 ? (
          <p className="text-sm text-muted-foreground/40 italic">{t("influence.empty")}</p>
        ) : (
          <div className="space-y-4">
            {brandReady.map((entry, i) => {
              const isDrafting = draftingId === entry.id;

              return (
                <div
                  key={entry.id}
                  className="p-5 rounded-xl bg-secondary/15 border border-border/10 hover:border-primary/10 transition-all duration-300 h-auto hover-lift animate-fade-in"
                  style={{ animationDelay: `${i * 60}ms` }}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground break-words leading-relaxed">
                        {entry.title || entry.content.slice(0, 80)}
                      </p>
                      {entry.summary && <SummaryText text={entry.summary} />}
                      <div className="flex items-center gap-2.5 mt-3">
                        {entry.skill_pillar && (
                          <span className="text-[10px] font-medium px-2.5 py-0.5 rounded-full bg-primary/8 text-primary/80 border border-primary/10">
                            {entry.skill_pillar}
                          </span>
                        )}
                        <span className="text-[10px] text-muted-foreground/40 tabular-nums">
                          {formatSmartDate(entry.created_at)}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-4 pt-4 border-t border-border/8">
                    <button
                      onClick={() => handleDraft(entry)}
                      disabled={isDrafting}
                      className="flex items-center gap-1.5 text-[11px] font-medium text-primary/70 hover:text-primary transition-all duration-200 disabled:opacity-40 px-3 py-1.5 rounded-lg bg-primary/6 hover:bg-primary/12 tactile-press border border-primary/8"
                    >
                      {isDrafting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Linkedin className="w-3.5 h-3.5" />}
                      Generate EN Post
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={draftOpen} onOpenChange={setDraftOpen}>
        <DialogContent className="glass-card-elevated border-border/10 sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-gradient-gold text-xl" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>{t("draft.title")}</DialogTitle>
          </DialogHeader>
          <div className="bg-secondary/20 rounded-xl p-6 mt-3 text-sm text-foreground/90 leading-relaxed whitespace-pre-line max-h-[400px] overflow-y-auto break-words border border-border/8">
            {draftPost}
          </div>
          <Button onClick={handleCopy} variant="outline" className="w-full mt-3 border-border/15 hover-lift tactile-press">
            {copied ? <Check className="w-4 h-4 mr-2" /> : <Copy className="w-4 h-4 mr-2" />}
            {copied ? t("draft.copied") : t("draft.copy")}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default InfluenceTab;
