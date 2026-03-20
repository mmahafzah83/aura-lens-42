import { useState } from "react";
import { Link, Mic, Type, ExternalLink, Search, Loader2, Copy, Check, Linkedin, ChevronDown, ChevronUp, Pin, PinOff, ImageIcon, Archive, Languages } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/contexts/LanguageContext";
import type { Database } from "@/integrations/supabase/types";

type Entry = Database["public"]["Tables"]["entries"]["Row"] & { pinned?: boolean; image_url?: string | null };

const iconMap: Record<string, any> = {
  link: Link,
  voice: Mic,
  text: Type,
  image: ImageIcon,
};

function detectDir(text: string): "rtl" | "ltr" {
  return /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(text) ? "rtl" : "ltr";
}

const ExpandableSummary = ({ text }: { text: string }) => {
  const [expanded, setExpanded] = useState(false);
  const { t } = useLanguage();
  const isLong = text.length > 200;
  const dir = detectDir(text);

  return (
    <div>
      <p
        className={`text-xs text-muted-foreground whitespace-pre-line leading-relaxed break-words ${!expanded && isLong ? "line-clamp-3" : ""}`}
        dir={dir}
        style={{ wordBreak: "break-word", overflowWrap: "anywhere" }}
      >
        {text}
      </p>
      {isLong && (
        <button
          onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
          className="flex items-center gap-0.5 text-[10px] text-primary/70 hover:text-primary mt-1 transition-colors"
        >
          {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          {expanded ? t("entries.less") : t("entries.readMore")}
        </button>
      )}
    </div>
  );
};

const RecentEntries = ({ entries, onRefresh }: { entries: Entry[]; onRefresh?: () => void }) => {
  const [search, setSearch] = useState("");
  const [draftingId, setDraftingId] = useState<string | null>(null);
  const [draftingArId, setDraftingArId] = useState<string | null>(null);
  const [translatingId, setTranslatingId] = useState<string | null>(null);
  const [draftPost, setDraftPost] = useState("");
  const [draftOpen, setDraftOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showArchive, setShowArchive] = useState(false);
  const [togglingPin, setTogglingPin] = useState<string | null>(null);
  const { toast } = useToast();
  const { t } = useLanguage();

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const activeEntries = entries.filter((e) => {
    const isPinned = (e as any).pinned === true;
    const isOld = new Date(e.created_at) < thirtyDaysAgo;
    return isPinned || !isOld;
  });

  const archivedEntries = entries.filter((e) => {
    const isPinned = (e as any).pinned === true;
    const isOld = new Date(e.created_at) < thirtyDaysAgo;
    return !isPinned && isOld;
  });

  const displayEntries = showArchive ? archivedEntries : activeEntries;

  const filtered = displayEntries.filter((e) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      e.content.toLowerCase().includes(q) ||
      (e.summary && e.summary.toLowerCase().includes(q)) ||
      (e.title && e.title.toLowerCase().includes(q)) ||
      (e.skill_pillar && e.skill_pillar.toLowerCase().includes(q))
    );
  });

  const handleTogglePin = async (entry: Entry) => {
    setTogglingPin(entry.id);
    const newPinned = !(entry as any).pinned;
    const { error } = await supabase
      .from("entries")
      .update({ pinned: newPinned } as any)
      .eq("id", entry.id);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      (entry as any).pinned = newPinned;
      onRefresh?.();
    }
    setTogglingPin(null);
  };

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
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-5 gap-4 flex-wrap">
        <div>
          <h3 className="text-lg font-semibold text-foreground mb-0.5">{t("entries.title")}</h3>
          <p className="text-xs text-muted-foreground tracking-wide uppercase">{t("entries.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button
            onClick={() => setShowArchive(!showArchive)}
            className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-colors ${
              showArchive ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"
            }`}
          >
            <Archive className="w-3.5 h-3.5" />
            {t("entries.archive")}{archivedEntries.length > 0 && ` (${archivedEntries.length})`}
          </button>
          <div className="relative flex-1 sm:w-52">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              placeholder={t("entries.search")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="ps-9 h-9 bg-secondary border-border/30 text-sm"
            />
          </div>
        </div>
      </div>
      <ScrollArea className="h-[360px] sm:h-[420px]">
        <div className="space-y-3 pe-3">
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">
              {showArchive ? t("entries.noArchive") : search ? t("entries.noResults") : t("entries.noEntries")}
            </p>
          ) : (
            filtered.map((entry) => {
              const Icon = iconMap[entry.type] || Type;
              const pillar = entry.skill_pillar;
              const title = entry.title;
              const isLink = entry.type === "link";
              const isDrafting = draftingId === entry.id;
              const isDraftingAr = draftingArId === entry.id;
              const isTranslating = translatingId === entry.id;
              const contentDir = detectDir(entry.content);
              const isPinned = (entry as any).pinned === true;
              const imageUrl = (entry as any).image_url;

              return (
                <div
                  key={entry.id}
                  className={`flex items-start gap-3 p-3 sm:p-4 rounded-xl border transition-colors ${
                    isPinned
                      ? "bg-primary/5 border-primary/20 hover:bg-primary/10"
                      : "bg-secondary/40 border-border/20 hover:bg-secondary/60"
                  }`}
                >
                  <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                    {imageUrl ? (
                      <img src={imageUrl} alt="" className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg object-cover" />
                    ) : (
                      <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-primary" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1 space-y-1.5">
                    {isLink && title ? (
                      <a
                        href={entry.content}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-medium text-foreground hover:text-primary transition-colors flex items-center gap-1.5 group break-words"
                        dir="auto"
                        style={{ wordBreak: "break-word", overflowWrap: "anywhere" }}
                      >
                        {title}
                        <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                      </a>
                    ) : title ? (
                      <p className="text-sm font-medium text-foreground break-words" dir="auto">{title}</p>
                    ) : (
                      <p className="text-sm text-foreground break-words" dir={contentDir} style={{ wordBreak: "break-word", overflowWrap: "anywhere" }}>
                        {entry.content}
                      </p>
                    )}
                    {entry.summary && <ExpandableSummary text={entry.summary} />}
                    <div className="flex items-center gap-2 pt-0.5 flex-wrap">
                      {pillar && (
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-primary/15 text-primary">
                          {pillar}
                        </span>
                      )}
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(entry.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </span>

                      <button
                        onClick={() => handleTogglePin(entry)}
                        disabled={togglingPin === entry.id}
                        className={`flex items-center gap-0.5 text-[10px] font-medium transition-colors disabled:opacity-50 ${
                          isPinned ? "text-primary" : "text-muted-foreground hover:text-primary"
                        }`}
                        title={isPinned ? "Unpin" : "Pin"}
                      >
                        {togglingPin === entry.id ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : isPinned ? (
                          <PinOff className="w-3 h-3" />
                        ) : (
                          <Pin className="w-3 h-3" />
                        )}
                      </button>

                      {entry.summary && (
                        <div className="ms-auto flex items-center gap-2">
                          {/* Translate to Executive Arabic */}
                          <button
                            onClick={() => handleTranslate(entry)}
                            disabled={isTranslating}
                            className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground hover:text-primary transition-colors disabled:opacity-50"
                            title={t("entries.translate")}
                          >
                            {isTranslating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Languages className="w-3.5 h-3.5" />}
                            <span className="hidden sm:inline">{t("entries.translate")}</span>
                          </button>
                          {/* Arabic LinkedIn */}
                          <button
                            onClick={() => handleDraft(entry, true)}
                            disabled={isDraftingAr}
                            className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground hover:text-primary transition-colors disabled:opacity-50"
                            title={t("entries.linkedinAr")}
                          >
                            {isDraftingAr ? <Loader2 className="w-3 h-3 animate-spin" /> : <span className="text-[10px]">عر</span>}
                            <span className="hidden sm:inline">{t("entries.linkedinAr")}</span>
                          </button>
                          {/* English LinkedIn */}
                          <button
                            onClick={() => handleDraft(entry)}
                            disabled={isDrafting}
                            className="flex items-center gap-1 text-[10px] font-medium text-primary/70 hover:text-primary transition-colors disabled:opacity-50"
                            title={t("entries.linkedinPost")}
                          >
                            {isDrafting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Linkedin className="w-3.5 h-3.5" />}
                            <span className="hidden sm:inline">{t("entries.linkedinPost")}</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </ScrollArea>

      <Dialog open={draftOpen} onOpenChange={setDraftOpen}>
        <DialogContent className="glass-card border-border/30 sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-gradient-gold text-lg">{t("draft.title")}</DialogTitle>
          </DialogHeader>
          <div className="bg-secondary/50 rounded-xl p-5 mt-2 text-sm text-foreground leading-relaxed whitespace-pre-line max-h-[400px] overflow-y-auto break-words" dir="auto" style={{ wordBreak: "break-word", overflowWrap: "anywhere" }}>
            {draftPost}
          </div>
          <Button onClick={handleCopy} variant="outline" className="w-full mt-2 border-border/30">
            {copied ? <Check className="w-4 h-4 me-2" /> : <Copy className="w-4 h-4 me-2" />}
            {copied ? t("draft.copied") : t("draft.copy")}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default RecentEntries;
