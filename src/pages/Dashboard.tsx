import { useState, useEffect } from "react";
import { Plus, LogOut, Zap, MessageCircle, Briefcase, Target, Megaphone, TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { useLanguage } from "@/contexts/LanguageContext";
import SkillRadar from "@/components/SkillRadar";
import CaptureModal from "@/components/CaptureModal";
import TrainingModal from "@/components/TrainingModal";
import WeeklyTransformationLens from "@/components/WeeklyTransformationLens";
import PotentialUnleashed from "@/components/PotentialUnleashed";
import RecentEntries from "@/components/RecentEntries";
import AuraChatSidebar from "@/components/AuraChatSidebar";
import DocumentUpload from "@/components/DocumentUpload";
import AccountIntelligence from "@/components/AccountIntelligence";
import BriefingTab from "@/components/tabs/BriefingTab";
import InfluenceTab from "@/components/tabs/InfluenceTab";
import OnboardingSequence from "@/components/OnboardingSequence";
import type { Database } from "@/integrations/supabase/types";

type Entry = Database["public"]["Tables"]["entries"]["Row"];

const TAB_ITEMS = [
  { value: "briefing", label: "Briefing", icon: Briefcase },
  { value: "pursuits", label: "Pursuits", icon: Target },
  { value: "influence", label: "Influence", icon: Megaphone },
  { value: "growth", label: "Growth", icon: TrendingUp },
] as const;

type TabValue = typeof TAB_ITEMS[number]["value"];

const Dashboard = () => {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [activeTab, setActiveTab] = useState<TabValue>("briefing");
  const [captureOpen, setCaptureOpen] = useState(false);
  const [trainingOpen, setTrainingOpen] = useState(false);
  const [radarKey, setRadarKey] = useState(0);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInitialMessage, setChatInitialMessage] = useState<string | undefined>();
  const [user, setUser] = useState<{ email?: string } | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const navigate = useNavigate();
  const { t } = useLanguage();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session) navigate("/auth");
      else setUser({ email: session.user.email });
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) navigate("/auth");
      else {
        setUser({ email: session.user.email });
        // Show onboarding for first-time users
        setShowOnboarding(true);
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const fetchEntries = async () => {
    const { data } = await supabase
      .from("entries")
      .select("*")
      .order("created_at", { ascending: false });
    if (data) setEntries(data);
  };

  useEffect(() => {
    fetchEntries();
    const channel = supabase
      .channel('entries-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'entries' }, () => fetchEntries())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  const handleOnboardingComplete = () => {
    setShowOnboarding(false);
  };

  return (
    <div className="h-screen max-h-screen bg-background flex flex-col overflow-hidden relative safe-area-container">
      {/* Animated gradient mesh background */}
      <div className="gradient-mesh fixed inset-0 pointer-events-none z-0" />

      {/* Onboarding */}
      {showOnboarding && <OnboardingSequence onComplete={handleOnboardingComplete} />}

      {/* Main Content — header scrolls with content */}
      <main className="flex-1 overflow-y-auto relative z-10" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="max-w-6xl mx-auto px-5 sm:px-10 py-8 sm:py-10 pb-36 md:pb-10">
          {/* Scrollable Header */}
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3.5">
              <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20">
                <Zap className="w-4.5 h-4.5 text-primary" />
              </div>
              <h1 className="text-2xl tracking-tight text-gradient-gold">Aura</h1>
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={() => setChatOpen(true)}
                className="flex items-center gap-2 text-xs text-muted-foreground hover:text-primary transition-all duration-200 px-4 py-2 rounded-xl glass-card hover-lift tactile-press"
              >
                <MessageCircle className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Ask Aura</span>
              </button>
              <span className="text-[11px] text-muted-foreground/60 hidden sm:block tracking-widest uppercase">{user?.email}</span>
              <button onClick={handleLogout} className="text-muted-foreground/50 hover:text-foreground transition-colors duration-200 tactile-press" title="Log out">
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto relative z-10">
        <div className="max-w-6xl mx-auto px-5 sm:px-10 py-8 sm:py-10 pb-36 md:pb-10">
          {/* Desktop Tab Bar */}
          <div className="hidden md:flex w-full justify-start gap-2 mb-10 border-b border-border/10 pb-0">
            {TAB_ITEMS.map((tab) => (
              <button
                key={tab.value}
                onClick={() => setActiveTab(tab.value)}
                className={`flex items-center gap-2.5 px-5 py-4 border-b-2 transition-all duration-300 tactile-press ${
                  activeTab === tab.value
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <tab.icon className="w-4 h-4" />
                <span className="text-sm font-medium tracking-wide">{tab.label}</span>
              </button>
            ))}
          </div>

          {/* Tab Content with spring-style transition */}
          <div className="tab-content-spring">
            {activeTab === "briefing" && (
              <div className="animate-tab-spring">
                <BriefingTab entries={entries} onRefresh={fetchEntries} onOpenChat={(msg) => {
                  setChatInitialMessage(msg);
                  setChatOpen(true);
                }} />
              </div>
            )}

            {activeTab === "pursuits" && (
              <div className="animate-tab-spring">
                <div className="space-y-8">
                  <div className="glass-card rounded-2xl p-6 sm:p-10">
                    <AccountIntelligence entries={entries} />
                  </div>
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    <div className="lg:col-span-2 glass-card rounded-2xl p-6 sm:p-10">
                      <RecentEntries entries={entries} onRefresh={fetchEntries} />
                    </div>
                    <div className="space-y-8">
                      <div
                        className="glass-card rounded-2xl p-10 flex flex-col items-center justify-center text-center cursor-pointer hover-lift tactile-press transition-all group"
                        onClick={() => setCaptureOpen(true)}
                      >
                        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-5 group-hover:scale-105 transition-transform duration-300 aura-glow border border-primary/20">
                          <Plus className="w-7 h-7 text-primary" />
                        </div>
                        <h2 className="text-lg font-semibold text-foreground mb-1.5">{t("capture.title")}</h2>
                        <p className="text-xs text-muted-foreground tracking-wide">{t("capture.subtitle")}</p>
                      </div>
                      <div className="glass-card rounded-2xl p-6 sm:p-8">
                        <h3 className="text-sm font-semibold text-foreground mb-4 tracking-widest uppercase">{t("tab.uploadDoc")}</h3>
                        <DocumentUpload onUploaded={fetchEntries} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "influence" && (
              <div className="animate-tab-spring">
                <InfluenceTab entries={entries} onRefresh={fetchEntries} />
              </div>
            )}

            {activeTab === "growth" && (
              <div className="animate-tab-spring">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  <div className="glass-card rounded-2xl p-6 sm:p-10 min-h-[400px] radar-glow">
                    <SkillRadar key={radarKey} />
                  </div>
                  <div className="space-y-8">
                    <div
                      className="glass-card rounded-2xl p-10 flex flex-col items-center justify-center text-center cursor-pointer hover-lift tactile-press transition-all group"
                      onClick={() => setTrainingOpen(true)}
                    >
                      <div className="w-16 h-16 rounded-2xl bg-secondary flex items-center justify-center mb-5 group-hover:scale-105 transition-transform duration-300 border border-border/20">
                        <TrendingUp className="w-7 h-7 text-primary" />
                      </div>
                      <h2 className="text-lg font-semibold text-foreground mb-1.5">{t("training.title")}</h2>
                      <p className="text-xs text-muted-foreground tracking-wide">{t("training.subtitle")}</p>
                    </div>
                    <WeeklyTransformationLens entries={entries} />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Mobile Floating Island Navigation — shared state */}
      <nav
        className="md:hidden fixed bottom-5 left-4 right-4 z-50 glass-island rounded-2xl px-2 py-2"
        style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="flex w-full">
          {TAB_ITEMS.map((tab) => (
            <button
              key={`mobile-${tab.value}`}
              onClick={() => setActiveTab(tab.value)}
              className={`flex-1 flex flex-col items-center gap-1 py-2.5 rounded-xl transition-all duration-200 tactile-press ${
                activeTab === tab.value
                  ? "text-primary bg-primary/8"
                  : "text-muted-foreground/60"
              }`}
            >
              <tab.icon className="w-4.5 h-4.5" />
              <span className="text-[10px] font-medium tracking-wide">{tab.label}</span>
            </button>
          ))}
        </div>
      </nav>

      {/* Mobile FAB */}
      <button
        onClick={() => setCaptureOpen(true)}
        className="md:hidden fixed bottom-24 right-5 w-14 h-14 rounded-2xl bg-primary text-primary-foreground shadow-2xl flex items-center justify-center tactile-press transition-transform duration-150 z-50 aura-glow border border-primary/30"
        style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
      >
        <Plus className="w-6 h-6" />
      </button>

      <CaptureModal
        open={captureOpen}
        onOpenChange={setCaptureOpen}
        onCaptured={fetchEntries}
        onOpenChat={(msg) => {
          setChatInitialMessage(msg);
          setChatOpen(true);
        }}
      />
      <TrainingModal open={trainingOpen} onOpenChange={setTrainingOpen} onLogged={() => { setRadarKey(k => k + 1); }} />
      <AuraChatSidebar
        open={chatOpen}
        onClose={() => { setChatOpen(false); setChatInitialMessage(undefined); }}
        initialMessage={chatInitialMessage}
      />
    </div>
  );
};

export default Dashboard;
