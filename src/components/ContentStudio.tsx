import { useState, useEffect } from "react";
import { Loader2, Copy, Check, Crown, RefreshCw, Pencil, Eye, Globe, Image as ImageIcon, Save, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export interface ContentStudioProps {
  open: boolean;
  onClose: () => void;
  /** Pre-filled topic / title */
  title: string;
  hook?: string;
  angle?: string;
  context?: string;
  /** If provided, triggers generate-content edge function flow */
  signalId?: string;
}

type Lang = "en" | "ar";

const CONTENT_TYPE_LABELS: Record<string, string> = {
  linkedin_post: "LinkedIn Post",
  carousel: "Carousel",
  framework: "Framework",
  article: "Article",
  whitepaper: "Whitepaper",
};

const ContentStudio = ({ open, onClose, title, hook, angle, context, signalId }: ContentStudioProps) => {
  const [drafts, setDrafts] = useState<Record<Lang, string>>({ en: "", ar: "" });
  const [lang, setLang] = useState<Lang>("en");
  const [loading, setLoading] = useState<Record<Lang, boolean>>({ en: false, ar: false });
  const [editing, setEditing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [visualUrl, setVisualUrl] = useState<string | null>(null);
  const [visualLoading, setVisualLoading] = useState(false);
  const [contentType, setContentType] = useState<string>("linkedin_post");
  const [saving, setSaving] = useState(false);
  // Track content_item id returned from generate-content for save/discard
  const [contentItemId, setContentItemId] = useState<string | null>(null);

  const draft = drafts[lang];

  useEffect(() => {
    if (open && title) {
      generateDraft("en");
      generateDraft("ar");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, title]);

  const generateDraft = async (targetLang: Lang) => {
    setLoading(prev => ({ ...prev, [targetLang]: true }));
    setDrafts(prev => ({ ...prev, [targetLang]: "" }));
    setEditing(false);
    setContentItemId(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      // If we have a signalId, use the generate-content edge function
      if (signalId) {
        const { data, error } = await supabase.functions.invoke("generate-content", {
          body: { signal_id: signalId, content_type: contentType, language: targetLang },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        if (data?.content_item) {
          setDrafts(prev => ({ ...prev, [targetLang]: data.content_item.body || "" }));
          if (targetLang === "en") setContentItemId(data.content_item.id);
        }
      } else {
        // Fallback to draft-post edge function (existing LinkedIn drafting)
        const summary = [
          hook ? `Hook: ${hook}` : "",
          angle ? `Angle: ${angle}` : "",
          context || "",
        ].filter(Boolean).join("\n");

        const { data, error } = await supabase.functions.invoke("draft-post", {
          body: {
            title,
            summary: summary || title,
            content: context || "",
            type: "default",
            lang: targetLang,
          },
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        setDrafts(prev => ({ ...prev, [targetLang]: data.post || "" }));
      }
    } catch (e: any) {
      toast.error(e.message || `Failed to generate ${targetLang === "ar" ? "Arabic" : "English"} draft`);
    } finally {
      setLoading(prev => ({ ...prev, [targetLang]: false }));
    }
  };

  const generateVisual = async () => {
    setVisualLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");
      const { data, error } = await supabase.functions.invoke("regenerate-schematic", {
        body: {
          image_prompt: `Strategic framework diagram for: ${title}. Key insight: ${hook || draft.slice(0, 120)}`,
        },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setVisualUrl(data.image_url || null);
      toast.success("Visual generated");
    } catch (e: any) {
      toast.error(e.message || "Failed to generate visual");
    } finally {
      setVisualLoading(false);
    }
  };

  const handleCopy = async () => {
    const plain = draft.replace(/<[^>]*>/g, "").replace(/[*_#`]/g, "");
    await navigator.clipboard.writeText(plain);
    setCopied(true);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSave = async () => {
    if (!contentItemId) {
      // If no content_item exists yet (non-signal flow), create one
      setSaving(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error("Not authenticated");
        const { error } = await supabase.from("content_items" as any).insert({
          user_id: session.user.id,
          type: contentType,
          title,
          body: draft,
          language: lang,
          status: "draft",
          generation_params: { source: "content_studio" },
        } as any);
        if (error) throw error;
        toast.success("Saved as draft");
        handleClose();
      } catch {
        toast.error("Failed to save");
      } finally {
        setSaving(false);
      }
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from("content_items" as any)
        .update({ status: "draft", body: draft } as any)
        .eq("id", contentItemId);
      if (error) throw error;
      toast.success("Saved as draft");
      handleClose();
    } catch {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleDiscard = async () => {
    if (contentItemId) {
      try {
        await supabase
          .from("content_items" as any)
          .update({ status: "discarded" } as any)
          .eq("id", contentItemId);
      } catch { /* ignore */ }
    }
    toast.success("Content discarded");
    handleClose();
  };

  const handleClose = () => {
    onClose();
    setTimeout(() => {
      setDrafts({ en: "", ar: "" });
      setEditing(false);
      setCopied(false);
      setVisualUrl(null);
      setContentItemId(null);
    }, 300);
  };

  const isCurrentLoading = loading[lang];

  return (
    <Sheet open={open} onOpenChange={(v) => !v && handleClose()}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto bg-background/95 backdrop-blur-xl border-primary/10 p-0">
        <div className="p-5 pb-0">
          <SheetHeader>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-500/20 to-amber-500/5 flex items-center justify-center border border-amber-500/10">
                <Crown className="w-4.5 h-4.5 text-amber-400" />
              </div>
              <div className="flex-1">
                <SheetTitle className="text-base font-bold text-foreground leading-tight">
                  Content Studio
                </SheetTitle>
                <SheetDescription className="text-[10px] text-muted-foreground/50 mt-0.5">
                  {signalId ? "Signal-driven content · EN + AR" : "Authority content · EN + AR"}
                </SheetDescription>
              </div>
            </div>
          </SheetHeader>
        </div>

        <div className="h-0.5 bg-gradient-to-r from-amber-500/40 via-primary/30 to-transparent mt-4" />

        {/* Topic */}
        <div className="px-5 pt-4 pb-2">
          <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground/40 font-semibold mb-1">Topic</p>
          <p className="text-xs font-medium text-foreground/80 leading-snug">{title}</p>
          {hook && (
            <p className="text-[11px] text-primary/50 italic mt-1.5 pl-3 border-l-2 border-primary/15 leading-relaxed">
              "{hook}"
            </p>
          )}
        </div>

        {/* Content type selector */}
        <div className="px-5 py-2">
          <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground/40 font-semibold mb-1.5">Format</p>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(CONTENT_TYPE_LABELS).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setContentType(key)}
                className={`text-[10px] px-2.5 py-1 rounded-full border transition-colors ${
                  contentType === key
                    ? "bg-amber-500/15 border-amber-500/30 text-amber-400 font-semibold"
                    : "bg-transparent border-border/20 text-muted-foreground/50 hover:border-border/40"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="px-5 py-4">
          {/* Language Toggle */}
          <Tabs value={lang} onValueChange={(v) => { setLang(v as Lang); setEditing(false); }} className="mb-4">
            <TabsList className="grid w-full grid-cols-2 h-8">
              <TabsTrigger value="en" className="text-xs gap-1.5">
                <Globe className="w-3 h-3" /> English
                {loading.en && <Loader2 className="w-3 h-3 animate-spin" />}
              </TabsTrigger>
              <TabsTrigger value="ar" className="text-xs gap-1.5">
                <Globe className="w-3 h-3" /> العربية
                {loading.ar && <Loader2 className="w-3 h-3 animate-spin" />}
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {isCurrentLoading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Loader2 className="w-5 h-5 text-primary/60 animate-spin" />
              <div className="text-center">
                <p className="text-xs text-muted-foreground/60">
                  {lang === "ar" ? "جارٍ إعداد المحتوى…" : "Generating your content…"}
                </p>
              </div>
            </div>
          ) : draft ? (
            <div className="space-y-4">
              {/* Draft Content */}
              <div className="rounded-xl border border-primary/[0.08] bg-card/60 backdrop-blur-sm overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-primary/[0.06]">
                  <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground/40 font-semibold">
                    {editing ? "Edit Mode" : "Preview"}
                  </p>
                  <button
                    onClick={() => setEditing(!editing)}
                    className="text-[10px] text-primary/60 hover:text-primary flex items-center gap-1 transition-colors"
                  >
                    {editing ? (
                      <><Eye className="w-3 h-3" /> Preview</>
                    ) : (
                      <><Pencil className="w-3 h-3" /> Edit</>
                    )}
                  </button>
                </div>

                {editing ? (
                  <Textarea
                    value={draft}
                    onChange={(e) => setDrafts(prev => ({ ...prev, [lang]: e.target.value }))}
                    className="border-0 rounded-none min-h-[300px] text-sm leading-relaxed resize-none focus-visible:ring-0 bg-transparent"
                    dir={lang === "ar" ? "rtl" : "ltr"}
                  />
                ) : (
                  <div
                    className="p-4 text-sm text-foreground/85 leading-relaxed whitespace-pre-line max-h-[400px] overflow-y-auto"
                    dir={lang === "ar" ? "rtl" : "auto"}
                    style={{ wordBreak: "break-word", overflowWrap: "anywhere" }}
                  >
                    {draft}
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <Button onClick={handleCopy} className="flex-1 text-xs">
                  {copied ? (
                    <><Check className="w-3.5 h-3.5 mr-1.5" /> Copied!</>
                  ) : (
                    <><Copy className="w-3.5 h-3.5 mr-1.5" /> Copy</>
                  )}
                </Button>
                <Button onClick={handleSave} disabled={saving} className="flex-1 text-xs" variant="outline">
                  {saving ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1.5" />}
                  Save
                </Button>
                <Button size="sm" variant="ghost" onClick={handleDiscard} className="text-xs text-muted-foreground">
                  <Trash2 className="w-3 h-3 mr-1" /> Discard
                </Button>
              </div>

              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => generateDraft(lang)}
                  disabled={isCurrentLoading}
                  className="text-xs border-border/15"
                >
                  <RefreshCw className="w-3 h-3 mr-1.5" /> Regenerate
                </Button>
              </div>

              {/* Visual Section */}
              <div className="rounded-xl border border-primary/[0.08] bg-card/60 backdrop-blur-sm overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-primary/[0.06]">
                  <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground/40 font-semibold">
                    Blackboard Schematic
                  </p>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={generateVisual}
                    disabled={visualLoading}
                    className="text-[10px] h-6 px-2 text-primary/60 hover:text-primary"
                  >
                    {visualLoading ? (
                      <Loader2 className="w-3 h-3 animate-spin mr-1" />
                    ) : (
                      <ImageIcon className="w-3 h-3 mr-1" />
                    )}
                    {visualUrl ? "Regenerate" : "Generate"}
                  </Button>
                </div>
                {visualLoading ? (
                  <div className="flex items-center justify-center py-10">
                    <Loader2 className="w-5 h-5 text-primary/40 animate-spin" />
                  </div>
                ) : visualUrl ? (
                  <img src={visualUrl} alt="Blackboard schematic" className="w-full" />
                ) : (
                  <div className="py-8 text-center">
                    <p className="text-[10px] text-muted-foreground/30">Click Generate to create a visual</p>
                  </div>
                )}
              </div>

              {/* Word count */}
              <p className="text-[9px] text-muted-foreground/30 text-right">
                {draft.split(/\s+/).filter(Boolean).length} words
              </p>
            </div>
          ) : (
            <div className="text-center py-12">
              <p className="text-xs text-muted-foreground/40">No draft generated yet.</p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => generateDraft(lang)}
                className="mt-3 text-xs"
              >
                Generate Draft
              </Button>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default ContentStudio;
