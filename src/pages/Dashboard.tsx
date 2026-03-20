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

    // Live sync: subscribe to entries changes
    const channel = supabase
      .channel('entries-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'entries' },
        () => fetchEntries()
      )
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
    <div className="min-h-screen bg-background pb-24 md:pb-0" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      {/* Header */}
      <header className="border-b border-border/20 px-4 sm:px-8 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <Zap className="w-4 h-4 text-primary-foreground" />
            </div>
            <h1 className="text-2xl tracking-tight text-gradient-gold">Aura</h1>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setChatOpen(true)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors px-3 py-1.5 rounded-lg glass-card border border-border/20 hover:border-primary/30"
            >
              <MessageCircle className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{t("header.askAura")}</span>
            </button>
            <span className="text-xs text-muted-foreground hidden sm:block tracking-wider uppercase">{user?.email}</span>
            <button onClick={handleLogout} className="text-muted-foreground hover:text-foreground transition-colors" title={t("header.logout")}>
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-8 py-6 sm:py-8">
        <Tabs defaultValue="briefing" className="w-full">
          <TabsList className="w-full justify-start gap-1 bg-transparent p-0 mb-6 border-b border-border/20 rounded-none h-auto pb-0">
            {tabItems.map((tab) => (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                className="flex items-center gap-2 px-4 py-3 rounded-none border-b-2 border-transparent text-muted-foreground data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none bg-transparent hover:text-foreground transition-colors"
              >
                <tab.icon className="w-4 h-4" />
                <span className="text-sm font-medium">{tab.label}</span>
              </TabsTrigger>
            ))}
          </TabsList>

          {/* Briefing Tab */}
          <TabsContent value="briefing" className="mt-0">
            <BriefingTab entries={entries} onOpenChat={(msg) => {
              setChatInitialMessage(msg);
              setChatOpen(true);
            }} />
          </TabsContent>

          {/* Pursuits Tab */}
          <TabsContent value="pursuits" className="mt-0">
            <div className="space-y-6">
              {/* Account Intelligence */}
              <div className="glass-card rounded-2xl p-5 sm:p-8">
                <AccountIntelligence entries={entries} />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 glass-card rounded-2xl p-5 sm:p-8">
                  <RecentEntries entries={entries} onRefresh={fetchEntries} />
                </div>
                <div className="space-y-6">
                  <div
                    className="glass-card rounded-2xl p-8 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-card-hover transition-all group"
                    onClick={() => setCaptureOpen(true)}
                  >
                    <div className="w-14 h-14 rounded-full bg-primary flex items-center justify-center mb-4 group-hover:scale-110 transition-transform aura-glow">
                      <Plus className="w-7 h-7 text-primary-foreground" />
                    </div>
                    <h2 className="text-lg font-semibold text-foreground mb-1">{t("capture.title")}</h2>
                    <p className="text-xs text-muted-foreground tracking-wide">{t("capture.subtitle")}</p>
                  </div>
                  <div className="glass-card rounded-2xl p-5 sm:p-6">
                    <h3 className="text-sm font-semibold text-foreground mb-3 tracking-wide uppercase">{t("tab.uploadDoc")}</h3>
                    <DocumentUpload onUploaded={fetchEntries} />
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* Influence Tab */}
          <TabsContent value="influence" className="mt-0">
            <InfluenceTab entries={entries} onRefresh={fetchEntries} />
          </TabsContent>

          {/* Growth Tab */}
          <TabsContent value="growth" className="mt-0">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="glass-card rounded-2xl p-5 sm:p-8 min-h-[400px] radar-glow">
                <SkillRadar key={radarKey} />
              </div>
              <div className="space-y-6">
                <div
                  className="glass-card rounded-2xl p-8 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-card-hover transition-all group"
                  onClick={() => setTrainingOpen(true)}
                >
                  <div className="w-14 h-14 rounded-full bg-secondary flex items-center justify-center mb-4 group-hover:scale-110 transition-transform border border-border/30">
                    <TrendingUp className="w-7 h-7 text-primary" />
                  </div>
                  <h2 className="text-lg font-semibold text-foreground mb-1">{t("training.title")}</h2>
                  <p className="text-xs text-muted-foreground tracking-wide">{t("training.subtitle")}</p>
                </div>
                <WeeklyTransformationLens entries={entries} />
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </main>

      {/* Mobile FAB */}
      <button
        onClick={() => setCaptureOpen(true)}
        className="md:hidden fixed bottom-6 right-6 w-16 h-16 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center active:scale-95 transition-transform z-50 aura-glow"
        style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
      >
        <Plus className="w-8 h-8" />
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
