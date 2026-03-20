import { useState, useEffect } from "react";
import { Plus, LogOut, Zap, MessageCircle, Briefcase, Target, Megaphone, TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { useLanguage } from "@/contexts/LanguageContext";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
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
import type { Database } from "@/integrations/supabase/types";

type Entry = Database["public"]["Tables"]["entries"]["Row"];

const Dashboard = () => {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [trainingOpen, setTrainingOpen] = useState(false);
  const [radarKey, setRadarKey] = useState(0);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInitialMessage, setChatInitialMessage] = useState<string | undefined>();
  const [user, setUser] = useState<{ email?: string } | null>(null);
  const navigate = useNavigate();
  const { t } = useLanguage();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session) navigate("/auth");
      else setUser({ email: session.user.email });
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) navigate("/auth");
      else setUser({ email: session.user.email });
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

  const tabItems = [
    { value: "briefing", label: t("tab.briefing"), icon: Briefcase },
    { value: "pursuits", label: t("tab.pursuits"), icon: Target },
    { value: "influence", label: t("tab.influence"), icon: Megaphone },
    { value: "growth", label: t("tab.growth"), icon: TrendingUp },
  ];

  return (
    <div className="h-[100dvh] bg-background flex flex-col overflow-hidden" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      {/* Premium Header */}
      <header className="border-b border-border/10 px-5 sm:px-10 py-5 flex-shrink-0 bg-background/80 backdrop-blur-xl z-40">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
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
              <span className="hidden sm:inline">{t("header.askAura")}</span>
            </button>
            <span className="text-[11px] text-muted-foreground/60 hidden sm:block tracking-widest uppercase">{user?.email}</span>
            <button onClick={handleLogout} className="text-muted-foreground/50 hover:text-foreground transition-colors duration-200 tactile-press" title={t("header.logout")}>
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-5 sm:px-10 py-8 sm:py-10 pb-36 md:pb-10">
          <Tabs defaultValue="briefing" className="w-full">
            {/* Desktop Tab Bar */}
            <TabsList className="hidden md:flex w-full justify-start gap-2 bg-transparent p-0 mb-10 border-b border-border/10 rounded-none h-auto pb-0">
              {tabItems.map((tab) => (
                <TabsTrigger
                  key={tab.value}
                  value={tab.value}
                  className="flex items-center gap-2.5 px-5 py-4 rounded-none border-b-2 border-transparent text-muted-foreground data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none bg-transparent hover:text-foreground transition-all duration-300"
                >
                  <tab.icon className="w-4 h-4" />
                  <span className="text-sm font-medium tracking-wide">{tab.label}</span>
                </TabsTrigger>
              ))}
            </TabsList>

            <TabsContent value="briefing" className="mt-0 animate-tab-enter">
              <BriefingTab entries={entries} onOpenChat={(msg) => {
                setChatInitialMessage(msg);
                setChatOpen(true);
              }} />
            </TabsContent>

            <TabsContent value="pursuits" className="mt-0 animate-tab-enter">
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
            </TabsContent>

            <TabsContent value="influence" className="mt-0 animate-tab-enter">
              <InfluenceTab entries={entries} onRefresh={fetchEntries} />
            </TabsContent>

            <TabsContent value="growth" className="mt-0 animate-tab-enter">
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
            </TabsContent>
          </Tabs>
        </div>
      </main>

      {/* Mobile Floating Island Navigation */}
      <nav
        className="md:hidden fixed bottom-5 left-4 right-4 z-50 glass-island rounded-2xl px-2 py-2"
        style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
      >
        <Tabs defaultValue="briefing" className="w-full">
          <TabsList className="w-full bg-transparent p-0 h-auto gap-0">
            {tabItems.map((tab) => (
              <TabsTrigger
                key={`mobile-${tab.value}`}
                value={tab.value}
                className="flex-1 flex flex-col items-center gap-1 py-2.5 rounded-xl text-muted-foreground/60 data-[state=active]:text-primary data-[state=active]:bg-primary/8 bg-transparent transition-all duration-200 tactile-press"
              >
                <tab.icon className="w-4.5 h-4.5" />
                <span className="text-[10px] font-medium tracking-wide">{tab.label}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
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
