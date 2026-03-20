import { createContext, useContext, useState, useEffect, ReactNode } from "react";

type Lang = "en" | "ar";

interface LanguageContextType {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: string) => string;
  isRTL: boolean;
}

const translations: Record<string, Record<Lang, string>> = {
  "app.name": { en: "Aura", ar: "أورا" },
  "app.subtitle": { en: "Executive Intelligence Platform", ar: "منصة الذكاء التنفيذي" },
  "header.askAura": { en: "Ask Aura", ar: "اسأل أورا" },
  "header.logout": { en: "Sign Out", ar: "تسجيل خروج" },
  "tab.briefing": { en: "Briefing", ar: "الإحاطة" },
  "tab.pursuits": { en: "Pursuits", ar: "المتابعات" },
  "tab.influence": { en: "Influence", ar: "التأثير" },
  "tab.growth": { en: "Growth", ar: "النمو" },
  "tab.uploadDoc": { en: "Upload Document", ar: "رفع مستند" },
  "briefing.strategicFocus": { en: "Strategic Focus", ar: "التركيز الاستراتيجي" },
  "briefing.focusDesc": { en: "Your dominant pillar this week based on capture activity", ar: "ركيزتك المهيمنة هذا الأسبوع بناءً على نشاط الالتقاط" },
  "briefing.weekCaptures": { en: "This Week", ar: "هذا الأسبوع" },
  "briefing.voiceNotes": { en: "Voice Notes", ar: "ملاحظات صوتية" },
  "briefing.insights": { en: "Insights", ar: "رؤى" },
  "briefing.pillarBreakdown": { en: "Pillar Breakdown", ar: "توزيع الركائز" },
  "influence.title": { en: "Content Pipeline", ar: "خط إنتاج المحتوى" },
  "influence.subtitle": { en: "Turn your captures into executive-grade LinkedIn posts", ar: "حوّل التقاطاتك إلى منشورات لينكدإن بمستوى تنفيذي" },
  "influence.empty": { en: "No captures with summaries yet. Capture some insights first.", ar: "لا توجد التقاطات بملخصات بعد. ابدأ بالتقاط بعض الرؤى." },
  "stats.strategicFocus": { en: "Strategic Focus", ar: "التركيز الاستراتيجي" },
  "stats.pendingPosts": { en: "Pending Brand Posts", ar: "منشورات العلامة المعلّقة" },
  "stats.voiceNotes": { en: "Voice Notes", ar: "الملاحظات الصوتية" },
  "stats.strategicInsights": { en: "Strategic Insights", ar: "الرؤى الاستراتيجية" },
  "capture.title": { en: "Capture", ar: "التقاط" },
  "capture.subtitle": { en: "Link, voice note, or thought", ar: "رابط، ملاحظة صوتية، أو فكرة" },
  "training.title": { en: "Log Training", ar: "تسجيل التدريب" },
  "training.subtitle": { en: "Track skill development", ar: "تتبع تطوير المهارات" },
  "entries.title": { en: "Recent Captures", ar: "آخر الالتقاطات" },
  "entries.subtitle": { en: "Latest intelligence entries", ar: "أحدث مدخلات الذكاء" },
  "entries.search": { en: "Search captures…", ar: "البحث في الالتقاطات…" },
  "entries.archive": { en: "Archive", ar: "الأرشيف" },
  "entries.noEntries": { en: "No entries yet. Start capturing.", ar: "لا توجد مدخلات بعد. ابدأ بالالتقاط." },
  "entries.noResults": { en: "No results found.", ar: "لم يتم العثور على نتائج." },
  "entries.noArchive": { en: "No archived entries.", ar: "لا توجد مدخلات مؤرشفة." },
  "entries.linkedinPost": { en: "Generate EN Post", ar: "منشور إنجليزي" },
  "entries.linkedinAr": { en: "Generate AR Post", ar: "منشور عربي" },
  "entries.translate": { en: "Arabic Briefing", ar: "إحاطة عربية" },
  "entries.readMore": { en: "Read more", ar: "اقرأ المزيد" },
  "entries.less": { en: "Less", ar: "أقل" },
  "draft.title": { en: "LinkedIn Draft", ar: "مسودة لينكدإن" },
  "draft.copy": { en: "Copy to Clipboard", ar: "نسخ" },
  "draft.copied": { en: "Copied!", ar: "تم النسخ!" },
  "chat.title": { en: "Ask Aura", ar: "اسأل أورا" },
  "chat.subtitle": { en: "Your Intelligence Vault", ar: "خزنة ذكائك" },
  "chat.placeholder": { en: "Ask about your captures…", ar: "اسأل عن التقاطاتك…" },
  "chat.vaultUnlocked": { en: "Your Vault, Unlocked", ar: "خزنتك، مفتوحة" },
  "chat.vaultDesc": { en: "Ask about your captures, find frameworks, connect insights, or draft a presentation from your intelligence.", ar: "اسأل عن التقاطاتك، ابحث عن الأطر، اربط الرؤى، أو صِغ عرضاً تقديمياً من ذكائك." },
  "chat.draftDeck": { en: "Draft Deck", ar: "مسودة العرض" },
  "chat.clearChat": { en: "Clear chat", ar: "مسح المحادثة" },
  "auth.signIn": { en: "Sign In", ar: "تسجيل الدخول" },
  "auth.signUp": { en: "Create Account", ar: "إنشاء حساب" },
  "auth.email": { en: "Email", ar: "البريد الإلكتروني" },
  "auth.password": { en: "Password", ar: "كلمة المرور" },
  "auth.hasAccount": { en: "Already have an account?", ar: "لديك حساب بالفعل؟" },
  "auth.needAccount": { en: "Need an account?", ar: "تحتاج حساب؟" },
  "lang.toggle": { en: "عربي", ar: "English" },
};

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider = ({ children }: { children: ReactNode }) => {
  const [lang, setLangState] = useState<Lang>(() => {
    return (localStorage.getItem("aura-lang") as Lang) || "en";
  });

  const setLang = (l: Lang) => {
    setLangState(l);
    localStorage.setItem("aura-lang", l);
  };

  const isRTL = lang === "ar";

  useEffect(() => {
    document.documentElement.dir = isRTL ? "rtl" : "ltr";
    document.documentElement.lang = lang;
    document.documentElement.classList.toggle("rtl", isRTL);
  }, [lang, isRTL]);

  const t = (key: string): string => {
    return translations[key]?.[lang] || key;
  };

  return (
    <LanguageContext.Provider value={{ lang, setLang, t, isRTL }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) throw new Error("useLanguage must be used within LanguageProvider");
  return context;
};
