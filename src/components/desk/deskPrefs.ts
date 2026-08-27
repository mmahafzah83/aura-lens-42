import { supabase } from "@/integrations/supabase/client";

/**
 * deskPrefs — one jsonb column on diagnostic_profiles, read and written the
 * same way notification_prefs already is. No new table, no new RLS.
 *
 * Every write is immediate and merged: if he closes the tab after answering
 * one question, that answer is already his.
 */

export type DeskPriority = "presence" | "current" | "output" | "role";
export type DeskAudience = "buyers" | "peers" | "hirers" | "team";

export interface DeskPrefs {
  priority?: DeskPriority;
  audience?: DeskAudience;
  watch?: Record<string, boolean>;
  /** capability key → ISO date (YYYY-MM-DD) he last said "later" */
  declined?: Record<string, string>;
}

export type CapabilityKey = "cv_crosscheck" | "linkedin_profile";

export interface WatchOption {
  key: string;
  group: "morning" | "weekly" | "conditional";
  title: string;
  line: string;
  /** Shipped default, used until he changes it. */
  on: boolean;
  /** Conditional rows only. */
  needs?: CapabilityKey;
}

export const WATCH_OPTIONS: WatchOption[] = [
  { key: "where_i_stand", group: "morning", title: "Where I stand", line: "One line on your presence, and what moved it.", on: true },
  { key: "todays_subject", group: "morning", title: "What I should write about today", line: "One subject, with the reason it's today's.", on: true },
  { key: "overnight", group: "morning", title: "What came in overnight", line: "The single finding worth your time. Nothing else.", on: false },
  { key: "unsaid", group: "weekly", title: "Things about me I didn't say", line: "What sets you apart, and what you keep avoiding. Fridays.", on: true },
  { key: "quiet_topics", group: "weekly", title: "Topics I've stopped reading about", line: "Which of your pillars has gone quiet, and for how long.", on: false },
  { key: "post_results", group: "weekly", title: "How my posts actually did", line: "What your readers rewarded, and when to stay quiet.", on: true },
  { key: "cv_gap", group: "conditional", title: "Gaps between my CV and what I publish", line: "Where your record and your writing disagree.", on: true, needs: "cv_crosscheck" },
  { key: "profile_read", group: "conditional", title: "How my LinkedIn profile reads", line: "What a stranger takes from your profile in ten seconds.", on: true, needs: "linkedin_profile" },
];

export const GROUP_TITLES: Record<WatchOption["group"], string> = {
  morning: "Every morning",
  weekly: "Weekly",
  conditional: "Only when it's true",
};

/** The honest reason a capability is not available, in his words. */
export const MISSING_REASON: Record<CapabilityKey, string> = {
  cv_crosscheck: "Needs a CV on file.",
  linkedin_profile: "Not yet — no profile is connected.",
};

/** Watch defaults that serve each priority. Everything not listed goes off. */
export const PRIORITY_WATCH: Record<DeskPriority, string[]> = {
  presence: ["where_i_stand", "todays_subject", "profile_read", "post_results"],
  current: ["overnight", "quiet_topics", "todays_subject"],
  output: ["todays_subject", "post_results", "unsaid"],
  role: ["cv_gap", "profile_read", "where_i_stand"],
};

export const PRIORITY_CHIPS: { key: DeskPriority; label: string }[] = [
  { key: "presence", label: "Grow my presence" },
  { key: "current", label: "Stay current in my field" },
  { key: "output", label: "Write more, with less effort" },
  { key: "role", label: "Land a specific role or client" },
];

/** Agreement plus the price. No praise, no exclamation. */
export const PRIORITY_REPLY: Record<DeskPriority, string> = {
  presence: "Good, and honest — that one is earned, not bought. It needs you to publish something specific enough that people can use it.",
  current: "Sensible — staying current is cheap to say and expensive to keep. It costs you a few minutes of reading on the days you would rather skip.",
  output: "Fair — volume only helps once the writing sounds like you. The price is letting me learn from drafts you would normally delete.",
  role: "Clear — a specific room needs a specific record. It costs you saying out loud what you want, so the writing can point at it.",
};

export function isOn(prefs: DeskPrefs | null, key: string): boolean {
  const shipped = WATCH_OPTIONS.find(o => o.key === key)?.on ?? false;
  const v = prefs?.watch?.[key];
  return typeof v === "boolean" ? v : shipped;
}

/** True while an ask he pushed away is still inside its 30 days. */
export function isDeclined(prefs: DeskPrefs | null, key: CapabilityKey): boolean {
  const on = prefs?.declined?.[key];
  if (!on) return false;
  const when = new Date(`${on}T00:00:00Z`).getTime();
  if (!Number.isFinite(when)) return false;
  return Date.now() - when < 30 * 86_400_000;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function loadDeskPrefs(): Promise<{ prefs: DeskPrefs; userId: string } | null> {
  const { data: { session } } = await supabase.auth.getSession();
  const uid = session?.user?.id;
  if (!uid) return null;
  const { data } = await supabase
    .from("diagnostic_profiles")
    .select("desk_prefs")
    .eq("user_id", uid)
    .maybeSingle();
  const raw = (data as any)?.desk_prefs;
  const prefs: DeskPrefs = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  return { prefs, userId: uid };
}

/** Merge and write immediately. Returns the merged object actually stored. */
export async function saveDeskPrefs(current: DeskPrefs, patch: DeskPrefs): Promise<DeskPrefs> {
  const merged: DeskPrefs = {
    ...current,
    ...patch,
    watch: { ...(current.watch || {}), ...(patch.watch || {}) },
    declined: { ...(current.declined || {}), ...(patch.declined || {}) },
  };
  const { data: { session } } = await supabase.auth.getSession();
  const uid = session?.user?.id;
  if (!uid) return merged;
  const { error } = await supabase
    .from("diagnostic_profiles")
    .update({ desk_prefs: merged as any })
    .eq("user_id", uid);
  if (error) console.error("[desk] prefs write failed", error.message);
  return merged;
}

/** "Later" — the ask is suppressed for thirty days, and the date is his record of it. */
export function declinePatch(key: CapabilityKey): DeskPrefs {
  return { declined: { [key]: today() } };
}

export interface Capabilities {
  cv_crosscheck: boolean;
  linkedin_profile: boolean;
}

/** What the Desk can actually do for him today, read from his own rows. */
export async function loadCapabilities(): Promise<Capabilities> {
  const { data: { session } } = await supabase.auth.getSession();
  const uid = session?.user?.id;
  if (!uid) return { cv_crosscheck: false, linkedin_profile: false };
  const { data } = await supabase
    .from("diagnostic_profiles")
    .select("cv_crosscheck, linkedin_handle, linkedin_url")
    .eq("user_id", uid)
    .maybeSingle();
  const p: any = data || {};
  const handle = String(p.linkedin_handle || "").trim() || String(p.linkedin_url || "").trim();
  return {
    cv_crosscheck: p.cv_crosscheck !== null && p.cv_crosscheck !== undefined,
    linkedin_profile: handle.length > 0,
  };
}
