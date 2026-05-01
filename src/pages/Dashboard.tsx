import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Plus, LogOut, Zap, MessageCircle, Compass, User, Shield, Crown, TrendingUp, Menu, X, Paperclip, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { useLanguage } from "@/contexts/LanguageContext";
import CaptureModal from "@/components/CaptureModal";
import AuraChatSidebar, { type ChatContext } from "@/components/AuraChatSidebar";
import AskAuraPresence from "@/components/AskAuraPresence";
import OnboardingSequence from "@/components/OnboardingSequence";
import ExecutiveDiagnostic from "@/components/ExecutiveDiagnostic";
import OnboardingWizard from "@/components/OnboardingWizard";
import WhatsAppOptInModal from "@/components/WhatsAppOptInModal";
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
};

const Dashboard = () => {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [activeTab, setActiveTab] = useState<TabValue>("home");
  const [captureOpen, setCaptureOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInitialMessage, setChatInitialMessage] = useState<string | undefined>();
  const [chatContext, setChatContext] = useState<ChatContext | undefined>();
  const [user, setUser] = useState<{ email?: string; fullName?: string | null } | null>(null);
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
    trendHeadline?: string;
  } | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
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

  // Handle prefill from trend Draft Post (passed via React Router state)
  useEffect(() => {
    const st = location.state as any;
    if (st?.prefill_topic) {
      setSignalDraftPrefill({
        topic: st.prefill_topic,
        context: st.prefill_context || "",
        sourceType: st.source || "trend",
        sourceTitle: st.prefill_topic,
        contentFormat: "post",
        trendHeadline: st.prefill_topic,
      });
      setActiveTab("authority");
      // Clear router state so refresh doesn't re-prefill
      window.history.replaceState({}, document.title);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
          .select("completed, onboarding_completed, first_name")
          .eq("user_id", uid)
          .maybeSingle();

        if (profile) {
          setUser((u) => ({ ...(u || {}), email: session.user.email, fullName: (profile as any).first_name ?? null }));
        }

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
      <WhatsAppOptInModal />

      {/* ── Desktop Sidebar ── */}
      <aside
        className={`hidden md:flex flex-col fixed top-0 left-0 h-full z-30 backdrop-blur-xl transition-all duration-300 ${
          sidebarCollapsed ? "w-[68px]" : "w-[220px]"
        }`}
        style={{
          background: "var(--paper-2)",
          borderRight: "0.5px solid var(--paper-3)",
        }}
      >
        {/* Logo */}
        <div
          className="flex items-center gap-3 px-4 py-5"
          style={{ borderBottom: "0.5px solid var(--paper-3)" }}
        >
          <div
            className="flex items-center justify-center shrink-0"
            style={{
              width: 32,
              height: 32,
              background: "var(--ink)",
              borderRadius: "var(--r-md)",
              fontFamily: "'Cormorant Garamond', serif",
              fontSize: 20,
              fontWeight: 600,
              color: "var(--bronze)",
              lineHeight: 1,
            }}
          >
            A
          </div>
          {!sidebarCollapsed && (
            <div className="overflow-hidden min-w-0">
              <h1
                className="text-lg tracking-tight font-semibold"
                style={{ color: "var(--ink)" }}
              >
                Aura
              </h1>
              <p
                style={{
                  fontSize: 9,
                  letterSpacing: "0.08em",
                  color: "var(--ink-4)",
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
        <nav className="flex-1 py-2 px-0 space-y-1">
          {!sidebarCollapsed && (
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                letterSpacing: "0.18em",
                color: "var(--ink-4)",
                padding: "12px 24px 8px",
                textTransform: "uppercase",
              }}
            >
              Workspace
            </div>
          )}
          {NAV_ITEMS.map((item) => {
            const isActive = activeTab === item.value;
            return (
              <button
                key={item.value}
                onClick={() => switchTab(item.value)}
                className="w-full flex items-center gap-3 tactile-press group relative aura-nav-item"
                style={{
                  padding: "10px 24px",
                  background: isActive ? "var(--vellum)" : "transparent",
                  color: isActive ? "var(--ink)" : "var(--ink-2)",
                  fontWeight: isActive ? 500 : 400,
                  border: "none",
                  transition: "all var(--t-fast) var(--ease)",
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.background = "var(--paper-3)";
                    e.currentTarget.style.color = "var(--ink)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.background = "transparent";
                    e.currentTarget.style.color = "var(--ink-2)";
                  }
                }}
              >
                {isActive && (
                  <span
                    aria-hidden="true"
                    style={{
                      position: "absolute",
                      left: 0,
                      top: 6,
                      bottom: 6,
                      width: 2,
                      background: "var(--bronze)",
                    }}
                  />
                )}
                <item.icon
                  className="w-5 h-5 shrink-0"
                  style={{
                    color: isActive ? "var(--bronze)" : "var(--ink-3)",
                    transition: "color var(--t-fast) var(--ease)",
                  }}
                />
                {!sidebarCollapsed && (
                  <span className="text-sm font-medium tracking-wide">{item.label}</span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Bottom actions */}
        <div
          className="px-3 py-4 flex flex-col gap-2"
          style={{ borderTop: "0.5px solid var(--paper-3)" }}
        >
          <AskAuraPresence collapsed={sidebarCollapsed} onOpen={() => openChat()} />
          <button
            onClick={() => setCaptureOpen(true)}
            className="w-full flex items-center gap-3 px-3 py-3 tactile-press group"
            style={{
              background: "var(--bronze-mist)",
              color: "var(--bronze-deep)",
              border: "0.5px solid var(--bronze-line)",
              borderRadius: "var(--r-md)",
              transition: "all var(--t-fast) var(--ease)",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bronze-pale)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "var(--bronze-mist)"; }}
          >
            <Paperclip className="w-4.5 h-4.5 shrink-0 group-hover:scale-110 transition-transform" />
            {!sidebarCollapsed && <span className="text-sm font-medium">Capture</span>}
          </button>

          {/* Theme toggle pill — above Collapse */}
          {!sidebarCollapsed && (
            <button
              onClick={toggleTheme}
              aria-label="Toggle theme"
              className="aura-theme-toggle"
              style={{
                background: "var(--vellum)",
                border: "0.5px solid var(--paper-3)",
                borderRadius: 20,
                padding: "0 12px",
                minHeight: 32,
                width: "100%",
                fontSize: 11,
                fontWeight: 500,
                color: "var(--ink-2)",
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
                  background: "var(--bronze)",
                  display: "inline-block",
                  flexShrink: 0,
                }}
              />
              <span>{theme === "light" ? "Light" : "Dark"}</span>
            </button>
          )}

          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="w-full flex items-center gap-3 px-3 py-2 transition-all"
            style={{ color: "var(--ink-4)", borderRadius: "var(--r-md)" }}
          >
            <Menu className="w-4 h-4 shrink-0" />
            {!sidebarCollapsed && <span className="text-[11px]">Collapse</span>}
          </button>
        </div>
      </aside>

      {/* ── Mobile Sidebar Overlay ── */}
      {mobileSidebarOpen && (
        <div className="md:hidden fixed inset-0 z-50">
          <div
            className="absolute inset-0 backdrop-blur-sm"
            style={{ background: "rgba(20,17,12,0.55)" }}
            onClick={() => setMobileSidebarOpen(false)}
          />
          <aside
            className="absolute left-0 top-0 h-full w-[260px] flex flex-col animate-slide-in-right"
            style={{
              animationName: 'slideInLeft',
              background: "var(--paper-2)",
              borderRight: "0.5px solid var(--paper-3)",
            }}
          >
            <div
              className="flex items-center justify-between px-4 py-4"
              style={{ borderBottom: "0.5px solid var(--paper-3)" }}
            >
              <div className="flex items-center gap-2.5">
                <div
                  className="flex items-center justify-center"
                  style={{
                    width: 32,
                    height: 32,
                    background: "var(--ink)",
                    borderRadius: "var(--r-md)",
                    fontFamily: "'Cormorant Garamond', serif",
                    fontSize: 20,
                    fontWeight: 600,
                    color: "var(--bronze)",
                    lineHeight: 1,
                  }}
                >
                  A
                </div>
                <span className="text-lg font-semibold" style={{ color: "var(--ink)" }}>Aura</span>
              </div>
              <button
                onClick={() => setMobileSidebarOpen(false)}
                className="p-1"
                style={{ color: "var(--ink-3)" }}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 py-2 px-0 space-y-1">
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                  letterSpacing: "0.18em",
                  color: "var(--ink-4)",
                  padding: "12px 24px 8px",
                  textTransform: "uppercase",
                }}
              >
                Workspace
              </div>
              {NAV_ITEMS.map((item) => {
                const isActive = activeTab === item.value;
                return (
                  <button
                    key={item.value}
                    onClick={() => switchTab(item.value)}
                    className="w-full flex items-center gap-3 relative"
                    style={{
                      padding: "10px 24px",
                      background: isActive ? "var(--vellum)" : "transparent",
                      color: isActive ? "var(--ink)" : "var(--ink-2)",
                      fontWeight: isActive ? 500 : 400,
                      transition: "all var(--t-fast) var(--ease)",
                    }}
                  >
                    {isActive && (
                      <span
                        aria-hidden="true"
                        style={{
                          position: "absolute",
                          left: 0,
                          top: 6,
                          bottom: 6,
                          width: 2,
                          background: "var(--bronze)",
                        }}
                      />
                    )}
                    <item.icon
                      className="w-5 h-5"
                      style={{ color: isActive ? "var(--bronze)" : "var(--ink-3)" }}
                    />
                    <span className="text-sm font-medium">{item.label}</span>
                  </button>
                );
              })}
            </nav>
            <div
              className="px-3 py-4 space-y-2"
              style={{ borderTop: "0.5px solid var(--paper-3)" }}
            >
              <AskAuraPresence
                onOpen={() => { setMobileSidebarOpen(false); openChat(); }}
              />
              <button
                onClick={() => { setMobileSidebarOpen(false); setCaptureOpen(true); }}
                className="w-full flex items-center justify-center gap-2 px-3 py-2.5 transition-all text-xs"
                style={{
                  color: "var(--ink-3)",
                  background: "transparent",
                  border: "0.5px solid var(--paper-3)",
                  borderRadius: "var(--r-md)",
                }}
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
        <div className="max-w-5xl mx-auto px-4 sm:px-8 py-4 sm:py-8 pb-[88px] md:pb-12 overflow-hidden">
          {/* Top Bar */}
          <div className="flex items-center justify-between mb-6 pt-2 md:pt-0">
            <div className="flex items-center gap-3">
              {/* Desktop section label */}
              <h2 className="hidden md:block text-sm font-medium text-muted-foreground tracking-wide uppercase">
                {NAV_ITEMS.find(n => n.value === activeTab)?.pageHeader}
              </h2>
              {/* Mobile page title */}
              <h2
                className="md:hidden"
                style={{
                  fontFamily: "'DM Serif Display', serif",
                  fontSize: 20,
                  lineHeight: 1.2,
                  color: "var(--color-text-primary)",
                }}
              >
                {NAV_ITEMS.find(n => n.value === activeTab)?.pageHeader}
              </h2>
            </div>
            <div className="flex items-center gap-3">
              <NotificationBell />
              {(() => {
                const fn = (user?.fullName || "").trim();
                const parts = fn.split(/\s+/).filter(Boolean);
                const initials = parts.length >= 2
                  ? `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
                  : parts.length === 1
                    ? parts[0][0]?.toUpperCase()
                    : "";
                return initials ? (
                  <span
                    className="aura-initials-avatar"
                    title={fn || user?.email || ""}
                    aria-label={fn || "Account"}
                  >
                    {initials}
                  </span>
                ) : (
                  <span
                    className="aura-initials-avatar"
                    title={user?.email || "Account"}
                    aria-label="Account"
                  >
                    <User className="w-4 h-4" />
                  </span>
                );
              })()}
              <button onClick={handleLogout} className="text-muted-foreground/40 hover:text-foreground transition-colors tactile-press" title="Log out">
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Tab Content */}
          <div className="tab-content-spring">
            {activeTab === "home" && (
              <div className="animate-tab-spring aura-page">
                <ErrorBoundary>
                  <HomeTab entries={entries} onOpenChat={openChat} onRefresh={fetchEntries} onNavigateToSignal={navigateToSignal} onOpenCapture={() => setCaptureOpen(true)} onSwitchTab={switchTab} onDraftToStudio={(prefill) => { setSignalDraftPrefill(prefill); setActiveTab("authority"); window.scrollTo({ top: 0, behavior: "smooth" }); }} />
                </ErrorBoundary>
              </div>
            )}

            {activeTab === "identity" && (
              <div className="animate-tab-spring aura-page">
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
              <div className="animate-tab-spring aura-page">
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
              <div className="animate-tab-spring aura-page">
                <ErrorBoundary>
                  <AuthorityTab entries={entries} onRefresh={fetchEntries} signalPrefill={signalDraftPrefill} onSignalPrefillConsumed={() => setSignalDraftPrefill(null)} />
                </ErrorBoundary>
              </div>
            )}

            {activeTab === "influence" && (
              <div className="animate-tab-spring aura-page">
                <ErrorBoundary>
                  <ImpactTab onOpenCapture={() => setCaptureOpen(true)} />
                </ErrorBoundary>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* ── Mobile Floating Capture FAB ── */}
      {!chatOpen && !showOnboarding && !showDiagnostic && !captureOpen && (
        <button
          onClick={() => setCaptureOpen(true)}
          aria-label="Capture"
          className="md:hidden fixed flex items-center justify-center"
          style={{
            bottom: `calc(76px + env(safe-area-inset-bottom))`,
            right: 16,
            width: 52,
            height: 52,
            background: "var(--bronze)",
            borderRadius: "var(--r-xl)",
            boxShadow: "var(--shadow-lift)",
            zIndex: 49,
            color: "var(--ink)",
          }}
        >
          <Plus className="w-[22px] h-[22px]" strokeWidth={2.5} />
        </button>
      )}

      {/* ── Mobile Bottom Nav ── */}
      {!chatOpen && !showOnboarding && !showDiagnostic && (
        <div
          className="fixed left-0 right-0 md:hidden"
          style={{ bottom: 0, zIndex: 50 }}
        >
          <nav
            className="flex items-center justify-around"
            style={{
              height: 60,
              background: "var(--paper-2)",
              borderTop: "0.5px solid var(--paper-3)",
              paddingBottom: "env(safe-area-inset-bottom)",
            }}
          >
            {(() => {
              const home = NAV_ITEMS.find(n => n.value === "home")!;
              const intel = NAV_ITEMS.find(n => n.value === "intelligence")!;
              const pub = NAV_ITEMS.find(n => n.value === "authority")!;
              const imp = NAV_ITEMS.find(n => n.value === "influence")!;
              const ordered = [home, intel, null, pub, imp] as const;
              return ordered.map((tab, idx) => {
                if (tab === null) {
                  return (
                    <button
                      key="mobile-aura-center"
                      onClick={() => openChat()}
                      aria-label="Ask Aura"
                      className="flex flex-col items-center justify-center"
                      style={{ gap: 4 }}
                    >
                      <span
                        className="flex items-center justify-center"
                        style={{
                          width: 40,
                          height: 40,
                          background: "var(--bronze)",
                          borderRadius: "var(--r-lg)",
                          boxShadow: "var(--shadow-rest)",
                          color: "var(--ink)",
                        }}
                      >
                        <Plus className="w-[18px] h-[18px]" strokeWidth={2.5} />
                      </span>
                      <span style={{ fontSize: 8, color: "var(--bronze)", fontWeight: 600 }}>Aura</span>
                    </button>
                  );
                }
                const isActive = activeTab === tab.value;
                return (
                  <button
                    key={`mobile-${tab.value}`}
                    onClick={() => switchTab(tab.value)}
                    className="flex flex-col items-center justify-center"
                    style={{ gap: 4 }}
                  >
                    <span
                      className="flex items-center justify-center"
                      style={{
                        width: 20,
                        height: 20,
                        background: isActive ? "var(--bronze)" : "transparent",
                        borderRadius: "var(--r-sm)",
                        color: isActive ? "var(--ink)" : "var(--ink-3)",
                      }}
                    >
                      <tab.icon className="w-[12px] h-[12px]" />
                    </span>
                    <span
                      style={{
                        fontSize: 8,
                        color: isActive ? "var(--bronze)" : "var(--ink-4)",
                        fontWeight: isActive ? 600 : 400,
                      }}
                    >
                      {tab.label}
                    </span>
                  </button>
                );
              });
            })()}
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
