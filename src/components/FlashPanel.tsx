import { useEffect, useMemo, useState } from "react";
import {
  Eye, TrendingUp, AlertTriangle, CheckCircle2, Sparkles, Compass, Lightbulb, Star, Loader2,
  Copy, Check, BookmarkPlus, RefreshCw, Linkedin,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { shareToLinkedIn } from "@/lib/shareLinkedIn";
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
import InfoTooltip from "@/components/ui/InfoTooltip";

type FlashLang = "ar" | "en";
type FlashMode = "theme" | "spark";
type PostTypeKey =
  | "reveal"
  | "pattern"
  | "tension"
  | "win"
  | "prediction"
  | "framework"
  | "lesson"
  | "inspiration";

interface PostTypeDef {
  key: PostTypeKey;
  icon: any;
  labelAr: string;
  labelEn: string;
  subAr: string;
  subEn: string;
}

const POST_TYPES: PostTypeDef[] = [
  { key: "reveal",      icon: Eye,           labelAr: "كشف",   labelEn: "Reveal",      subAr: "كشف واقع مخفي",                  subEn: "Expose a hidden truth" },
  { key: "pattern",     icon: TrendingUp,    labelAr: "نمط",   labelEn: "Pattern",     subAr: "نمط متكرر في الجهات",             subEn: "Recurring market signal" },
  { key: "tension",     icon: AlertTriangle, labelAr: "خلل",   labelEn: "Tension",     subAr: "المشكلة مش في X",                 subEn: "A real problem nobody names" },
  { key: "win",         icon: CheckCircle2,  labelAr: "إنجاز",  labelEn: "Win",         subAr: "نتيجة حققتها فعلاً",              subEn: "A concrete result or milestone you achieved" },
  { key: "prediction",  icon: Sparkles,      labelAr: "تنبؤ",   labelEn: "Prediction",  subAr: "وين رايح القطاع",                 subEn: "Where your sector is heading" },
  { key: "framework",   icon: Compass,       labelAr: "إطار",   labelEn: "Framework",   subAr: "نموذج أو منهجية تستخدمها",         subEn: "A model or approach you use" },
  { key: "lesson",      icon: Lightbulb,     labelAr: "درس",   labelEn: "Lesson",      subAr: "اللي علّمك إياه التجربة",          subEn: "What experience taught you" },
  { key: "inspiration", icon: Star,          labelAr: "إلهام",  labelEn: "Inspiration", subAr: "منظور يحفّز المجال",               subEn: "A perspective that motivates your field" },
];

const THEMES_EN = [
  "Strategic foresight",
  "Digital transformation",
  "Leadership under pressure",
  "Governance & compliance",
  "Commercial impact",
  "Talent & capability",
  "AI & technology adoption",
  "Vision 2030 & national agenda",
  "Water & utilities",
  "Infrastructure modernization",
];

const THEMES_AR = [
  "الرؤية الاستراتيجية",
  "التحول الرقمي",
  "القيادة تحت الضغط",
  "الحوكمة والامتثال",
  "الأثر التجاري",
  "الكفاءات والمواهب",
  "الذكاء الاصطناعي واعتماد التقنية",
  "رؤية 2030 والأجندة الوطنية",
  "قطاع المياه والمرافق",
  "تحديث البنية التحتية",
];

const SECTORS: { value: string; ar: string; en: string }[] = [
  { value: "general",        ar: "عام — لجميع القطاعات",       en: "General — All Sectors" },
  { value: "water",          ar: "قطاع المياه والمرافق",        en: "Water & Utilities" },
  { value: "digital",        ar: "التحول الرقمي المؤسسي",       en: "Enterprise Digital Transformation" },
  { value: "infrastructure", ar: "البنية التحتية الحيوية",       en: "Critical Infrastructure" },
  { value: "governance",     ar: "الحوكمة والقيادة",            en: "Governance & Leadership" },
  { value: "vision2030",     ar: "رؤية 2030 والقطاع العام",     en: "Vision 2030 & Public Sector" },
  { value: "finance",        ar: "القطاع المالي والمصرفي",       en: "Financial & Banking Sector" },
  { value: "healthcare",     ar: "الرعاية الصحية",              en: "Healthcare" },
  { value: "energy",         ar: "قطاع الطاقة",                 en: "Energy Sector" },
];

interface FlashResult {
  variation: number;
  text: string;
  copied?: boolean;
  saving?: boolean;
}

const arabicNumerals = ["١", "٢", "٣"];

export default function FlashPanel() {
  const [lang, setLang] = useState<FlashLang>("ar");
  const [mode, setMode] = useState<FlashMode>("theme");
  const [postType, setPostType] = useState<PostTypeKey | null>(null);
  const [selectedTheme, setSelectedTheme] = useState<string | null>(null);
  const [sector, setSector] = useState<string>("general");
  const [userSector, setUserSector] = useState<{ value: string; ar: string; en: string } | null>(null);
  const [spark, setSpark] = useState("");
  const [generating, setGenerating] = useState(false);
  const [results, setResults] = useState<FlashResult[]>([]);

  // Theme list is language-aware and static — see THEMES_EN / THEMES_AR.
  const themeChips = useMemo(() => (lang === "ar" ? THEMES_AR : THEMES_EN), [lang]);

  // Reset theme selection when language changes (EN ↔ AR)
  useEffect(() => {
    setSelectedTheme(null);
  }, [lang]);

  // Signal count — Flash mode is most useful once the user has signal territory.
  const [signalCount, setSignalCount] = useState<number | null>(null);
  useEffect(() => {
    (async () => {
      const { count } = await supabase
        .from("strategic_signals" as any)
        .select("id", { count: "exact", head: true })
        .eq("status", "active");
      setSignalCount(count || 0);
    })();
  }, []);

  // Load user's sector_focus from diagnostic_profiles and pre-select
  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) return;
      const { data } = await supabase
        .from("diagnostic_profiles")
        .select("sector_focus")
        .eq("user_id", session.user.id)
        .maybeSingle();
      const focus = (data?.sector_focus || "").trim();
      if (!focus) return;
      const match = SECTORS.find(
        s => s.ar === focus || s.en.toLowerCase() === focus.toLowerCase() || s.value === focus.toLowerCase()
      );
      if (match) {
        setSector(match.value);
      } else {
        const custom = { value: `user:${focus}`, ar: focus, en: focus };
        setUserSector(custom);
        setSector(custom.value);
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
    generating: lang === "ar" ? "⚡ جاري الكتابة..." : "⚡ Writing...",
    copy: lang === "ar" ? "نسخ" : "Copy",
    saveDraft: lang === "ar" ? "حفظ مسودة" : "Save Draft",
    saved: lang === "ar" ? "تم الحفظ" : "Saved",
    postOnLinkedIn: lang === "ar" ? "انشر على لينكدإن ←" : "Post on LinkedIn →",
    newVariations: lang === "ar" ? "🔄 نسخ جديدة" : "🔄 New Variations",
    versionWord: lang === "ar" ? "النسخة" : "Version",
  }), [lang]);

  const hasSignals = (signalCount ?? 0) > 0;

  // Flip directional arrows for RTL display + copy in Arabic mode.
  const displayText = (text: string): string => {
    if (lang !== "ar" || !text) return text;
    return text
      .replace(/→/g, "←")
      .replace(/↳/g, "↲")
      .replace(/->/g, "<-")
      .replace(/⟶/g, "⟵");
  };
  const canGenerate = hasSignals && (mode === "theme"
    ? !!postType && !!selectedTheme && !generating
    : spark.trim().length >= 3 && !generating);

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
    if (userSector && sector === userSector.value) {
      return lang === "ar" ? userSector.ar : userSector.en;
    }
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
        post_type: postType
          ? (lang === "ar"
              ? POST_TYPES.find(p => p.key === postType)?.labelAr
              : POST_TYPES.find(p => p.key === postType)?.labelEn)
          : undefined,
        theme: selectedTheme || undefined,
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
    await navigator.clipboard.writeText(displayText(r.text));
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

  const versionLabel = (n: number) => lang === "ar"
    ? `${t.versionWord} ${arabicNumerals[n - 1] || n}`
    : `${t.versionWord} ${n}`;

  const dirAttr = lang === "ar" ? "rtl" : "ltr";
  const arabicFontStyle = lang === "ar" ? { fontFamily: "Cairo, sans-serif" as const } : undefined;

  return (
    <div className="space-y-5">
      {/* Section label with tooltip (G9) */}
      <div
        style={{
          fontSize: 11,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "hsl(var(--muted-foreground))",
          fontFamily: "'DM Sans', sans-serif",
          display: "inline-flex",
          alignItems: "center",
        }}
      >
        Flash mode
        <InfoTooltip
          label="Flash Mode"
          text="Generate a LinkedIn post in under 60 seconds."
        />
      </div>
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
                {(() => {
                  const general = SECTORS[0];
                  const rest = SECTORS.slice(1);
                  const ordered = userSector
                    ? [general, userSector, ...rest]
                    : [general, ...rest];
                  return ordered.map(s => (
                    <SelectItem key={s.value} value={s.value} style={lang === "ar" ? arabicFontStyle : undefined}>
                      {lang === "ar" ? s.ar : s.en}
                    </SelectItem>
                  ));
                })()}
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
                    style={selected ? { borderColor: "var(--brand)", backgroundColor: "var(--brand-muted)" } : undefined}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      selected
                        ? "text-foreground"
                        : "bg-secondary/20 border-border/10 text-muted-foreground hover:border-border/30"
                    }`}
                  >
                    <Icon className="w-4 h-4 mb-1.5" style={selected ? { color: "var(--brand)" } : undefined} />
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
      {signalCount === 0 && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-muted-foreground leading-relaxed">
          <p className="font-medium text-foreground mb-1">Flash mode is waiting for your signals</p>
          <p>Flash mode creates 3 post variations from your strongest signals in 60 seconds. Capture a few articles first to unlock this feature — Aura needs signal territory to generate content worth publishing.</p>
        </div>
      )}
      <button
        onClick={runGeneration}
        disabled={!canGenerate}
        style={{
          backgroundColor: canGenerate ? "var(--brand)" : undefined,
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
                  backgroundColor: "var(--brand)",
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
                {displayText(r.text)}
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
                  variant="outline"
                  className="h-8 gap-1.5 text-xs"
                  onClick={() => shareToLinkedIn({
                    text: displayText(r.text),
                    mode: "feed",
                    toastMessage: lang === "ar"
                      ? "تم نسخ المنشور — الصقه في لينكدإن."
                      : "Post copied to clipboard — paste it in LinkedIn.",
                  })}
                >
                  <Linkedin className="w-3 h-3" />
                  <span style={lang === "ar" ? arabicFontStyle : undefined}>{t.postOnLinkedIn}</span>
                </Button>
              </div>
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