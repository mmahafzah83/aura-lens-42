import { createContext, useContext, ReactNode } from "react";

interface LanguageContextType {
  lang: "en";
  setLang: (lang: "en") => void;
  t: (key: string) => string;
  isRTL: false;
}

const translations: Record<string, string> = {
  "app.name": "Aura",
  "app.subtitle": "Executive Intelligence Platform",
  "header.askAura": "Ask Aura",
  "header.logout": "Sign Out",
  "tab.briefing": "Briefing",
  "tab.pursuits": "Pursuits",
  "tab.influence": "Influence",
  "tab.growth": "Growth",
  "tab.uploadDoc": "Upload Document",
  "briefing.strategicPulse": "Strategic Pulse",
  "briefing.generatingInsight": "Generating Director's Insight…",
  "briefing.noInsight": "Capture some insights to generate your Director's Pulse.",
  "briefing.recentCaptures": "Recent Captures",
  "briefing.strategicFocus": "Strategic Focus",
  "briefing.focusDesc": "Your dominant pillar this week based on capture activity",
  "briefing.weekCaptures": "This Week",
  "briefing.voiceNotes": "Voice Notes",
  "briefing.insights": "Insights",
  "briefing.pillarBreakdown": "Pillar Breakdown",
  "influence.title": "Content Pipeline",
  "influence.subtitle": "Turn your captures into executive-grade LinkedIn posts",
  "influence.empty": "No captures with summaries yet. Capture some insights first.",
  "stats.strategicFocus": "Strategic Focus",
  "stats.pendingPosts": "Pending Brand Posts",
  "stats.voiceNotes": "Voice Notes",
  "stats.strategicInsights": "Strategic Insights",
  "capture.title": "Capture",
  "capture.subtitle": "Link, voice note, or thought",
  "training.title": "Log Training",
  "training.subtitle": "Track skill development",
  "entries.title": "Recent Captures",
  "entries.subtitle": "Latest intelligence entries",
  "entries.search": "Search captures…",
  "entries.archive": "Archive",
  "entries.noEntries": "No entries yet. Start capturing.",
  "entries.noResults": "No results found.",
  "entries.noArchive": "No archived entries.",
  "entries.linkedinPost": "Generate EN Post",
  "entries.linkedinAr": "Generate AR Post",
  "entries.translate": "Arabic Briefing",
  "entries.readMore": "Read more",
  "entries.less": "Less",
  "draft.title": "LinkedIn Draft",
  "draft.copy": "Copy to Clipboard",
  "draft.copied": "Copied!",
  "chat.title": "Ask Aura",
  "chat.subtitle": "Your Intelligence Vault",
  "chat.placeholder": "Ask about your captures…",
  "chat.vaultUnlocked": "Your Vault, Unlocked",
  "chat.vaultDesc": "Ask about your captures, find frameworks, connect insights, or draft a presentation from your intelligence.",
  "chat.draftDeck": "Draft Deck",
  "chat.clearChat": "Clear chat",
  "auth.signIn": "Sign In",
  "auth.signUp": "Create Account",
  "auth.email": "Email",
  "auth.password": "Password",
  "auth.hasAccount": "Already have an account?",
  "auth.needAccount": "Need an account?",
  "account.title": "Account Intelligence",
  "account.selectAccount": "Focus Account",
  "account.selectFirst": "Select an account first",
  "account.synthesize": "Synthesize",
  "account.analyzing": "Analyzing intelligence vault…",
  "account.entries": "entries",
  "account.docChunks": "doc chunks",
  "account.strategicSynthesis": "Strategic Synthesis",
  "account.keyThemes": "Key Themes",
  "account.strategicQuestions": "Questions for GM Discussion",
  "account.risks": "Risk Factors",
  "account.opportunities": "Opportunities",
  "account.architectBrief": "Architect Meeting Brief (PDF)",
  "account.pdfGenerated": "Meeting brief downloaded",
};

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider = ({ children }: { children: ReactNode }) => {
  const t = (key: string): string => translations[key] || key;

  return (
    <LanguageContext.Provider value={{ lang: "en", setLang: () => {}, t, isRTL: false }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) throw new Error("useLanguage must be used within LanguageProvider");
  return context;
};
