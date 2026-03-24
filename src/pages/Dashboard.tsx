import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Plus, LogOut, Zap, MessageCircle, Briefcase, Target, Megaphone, TrendingUp, Radar, Shield, Lightbulb } from "lucide-react";
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
import ExecutiveDiagnostic from "@/components/ExecutiveDiagnostic";
import MyFrameworks from "@/components/MyFrameworks";
import SovereignReadingList from "@/components/SovereignReadingList";
import MarketTab from "@/components/tabs/MarketTab";
import StrategyTab from "@/components/tabs/StrategyTab";
import YearlyRoadmap from "@/components/YearlyRoadmap";
import KPIProgressRings from "@/components/KPIProgressRings";
import ProfileManagement from "@/components/ProfileManagement";
import ProfileIntelligence from "@/components/ProfileIntelligence";
import NotificationBell from "@/components/NotificationBell";
import type { Database } from "@/integrations/supabase/types";

type Entry = Database["public"]["Tables"]["entries"]["Row"];

const TAB_ITEMS = [
  { value: "intelligence", label: "Intelligence", icon: Shield },
  { value: "pursuits", label: "Pursuits", icon: Target },
  { value: "influence", label: "Influence", icon: Megaphone },
  { value: "growth", label: "Growth", icon: TrendingUp },
] as const;

type TabValue = typeof TAB_ITEMS[number]["value"];

