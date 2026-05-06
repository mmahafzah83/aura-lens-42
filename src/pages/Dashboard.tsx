import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Plus, LogOut, Zap, MessageCircle, Compass, User, Shield, Crown, TrendingUp, Menu, X, Paperclip, Sparkles, UserPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { useLanguage } from "@/contexts/LanguageContext";
import { useDesignTokens } from "@/hooks/useDesignTokens";
import { useCardEntryAnimation } from "@/hooks/useCardEntryAnimation";
import CaptureModal from "@/components/CaptureModal";
import AuraChatSidebar, { type ChatContext } from "@/components/AuraChatSidebar";
import AskAuraPresence from "@/components/AskAuraPresence";
import OnboardingSequence from "@/components/OnboardingSequence";
import ExecutiveDiagnostic from "@/components/ExecutiveDiagnostic";
import OnboardingWizard from "@/components/OnboardingWizard";
import WhatsAppOptInModal from "@/components/WhatsAppOptInModal";
import ErrorBoundary from "@/components/ErrorBoundary";
import NotificationBell from "@/components/NotificationBell";
import { HelpPanel, HelpButton } from "@/components/HelpPanel";
import ProfileMenu from "@/components/ProfileMenu";
import FeedbackButton from "@/components/FeedbackButton";
import InviteColleagueModal from "@/components/InviteColleagueModal";
import NpsSurveyModal from "@/components/NpsSurveyModal";
import HomeTab from "@/components/tabs/HomeTab";
import IdentityTab from "@/components/tabs/IdentityTab";
import IntelligenceTab from "@/components/tabs/IntelligenceTab";

import AuthorityTab from "@/components/tabs/AuthorityTab";
import ImpactTab from "@/components/tabs/ImpactTab";
import AmbientOrbs from "@/components/AmbientOrbs";
import PageHeroBackground from "@/components/PageHeroBackground";
import type { Database } from "@/integrations/supabase/types";

type Entry = Database["public"]["Tables"]["entries"]["Row"];

