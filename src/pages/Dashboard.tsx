import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Plus, LogOut, Zap, MessageCircle, Compass, User, Shield, Crown, TrendingUp, Menu, X, Paperclip, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useLanguage } from "@/contexts/LanguageContext";
import CaptureModal from "@/components/CaptureModal";
import AuraChatSidebar, { type ChatContext } from "@/components/AuraChatSidebar";
import OnboardingSequence from "@/components/OnboardingSequence";
import ExecutiveDiagnostic from "@/components/ExecutiveDiagnostic";
import OnboardingWizard from "@/components/OnboardingWizard";
import ErrorBoundary from "@/components/ErrorBoundary";
import NotificationBell from "@/components/NotificationBell";
import HomeTab from "@/components/tabs/HomeTab";
import IdentityTab from "@/components/tabs/IdentityTab";
import IntelligenceTab from "@/components/tabs/IntelligenceTab";

import AuthorityTab from "@/components/tabs/AuthorityTab";
import ImpactTab from "@/components/tabs/ImpactTab";
import type { Database } from "@/integrations/supabase/types";

type Entry = Database["public"]["Tables"]["entries"]["Row"];

const NAV_ITEMS = [
  { value: "home", label: "Home", pageHeader: "Home", icon: Compass, docTitle: "Home — Aura" },
  { value: "identity", label: "My Story", pageHeader: "Build your foundation", icon: User, docTitle: "My Story — Aura" },
  { value: "intelligence", label: "Intelligence", pageHeader: "Intelligence", icon: Shield, docTitle: "Intelligence — Aura" },
  { value: "authority", label: "Publish", pageHeader: "Content Studio", icon: Crown, docTitle: "Content Studio — Aura" },
  { value: "influence", label: "Impact", pageHeader: "Measure your influence", icon: TrendingUp, docTitle: "Impact — Aura" },
] as const;

type TabValue = typeof NAV_ITEMS[number]["value"];

const applyThemeToRoot = (theme: "dark" | "light") => {
  document.documentElement.setAttribute("data-theme", theme);
  document.documentElement.classList.remove("light", "dark");
  document.documentElement.classList.add(theme);
  document.documentElement.style.backgroundColor = theme === "dark" ? "#0c0c0c" : "#f7f7f7";
};

