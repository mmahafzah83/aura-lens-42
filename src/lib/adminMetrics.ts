/**
 * ONE BRAIN — the single definition of every admin user metric.
 *
 * Every /admin surface must read these numbers from here. The numbers are the
 * ones `founder-daily-brief` computes and freezes into `daily_brief_snapshots`;
 * this module never invents a rival count, and no function in it may return the
 * length of a fetched array.
 */
import { supabase } from "@/integrations/supabase/client";

/** Excluded from every user number, exactly as the brief excludes them. */
export const FOUNDER_ID = "9e0c6ee1-6562-4fdc-89ba-d62b39f02bb3";
export const TEST_EMAIL_MARKER = "test";

export type MetricKey =
  | "invited"
  | "signed_in"
  | "finished_setup"
  | "captured"
  | "got_signal"
  | "linkedin_live"
  | "opened_writer"
  | "has_draft"
  | "published";

/** Where each number comes from — shown on screen so no exclusion is silent. */
export const METRIC_DEFINITIONS: Record<MetricKey | "drafts_waiting", string> = {
  invited: "auth.users, founder and test accounts removed",
  signed_in: "auth.users.last_sign_in_at",
  finished_setup: "diagnostic_profiles",
  captured: "entries",
  got_signal: "strategic_signals",
  linkedin_live: "linkedin_connections.status = active",
  opened_writer: "product_events composer_opened",
  has_draft: "content_items + aura-written linkedin_posts",
  published: "linkedin_posts.tracking_status = published",
  drafts_waiting:
    "content_items status=draft + linkedin_posts tracking_status=draft and source_type in (aura_generated, carousel_studio)",
};

export const FUNNEL_ORDER: { key: MetricKey; label: string }[] = [
  { key: "invited", label: "Invited" },
  { key: "signed_in", label: "Signed in" },
  { key: "finished_setup", label: "Finished setup" },
  { key: "captured", label: "Captured something" },
  { key: "got_signal", label: "Got a signal" },
  { key: "linkedin_live", label: "LinkedIn live" },
  { key: "opened_writer", label: "Opened the writer" },
  { key: "has_draft", label: "Holds a draft" },
  { key: "published", label: "Published" },
];

export type AdminMetrics = {
  briefDate: string;
  /** "HH:MM" UTC, as counted by the brief. */
  countedAtUtc: string | null;
  source: "stored" | "live";
  funnel: Partial<Record<MetricKey, number>>;
  drafts: { content_items: number; linkedin_posts: number };
  excludedTestUsers: number;
  payload: any;
};

const N = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

function shape(payload: any, source: "stored" | "live"): AdminMetrics {
  const f = payload?.funnel ?? {};
  return {
    briefDate: String(payload?.brief_date ?? ""),
    countedAtUtc: payload?.counted_at_utc ? String(payload.counted_at_utc) : null,
    source,
    funnel: {
      invited: N(f.invited) ?? undefined,
      signed_in: N(f.signed_in) ?? undefined,
      finished_setup: N(f.finished_setup) ?? undefined,
      captured: N(f.captured) ?? undefined,
      got_signal: N(f.got_signal) ?? undefined,
      linkedin_live: N(f.linkedin_live) ?? undefined,
      opened_writer: N(f.opened_writer) ?? undefined,
      has_draft: N(f.has_draft) ?? undefined,
      published: N(f.published) ?? undefined,
    },
    drafts: {
      content_items: N(payload?.drafts?.content_items) ?? 0,
      linkedin_posts: N(payload?.drafts?.linkedin_posts) ?? 0,
    },
    excludedTestUsers: N(payload?.excluded?.test_users) ?? 0,
    payload,
  };
}

/**
 * Today's stored brief; if it has not been written yet, the same computation
 * run live as a dry run. Identical to how the cockpit loads it.
 */
export async function loadAdminMetrics(opts?: { forceLive?: boolean }): Promise<AdminMetrics> {
  const today = new Date().toISOString().slice(0, 10);
  if (!opts?.forceLive) {
    // Read the view, not the base table: the base table is append-only and
    // holds one row per run. `daily_brief_latest` collapses that to the
    // highest run_seq per date, so exactly one row can match. maybeSingle()
    // stays on purpose — if it ever throws, the view itself is at fault.
    const { data, error } = await supabase
      .from("daily_brief_latest")
      .select("payload, brief_date")
      .eq("brief_date", today)
      .maybeSingle();
    if (error) throw error;
    if (data?.payload) return shape(data.payload, "stored");
  }
  const { data, error } = await supabase.functions.invoke("founder-daily-brief", {
    body: { dry_run: true },
  });
  if (error) throw error;
  if (!data?.payload) throw new Error("The brief returned no payload.");
  return shape(data.payload, "live");
}

/* ---------- one exported definition per metric ---------- */

export const signedUp = (m: AdminMetrics) => m.funnel.invited ?? null;
export const signedIn = (m: AdminMetrics) => m.funnel.signed_in ?? null;
export const finishedSetup = (m: AdminMetrics) => m.funnel.finished_setup ?? null;
export const captured = (m: AdminMetrics) => m.funnel.captured ?? null;
export const hasSignal = (m: AdminMetrics) => m.funnel.got_signal ?? null;
export const linkedinLive = (m: AdminMetrics) => m.funnel.linkedin_live ?? null;
export const openedWriter = (m: AdminMetrics) => m.funnel.opened_writer ?? null;
export const holdsDraft = (m: AdminMetrics) => m.funnel.has_draft ?? null;
export const published = (m: AdminMetrics) => m.funnel.published ?? null;

/** Drafts waiting — never the whole linkedin_posts table. */
export const draftsWaiting = (m: AdminMetrics) =>
  m.drafts.content_items + m.drafts.linkedin_posts;

export const metricValue = (m: AdminMetrics, key: MetricKey): number | null =>
  m.funnel[key] ?? null;

/** "counted at 14:16 UTC · stored brief" */
export function freshnessLine(m: AdminMetrics): string {
  const when = m.countedAtUtc ? `counted at ${m.countedAtUtc} UTC` : "counted at an unknown time";
  const how = m.source === "stored" ? "today's stored brief" : "live recount";
  return `${when} · ${how}`;
}

export function exclusionLine(m: AdminMetrics): string {
  const n = m.excludedTestUsers;
  return `Founder account and ${n} test account${n === 1 ? "" : "s"} excluded from every user number.`;
}