const NAV_ITEMS = [
  { value: "home", label: "Home", pageHeader: "Home", icon: Compass, docTitle: "Home — Aura" },
  { value: "intelligence", label: "Intelligence", pageHeader: "Intelligence", icon: Shield, docTitle: "Intelligence — Aura" },
  { value: "authority", label: "Publish", pageHeader: "Content Studio", icon: Crown, docTitle: "Content Studio — Aura" },
  { value: "influence", label: "Impact", pageHeader: "Measure your influence", icon: TrendingUp, docTitle: "Impact — Aura" },
  { value: "identity", label: "My Story", pageHeader: "Build your foundation", icon: User, docTitle: "My Story — Aura" },
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
  const [user, setUser] = useState<{ email?: string; fullName?: string | null; avatarUrl?: string | null } | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showDiagnostic, setShowDiagnostic] = useState(false);
  const [showWizard, setShowWizard] = useState(false);
  const [wizardUserId, setWizardUserId] = useState("");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
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

  // Database-driven design tokens (overrides CSS fallbacks via inline style)
  useDesignTokens(theme);

  // Sprint F2 — observe cards for entry fade/slide animation.
  // Re-runs when the active tab changes so newly mounted cards get observed.
  useCardEntryAnimation(null, [activeTab]);

  // FirstVisitHint action wiring (M-0-4): respond to events emitted by hint CTAs.
  useEffect(() => {
    const openCap = () => setCaptureOpen(true);
    const openFlash = () => {
      setActiveTab("authority");
      setSearchParams({ tab: "authority" });
      window.setTimeout(() => {
        const el = document.querySelector('[data-format-tile="flash"]') as HTMLElement | null;
        if (el) { el.scrollIntoView({ behavior: "smooth", block: "center" }); el.click(); }
      }, 250);
    };
    const scrollLi = () => {
      const el = document.querySelector('[data-section="linkedin-upload"]') as HTMLElement | null;
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    window.addEventListener("aura:open-capture", openCap);
    window.addEventListener("aura:open-flash", openFlash);
    window.addEventListener("aura:scroll-linkedin-upload", scrollLi);
    return () => {
      window.removeEventListener("aura:open-capture", openCap);
      window.removeEventListener("aura:open-flash", openFlash);
      window.removeEventListener("aura:scroll-linkedin-upload", scrollLi);
    };
  }, [setSearchParams]);

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
        // Self-promote beta_allowlist row to 'active' on first sign-in.
        // Fire-and-forget; failures must not block the dashboard.
        try {
          const key = `aura_marked_active_${uid}`;
          if (!localStorage.getItem(key)) {
            supabase.functions
              .invoke("mark-user-active", { body: {} })
              .then(() => localStorage.setItem(key, "1"))
              .catch((e) => console.warn("mark-user-active failed", e));
          }
        } catch {}
        const { data: profile } = await supabase
          .from("diagnostic_profiles" as any)
          .select("completed, onboarding_completed, first_name, avatar_url")
          .eq("user_id", uid)
          .maybeSingle();

        if (profile) {
          setUser((u) => ({
            ...(u || {}),
            email: session.user.email,
            fullName: (profile as any).first_name ?? null,
            avatarUrl: (profile as any).avatar_url ?? null,
          }));
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
        className={`aura-sidebar-shell hidden md:flex flex-col fixed top-0 left-0 h-full z-30 backdrop-blur-xl transition-all duration-300 ${
          sidebarCollapsed ? "w-[68px]" : "w-[220px]"
        }`}
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
                  color: "var(--ink-2)",
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
                color: "var(--ink-2)",
                padding: "12px 24px 8px",
                textTransform: "uppercase",
              }}
            >
              Workspace
            </div>
          )}
          {NAV_ITEMS.map((item) => {
            const isActive = activeTab === item.value;
            const navTestId = ({
              home: "nav-home",
              identity: "nav-mystory",
              intelligence: "nav-intelligence",
              authority: "nav-publish",
              influence: "nav-impact",
            } as Record<string, string>)[item.value] || `nav-${item.value}`;
            return (
              <button
                key={item.value}
                onClick={() => switchTab(item.value)}
                data-testid={navTestId}
                data-active={isActive ? "true" : "false"}
                className={`w-full flex items-center gap-3 tactile-press group aura-nav-item ${isActive ? "is-active" : ""}`}
                style={{
                  padding: "10px 24px",
                  fontWeight: isActive ? 500 : 400,
                }}
              >
                <item.icon
                  className="w-5 h-5 shrink-0"
                  style={{
                    color: isActive ? "var(--brand)" : "var(--ink-3)",
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
            data-testid="nav-capture"
            className="w-full flex items-center gap-3 px-3 py-3 tactile-press group"
            style={{
              background: "transparent",
              color: "var(--brand)",
              border: "1px solid var(--brand-line)",
              borderRadius: "var(--r-md)",
              transition: "all var(--t-fast) var(--ease)",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--brand-ghost)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
          >
            <Paperclip className="w-4.5 h-4.5 shrink-0 group-hover:scale-110 transition-transform" />
            {!sidebarCollapsed && <span className="text-sm font-medium">Capture</span>}
          </button>

          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="w-full flex items-center gap-3 px-3 py-2 transition-all min-h-[44px]"
            style={{ color: "var(--ink-4)", borderRadius: "var(--r-md)" }}
          >
            <Menu className="w-4 h-4 shrink-0" />
            {!sidebarCollapsed && <span className="text-[11px]">Collapse</span>}
          </button>

          <button
            onClick={() => setInviteOpen(true)}
            aria-label="Invite a colleague"
            className="w-full flex items-center gap-3 px-3 py-2 transition-all min-h-[44px]"
            style={{ color: "var(--ink-3)", borderRadius: "var(--r-md)" }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "var(--brand)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "var(--ink-3)"; }}
            title="Invite a colleague"
          >
            <UserPlus className="w-4 h-4 shrink-0" />
            {!sidebarCollapsed && <span className="text-[11px]">Invite a colleague</span>}
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
            className="aura-sidebar-shell absolute left-0 top-0 h-full w-[260px] flex flex-col animate-slide-in-right"
            style={{
              animationName: 'slideInLeft',
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
                const navTestId = ({
                  home: "nav-home",
                  identity: "nav-mystory",
                  intelligence: "nav-intelligence",
                  authority: "nav-publish",
                  influence: "nav-impact",
                } as Record<string, string>)[item.value] || `nav-${item.value}`;
                return (
                  <button
                    key={item.value}
                    onClick={() => switchTab(item.value)}
                    data-testid={navTestId}
                    data-active={isActive ? "true" : "false"}
                    className={`w-full flex items-center gap-3 aura-nav-item ${isActive ? "is-active" : ""}`}
                    style={{
                      padding: "10px 24px",
                      fontWeight: isActive ? 500 : 400,
                    }}
                  >
                    <item.icon
                      className="w-5 h-5"
                      style={{ color: isActive ? "var(--brand)" : "var(--ink-3)" }}
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
                data-testid="nav-capture"
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
        className={`grain-overlay flex-1 min-w-0 relative z-10 transition-all duration-300 overflow-x-hidden ${
          sidebarCollapsed ? "md:ml-[68px]" : "md:ml-[220px]"
        }`}
        style={{ paddingTop: 'env(safe-area-inset-top)', background: 'var(--paper)' }}
      >
        <div className="max-w-5xl mx-auto px-4 sm:px-8 py-4 sm:py-8 pb-[88px] md:pb-12 overflow-hidden">
          {/* Top Bar */}
          <div className="flex items-center justify-between mb-6 pt-2 md:pt-0">
            <div className="flex items-center gap-3">
              {/* Global section label removed — each tab owns its own branded header */}
            </div>
            <div className="flex items-center gap-3">
              <HelpButton onClick={() => setHelpOpen(true)} />
              <NotificationBell />
              <ProfileMenu
                fullName={user?.fullName ?? null}
                email={user?.email}
                avatarUrl={user?.avatarUrl ?? null}
                theme={theme}
                onToggleTheme={toggleTheme}
                onSignOut={handleLogout}
                onEditProfile={() => {
                  setActiveTab("identity");
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
              />
            </div>
          </div>

          {/* Tab Content */}
          <div className="tab-content-spring aura-page-fade relative" key={activeTab} style={{ minHeight: "60vh" }}>
            {/* Sprint F4 — atmosphere & cinematic background */}
            <PageHeroBackground
              pageKey={
                activeTab === "home"
                  ? "home"
                  : activeTab === "identity"
                  ? "story"
                  : activeTab === "intelligence"
                  ? "intel"
                  : activeTab === "authority"
                  ? "publish"
                  : "impact"
              }
              theme={theme}
            />
            <AmbientOrbs theme={theme} pageKey={activeTab} />
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
      <FeedbackButton />
      <HelpPanel open={helpOpen} onClose={() => setHelpOpen(false)} activeTab={activeTab} />
      <InviteColleagueModal open={inviteOpen} onClose={() => setInviteOpen(false)} />
      <NpsSurveyModal />
    </div>
  );
};

export default Dashboard;
