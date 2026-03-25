import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Plus, LogOut, Zap, MessageCircle, Compass, User, Shield, Lightbulb, Crown, TrendingUp, Menu, X, Mic, Paperclip, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { useLanguage } from "@/contexts/LanguageContext";
import CaptureModal from "@/components/CaptureModal";
import AuraChatSidebar from "@/components/AuraChatSidebar";
import OnboardingSequence from "@/components/OnboardingSequence";
import ExecutiveDiagnostic from "@/components/ExecutiveDiagnostic";
import NotificationBell from "@/components/NotificationBell";
import HomeTab from "@/components/tabs/HomeTab";
import IdentityTab from "@/components/tabs/IdentityTab";
import IntelligenceTab from "@/components/tabs/IntelligenceTab";
import StrategyTab from "@/components/tabs/StrategyTab";
import AuthorityTab from "@/components/tabs/AuthorityTab";
import InfluenceTabNew from "@/components/tabs/InfluenceTabNew";
import type { Database } from "@/integrations/supabase/types";

type Entry = Database["public"]["Tables"]["entries"]["Row"];

const NAV_ITEMS = [
  { value: "home", label: "Home", icon: Compass },
  { value: "identity", label: "Identity", icon: User },
  { value: "intelligence", label: "Intelligence", icon: Shield },
  { value: "strategy", label: "Strategy", icon: Lightbulb },
  { value: "authority", label: "Authority", icon: Crown },
  { value: "influence", label: "Influence", icon: TrendingUp },
] as const;

type TabValue = typeof NAV_ITEMS[number]["value"];

