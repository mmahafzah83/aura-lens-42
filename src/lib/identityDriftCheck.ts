import { supabase } from "@/integrations/supabase/client";

export interface DriftResult {
  drift: true;
  dominantTopic: string;
  dominantCount: number;
  driftPercentage: number;
  totalCaptured: number;
}

const COUNT_KEY = "aura_capture_count";
const SHOWN_KEY = "aura_drift_shown";
const DISMISSED_KEY = "aura_drift_dismissed_at";
const DRIFT_THRESHOLD = 0.6;

export async function checkIdentityDrift(userId: string): Promise<DriftResult | null> {
  const { data: recentEntries } = await supabase
    .from("entries")
    .select("skill_pillar, title")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(20);

  if (!recentEntries || recentEntries.length < 10) return null;

  const { data: profile } = await supabase
    .from("diagnostic_profiles")
    .select("brand_pillars")
    .eq("user_id", userId)
    .maybeSingle();

  const declaredPillars: string[] = Array.isArray(profile?.brand_pillars)
    ? (profile!.brand_pillars as any[]).filter((p) => typeof p === "string")
    : [];
  if (declaredPillars.length === 0) return null;

  const matches = (topic: string) =>
    !!topic &&
    declaredPillars.some(
      (pillar) =>
        pillar.toLowerCase().includes(topic.toLowerCase()) ||
        topic.toLowerCase().includes(pillar.toLowerCase()),
    );

  const topicCounts: Record<string, number> = {};
  let outsidePillarCount = 0;
  for (const entry of recentEntries) {
    const topic = (entry as any).skill_pillar || "uncategorized";
    topicCounts[topic] = (topicCounts[topic] || 0) + 1;
    if (!matches((entry as any).skill_pillar || "")) outsidePillarCount++;
  }

  const sortedTopics = Object.entries(topicCounts).sort((a, b) => b[1] - a[1]);
  const dominantTopic = sortedTopics[0];
  const driftPercentage = outsidePillarCount / recentEntries.length;

  if (driftPercentage > DRIFT_THRESHOLD) {
    return {
      drift: true,
      dominantTopic: dominantTopic[0],
      dominantCount: dominantTopic[1],
      driftPercentage: Math.round(driftPercentage * 100),
      totalCaptured: recentEntries.length,
    };
  }
  return null;
}

/**
 * Increments the capture counter and, every 5th capture, runs a drift check.
 * Dispatches `aura:identity-drift` window event with the DriftResult when triggered.
 * Safe to call after any successful capture save — fire-and-forget.
 */
export async function bumpCaptureAndCheckDrift(userId: string | null | undefined) {
  if (!userId) return;
  try {
    const next = parseInt(sessionStorage.getItem(COUNT_KEY) || "0", 10) + 1;
    sessionStorage.setItem(COUNT_KEY, String(next));

    if (next % 5 !== 0) return;
    if (sessionStorage.getItem(SHOWN_KEY) === "true") return;
    if (sessionStorage.getItem(DISMISSED_KEY)) return;

    const result = await checkIdentityDrift(userId);
    if (!result) return;

    sessionStorage.setItem(SHOWN_KEY, "true");
    window.dispatchEvent(new CustomEvent("aura:identity-drift", { detail: result }));
  } catch (err) {
    console.warn("[identity-drift] check failed:", err);
  }
}

export const __DRIFT_KEYS = { COUNT_KEY, SHOWN_KEY, DISMISSED_KEY };