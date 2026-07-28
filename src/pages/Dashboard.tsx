import { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";
import { Plus, LogOut, MessageCircle, Compass, Moon, User, Shield, Crown, TrendingUp, Menu, X, Paperclip, Sparkles, UserPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { useLanguage } from "@/contexts/LanguageContext";
import { useDesignTokens } from "@/hooks/useDesignTokens";
import { useCardEntryAnimation } from "@/hooks/useCardEntryAnimation";
import CaptureModal from "@/components/CaptureModal";
import { useCapturedSources } from "@/hooks/useCapturedSources";
import AuraChatSidebar, { type ChatContext } from "@/components/AuraChatSidebar";
import AskAuraPresence from "@/components/AskAuraPresence";
import AuraLogo from "@/components/brand/AuraLogo";
import ExecutiveDiagnostic from "@/components/ExecutiveDiagnostic";
import WhatsAppOptInModal from "@/components/WhatsAppOptInModal";
import ErrorBoundary from "@/components/ErrorBoundary";
import NotificationBell from "@/components/NotificationBell";
import AskAuraButton from "@/components/AskAuraButton";
import { HelpPanel, HelpButton } from "@/components/HelpPanel";
import ProfileMenu from "@/components/ProfileMenu";
import PreferencesPanel from "@/components/PreferencesPanel";
import EditProfileModal, { type EditProfileField } from "@/components/EditProfileModal";
import SetPasswordModal from "@/components/SetPasswordModal";
import BrandAssessmentModal from "@/components/BrandAssessmentModal";
import FeedbackButton from "@/components/FeedbackButton";
import InviteColleagueModal from "@/components/InviteColleagueModal";
import NpsSurveyModal from "@/components/NpsSurveyModal";
import FirstLoginWelcome from "@/components/FirstLoginWelcome";
import Brief from "@/components/Brief";
import BriefV2 from "@/components/home/BriefV2";
import AuraRail from "@/components/rail/AuraRail";
import IdentityDriftBanner from "@/components/IdentityDriftBanner";
import FirstFlightCard from "@/components/FirstFlightCard";
import useFirstFlight from "@/hooks/useFirstFlight";
import FirstVisitHint from "@/components/ui/FirstVisitHint";
import IdentityTab from "@/components/tabs/IdentityTab";
import SignalsBoardV2 from "@/components/signals/SignalsBoardV2";
import TierCeremonyModal from "@/components/TierCeremonyModal";
import MilestoneNotification from "@/components/MilestoneNotification";
import useTierFromImprint from "@/hooks/useTierFromImprint";
import { useCelebrationsEnabled } from "@/hooks/useCelebrationsEnabled";
import usePageMeta from "@/hooks/usePageMeta";
import { track, getTrackSessionId } from "@/lib/track";
import { isProfileComplete } from "@/lib/onboarding";

import AuthorityTab from "@/components/tabs/AuthorityTab";
import ImpactTab from "@/components/tabs/ImpactTab";
import OvernightPage from "@/components/overnight/OvernightPage";
import type { Database } from "@/integrations/supabase/types";

type Entry = Database["public"]["Tables"]["entries"]["Row"];

const NAV_ITEMS = [
  { value: "home", label: "Home", pageHeader: "Home", icon: Compass, docTitle: "Aura — Home" },
  { value: "intelligence", label: "Signals", pageHeader: "Signals", icon: Shield, docTitle: "Aura — Signals" },
  { value: "overnight", label: "The Overnight", pageHeader: "The Overnight", icon: Moon, docTitle: "Aura — The Overnight" },
  { value: "authority", label: "Composer", pageHeader: "Composer", icon: Crown, docTitle: "Aura — Composer" },
  { value: "influence", label: "Analytics", pageHeader: "Analytics", icon: TrendingUp, docTitle: "Aura — Analytics" },
  { value: "identity", label: "Profile", pageHeader: "Profile", icon: User, docTitle: "Aura — Profile" },
] as const;

type TabValue = typeof NAV_ITEMS[number]["value"];

const Dashboard = () => {
  usePageMeta({
    title: "Aura — Dashboard",
    description: "Your strategic intelligence command center: signals, captures, content, and presence growth in one place.",
    path: "/dashboard",
  });
  const [entries, setEntries] = useState<Entry[]>([]);
  const [activeTab, setActiveTab] = useState<TabValue>("home");
  const [captureOpen, setCaptureOpen] = useState(false);
  const [capturePrefillUrl, setCapturePrefillUrl] = useState<string | null>(null);
  const [capturePrefillText, setCapturePrefillText] = useState<string | null>(null);
  const [captureInitialType, setCaptureInitialType] = useState<"link" | "voice" | "text" | "image" | "document" | undefined>(undefined);
  const pendingCaptureKeyRef = useRef<string | null>(null);
  const { markCaptured } = useCapturedSources();
  const handleOpenCapture = (url?: string, text?: string, sourceKey?: string, mode?: string) => {
    setCapturePrefillUrl(url ?? null);
    setCapturePrefillText(text ?? null);
    setCaptureInitialType(
      mode === "link" || mode === "voice" || mode === "text" || mode === "image" || mode === "document" ? mode : undefined
    );
    pendingCaptureKeyRef.current = sourceKey ?? null;
    setCaptureOpen(true);
  };
  const handleCaptureOutcome = () => {
    if (pendingCaptureKeyRef.current) {
      markCaptured(pendingCaptureKeyRef.current);
      pendingCaptureKeyRef.current = null;
    }
    fetchEntries();
  };
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInitialMessage, setChatInitialMessage] = useState<string | undefined>();
  const [chatContext, setChatContext] = useState<ChatContext | undefined>();
  const [user, setUser] = useState<{ email?: string; fullName?: string | null; firstName?: string | null; avatarUrl?: string | null } | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const firstFlight = useFirstFlight(userId);
  const isFfDimmed = (val: string, isActive: boolean) => firstFlight.dimmedTabs.has(val) && !isActive;
  const [newIntelSignalCount, setNewIntelSignalCount] = useState(0);
  const showOnboarding = false;
  const [showDiagnostic, setShowDiagnostic] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
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
  const [draftPrefill, setDraftPrefill] = useState<{
    id: string;
    body: string;
    language: "en" | "ar";
    type: "carousel" | "framework" | "linkedin_post";
    topic?: string | null;
    _source?: "content_items" | "linkedin_posts";
  } | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { t } = useLanguage();
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [editProfileOpen, setEditProfileOpen] = useState(false);
  const [brandAssessmentOpen, setBrandAssessmentOpen] = useState(false);
  const [editProfileField, setEditProfileField] = useState<EditProfileField | undefined>(undefined);

  // Force-enable elevation motion globally (count-up + ring draw-in).
  useEffect(() => {
    document.documentElement.setAttribute("data-fx-score-ring", "true");
  }, []);

  // Fire session_start once per browser session (guarded by sessionStorage flag).
  useEffect(() => {
    try {
      const sid = getTrackSessionId();
      if (!sid) return;
      const flagKey = `aura_session_start_fired:${sid}`;
      if (sessionStorage.getItem(flagKey)) return;
      sessionStorage.setItem(flagKey, "1");
      void track("session_start", { surface: "dashboard" });
    } catch { /* noop */ }
  }, []);

  // In-session Imprint recompute: after any capture-complete event, debounce
  // 25s (letting ingest-capture → extract-evidence → detect-signals land) then
  // fire-and-forget compute-imprint. Realtime subscribers on imprint_snapshots
  // (Brief, Observatory) pick up the new row automatically.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const handler = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        supabase.functions.invoke("compute-imprint", { body: {} }).catch(() => {});
      }, 25000);
    };
    window.addEventListener("capture-complete", handler);
    return () => {
      window.removeEventListener("capture-complete", handler);
      if (timer) clearTimeout(timer);
    };
  }, []);

  // Sidebar Intelligence icon pulse — fires once when a new signal arrives.
  const prevIntelCount = useRef<number | null>(null);
  const [intelPulseToken, setIntelPulseToken] = useState(0);
  useEffect(() => {
    const prev = prevIntelCount.current;
    if (prev !== null && newIntelSignalCount > prev) {
      setIntelPulseToken(t => t + 1);
    }
    prevIntelCount.current = newIntelSignalCount;
  }, [newIntelSignalCount]);

  // Database-driven design tokens (overrides CSS fallbacks via inline style)
  useDesignTokens("light");

  // Tier derived from imprint_snapshots (replaces retired calculate-aura-score
  // tier_name / newly_earned payload). A band crossing fires the ceremony
  // and the milestone toast at Dashboard level so both surface from any tab.
  const tierImprint = useTierFromImprint(userId);
  const { enabled: celebrationsEnabled } = useCelebrationsEnabled();
  const [tierCeremonyOpen, setTierCeremonyOpen] = useState(false);
  useEffect(() => {
    if (celebrationsEnabled && tierImprint.crossed && tierImprint.currentTier) setTierCeremonyOpen(true);
  }, [celebrationsEnabled, tierImprint.crossed, tierImprint.currentTier]);
  const tierMilestoneAuraData = tierImprint.crossed && tierImprint.currentTier
    ? {
        newly_earned: [`tier_${tierImprint.currentTier.key}`],
        milestones: [{
          id: `tier_${tierImprint.currentTier.key}`,
          name: `${tierImprint.currentTier.name} tier`,
        }],
      }
    : null;

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
    const switchTab = (e: Event) => {
      const detail = (e as CustomEvent).detail as { tab?: string } | undefined;
      const target = detail?.tab;
      if (target && NAV_ITEMS.some(n => n.value === target)) {
        setActiveTab(target as TabValue);
        setSearchParams({ tab: target });
      }
    };
    window.addEventListener("aura:open-capture", openCap);
    window.addEventListener("aura:open-flash", openFlash);
    window.addEventListener("aura:switch-tab", switchTab);
    return () => {
      window.removeEventListener("aura:open-capture", openCap);
      window.removeEventListener("aura:open-flash", openFlash);
      window.removeEventListener("aura:switch-tab", switchTab);
    };
  }, [setSearchParams]);

  // Handle ?tab=intelligence&signal=xxx from URL
  useEffect(() => {
    const tabParam = searchParams.get("tab");
    // Tab aliases — map external/legacy names to internal tab values.
    // Email deep links use friendly names (publish, impact, strategy).
    const tabAlias: Record<string, string> = {
      strategy: "intelligence",
      publish: "authority",
      impact: "influence",
      "my-story": "identity",
    };
    const resolvedTab = tabParam ? (tabAlias[tabParam] ?? tabParam) : null;
    if (resolvedTab && NAV_ITEMS.some(n => n.value === resolvedTab)) {
      setActiveTab(resolvedTab as TabValue);
    }

    // If we landed on the Publish tab with a signal id, fetch that signal and
    // pre-fill the draft so the user lands directly in the right context.
    const signalParam = searchParams.get("signal");
    if (signalParam && resolvedTab === "authority") {
      (async () => {
        const { data: sig } = await (supabase
          .from("strategic_signals" as any) as any)
          .select("id, signal_title, strategic_implications, explanation")
          .eq("id", signalParam)
          .maybeSingle();
        if (sig) {
          setSignalDraftPrefill({
            topic: sig.signal_title,
            context: sig.strategic_implications || sig.explanation || "",
            signalId: sig.id,
            signalTitle: sig.signal_title,
            sourceType: "signal",
            sourceTitle: sig.signal_title,
          } as any);
        }
        // Clear so a refresh doesn't reapply
        const next = new URLSearchParams(window.location.search);
        next.delete("signal");
        setSearchParams(next, { replace: true });
      })();
    }

    // If we landed on the Publish tab with a draft id (from a lifecycle email),
    // fetch that specific draft and hand it to the Composer. Mirrors the
    // signal-param path exactly: same effect, same setSearchParams cleanup.
    const draftParam = searchParams.get("draft");
    const srcParam = searchParams.get("src");
    if (draftParam && resolvedTab === "authority") {
      (async () => {
        const tryContentItems = async () => {
          const { data: r } = await (supabase
            .from("content_items" as any) as any)
            .select("id, body, language, type, generation_params")
            .eq("id", draftParam)
            .maybeSingle();
          if (!r) return null;
          const lang: "en" | "ar" = r.language === "ar" ? "ar" : "en";
          const type: "carousel" | "framework" | "linkedin_post" =
            r.type === "carousel" ? "carousel" : r.type === "framework" ? "framework" : "linkedin_post";
          return {
            id: r.id,
            body: r.body || "",
            language: lang,
            type,
            topic: r?.generation_params?.topic ?? null,
            _source: "content_items" as const,
          };
        };
        const tryLinkedInPosts = async () => {
          const { data: r } = await (supabase
            .from("linkedin_posts" as any) as any)
            .select("id, post_text, created_at")
            .eq("id", draftParam)
            .maybeSingle();
          if (!r) return null;
          return {
            id: r.id,
            body: r.post_text || "",
            language: "en" as const,
            type: "linkedin_post" as const,
            topic: null,
            _source: "linkedin_posts" as const,
          };
        };

        type DraftPrefillType = NonNullable<typeof draftPrefill>;
        let prefill: DraftPrefillType | null = null;
        if (srcParam === "linkedin_posts") {
          prefill = await tryLinkedInPosts();
        } else if (srcParam === "content_items") {
          prefill = await tryContentItems();
        } else {
          prefill = (await tryContentItems()) || (await tryLinkedInPosts());
        }

        if (prefill) {
          setDraftPrefill(prefill);
          setActiveTab("authority");
        } else {
          toast("That draft is no longer available");
        }

        // Clear so a refresh doesn't reapply
        const next = new URLSearchParams(window.location.search);
        next.delete("draft");
        next.delete("src");
        setSearchParams(next, { replace: true });
      })();
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

  // First Flight handlers.
  const connectLinkedInFirstFlight = async () => {
    try {
      const { data, error } = await supabase.functions.invoke("linkedin-oauth", {
        body: { action: "get-auth-url", origin: window.location.origin },
      });
      if (error) throw error;
      const url = (data as any)?.url;
      if (url) window.location.href = url;
    } catch (e) {
      console.warn("[FirstFlight] LinkedIn connect failed", e);
      toast.error("Couldn't start LinkedIn connect. Try again in a moment.");
    }
  };
  const writeFromFirstFlightSignal = (sig: { id: string; title: string; what: string | null; explanation: string | null }) => {
    const context = [sig.what, sig.explanation].filter(Boolean).join("\n\n");
    setSignalDraftPrefill({
      topic: sig.title,
      context,
      signalId: sig.id,
      signalTitle: sig.title,
      sourceType: "signal",
      sourceTitle: sig.title,
      contentFormat: "post",
    });
    setActiveTab("authority");
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
      if (!session) {
        const returnTo = window.location.pathname + window.location.search;
        navigate(`/auth?returnTo=${encodeURIComponent(returnTo)}`);
      } else { setUser({ email: session.user.email }); setUserId(session.user.id); }
    });

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) {
        const returnTo = window.location.pathname + window.location.search;
        navigate(`/auth?returnTo=${encodeURIComponent(returnTo)}`);
      } else {
        setUser({ email: session.user.email });
        const uid = session.user.id;
        setUserId(uid);
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
          .select("completed, onboarding_completed, onboarding_step, first_name, firm, level, sector_focus, avatar_url")
          .eq("user_id", uid)
          .maybeSingle();

        if (profile) {
          setUser((u) => ({
            ...(u || {}),
            email: session.user.email,
            fullName: (profile as any).first_name ?? null,
            firstName: (profile as any).first_name ?? null,
            avatarUrl: (profile as any).avatar_url ?? null,
          }));
        }

        // Onboarding must fully complete (onboarding_step >= 4, set at the ceremony)
        // before the dashboard loads. onboarding_completed alone is unreliable — it flips
        // true at the first-step profile save. The inline checklist was retired in favor
        // of First Flight. Dashboard NEVER creates a profile row — Onboarding.tsx is the
        // only place a real profile is born.
        const onboardingDone = Number((profile as any)?.onboarding_step ?? 0) >= 4;
        console.log("[Dashboard] onboarding gate", {
          uid: uid.slice(0, 8),
          hasProfile: !!profile,
          complete: isProfileComplete(profile),
          onboardingDone,
        });
        if (!isProfileComplete(profile) || !onboardingDone) {
          navigate("/onboarding", { replace: true });
          return;
        }

        checkStrategicNudge(session.access_token);
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const fetchEntries = async () => {
    const { data } = await supabase
      .from("entries")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
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

  // Listen for global "aura-open-chat" events (HelpPanel walkthrough, banners, hints)
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail || {};
      openChat(typeof detail.prompt === "string" ? detail.prompt : undefined);
    };
    window.addEventListener("aura-open-chat", handler as EventListener);
    return () => window.removeEventListener("aura-open-chat", handler as EventListener);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatOpen]);


  const switchTab = (tab: TabValue) => {
    setActiveTab(tab);
    setMobileSidebarOpen(false);
    setSearchParams({ tab });
    if (tab === "intelligence") {
      try { localStorage.setItem("aura_intel_last_visit", new Date().toISOString()); } catch {}
      setNewIntelSignalCount(0);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Poll for new strategic signals created since last Intelligence visit.
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    const check = async () => {
      try {
        const since = localStorage.getItem("aura_intel_last_visit") || new Date(0).toISOString();
        const { count } = await (supabase.from("strategic_signals" as any) as any)
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId)
          .gt("created_at", since);
        if (!cancelled) setNewIntelSignalCount(count || 0);
      } catch {}
    };
    check();
    // Beat 2 — capture receipt. Piggybacks the existing realtime channel;
    // no polling. Fires at most once per pending capture within a 10-min
    // window and silently drops after that.
    const receiptShownRef = { current: false };
    const maybeShowReceipt = async (payload: any) => {
      try {
        const pendingRaw = sessionStorage.getItem("aura_pending_capture_at");
        if (!pendingRaw) return;
        const pendingAt = Number(pendingRaw);
        if (!pendingAt || Number.isNaN(pendingAt)) return;
        if (Date.now() - pendingAt > 10 * 60 * 1000) {
          sessionStorage.removeItem("aura_pending_capture_at");
          return;
        }
        if (receiptShownRef.current) return;
        const row = (payload?.new || {}) as {
          id?: string;
          signal_title?: string;
          supporting_evidence_ids?: string[];
          updated_at?: string;
        };
        const ids = Array.isArray(row.supporting_evidence_ids) ? row.supporting_evidence_ids : [];
        if (!row.id || !row.signal_title || ids.length === 0) return;
        // Exact fragment count via a count query — never array.length.
        const { count: fragCount } = await supabase
          .from("evidence_fragments")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId)
          .in("id", ids);
        if (!fragCount || fragCount <= 0) return;
        receiptShownRef.current = true;
        sessionStorage.removeItem("aura_pending_capture_at");
        const title = row.signal_title.length > 60 ? row.signal_title.slice(0, 58) + "…" : row.signal_title;
        toast(`Your reading strengthened ${title} — now backed by ${fragCount} sources`, {
          duration: 9000,
          action: {
            label: "See it →",
            onClick: () => {
              setActiveTab("intelligence");
              const next = new URLSearchParams(window.location.search);
              next.set("tab", "intelligence");
              next.set("signal", row.id!);
              setSearchParams(next);
            },
          },
        });
      } catch { /* silent — never break UI */ }
    };
    const channel = supabase
      .channel(`intel-badge-${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "strategic_signals", filter: `user_id=eq.${userId}` },
        (payload) => {
          if (activeTab !== "intelligence") check();
          void maybeShowReceipt(payload);
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "strategic_signals", filter: `user_id=eq.${userId}` },
        (payload) => { void maybeShowReceipt(payload); },
      )
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(channel); };
  }, [userId, activeTab]);

  // Keep browser tab title in sync with the active section
  useEffect(() => {
    const item = NAV_ITEMS.find(n => n.value === activeTab);
    if (item) document.title = item.docTitle;
  }, [activeTab]);

  // Reset scroll to top on tab switch so users always land at the top
  // of the section instead of mid-page from their previous tab.
  useEffect(() => {
    try { window.scrollTo({ top: 0, behavior: "smooth" }); } catch {}
  }, [activeTab]);

  // One-time backfill: populate generated_skills from audit_results if empty.
  // For users who completed calibration before generated_skills was written
  // during onboarding. Short-circuits when generated_skills is already set.
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      try {
        const { data: profile } = await (supabase.from("diagnostic_profiles" as any) as any)
          .select("generated_skills, audit_results")
          .eq("user_id", userId)
          .maybeSingle();
        if (cancelled || !profile) return;
        const existing = (profile as any).generated_skills;
        const audit = (profile as any).audit_results;
        const isEmpty = !existing || (Array.isArray(existing) && existing.length === 0);
        if (!isEmpty) return;
        if (!audit || typeof audit !== "object" || Object.keys(audit).length === 0) return;
        const dimensionCategories: Record<string, string> = {
          "Strategic Architecture": "Strategic",
          "C-Suite Stewardship": "Leadership",
          "Commercial Velocity": "Commercial",
          "Human-Centric Leadership": "Leadership",
          "Digital Synthesis": "Technical",
          "Sector Foresight": "Strategic",
          "Operational Resilience": "Operational",
          "Executive Presence": "Leadership",
          "Geopolitical Fluency": "Strategic",
          "Value-Based P&L": "Commercial",
        };
        const skills = Object.entries(audit as Record<string, unknown>).map(([name, score]) => ({
          name,
          category: dimensionCategories[name] || "General",
          description: `${dimensionCategories[name] || "General"} capability — calibrated at ${Number(score)}/100`,
        }));
        await (supabase.from("diagnostic_profiles" as any) as any)
          .update({ generated_skills: skills })
          .eq("user_id", userId);
      } catch (e) {
        console.warn("generated_skills backfill skipped:", e);
      }
    })();
    return () => { cancelled = true; };
  }, [userId]);

  const darkSurface = true; // System-B: the navigation rail is always night

  return (
    <div
      className="min-h-screen bg-background flex relative safe-area-container"
      style={{ background: "var(--aura-bg)", color: "var(--aura-t1)" }}
    >
      <div className="gradient-mesh fixed inset-0 pointer-events-none z-0" />

      {showDiagnostic && <ExecutiveDiagnostic onComplete={() => setShowDiagnostic(false)} />}
      <WhatsAppOptInModal />

      {/* ── V23 Rail (night surface, every tab) ── */}
      <AuraRail
        activeTab={activeTab}
        onSelect={(t) => switchTab(t as TabValue)}
        onOpenAsk={() => openChat()}
        onOpenCapture={() => handleOpenCapture()}
        onOpenSettings={() => setPreferencesOpen(true)}
        newSignalCount={newIntelSignalCount}
      />

      {/* ── Mobile Sidebar Overlay ── */}
      {mobileSidebarOpen && (
        <div className="md:hidden fixed inset-0 z-50">
          <div
            className="absolute inset-0 backdrop-blur-sm"
            style={{ background: "rgba(20,17,12,0.55)" }}
            onClick={() => setMobileSidebarOpen(false)}
          />
          <aside
            data-surface="dark"
            className="aura-sidebar-shell absolute left-0 top-0 h-full w-[260px] flex flex-col animate-slide-in-right"
            style={{
              animationName: 'slideInLeft',
              transition: "background-color .25s ease, color .25s ease",
            }}
          >
            <div
              className="flex items-center justify-between px-4 py-4"
              style={{ borderBottom: "0.5px solid var(--paper-3)" }}
            >
              <div className="flex items-center gap-2.5">
                <AuraLogo size={32} variant={darkSurface ? "dark" : "light"} />
                <span className="text-lg font-semibold" style={{ color: darkSurface ? "var(--glass)" : "var(--aura-t1)" }}>Aura</span>
              </div>
              <button
                onClick={() => setMobileSidebarOpen(false)}
                className="p-1"
                style={{ color: "var(--aura-t3)" }}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 py-2 px-0 space-y-1">
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 12,
                  letterSpacing: "0.18em",
                  color: "var(--aura-t3)",
                  padding: "12px 24px 8px",
                  textTransform: "uppercase",
                }}
              >
                Your space
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
                      opacity: isFfDimmed(item.value, isActive) ? 0.45 : 1,
                    }}
                    title={isFfDimmed(item.value, isActive) ? "Your first post comes first" : undefined}
                  >
                    <item.icon
                      className="w-4.5 h-4.5"
                      style={{ color: isActive ? "var(--aura-accent)" : "var(--aura-t3)" }}
                    />
                    <span className="text-sm font-medium">{item.label}</span>
                    {item.value === "intelligence" && newIntelSignalCount > 0 && !isActive && (
                      <span
                        aria-label={`${newIntelSignalCount} new signals`}
                        className="w-2 h-2 rounded-full ml-auto mr-1 shrink-0"
                        style={{ background: "var(--gold-dark)" }}
                      />
                    )}
                  </button>
                );
              })}
            </nav>
            <div
              className="px-3 py-4 space-y-2"
              style={{ borderTop: "0.5px solid var(--paper-3)" }}
            >
              <div data-tour="nav-ask-aura">
                <AskAuraPresence
                  onOpen={() => { setMobileSidebarOpen(false); openChat(); }}
                />
              </div>
              <button
                onClick={() => { setMobileSidebarOpen(false); setCaptureOpen(true); }}
                data-testid="nav-capture"
                data-tour="nav-capture"
                className="w-full flex items-center justify-center gap-2 px-3 py-2.5 transition-all text-xs"
                style={{
                  color: "var(--aura-t3)",
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
        id="aura-main"
        className={`grain-overlay flex-1 min-w-0 relative z-10 transition-all duration-300 overflow-x-hidden ${
          "md:ml-[var(--v23-rail-w)]"
        }`}
        style={{
          paddingTop: 'env(safe-area-inset-top)',
          background: (activeTab === "intelligence" || activeTab === "influence") ? 'var(--ob-bg)' : 'var(--paper)',
        }}
      >
        <div className={activeTab === "home" ? "max-w-[1400px] mx-auto px-5 sm:px-10 lg:px-14 pt-4 sm:pt-8" : "max-w-5xl mx-auto px-4 sm:px-8 pt-4 sm:pt-8"}>
          {/* Top Bar */}
          <div className="flex items-center justify-between mb-6 pt-2 md:pt-0">
            <div className="flex items-center gap-3">
              {/* Global section label removed — each tab owns its own branded header */}
            </div>
            <div className="flex items-center gap-3">
              <AskAuraButton onClick={() => openChat()} />
              <HelpButton onClick={() => setHelpOpen(true)} />
              <NotificationBell />
              <ProfileMenu
                fullName={user?.fullName ?? null}
                email={user?.email}
                avatarUrl={user?.avatarUrl ?? null}
                onSignOut={handleLogout}
                onOpenPreferences={() => setPreferencesOpen(true)}
                onEditProfile={() => {
                  setActiveTab("identity");
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
                onViewFullJourney={() => {
                  setActiveTab("identity");
                  window.scrollTo({ top: 0, behavior: "smooth" });
                  // After navigation, scroll to milestones section
                  setTimeout(() => {
                    const el = document.querySelector('[data-testid="story-milestones"]');
                    if (el) (el as HTMLElement).scrollIntoView({ behavior: "smooth", block: "start" });
                  }, 250);
                }}
                onQuestAction={(questId) => {
                  const goIdentity = () => {
                    setActiveTab("identity");
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  };
                  switch (questId) {
                    case "p1_profile":
                      goIdentity();
                      setTimeout(() => window.dispatchEvent(new CustomEvent("aura:open-profile-editor")), 250);
                      break;
                    case "p1_assessment":
                    case "p2_strategist":
                      goIdentity();
                      setTimeout(() => window.dispatchEvent(new CustomEvent("aura:open-brand-assessment")), 250);
                      break;
                    case "p1_first_capture":
                    case "p1_three_sources":
                    case "p2_rhythm":
                      setCaptureOpen(true);
                      break;
                    case "p1_voice":
                      goIdentity();
                      break;
                    case "p1_first_post":
                    case "p2_published":
                    case "p3_five_signal_posts":
                    case "p3_carousel":
                      setActiveTab("authority");
                      window.scrollTo({ top: 0, behavior: "smooth" });
                      break;
                    case "p2_first_signal":
                    case "p2_three_signals":
                    case "p3_themes":
                      setActiveTab("intelligence");
                      window.scrollTo({ top: 0, behavior: "smooth" });
                      break;
                    case "p2_analytics":
                    case "p3_track":
                    case "p3_authority":
                      setActiveTab("influence");
                      window.scrollTo({ top: 0, behavior: "smooth" });
                      break;
                    case "p3_mirror":
                      goIdentity();
                      setTimeout(() => {
                        const el = document.querySelector('[data-testid="story-market-mirror"]');
                        if (el) (el as HTMLElement).scrollIntoView({ behavior: "smooth", block: "start" });
                      }, 250);
                      break;
                    default:
                      goIdentity();
                  }
                }}
              />
            </div>
          </div>
        </div>
        <div
          className={
            activeTab === "intelligence"
              ? "pb-[88px] md:pb-12"
              : activeTab === "home"
              ? "max-w-[1400px] mx-auto px-5 sm:px-10 lg:px-14 pb-[88px] md:pb-12 overflow-hidden"
              : "max-w-5xl mx-auto px-4 sm:px-8 pb-[88px] md:pb-12 overflow-hidden"
          }
        >
          {/* Tab Content */}
          <div className="tab-content-spring aura-page-fade relative" key={activeTab} style={{ minHeight: "60vh" }}>
            {activeTab !== "home" && activeTab !== "identity" && (
              <div className={activeTab === "intelligence" ? "max-w-[1400px] mx-auto px-5 sm:px-10 lg:px-14" : ""}>
              </div>
            )}
            {activeTab === "home" && (
              <div className="animate-tab-spring aura-page">
                <FirstLoginWelcome
                  firstName={user?.firstName ?? null}
                  onOpenGuide={() => setHelpOpen(true)}
                  onDismiss={() => {
                    try { localStorage.setItem("aura_welcome_briefing_done", "1"); } catch {}
                  }}
                />
                <FirstFlightCard
                  state={firstFlight}
                  onConnectLinkedIn={connectLinkedInFirstFlight}
                  onOpenCapture={() => handleOpenCapture()}
                  onOpenSignal={(sig) => navigateToSignal(sig.id)}
                  onWriteFromSignal={writeFromFirstFlightSignal}
                />
                <FirstVisitHint page="home" />
                <IdentityDriftBanner />
                <ErrorBoundary>
                  <BriefV2
                    onOpenCapture={(mode) => handleOpenCapture(undefined, undefined, undefined, mode)}
                    onSwitchTab={(t) => switchTab(t as TabValue)}
                    onOpenBrandAssessment={() => setBrandAssessmentOpen(true)}
                    onOpenSignal={navigateToSignal}
                    onOpenDraft={(d) => { setDraftPrefill(d); setActiveTab("authority"); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                    onDraftToStudio={(prefill) => {
                      setSignalDraftPrefill(prefill);
                      setActiveTab("authority");
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                  />
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
                  <SignalsBoardV2
                    onOpenCapture={handleOpenCapture}
                    onOpenChat={openChat}
                    onDraftToStudio={(prefill) => {
                      setSignalDraftPrefill(prefill);
                      setActiveTab("authority");
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                  />
                </ErrorBoundary>
              </div>
            )}

            {activeTab === "overnight" && (
              <div className="animate-tab-spring aura-page">
                <ErrorBoundary>
                  <OvernightPage
                    onOpenDraft={(d) => { setDraftPrefill(d); setActiveTab("authority"); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                    onOpenSettings={() => setPreferencesOpen(true)}
                  />
                </ErrorBoundary>
              </div>
            )}

            {activeTab === "authority" && (
              <div className="animate-tab-spring aura-page">
                <ErrorBoundary>
                  <AuthorityTab
                    entries={entries}
                    onRefresh={fetchEntries}
                    signalPrefill={signalDraftPrefill}
                    onSignalPrefillConsumed={() => setSignalDraftPrefill(null)}
                    draftPrefill={draftPrefill}
                    onDraftPrefillConsumed={() => setDraftPrefill(null)}
                    onOpenDraft={(d) => setDraftPrefill(d)}
                  />
                </ErrorBoundary>
              </div>
            )}

            {activeTab === "influence" && (
              <div className="animate-tab-spring aura-page">
                <ErrorBoundary>
                  <ImpactTab onOpenCapture={handleOpenCapture} />
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
                      <span style={{ fontSize: 12, color: "var(--bronze)", fontWeight: 600 }}>Aura</span>
                    </button>
                  );
                }
                const isActive = activeTab === tab.value;
                return (
                  <button
                    key={`mobile-${tab.value}`}
                    onClick={() => switchTab(tab.value)}
                    className="flex flex-col items-center justify-center"
                    style={{ gap: 4, opacity: isFfDimmed(tab.value, isActive) ? 0.45 : 1 }}
                    title={isFfDimmed(tab.value, isActive) ? "Your first post comes first" : undefined}
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
                        fontSize: 12,
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
        onOpenChange={(o) => {
          setCaptureOpen(o);
          if (!o) { setCapturePrefillUrl(null); setCapturePrefillText(null); setCaptureInitialType(undefined); pendingCaptureKeyRef.current = null; }
        }}
        onCaptured={handleCaptureOutcome}
        onDuplicate={handleCaptureOutcome}
        onOpenChat={openChat}
        prefillUrl={capturePrefillUrl || undefined}
        prefillText={capturePrefillText || undefined}
        initialType={captureInitialType}
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
      <PreferencesPanel
        open={preferencesOpen}
        onClose={() => setPreferencesOpen(false)}
        userId={userId}
        fullName={user?.fullName ?? null}
        email={user?.email}
        onSignOut={() => { setPreferencesOpen(false); handleLogout(); }}
        onEditField={(field) => {
          setPreferencesOpen(false);
          setEditProfileField(field);
          setTimeout(() => setEditProfileOpen(true), 180);
        }}
        onChangePassword={() => {
          setPreferencesOpen(false);
          setTimeout(() => setPasswordModalOpen(true), 180);
        }}
        onRetakeBrandAssessment={() => {
          setPreferencesOpen(false);
          setTimeout(() => setBrandAssessmentOpen(true), 180);
        }}
      />
      <EditProfileModal
        open={editProfileOpen}
        onClose={() => setEditProfileOpen(false)}
        userId={userId}
        focusField={editProfileField}
      />
      <SetPasswordModal
        open={passwordModalOpen}
        onClose={() => setPasswordModalOpen(false)}
        isFirstTime={false}
      />
      <BrandAssessmentModal
        open={brandAssessmentOpen}
        onOpenChange={setBrandAssessmentOpen}
        onComplete={() => setBrandAssessmentOpen(false)}
      />

      {/* Tier ceremony — fires when imprint_snapshots crosses a band boundary.
          Uses forceOpen + forceOpenStep=0 so the ceremonial intro runs first.
          Closing the modal acknowledges the tier locally so it doesn't replay. */}
      {celebrationsEnabled && (
        <TierCeremonyModal
          userId={userId}
          forceOpen={tierCeremonyOpen}
          forceOpenStep={0}
          forcedTierName={tierImprint.currentTier?.name ?? null}
          onForceClose={() => {
            tierImprint.acknowledge();
            setTierCeremonyOpen(false);
          }}
        />
      )}

      {/* Lightweight milestone toast (tier-only). Other canonical milestones
          continue to surface via user_milestones / useMilestones inside their
          own components — they are NOT coupled to calculate-aura-score. */}
      {celebrationsEnabled && (
        <div style={{ position: "fixed", bottom: 16, insetInlineStart: 16, zIndex: 60, maxWidth: 360 }}>
          <MilestoneNotification userId={userId} auraData={tierMilestoneAuraData} />
        </div>
      )}
    </div>
  );
};

export default Dashboard;