const Dashboard = () => {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [activeTab, setActiveTab] = useState<TabValue>("home");
  const [captureOpen, setCaptureOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInitialMessage, setChatInitialMessage] = useState<string | undefined>();
  const [chatContext, setChatContext] = useState<ChatContext | undefined>();
  const [user, setUser] = useState<{ email?: string } | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showDiagnostic, setShowDiagnostic] = useState(false);
  const [showWizard, setShowWizard] = useState(false);
  const [wizardUserId, setWizardUserId] = useState("");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    if (typeof window === "undefined") return "light";
    return (localStorage.getItem("aura-theme") as "dark" | "light") || "light";
  });
  const toggleTheme = () => {
    setTheme((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      try {
        localStorage.setItem("aura-theme", next);
        applyThemeToRoot(next);
      } catch {}
      return next;
    });
  };
  const [signalDraftPrefill, setSignalDraftPrefill] = useState<{
    topic: string;
    context: string;
    signalId?: string;
    signalTitle?: string;
    sourceType?: string;
    sourceTitle?: string;
    contentFormat?: "post" | "carousel" | "framework_summary";
  } | null>(null);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { t } = useLanguage();

  useEffect(() => {
    applyThemeToRoot(theme);
  }, [theme]);

  // Handle ?tab=intelligence&signal=xxx from URL
  useEffect(() => {
    const tabParam = searchParams.get("tab");
    // Redirect old "strategy" tab to "intelligence"
    const resolvedTab = tabParam === "strategy" ? "intelligence" : tabParam;
    if (resolvedTab && NAV_ITEMS.some(n => n.value === resolvedTab)) {
      setActiveTab(resolvedTab as TabValue);
    }
  }, []);

  const navigateToSignal = (signalId: string) => {
    setSearchParams({ signal: signalId });
    setActiveTab("intelligence");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const checkStrategicNudge = useCallback(async (_accessToken: string) => {
    try {
      // Get fresh session to avoid expired JWT
      const { data: { session: freshSession } } = await supabase.auth.getSession();
      const token = freshSession?.access_token || _accessToken;
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/strategic-nudge`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
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
        const uid = session.user.id;
        const { data: profile } = await supabase
          .from("diagnostic_profiles" as any)
          .select("completed, onboarding_completed")
          .eq("user_id", uid)
          .maybeSingle();

        // New wizard trigger: no profile row AND localStorage not set
        const wizardDone = localStorage.getItem("aura_onboarding_complete") === "true";
        if (!profile && !wizardDone) {
          setWizardUserId(uid);
          setShowWizard(true);
          return;
        }
        
        // Gate: onboarding must be completed first
        if (profile && !(profile as any).onboarding_completed) {
          navigate("/onboarding");
          return;
        }
        
        if (profile && (profile as any).completed) {
          const onboardKey = `aura_onboarded_${uid}`;
          if (!localStorage.getItem(onboardKey)) {
            setShowOnboarding(true);
          }
          checkStrategicNudge(session.access_token);
        } else if (profile && (profile as any).onboarding_completed) {
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

  const openChat = (msg?: string, ctx?: ChatContext) => {
    if (chatOpen) {
      setChatOpen(false);
      setTimeout(() => {
        setChatInitialMessage(msg);
        setChatContext(ctx);
        setChatOpen(true);
      }, 50);
    } else {
      setChatInitialMessage(msg);
      setChatContext(ctx);
      setChatOpen(true);
    }
  };

  const switchTab = (tab: TabValue) => {
    setActiveTab(tab);
    setMobileSidebarOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Keep browser tab title in sync with the active section
  useEffect(() => {
    const item = NAV_ITEMS.find(n => n.value === activeTab);
    if (item) document.title = item.docTitle;
  }, [activeTab]);

  return (
    <div className="min-h-screen bg-background flex relative safe-area-container">
      <div className="gradient-mesh fixed inset-0 pointer-events-none z-0" />

      {showOnboarding && <OnboardingSequence onComplete={async () => {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) localStorage.setItem(`aura_onboarded_${session.user.id}`, "1");
        setShowOnboarding(false);
      }} />}
      {showDiagnostic && <ExecutiveDiagnostic onComplete={() => setShowDiagnostic(false)} />}
      {showWizard && <OnboardingWizard userId={wizardUserId} onComplete={() => setShowWizard(false)} />}

      {/* ── Desktop Sidebar ── */}
      <aside
        className={`hidden md:flex flex-col fixed top-0 left-0 h-full z-30 border-r border-border/10 backdrop-blur-xl transition-all duration-300 ${
          sidebarCollapsed ? "w-[68px]" : "w-[220px]"
        }`}
        style={{ background: "var(--color-sidebar)" }}
      >
        {/* Orange left rail */}
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: 3,
            background: "var(--color-accent)",
            borderRadius: "0 2px 2px 0",
          }}
        />
        {/* Logo */}
        <div className="flex items-center gap-3 px-4 py-5 border-b border-border/8">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20 shrink-0">
            <Zap className="w-4.5 h-4.5 text-primary" />
          </div>
          {!sidebarCollapsed && (
            <div className="overflow-hidden min-w-0">
              <h1 className="text-lg tracking-tight text-gradient-gold font-semibold">Aura</h1>
              <p
                style={{
                  fontSize: 9,
                  letterSpacing: "0.08em",
                  color: "var(--color-text-muted)",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textTransform: "uppercase",
                  textOverflow: "ellipsis",
                }}
              >
                Strategic Intelligence OS
              </p>
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
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-primary/5 border border-transparent"
                }`}
                style={
                  isActive
                    ? {
                        borderLeft: "2px solid var(--color-accent)",
                        paddingLeft: 6,
                        marginLeft: 2,
                        background: "rgba(249, 115, 22, 0.08)",
                        color: "var(--color-text-primary)",
                      }
                    : undefined
                }
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
        <div className="px-2 py-4 border-t border-border/8 flex flex-col gap-2">
          <button
            onClick={() => openChat()}
            className="w-full flex items-center gap-3 px-3 py-3 rounded-xl bg-primary/8 text-primary hover:bg-primary/15 border border-primary/15 hover:border-primary/25 transition-all tactile-press group"
          >
            <Sparkles className="w-4.5 h-4.5 shrink-0 group-hover:scale-110 transition-transform" />
            {!sidebarCollapsed && <span className="text-sm font-medium">Ask Aura</span>}
          </button>
          <button
            onClick={() => setCaptureOpen(true)}
            className="w-full flex items-center gap-3 px-3 py-3 rounded-xl bg-primary/8 text-primary hover:bg-primary/15 border border-primary/15 hover:border-primary/25 transition-all tactile-press group"
          >
            <Paperclip className="w-4.5 h-4.5 shrink-0 group-hover:scale-110 transition-transform" />
            {!sidebarCollapsed && <span className="text-sm font-medium">Capture</span>}
          </button>

          {/* Theme toggle pill — above Collapse */}
          {!sidebarCollapsed && (
            <button
              onClick={toggleTheme}
              aria-label="Toggle theme"
              style={{
                background: "var(--color-border-subtle)",
                border: "0.5px solid var(--color-border)",
                borderRadius: 20,
                padding: "0 12px",
                minHeight: 32,
                width: "100%",
                fontSize: 11,
                fontWeight: 500,
                color: "var(--color-text-secondary)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
              }}
            >
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  background: "var(--color-accent)",
                  display: "inline-block",
                  flexShrink: 0,
                }}
              />
              <span>{theme === "light" ? "Light" : "Dark"}</span>
            </button>
          )}

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
            <nav className="flex-1 py-4 px-3 space-y-2">
              {NAV_ITEMS.map((item) => {
                const isActive = activeTab === item.value;
                return (
                  <button
                    key={item.value}
                    onClick={() => switchTab(item.value)}
                    className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl transition-all duration-[250ms] ease-[ease-in-out] ${
                      isActive
                        ? "bg-primary/12 text-primary border border-primary/20 shadow-[0_0_12px_hsl(43_80%_45%/0.1)]"
                        : "text-muted-foreground hover:text-foreground hover:bg-primary/5 border border-transparent"
                    }`}
                  >
                    <item.icon className="w-5 h-5" />
                    <span className="text-sm font-medium">{item.label}</span>
                  </button>
                );
              })}
            </nav>
            <div className="px-3 py-4 border-t border-border/8 space-y-2">
              <button
                onClick={() => { setMobileSidebarOpen(false); openChat(); }}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-primary/8 text-primary hover:bg-primary/15 border border-primary/15 hover:border-primary/25 transition-all"
              >
                <Sparkles className="w-4.5 h-4.5 shrink-0" />
                <span className="text-sm font-medium">Ask Aura</span>
              </button>
              <button
                onClick={() => { setMobileSidebarOpen(false); setCaptureOpen(true); }}
                className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-muted-foreground/60 hover:text-foreground hover:bg-secondary/30 transition-all text-xs border border-border/10"
              >
                <Paperclip className="w-3.5 h-3.5 shrink-0" />
                <span>Capture</span>
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* ── Main Content ── */}
      <main
        className={`flex-1 min-w-0 relative z-10 transition-all duration-300 overflow-x-hidden ${
          sidebarCollapsed ? "md:ml-[68px]" : "md:ml-[220px]"
        }`}
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <div className="max-w-5xl mx-auto px-4 sm:px-8 py-4 sm:py-8 pb-24 md:pb-12 overflow-hidden">
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
                className="text-sm font-medium text-muted-foreground tracking-wide uppercase"
              >
                {NAV_ITEMS.find(n => n.value === activeTab)?.pageHeader}
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
                <ErrorBoundary>
                  <HomeTab entries={entries} onOpenChat={openChat} onRefresh={fetchEntries} onNavigateToSignal={navigateToSignal} onOpenCapture={() => setCaptureOpen(true)} onSwitchTab={switchTab} onDraftToStudio={(prefill) => { setSignalDraftPrefill(prefill); setActiveTab("authority"); window.scrollTo({ top: 0, behavior: "smooth" }); }} />
                </ErrorBoundary>
              </div>
            )}

            {activeTab === "identity" && (
              <div className="animate-tab-spring">
                <ErrorBoundary>
                  <IdentityTab
                    onResetDiagnostic={() => setShowDiagnostic(true)}
                    onSwitchTab={switchTab}
                    onDraftToStudio={(prefill) => {
                      setSignalDraftPrefill(prefill);
                      setActiveTab("authority");
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                  />
                </ErrorBoundary>
              </div>
            )}

            {activeTab === "intelligence" && (
              <div className="animate-tab-spring">
                <ErrorBoundary>
                  <IntelligenceTab
                    entries={entries}
                    onOpenChat={openChat}
                    onRefresh={fetchEntries}
                    onOpenCapture={() => setCaptureOpen(true)}
                    onDraftToStudio={(prefill) => {
                      setSignalDraftPrefill(prefill);
                      setActiveTab("authority");
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                  />
                </ErrorBoundary>
              </div>
            )}

            {activeTab === "authority" && (
              <div className="animate-tab-spring">
                <ErrorBoundary>
                  <AuthorityTab entries={entries} onRefresh={fetchEntries} signalPrefill={signalDraftPrefill} onSignalPrefillConsumed={() => setSignalDraftPrefill(null)} />
                </ErrorBoundary>
              </div>
            )}

            {activeTab === "influence" && (
              <div className="animate-tab-spring">
                <ErrorBoundary>
                  <ImpactTab />
                </ErrorBoundary>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* ── Mobile Bottom Nav (navigation only, no AI bar) ── */}
      {!chatOpen && !showOnboarding && !showDiagnostic && (
        <div
          className={`fixed z-40 left-0 right-0 md:hidden`}
          style={{ bottom: 'env(safe-area-inset-bottom)' }}
        >
          <nav className="border-t border-border/10 bg-background/95 backdrop-blur-xl">
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
        onClose={() => { setChatOpen(false); setChatInitialMessage(undefined); setChatContext(undefined); }}
        initialMessage={chatInitialMessage}
        context={chatContext}
      />
    </div>
  );
};

export default Dashboard;