const Dashboard = () => {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [activeTab, setActiveTab] = useState<TabValue>("intelligence");
  const [captureOpen, setCaptureOpen] = useState(false);
  const [trainingOpen, setTrainingOpen] = useState(false);
  const [radarKey, setRadarKey] = useState(0);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInitialMessage, setChatInitialMessage] = useState<string | undefined>();
  const [user, setUser] = useState<{ email?: string } | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showDiagnostic, setShowDiagnostic] = useState(false);
  const navigate = useNavigate();
  const checkStrategicNudge = useCallback(async (accessToken: string) => {
    try {
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/strategic-nudge`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({}),
      });
      if (!resp.ok) return;
      const data = await resp.json();
      if (data.nudge) {
        toast(data.nudge.title, {
          description: data.nudge.body,
          duration: 12000,
          action: {
            label: "Open Aura",
            onClick: () => {
              setChatInitialMessage(data.nudge.body);
              setChatOpen(true);
            },
          },
        });
      }
    } catch (e) {
      console.error("Nudge check failed:", e);
    }
  }, []);

  const { t } = useLanguage();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session) navigate("/auth");
      else setUser({ email: session.user.email });
    });

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) navigate("/auth");
      else {
        setUser({ email: session.user.email });
        // Check if user has completed diagnostic
        const { data: profile } = await supabase
          .from("diagnostic_profiles" as any)
          .select("completed")
          .eq("user_id", session.user.id)
          .maybeSingle();
        if (profile && (profile as any).completed) {
          setShowOnboarding(true);
          // Check for 48h nudge in background
          checkStrategicNudge(session.access_token);
        } else {
          setShowDiagnostic(true);
        }
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

  const handleDiagnosticComplete = () => {
    setShowDiagnostic(false);
  };

    return (
    <div className="min-h-screen bg-background flex flex-col relative safe-area-container">
      {/* Animated gradient mesh background */}
      <div className="gradient-mesh fixed inset-0 pointer-events-none z-0" />

      {/* Onboarding */}
      {showOnboarding && <OnboardingSequence onComplete={handleOnboardingComplete} />}
      {showDiagnostic && <ExecutiveDiagnostic onComplete={handleDiagnosticComplete} />}

      {/* Main Content */}
      <main className="flex-1 relative z-10" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="max-w-6xl mx-auto px-5 sm:px-10 py-8 sm:py-10 pb-24 md:pb-10">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3.5">
              <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20">
                <Zap className="w-4.5 h-4.5 text-primary" />
              </div>
              <h1 className="text-2xl tracking-tight text-gradient-gold">Aura</h1>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setChatOpen(true)}
                className="flex items-center gap-2 text-xs text-muted-foreground hover:text-primary transition-all duration-200 px-4 py-2 rounded-xl glass-card hover-lift tactile-press z-30"
              >
                <MessageCircle className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Ask Aura</span>
              </button>
              <NotificationBell />
              <span className="text-[11px] text-muted-foreground/60 hidden sm:block tracking-widest uppercase">{user?.email}</span>
              <button onClick={handleLogout} className="text-muted-foreground/50 hover:text-foreground transition-colors duration-200 tactile-press" title="Log out">
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>

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

          {/* Tab Content */}
          <div className="tab-content-spring">
            {activeTab === "intelligence" && (
              <div className="animate-tab-spring">
                <BriefingTab entries={entries} onRefresh={fetchEntries} onOpenChat={(msg) => {
                  setChatInitialMessage(msg);
                  setChatOpen(true);
                }} />
                <div className="mt-8">
                  <MarketTab />
                </div>
              </div>
            )}

            {activeTab === "pursuits" && (
              <div className="animate-tab-spring relative pb-20">
                <div className="space-y-8">
                  <div className="glass-card rounded-2xl p-6 sm:p-10">
                    <AccountIntelligence entries={entries} />
                  </div>
                  <div className="glass-card rounded-2xl p-6 sm:p-10">
                    <RecentEntries entries={entries} onRefresh={fetchEntries} />
                  </div>
                  {/* Minimized Upload */}
                  <div className="glass-card rounded-2xl p-4 sm:p-5">
                    <details className="group">
                      <summary className="flex items-center justify-between cursor-pointer list-none">
                        <span className="text-xs font-semibold text-muted-foreground tracking-widest uppercase">Upload Document</span>
                        <span className="text-[10px] text-muted-foreground group-open:rotate-180 transition-transform">▼</span>
                      </summary>
                      <div className="mt-3">
                        <DocumentUpload onUploaded={fetchEntries} />
                      </div>
                    </details>
                  </div>
                </div>
                {/* Sticky Quick Capture Bar */}
                <div className="fixed left-4 right-4 md:left-auto md:right-auto md:w-full md:max-w-6xl md:mx-auto z-[40]" style={{ bottom: 'calc(72px + env(safe-area-inset-bottom))' }}>
                  <button
                    onClick={() => setCaptureOpen(true)}
                    className="w-full flex items-center gap-3 px-5 py-3.5 rounded-2xl glass-card border border-primary/20 hover-lift tactile-press transition-all"
                  >
                    <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20 aura-glow">
                      <Plus className="w-5 h-5 text-primary" />
                    </div>
                    <span className="text-sm font-medium text-muted-foreground">Quick Capture — text, voice, link, or image</span>
                  </button>
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
                <div className="space-y-6">
                  {/* KPI Progress Rings */}
                  <KPIProgressRings />

                  {/* Skill Radar + Log Training */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="glass-card rounded-2xl p-6 sm:p-10 min-h-[400px] radar-glow animate-data-pulse">
                      <SkillRadar key={radarKey} />
                    </div>
                    <div className="space-y-6">
                      <div
                        className="glass-card rounded-2xl p-8 flex flex-col items-center justify-center text-center cursor-pointer hover-lift tactile-press transition-all group"
                        onClick={() => setTrainingOpen(true)}
                      >
                        <div className="w-14 h-14 rounded-2xl bg-secondary flex items-center justify-center mb-4 group-hover:scale-105 transition-transform duration-300 border border-border/20">
                          <TrendingUp className="w-6 h-6 text-primary" />
                        </div>
                        <h2 className="text-base font-semibold text-foreground mb-1">Log Training</h2>
                        <p className="text-xs text-muted-foreground tracking-wide">Track your growth hours</p>
                      </div>
                      <WeeklyTransformationLens entries={entries} />
                    </div>
                  </div>

                  {/* 12-Month Roadmap */}
                  <YearlyRoadmap />

                  {/* Reading List */}
                  <SovereignReadingList />

                  {/* Frameworks */}
                  <MyFrameworks />

                  {/* Profile Intelligence */}
                  <ProfileIntelligence />

                  {/* Profile Management */}
                  <ProfileManagement onResetDiagnostic={() => setShowDiagnostic(true)} />
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Static Footer Navigation — visible at bottom of content */}
      {!chatOpen && !showOnboarding && !showDiagnostic && (
        <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 border-t border-border/10 bg-background/95 backdrop-blur-xl" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
          <div className="flex w-full max-w-6xl mx-auto px-2 py-2">
            {TAB_ITEMS.map((tab) => (
              <button
                key={`mobile-${tab.value}`}
                onClick={() => {
                  setActiveTab(tab.value);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
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
      )}

      {/* Mobile FAB — hidden when chat, onboarding, or diagnostic is open */}
      {!chatOpen && !showOnboarding && !showDiagnostic && (
        <button
          onClick={() => setCaptureOpen(true)}
          className="md:hidden fixed right-5 w-14 h-14 rounded-2xl bg-primary text-primary-foreground shadow-2xl flex items-center justify-center tactile-press transition-transform duration-150 z-[45] aura-glow border border-primary/30"
          style={{ bottom: 'calc(68px + env(safe-area-inset-bottom))' }}
        >
          <Plus className="w-6 h-6" />
        </button>
      )}

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
