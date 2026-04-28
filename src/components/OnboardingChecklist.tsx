import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, ChevronRight, Circle, Zap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuthReady } from "@/hooks/useAuthReady";

const STORAGE_KEY = "aura_onboarding_complete";

type TabValue =
  | "home"
  | "identity"
  | "intelligence"
  | "authority"
  | "influence"
  | "impact";

interface OnboardingChecklistProps {
  onOpenCapture?: () => void;
  onSwitchTab?: (tab: TabValue) => void;
}

type Step = {
  key: "profile" | "audit" | "brand" | "capture" | "post";
  label: string;
  done: boolean;
  onClick: () => void;
};

const OnboardingChecklist = ({ onOpenCapture, onSwitchTab }: OnboardingChecklistProps) => {
  const { user, isReady } = useAuthReady();
  const [loaded, setLoaded] = useState(false);
  const [hidden, setHidden] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(STORAGE_KEY) === "true";
  });
  const [celebrate, setCelebrate] = useState(false);
  const [exiting, setExiting] = useState(false);

  const [status, setStatus] = useState({
    profile: false,
    audit: false,
    brand: false,
    capture: false,
    post: false,
  });

  const prevAllDoneRef = useRef(false);

  const fetchStatus = useCallback(async (uid: string) => {
    try {
      const [profileRes, captureRes, postRes] = await Promise.all([
        supabase
          .from("diagnostic_profiles")
          .select("firm, level, audit_interpretation, brand_assessment_results")
          .eq("user_id", uid)
          .maybeSingle(),
        supabase
          .from("entries")
          .select("id", { count: "exact", head: true })
          .eq("user_id", uid),
        supabase
          .from("linkedin_posts")
          .select("id", { count: "exact", head: true })
          .eq("user_id", uid)
          .eq("source_type", "aura_generated"),
      ]);

      const p: any = profileRes.data || {};
      const brandResults = p.brand_assessment_results;
      const brandComplete =
        brandResults != null &&
        !(typeof brandResults === "object" &&
          !Array.isArray(brandResults) &&
          Object.keys(brandResults).length === 0);

      setStatus({
        profile: Boolean(p.firm) && Boolean(p.level),
        audit: p.audit_interpretation != null && String(p.audit_interpretation).trim() !== "",
        brand: brandComplete,
        capture: (captureRes.count ?? 0) >= 1,
        post: (postRes.count ?? 0) >= 1,
      });
    } catch (e) {
      console.warn("[OnboardingChecklist] fetch failed", e);
    } finally {
      setLoaded(true);
    }
  }, []);

  // Initial load + auth gating
  useEffect(() => {
    if (!isReady || !user) return;
    fetchStatus(user.id);
  }, [isReady, user, fetchStatus]);

  // Refetch on window focus / visibility change
  useEffect(() => {
    if (!isReady || !user) return;
    const refetch = () => fetchStatus(user.id);
    const onVis = () => { if (document.visibilityState === "visible") refetch(); };
    window.addEventListener("focus", refetch);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("focus", refetch);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [isReady, user, fetchStatus]);

  const completedCount =
    Number(status.profile) +
    Number(status.audit) +
    Number(status.brand) +
    Number(status.capture) +
    Number(status.post);
  const allDone = completedCount === 5;

  // Detect transition to all-done → celebrate, then hide
  useEffect(() => {
    if (!loaded) return;
    if (allDone && !prevAllDoneRef.current) {
      // First time we see all-done: celebrate, then exit
      if (window.localStorage.getItem(STORAGE_KEY) === "true") {
        // Already marked complete on a prior session — just hide silently
        setHidden(true);
      } else {
        setCelebrate(true);
        const t1 = setTimeout(() => setExiting(true), 2000);
        const t2 = setTimeout(() => {
          window.localStorage.setItem(STORAGE_KEY, "true");
          setHidden(true);
        }, 2400);
        return () => { clearTimeout(t1); clearTimeout(t2); };
      }
    }
    prevAllDoneRef.current = allDone;
  }, [allDone, loaded]);

  // Don't render until we know status (prevents flash)
  if (!isReady || !user || !loaded) return null;
  if (hidden) return null;
  // Edge case: localStorage already marked complete (e.g. data deletion) → stay hidden
  if (typeof window !== "undefined" && window.localStorage.getItem(STORAGE_KEY) === "true") {
    return null;
  }

  const goMyStory = () => onSwitchTab?.("identity");
  const goPublish = () => onSwitchTab?.("authority");
  const openCapture = () => onOpenCapture?.();

  const steps: Step[] = [
    { key: "profile", label: "Set up your profile", done: status.profile, onClick: goMyStory },
    { key: "audit", label: "Complete Evidence Audit", done: status.audit, onClick: goMyStory },
    { key: "brand", label: "Complete Brand Assessment", done: status.brand, onClick: goMyStory },
    { key: "capture", label: "Add your first source", done: status.capture, onClick: openCapture },
    { key: "post", label: "Generate your first post", done: status.post, onClick: goPublish },
  ];

  return (
    <AnimatePresence>
      {!exiting && (
        <motion.div
          key="onboarding-checklist"
          initial={{ opacity: 1, height: "auto", marginBottom: 16 }}
          animate={{ opacity: 1, height: "auto", marginBottom: 16 }}
          exit={{ opacity: 0, height: 0, marginBottom: 0 }}
          transition={{ duration: 0.4, ease: "easeInOut" }}
          className="overflow-hidden"
        >
          <div
            className="rounded-xl border border-primary/20 bg-primary/5 relative"
            style={{
              padding: "16px 20px",
              borderLeft: "3px solid var(--brand)",
            }}
          >
            {celebrate ? (
              <div className="flex items-center gap-3 py-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                <span className="text-sm font-semibold text-emerald-500">
                  🎉 You're all set! Aura is ready.
                </span>
              </div>
            ) : (
              <>
                {/* Header */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4" style={{ color: "var(--brand)" }} fill="var(--brand)" />
                    <span className="text-sm font-semibold text-foreground">
                      Get started with Aura
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {completedCount} of 5 complete
                  </span>
                </div>

                {/* Progress bar */}
                <div
                  className="w-full rounded-full overflow-hidden mb-3"
                  style={{ height: 4, background: "hsl(var(--muted))" }}
                >
                  <div
                    className="h-full rounded-full transition-all duration-500 ease-out"
                    style={{
                      width: `${(completedCount / 5) * 100}%`,
                      background: "var(--brand)",
                    }}
                  />
                </div>

                {/* Steps */}
                <div className="flex flex-col gap-2">
                  {steps.map((s) => (
                    <button
                      key={s.key}
                      type="button"
                      onClick={s.done ? undefined : s.onClick}
                      disabled={s.done}
                      className={`flex items-center gap-3 rounded-lg px-2 py-1.5 text-left transition-colors ${
                        s.done ? "cursor-default" : "cursor-pointer hover:bg-primary/5"
                      }`}
                    >
                      {s.done ? (
                        <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
                      ) : (
                        <Circle className="w-4 h-4 text-muted-foreground/40 shrink-0" />
                      )}
                      <span
                        className={`flex-1 text-sm ${
                          s.done
                            ? "line-through text-muted-foreground"
                            : "text-foreground font-medium"
                        }`}
                      >
                        {s.label}
                      </span>
                      {!s.done && (
                        <ChevronRight className="w-4 h-4 text-muted-foreground/50 shrink-0" />
                      )}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default OnboardingChecklist;