const Dashboard = () => {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [activeTab, setActiveTab] = useState<TabValue>("home");
  const [captureOpen, setCaptureOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInitialMessage, setChatInitialMessage] = useState<string | undefined>();
  const [user, setUser] = useState<{ email?: string } | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showDiagnostic, setShowDiagnostic] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const navigate = useNavigate();
  const { t } = useLanguage();

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

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session) navigate("/auth");
      else setUser({ email: session.user.email });
    });

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) navigate("/auth");
      else {
        setUser({ email: session.user.email });
        const { data: profile } = await supabase
          .from("diagnostic_profiles" as any)
          .select("completed")
          .eq("user_id", session.user.id)
          .maybeSingle();
        if (profile && (profile as any).completed) {
          setShowOnboarding(true);
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

  const openChat = (msg?: string) => {
    setChatInitialMessage(msg);
    setChatOpen(true);
  };

  const switchTab = (tab: TabValue) => {
    setActiveTab(tab);
    setMobileSidebarOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-background flex relative safe-area-container">
      <div className="gradient-mesh fixed inset-0 pointer-events-none z-0" />

      {showOnboarding && <OnboardingSequence onComplete={() => setShowOnboarding(false)} />}
      {showDiagnostic && <ExecutiveDiagnostic onComplete={() => setShowDiagnostic(false)} />}

      {/* ── Desktop Sidebar ── */}
      <aside
        className={`hidden md:flex flex-col fixed top-0 left-0 h-full z-30 border-r border-border/10 bg-background/95 backdrop-blur-xl transition-all duration-300 ${
          sidebarCollapsed ? "w-[68px]" : "w-[220px]"
        }`}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 px-4 py-5 border-b border-border/8">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20 shrink-0">
            <Zap className="w-4.5 h-4.5 text-primary" />
          </div>
          {!sidebarCollapsed && (
            <div className="overflow-hidden">
              <h1 className="text-lg tracking-tight text-gradient-gold font-semibold">Aura</h1>
              <p className="text-[8px] text-muted-foreground/40 tracking-[0.15em] uppercase">Strategic Intelligence OS</p>
            </div>
          )}
        </div>

        {/* Nav Items */}
        <nav className="flex-1 py-4 px-2 space-y-2">
          {NAV_ITEMS.map((item) => {
            const isActive = activeTab === item.value;
            return (
              <button
                key={item.value}
                onClick={() => switchTab(item.value)}
                className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-[250ms] ease-[ease-in-out] tactile-press group ${
                  isActive
                    ? "bg-primary/12 text-primary border border-primary/20 shadow-[0_0_12px_hsl(43_80%_45%/0.1)]"
                    : "text-muted-foreground hover:text-foreground hover:bg-primary/5 border border-transparent"
                }`}
              >
                <item.icon className={`w-5 h-5 shrink-0 transition-colors duration-[250ms] ${isActive ? "text-primary" : "text-muted-foreground/60 group-hover:text-foreground"}`} />
                {!sidebarCollapsed && (
                  <span className="text-sm font-medium tracking-wide">{item.label}</span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Bottom actions */}
        <div className="px-2 py-4 border-t border-border/8 space-y-1">
          <button
            onClick={() => openChat()}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-muted-foreground hover:text-foreground hover:bg-secondary/30 transition-all tactile-press"
          >
            <MessageCircle className="w-4.5 h-4.5 shrink-0" />
            {!sidebarCollapsed && <span className="text-sm">Ask Aura</span>}
          </button>
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-muted-foreground/40 hover:text-muted-foreground transition-all"
          >
            <Menu className="w-4 h-4 shrink-0" />
            {!sidebarCollapsed && <span className="text-[11px]">Collapse</span>}
          </button>
        </div>
      </aside>

      {/* ── Mobile Sidebar Overlay ── */}
      {mobileSidebarOpen && (
        <div className="md:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={() => setMobileSidebarOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-[260px] bg-background border-r border-border/10 flex flex-col animate-slide-in-right" style={{ animationName: 'slideInLeft' }}>
            <div className="flex items-center justify-between px-4 py-4 border-b border-border/8">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center border border-primary/20">
                  <Zap className="w-4 h-4 text-primary" />
                </div>
                <span className="text-lg font-semibold text-gradient-gold">Aura</span>
              </div>
              <button onClick={() => setMobileSidebarOpen(false)} className="text-muted-foreground p-1">
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 py-4 px-3 space-y-1">
              {NAV_ITEMS.map((item) => {
                const isActive = activeTab === item.value;
                return (
                  <button
                    key={item.value}
                    onClick={() => switchTab(item.value)}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                      isActive
                        ? "bg-primary/10 text-primary border border-primary/15"
                        : "text-muted-foreground hover:text-foreground hover:bg-secondary/30 border border-transparent"
                    }`}
                  >
                    <item.icon className="w-4.5 h-4.5" />
                    <span className="text-sm font-medium">{item.label}</span>
                  </button>
                );
              })}
            </nav>
          </aside>
        </div>
      )}

      {/* ── Main Content ── */}
      <main
        className={`flex-1 relative z-10 transition-all duration-300 ${
          sidebarCollapsed ? "md:ml-[68px]" : "md:ml-[220px]"
        }`}
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <div className="max-w-5xl mx-auto px-5 sm:px-8 py-6 sm:py-8 pb-36 md:pb-24">
          {/* Top Bar */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              {/* Mobile hamburger */}
              <button
                onClick={() => setMobileSidebarOpen(true)}
                className="md:hidden p-2 rounded-xl bg-secondary/30 text-muted-foreground hover:text-foreground transition-colors"
              >
                <Menu className="w-5 h-5" />
              </button>
              <h2
                className="text-lg font-bold text-foreground tracking-tight"
                style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
              >
                {NAV_ITEMS.find(n => n.value === activeTab)?.label}
              </h2>
            </div>
            <div className="flex items-center gap-3">
              <NotificationBell />
              <span className="text-[10px] text-muted-foreground/40 hidden sm:block tracking-widest uppercase">{user?.email}</span>
              <button onClick={handleLogout} className="text-muted-foreground/40 hover:text-foreground transition-colors tactile-press" title="Log out">
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Tab Content */}
          <div className="tab-content-spring">
            {activeTab === "home" && (
              <div className="animate-tab-spring">
                <HomeTab entries={entries} onOpenChat={openChat} onRefresh={fetchEntries} />
              </div>
            )}

            {activeTab === "identity" && (
              <div className="animate-tab-spring">
                <IdentityTab onResetDiagnostic={() => setShowDiagnostic(true)} />
              </div>
            )}

            {activeTab === "intelligence" && (
              <div className="animate-tab-spring">
                <IntelligenceTab entries={entries} onOpenChat={openChat} onRefresh={fetchEntries} />
              </div>
            )}

            {activeTab === "strategy" && (
              <div className="animate-tab-spring">
                <StrategyTab onOpenChat={openChat} />
              </div>
            )}

            {activeTab === "authority" && (
              <div className="animate-tab-spring">
                <AuthorityTab entries={entries} onRefresh={fetchEntries} />
              </div>
            )}

            {activeTab === "influence" && (
              <div className="animate-tab-spring">
                <InfluenceTabNew entries={entries} />
              </div>
            )}
          </div>
        </div>
      </main>

      {/* ── Persistent AI Bar ── */}
      {!chatOpen && !showOnboarding && !showDiagnostic && (
        <div
          className={`fixed z-40 transition-all duration-300 ${
            sidebarCollapsed ? "md:left-[68px]" : "md:left-[220px]"
          } left-0 right-0`}
          style={{ bottom: 'env(safe-area-inset-bottom)' }}
        >
          {/* Mobile bottom nav */}
          <nav className="md:hidden border-t border-border/10 bg-background/95 backdrop-blur-xl">
            <div className="flex w-full px-1 py-1.5">
              {NAV_ITEMS.map((tab) => (
                <button
                  key={`mobile-${tab.value}`}
                  onClick={() => switchTab(tab.value)}
                  className={`flex-1 flex flex-col items-center gap-0.5 py-2 rounded-lg transition-all duration-200 tactile-press ${
                    activeTab === tab.value ? "text-primary bg-primary/8" : "text-muted-foreground/50"
                  }`}
                >
                  <tab.icon className="w-4 h-4" />
                  <span className="text-[8px] font-medium tracking-wide">{tab.label}</span>
                </button>
              ))}
            </div>
          </nav>

          {/* AI Bar */}
          <div className="border-t border-border/10 bg-background/95 backdrop-blur-xl px-4 sm:px-6 py-3">
            <div className="max-w-5xl mx-auto">
              <div className="flex items-center gap-3">
                {/* Quick Prompts */}
                <div className="hidden sm:flex items-center gap-1.5 shrink-0">
                  {["What signals are emerging?", "Suggest a framework", "Draft a LinkedIn post"].map((prompt, i) => (
                    <button
                      key={i}
                      onClick={() => openChat(prompt)}
                      className="text-[9px] px-2.5 py-1.5 rounded-lg bg-secondary/30 text-muted-foreground/50 hover:text-primary hover:bg-primary/8 transition-colors border border-transparent hover:border-primary/15 whitespace-nowrap"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>

                {/* Main Input */}
                <button
                  onClick={() => openChat()}
                  className="flex-1 flex items-center gap-3 px-4 py-3 rounded-xl glass-card border border-border/15 hover:border-primary/20 transition-all group cursor-pointer"
                >
                  <Sparkles className="w-4 h-4 text-primary/50 group-hover:text-primary transition-colors shrink-0" />
                  <span className="text-sm text-muted-foreground/40 group-hover:text-muted-foreground/60 transition-colors">
                    What strategic question are you exploring?
                  </span>
                </button>

                {/* Tool Buttons */}
                <button
                  onClick={() => setCaptureOpen(true)}
                  className="w-10 h-10 rounded-xl bg-secondary/30 flex items-center justify-center text-muted-foreground/40 hover:text-primary hover:bg-primary/8 transition-colors shrink-0 border border-transparent hover:border-primary/15"
                  title="Attach document"
                >
                  <Paperclip className="w-4 h-4" />
                </button>
                <button
                  onClick={() => { setCaptureOpen(true); }}
                  className="w-10 h-10 rounded-xl bg-secondary/30 flex items-center justify-center text-muted-foreground/40 hover:text-primary hover:bg-primary/8 transition-colors shrink-0 border border-transparent hover:border-primary/15 md:flex hidden"
                  title="Voice question"
                >
                  <Mic className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <CaptureModal
        open={captureOpen}
        onOpenChange={setCaptureOpen}
        onCaptured={fetchEntries}
        onOpenChat={openChat}
      />
      <AuraChatSidebar
        open={chatOpen}
        onClose={() => { setChatOpen(false); setChatInitialMessage(undefined); }}
        initialMessage={chatInitialMessage}
      />
    </div>
  );
};

export default Dashboard;
