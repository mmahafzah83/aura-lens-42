import { useEffect, useMemo, useState } from "react";
import {
  Eye, TrendingUp, AlertTriangle, HelpCircle, Loader2,
  Copy, Check, BookmarkPlus, Image as ImageIcon, Download, RefreshCw,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

type FlashLang = "ar" | "en";
type FlashMode = "theme" | "spark";
type PostTypeKey = "reveal" | "pattern" | "problem" | "challenge";

interface PostTypeDef {
  key: PostTypeKey;
  icon: any;
  labelAr: string;
  labelEn: string;
  subAr: string;
  subEn: string;
}

const POST_TYPES: PostTypeDef[] = [
  { key: "reveal",    icon: Eye,            labelAr: "كشف",  labelEn: "Reveal",          subAr: "كشف واقع مخفي",        subEn: "Reveal a hidden truth" },
  { key: "pattern",   icon: TrendingUp,     labelAr: "نمط",  labelEn: "Pattern",         subAr: "نمط متكرر في الجهات",   subEn: "Recurring industry pattern" },
  { key: "problem",   icon: AlertTriangle,  labelAr: "خلل",  labelEn: "Problem Reframe", subAr: "المشكلة مش في X",       subEn: "The problem isn't X" },
  { key: "challenge", icon: HelpCircle,     labelAr: "تحدي", labelEn: "Challenge",       subAr: "سؤال يعيد التقييم",     subEn: "A question that reframes" },
];

const FALLBACK_THEMES = ["التحول الرقمي", "قطاع المياه", "الحوكمة", "فجوة IT وOT"];

const SECTORS: { value: string; ar: string; en: string }[] = [
  { value: "general",        ar: "عام — لجميع القطاعات",       en: "General — All Sectors" },
  { value: "water",          ar: "قطاع المياه والمرافق",        en: "Water & Utilities" },
  { value: "digital",        ar: "التحول الرقمي المؤسسي",       en: "Enterprise Digital Transformation" },
  { value: "infrastructure", ar: "البنية التحتية الحيوية",       en: "Critical Infrastructure" },
  { value: "governance",     ar: "الحوكمة والقيادة",            en: "Governance & Leadership" },
  { value: "vision2030",     ar: "رؤية 2030 والقطاع العام",     en: "Vision 2030 & Public Sector" },
];

interface FlashResult {
  variation: number;
  text: string;
  copied?: boolean;
  imageLoading?: boolean;
  visuals?: FlashVisual[] | null;
  saving?: boolean;
}

interface FlashVisual {
  style: string;
  label_ar: string;
  label_en: string;
  image_data?: string;
  error?: string;
}

const arabicNumerals = ["١", "٢", "٣"];

export default function FlashPanel() {
  const [lang, setLang] = useState<FlashLang>("ar");
  const [mode, setMode] = useState<FlashMode>("theme");
  const [postType, setPostType] = useState<PostTypeKey | null>(null);
  const [themeChips, setThemeChips] = useState<string[]>(FALLBACK_THEMES);
  const [selectedTheme, setSelectedTheme] = useState<string | null>(null);
  const [sector, setSector] = useState<string>("general");
  const [spark, setSpark] = useState("");
  const [generating, setGenerating] = useState(false);
  const [results, setResults] = useState<FlashResult[]>([]);

  // Load themes from authority_voice_profiles.storytelling_patterns
  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) return;
      const { data } = await supabase
        .from("authority_voice_profiles")
        .select("storytelling_patterns")
        .eq("user_id", session.user.id)
        .maybeSingle();
      const patterns = data?.storytelling_patterns;
      if (Array.isArray(patterns) && patterns.length > 0) {
        const chips = patterns
          .map((p: any) => (typeof p === "string" ? p : (p?.text || p?.label || "")))
          .filter((s: string) => !!s && s.trim().length > 0)
          .map((s: string) => s.trim().split(/\s+/).slice(0, 4).join(" "))
          .slice(0, 12);
        if (chips.length > 0) setThemeChips(Array.from(new Set(chips)));
      }
    })();
  }, []);

  const t = useMemo(() => ({
    langAr: "العربية",
    langEn: "English",
    modeTheme: lang === "ar" ? "بالموضوع" : "By Theme",
    modeSpark: lang === "ar" ? "بكلماتك" : "Your Spark",
    sectorLabel: lang === "ar" ? "القطاع" : "Sector",
    themeSelectLabel: lang === "ar" ? "الموضوع" : "Theme",
    themePlaceholder: lang === "ar" ? "اختر موضوعاً" : "Select a theme",
    postTypeLabel: lang === "ar" ? "نوع البوست" : "Post type",
    themesLabel: lang === "ar" ? "المواضيع" : "Themes",
    sparkLabel: lang === "ar" ? "شرارة" : "Your spark",
    sparkPlaceholder: lang === "ar"
      ? "اكتب 3-10 كلمات... مثال: اجتماعات كثيرة ونتائج قليلة"
      : "Write 3-10 words... e.g. too many meetings, no results",
    generate: lang === "ar" ? "⚡ توليد 3 نسخ" : "⚡ Generate 3 versions",
    generating: lang === "ar" ? "⚡ جاري التوليد..." : "⚡ Generating...",
    copy: lang === "ar" ? "نسخ" : "Copy",
    saveDraft: lang === "ar" ? "حفظ مسودة" : "Save Draft",
    saved: lang === "ar" ? "تم الحفظ" : "Saved",
    genVisual: lang === "ar" ? "🎨 توليد صورة" : "🎨 Generate Visual",
    visualLoading: lang === "ar" ? "جاري التوليد..." : "Generating...",
    download: lang === "ar" ? "تحميل" : "Download",
    newVariations: lang === "ar" ? "🔄 نسخ جديدة" : "🔄 New Variations",
    versionWord: lang === "ar" ? "النسخة" : "Version",
    genVisuals: lang === "ar" ? "🎨 توليد صور" : "🎨 Generate Visuals",
    visualsLoading: lang === "ar" ? "⚡ جاري توليد 3 تصاميم مختلفة..." : "⚡ Generating 3 designs...",
    chooseDesign: lang === "ar" ? "اختر التصميم المناسب" : "Choose your design",
    select: lang === "ar" ? "اختر هذا" : "Select",
    regenerateAll: lang === "ar" ? "🔄 أعد التوليد" : "🔄 Regenerate All",
    visualFailed: lang === "ar" ? "فشل التوليد" : "Failed",
    retry: lang === "ar" ? "أعد المحاولة" : "Retry",
  }), [lang]);

  const canGenerate = mode === "theme"
    ? !!postType && !!selectedTheme && !generating
    : spark.trim().length >= 3 && !generating;

  const buildTopic = (): string => {
    if (mode === "theme") return selectedTheme || "";
    return spark.trim();
  };

  const buildContext = (): string => {
    if (mode !== "theme" || !postType) return "";
    const def = POST_TYPES.find(p => p.key === postType);
    if (!def) return "";
    const labelAr = def.labelAr;
    const labelEn = def.labelEn;
    return lang === "ar" ? `نوع البوست: ${labelAr}` : `Post type: ${labelEn}`;
  };

  const sectorPayloadValue = (): string => {
    const s = SECTORS.find(s => s.value === sector);
    if (!s) return "";
    return lang === "ar" ? s.ar : s.en;
  };

  const callOnce = async (variation: number, accessToken: string): Promise<string> => {
    const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-authority-content`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      },
      body: JSON.stringify({
        action: "generate_content",
        content_type: "post",
        topic: buildTopic(),
        context: buildContext(),
        language: lang,
        lang,
        framework: "auto",
        contentType: "post",
        flash: true,
        stream: false,
        variation,
        sector: sectorPayloadValue(),
      }),
    });
    if (!resp.ok) throw new Error(`Generation failed (${resp.status})`);
    const data = await resp.json();
    return data?.content || "";
  };

  const runGeneration = async () => {
    setGenerating(true);
    setResults([]);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Not authenticated");
      const [a, b, c] = await Promise.all([
        callOnce(1, session.access_token),
        callOnce(2, session.access_token),
        callOnce(3, session.access_token),
      ]);
      setResults([
        { variation: 1, text: a },
        { variation: 2, text: b },
        { variation: 3, text: c },
      ]);
    } catch (e: any) {
      toast.error(e.message || "Generation failed");
    } finally {
      setGenerating(false);
    }
  };

  const onCopy = async (idx: number) => {
    const r = results[idx];
    if (!r) return;
    await navigator.clipboard.writeText(r.text);
    setResults(prev => prev.map((x, i) => i === idx ? { ...x, copied: true } : x));
    setTimeout(() => {
      setResults(prev => prev.map((x, i) => i === idx ? { ...x, copied: false } : x));
    }, 2000);
  };

  const onSaveDraft = async (idx: number) => {
    const r = results[idx];
    if (!r) return;
    setResults(prev => prev.map((x, i) => i === idx ? { ...x, saving: true } : x));
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) throw new Error("Not authenticated");
      const { error } = await supabase.from("linkedin_posts").insert({
        user_id: session.user.id,
        post_text: r.text,
        source_type: "aura_generated",
        tracking_status: "draft",
      });
      if (error) throw error;
      toast.success(t.saved);
    } catch (e: any) {
      toast.error(e.message || "Save failed");
    } finally {
      setResults(prev => prev.map((x, i) => i === idx ? { ...x, saving: false } : x));
    }
  };

  const onGenerateVisual = async (idx: number) => {
    const r = results[idx];
    if (!r) return;
    setResults(prev => prev.map((x, i) => i === idx ? { ...x, imageLoading: true } : x));
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Not authenticated");
      const ptDef = postType ? POST_TYPES.find(p => p.key === postType) : null;
      const ptLabel = ptDef ? (lang === "ar" ? ptDef.labelAr : ptDef.labelEn) : "";
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-flash-image`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({
          topic: buildTopic(),
          lang,
          post_text: r.text,
          sector: sectorPayloadValue(),
          post_type: ptLabel,
        }),
      });
      const data = await resp.json();
      if (!resp.ok || !Array.isArray(data?.visuals)) throw new Error(data?.error || "generation_failed");
      setResults(prev => prev.map((x, i) => i === idx ? { ...x, visuals: data.visuals, imageLoading: false } : x));
    } catch (e: any) {
      toast.error(e.message || "Image generation failed");
      setResults(prev => prev.map((x, i) => i === idx ? { ...x, imageLoading: false } : x));
    }
  };

  const downloadVisual = (v: FlashVisual) => {
    if (!v.image_data) return;
    const a = document.createElement("a");
    a.href = v.image_data;
    a.download = `flash-${v.style}-${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const versionLabel = (n: number) => lang === "ar"
    ? `${t.versionWord} ${arabicNumerals[n - 1] || n}`
    : `${t.versionWord} ${n}`;

  const dirAttr = lang === "ar" ? "rtl" : "ltr";
  const arabicFontStyle = lang === "ar" ? { fontFamily: "Cairo, sans-serif" as const } : undefined;

  return (
    <div className="space-y-5">
      {/* Language toggle */}
      <div className="flex items-center gap-3">
        <p className="text-label uppercase tracking-wider text-xs font-semibold">Language</p>
        <div className="flex gap-1 bg-secondary/30 rounded-lg p-0.5 border border-border/10">
          <button
            onClick={() => setLang("ar")}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${lang === "ar" ? "bg-primary/15 text-primary" : "text-muted-foreground"}`}
          >
            {t.langAr}
          </button>
          <button
            onClick={() => setLang("en")}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${lang === "en" ? "bg-primary/15 text-primary" : "text-muted-foreground"}`}
          >
            {t.langEn}
          </button>
        </div>
      </div>

      {/* Mode selector */}
      <div className="flex gap-2">
        <button
          onClick={() => setMode("theme")}
          className={`px-4 py-2 rounded-full text-xs font-medium border transition-all ${
            mode === "theme"
              ? "bg-primary/10 border-primary/30 text-primary"
              : "bg-secondary/20 border-border/10 text-muted-foreground hover:border-border/30"
          }`}
        >
          {t.modeTheme}
        </button>
        <button
          onClick={() => setMode("spark")}
          className={`px-4 py-2 rounded-full text-xs font-medium border transition-all ${
            mode === "spark"
              ? "bg-primary/10 border-primary/30 text-primary"
              : "bg-secondary/20 border-border/10 text-muted-foreground hover:border-border/30"
          }`}
        >
          {t.modeSpark}
        </button>
      </div>

      {/* MODE 1: BY THEME */}
      {mode === "theme" && (
        <>
          <div>
            <p className="text-label uppercase tracking-wider text-xs font-semibold mb-2" style={lang === "ar" ? arabicFontStyle : undefined}>
              {t.sectorLabel}
            </p>
            <Select value={sector} onValueChange={setSector} dir={dirAttr}>
              <SelectTrigger className="w-full bg-secondary/30 border-border/20 text-sm" style={lang === "ar" ? arabicFontStyle : undefined}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SECTORS.map(s => (
                  <SelectItem key={s.value} value={s.value} style={lang === "ar" ? arabicFontStyle : undefined}>
                    {lang === "ar" ? s.ar : s.en}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <p className="text-label uppercase tracking-wider text-xs font-semibold mb-2">{t.postTypeLabel}</p>
            <div className="grid grid-cols-2 gap-2">
              {POST_TYPES.map(pt => {
                const Icon = pt.icon;
                const selected = postType === pt.key;
                return (
                  <button
                    key={pt.key}
                    onClick={() => setPostType(pt.key)}
                    dir={dirAttr}
                    style={selected ? { borderColor: "#F97316", backgroundColor: "rgba(249,115,22,0.08)" } : undefined}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      selected
                        ? "text-foreground"
                        : "bg-secondary/20 border-border/10 text-muted-foreground hover:border-border/30"
                    }`}
                  >
                    <Icon className="w-4 h-4 mb-1.5" style={selected ? { color: "#F97316" } : undefined} />
                    <div className="text-xs font-semibold" style={lang === "ar" ? arabicFontStyle : undefined}>
                      {lang === "ar" ? pt.labelAr : pt.labelEn}
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5" style={lang === "ar" ? arabicFontStyle : undefined}>
                      {lang === "ar" ? pt.subAr : pt.subEn}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <p className="text-label uppercase tracking-wider text-xs font-semibold mb-2" style={lang === "ar" ? arabicFontStyle : undefined}>
              {t.themeSelectLabel}
            </p>
            <Select value={selectedTheme || ""} onValueChange={setSelectedTheme} dir={dirAttr}>
              <SelectTrigger className="w-full bg-secondary/30 border-border/20 text-sm" style={lang === "ar" ? arabicFontStyle : undefined}>
                <SelectValue placeholder={t.themePlaceholder} />
              </SelectTrigger>
              <SelectContent>
                {themeChips.map(chip => (
                  <SelectItem key={chip} value={chip} style={lang === "ar" ? arabicFontStyle : undefined}>
                    {chip}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </>
      )}

      {/* MODE 2: YOUR SPARK */}
      {mode === "spark" && (
        <div>
          <p className="text-label uppercase tracking-wider text-xs font-semibold mb-2">{t.sparkLabel}</p>
          <Textarea
            value={spark}
            onChange={(e) => setSpark(e.target.value)}
            placeholder={t.sparkPlaceholder}
            dir={dirAttr}
            className="min-h-[80px] bg-secondary/30 border-border/20 text-sm"
            style={lang === "ar" ? arabicFontStyle : undefined}
          />
        </div>
      )}

      {/* Generate button */}
      <button
        onClick={runGeneration}
        disabled={!canGenerate}
        style={{
          backgroundColor: canGenerate ? "#F97316" : undefined,
          color: canGenerate ? "#fff" : undefined,
        }}
        className={`w-full py-3 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2 ${
          canGenerate
            ? "hover:brightness-110 active:scale-[0.98]"
            : "bg-secondary/30 text-muted-foreground cursor-not-allowed"
        }`}
      >
        {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
        <span style={lang === "ar" ? arabicFontStyle : undefined}>{t.generate}</span>
      </button>

      {/* Loading skeletons */}
      {generating && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground text-center" style={lang === "ar" ? arabicFontStyle : undefined}>
            {t.generating}
          </p>
          {[0, 1, 2].map(i => (
            <div key={i} className="rounded-xl border border-border/10 bg-secondary/10 p-4 space-y-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-5/6" />
              <Skeleton className="h-3 w-4/6" />
            </div>
          ))}
        </div>
      )}

      {/* Results */}
      {!generating && results.length > 0 && (
        <div className="space-y-4">
          {results.map((r, idx) => (
            <div
              key={idx}
              dir={dirAttr}
              style={lang === "ar" ? { direction: "rtl", textAlign: "right" } : undefined}
              className="relative rounded-xl border border-border/15 bg-card/60 backdrop-blur-sm p-4 space-y-3"
            >
              <span
                className="absolute top-3 px-2 py-0.5 rounded-full text-[10px] font-semibold text-white"
                style={{
                  backgroundColor: "#F97316",
                  ...(lang === "ar" ? { left: "0.75rem" } : { right: "0.75rem" }),
                  ...(lang === "ar" ? arabicFontStyle : undefined),
                }}
              >
                {versionLabel(r.variation)}
              </span>

              <div
                dir={dirAttr}
                className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap pt-4"
                style={lang === "ar"
                  ? { fontFamily: "Cairo, sans-serif", textAlign: "right", direction: "rtl" }
                  : { fontFamily: "Inter, sans-serif" }}
              >
                {r.text}
              </div>

              <div
                className="flex flex-wrap items-center gap-2"
                style={lang === "ar" ? { flexDirection: "row-reverse" } : undefined}
              >
                <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={() => onCopy(idx)}>
                  {r.copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  <span style={lang === "ar" ? arabicFontStyle : undefined}>{t.copy}</span>
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 gap-1.5 text-xs"
                  disabled={!!r.saving}
                  onClick={() => onSaveDraft(idx)}
                >
                  {r.saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <BookmarkPlus className="w-3 h-3" />}
                  <span style={lang === "ar" ? arabicFontStyle : undefined}>{t.saveDraft}</span>
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 gap-1.5 text-[11px] text-muted-foreground"
                  disabled={!!r.imageLoading}
                  onClick={() => onGenerateVisual(idx)}
                >
                  {r.imageLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <ImageIcon className="w-3 h-3" />}
                  <span style={lang === "ar" ? arabicFontStyle : undefined}>
                    {r.imageLoading ? t.visualsLoading : t.genVisuals}
                  </span>
                </Button>
              </div>

              {r.visuals && r.visuals.length > 0 && (
                <div className="space-y-3 pt-2 border-t border-border/10">
                  <p
                    className="text-xs font-semibold text-foreground/80"
                    style={lang === "ar" ? arabicFontStyle : undefined}
                  >
                    {t.chooseDesign}
                  </p>
                  <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
                    {r.visuals.map((v, vi) => (
                      <div
                        key={vi}
                        className="flex-shrink-0 w-48 space-y-2"
                        dir={dirAttr}
                      >
                        {v.image_data ? (
                          <img
                            src={v.image_data}
                            alt={lang === "ar" ? v.label_ar : v.label_en}
                            className="w-48 h-60 object-cover rounded-xl border border-border/15"
                          />
                        ) : (
                          <div className="w-48 h-60 rounded-xl border border-border/15 bg-secondary/30 flex flex-col items-center justify-center gap-2 text-muted-foreground">
                            <ImageIcon className="w-6 h-6 opacity-50" />
                            <span className="text-[11px]" style={lang === "ar" ? arabicFontStyle : undefined}>
                              {t.visualFailed}
                            </span>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 gap-1.5 text-[11px]"
                              onClick={() => onGenerateVisual(idx)}
                            >
                              <RefreshCw className="w-3 h-3" />
                              <span style={lang === "ar" ? arabicFontStyle : undefined}>{t.retry}</span>
                            </Button>
                          </div>
                        )}
                        <div
                          className="text-[11px] font-medium text-center text-foreground/80"
                          style={lang === "ar" ? arabicFontStyle : undefined}
                        >
                          {lang === "ar" ? v.label_ar : v.label_en}
                        </div>
                        {v.image_data && (
                          <div className="flex items-center gap-1.5 justify-center">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-[11px] flex-1"
                              onClick={() => window.open(v.image_data!, "_blank")}
                            >
                              <span style={lang === "ar" ? arabicFontStyle : undefined}>{t.select}</span>
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0"
                              onClick={() => downloadVisual(v)}
                              aria-label={t.download}
                            >
                              <Download className="w-3 h-3" />
                            </Button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full h-8 gap-1.5 text-xs"
                    disabled={!!r.imageLoading}
                    onClick={() => onGenerateVisual(idx)}
                  >
                    {r.imageLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                    <span style={lang === "ar" ? arabicFontStyle : undefined}>{t.regenerateAll}</span>
                  </Button>
                </div>
              )}
            </div>
          ))}

          <Button
            variant="outline"
            className="w-full gap-2"
            onClick={runGeneration}
            disabled={!canGenerate}
          >
            <RefreshCw className="w-4 h-4" />
            <span style={lang === "ar" ? arabicFontStyle : undefined}>{t.newVariations}</span>
          </Button>
        </div>
      )}
    </div>
  );
}