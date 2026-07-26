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

/* ============================================================================
 * HISTORY — two kinds, never merged.
 *
 * RECORDED     what the brief actually said that morning. Comes from
 *              `brief_history`, which reads the FIRST run of each stored day.
 *              Begins the day the brief began. Cannot be recomputed.
 * RECONSTRUCTED derived NOW from raw timestamps in the underlying tables.
 *              Covers the whole history, but it is today's understanding of
 *              the past, not what we knew at the time.
 *
 * The UI must render them differently and say which is which. Reconstruction
 * happens at read time only — no derived history is ever written into
 * `daily_brief_snapshots`.
 * ========================================================================== */

export type HistoryKind = "recorded" | "reconstructed";

export const HISTORY_LEGEND =
  "Solid: what the brief reported that morning. Dashed: reconstructed from the underlying records.";

/** Below this, a cohort is people, not a percentage. */
export const COHORT_MIN_FOR_PCT = 5;

export const COHORT_TOO_SMALL_NOTE = "too few people to express as a percentage";

/** Stages a cohort or trend line can report on, in funnel order. */
export type StageKey =
  | "signed_up"
  | "finished_setup"
  | "captured"
  | "got_signal"
  | "linkedin_live"
  | "opened_writer"
  | "has_draft"
  | "published";

export const COHORT_STAGES: { key: Exclude<StageKey, "signed_up" | "finished_setup">; label: string }[] = [
  { key: "captured", label: "Captured" },
  { key: "got_signal", label: "Got a signal" },
  { key: "linkedin_live", label: "LinkedIn" },
  { key: "opened_writer", label: "Opened writer" },
  { key: "has_draft", label: "Holds a draft" },
  { key: "published", label: "Published" },
];

export const TREND_STAGES: { key: StageKey; label: string; recordedKey: string | null }[] = [
  { key: "signed_up", label: "Signed up", recordedKey: "invited" },
  { key: "finished_setup", label: "Finished setup", recordedKey: "finished_setup" },
  { key: "captured", label: "Captured", recordedKey: "captured" },
  { key: "got_signal", label: "Got a signal", recordedKey: "got_signal" },
  { key: "linkedin_live", label: "LinkedIn live", recordedKey: "linkedin_live" },
  { key: "opened_writer", label: "Opened writer", recordedKey: "opened_writer" },
  { key: "has_draft", label: "Holds a draft", recordedKey: "has_draft" },
  { key: "published", label: "Published", recordedKey: "published" },
];

export type Cohort = {
  cohortWeek: string;
  size: number;
  captured: number;
  got_signal: number;
  linkedin_live: number;
  opened_writer: number;
  has_draft: number;
  published: number;
};

export type TrendPoint = { day: string } & Record<StageKey, number>;

export type ShipMarker = { id: string; shipped_on: string; title: string; notes: string | null };

/**
 * Cohorts by ISO sign-up week. Counted in SQL with the same exclusions and the
 * same stage predicates the brief uses — never by measuring a fetched array.
 */
export async function loadCohorts(): Promise<Cohort[]> {
  const { data, error } = await supabase.rpc("admin_cohorts" as any);
  if (error) throw error;
  return ((data ?? []) as any[]).map((r) => ({
    cohortWeek: String(r.cohort_week),
    size: Number(r.size),
    captured: Number(r.captured),
    got_signal: Number(r.got_signal),
    linkedin_live: Number(r.linkedin_live),
    opened_writer: Number(r.opened_writer),
    has_draft: Number(r.has_draft),
    published: Number(r.published),
  }));
}

/** RECONSTRUCTED: how many people had reached each stage as of each day. */
export async function loadStageTimeline(days = 90): Promise<TrendPoint[]> {
  const { data, error } = await supabase.rpc("admin_stage_timeline" as any, { p_days: days });
  if (error) throw error;
  return ((data ?? []) as any[]).map((r) => ({
    day: String(r.day),
    signed_up: Number(r.signed_up),
    finished_setup: Number(r.finished_setup),
    captured: Number(r.captured),
    got_signal: Number(r.got_signal),
    linkedin_live: Number(r.linkedin_live),
    opened_writer: Number(r.opened_writer),
    has_draft: Number(r.has_draft),
    published: Number(r.published),
  }));
}

/** RECORDED: what the brief reported, one row per stored day. May be empty. */
export async function loadRecordedHistory(days = 90): Promise<Record<string, Record<string, number>>> {
  const { data, error } = await supabase.rpc("brief_history" as any, { days });
  if (error) throw error;
  const out: Record<string, Record<string, number>> = {};
  for (const row of (data ?? []) as any[]) {
    const f = row?.funnel ?? {};
    const clean: Record<string, number> = {};
    for (const [k, v] of Object.entries(f)) {
      const n = N(v);
      if (n !== null) clean[k] = n;
    }
    out[String(row.brief_date)] = clean;
  }
  return out;
}

export async function loadShipMarkers(): Promise<ShipMarker[]> {
  const { data, error } = await supabase
    .from("ship_markers")
    .select("id, shipped_on, title, notes")
    .order("shipped_on", { ascending: true });
  if (error) throw error;
  return (data ?? []) as ShipMarker[];
}

export async function addShipMarker(m: { shipped_on: string; title: string; notes: string }) {
  const { error } = await supabase.from("ship_markers").insert({
    shipped_on: m.shipped_on,
    title: m.title,
    notes: m.notes || null,
  });
  if (error) throw error;
}

/**
 * A percentage, or null when the cohort is too small for one to mean anything.
 * A cohort of 3 where 1 published is one person, not 33% activation.
 */
export function cohortPct(reached: number, size: number): number | null {
  if (size < COHORT_MIN_FOR_PCT || size <= 0) return null;
  return Math.round((reached / size) * 100);
}

/** Cohorts large enough to compare honestly, oldest first. */
export function comparableCohorts(cohorts: Cohort[]): Cohort[] {
  return cohorts.filter((c) => c.size >= COHORT_MIN_FOR_PCT);
}

/**
 * One plain-English line on whether newer cohorts are moving faster. Returns
 * the honest answer — usually that there is not enough history yet.
 */
export function cohortVerdict(cohorts: Cohort[]): { line: string; enough: boolean } {
  const usable = comparableCohorts(cohorts);
  const oldest = usable[0];
  const newest = usable[usable.length - 1];
  if (!oldest || !newest || oldest === newest) {
    return {
      enough: false,
      line: `Not enough history yet to say whether newer sign-ups are moving faster — only one sign-up week has ${COHORT_MIN_FOR_PCT} or more people in it.`,
    };
  }
  const a = cohortPct(oldest.captured, oldest.size) ?? 0;
  const b = cohortPct(newest.captured, newest.size) ?? 0;
  const dir = b > a ? "faster" : b < a ? "slower" : "at the same rate";
  return {
    enough: true,
    line: `The week of ${newest.cohortWeek} is reaching first capture ${dir} than the week of ${oldest.cohortWeek} (${b}% against ${a}%).`,
  };
}

/* ============================================================================
 * DECISIONS — the review loop.
 *
 * The point of a decision log is not the writing down; it is that the system
 * comes back and asks whether the thing you expected actually happened. Every
 * number here is counted, never measured off an array, and every baseline is
 * captured by the system from today's brief — never typed by a human.
 * ========================================================================== */

export type DecisionStatus = "pending" | "open" | "confirmed" | "refuted" | "inconclusive";

export type Decision = {
  id: string;
  decided_on: string;
  title: string;
  decision: string;
  rationale: string | null;
  expected_outcome: string | null;
  metric_key: string | null;
  baseline_value: number | null;
  expected_value: number | null;
  review_on: string | null;
  status: DecisionStatus;
  actual_value: number | null;
  reviewed_on: string | null;
  review_note: string | null;
  created_at: string;
};

/** "none" is a judgement call with a review date, not an escape hatch. */
export const DECISION_METRIC_OPTIONS: { key: MetricKey | "none"; label: string }[] = [
  ...FUNNEL_ORDER.map((f) => ({ key: f.key as MetricKey | "none", label: f.label })),
  { key: "none", label: "No funnel metric — judged yes/no on the review date" },
];

export const DECISION_BLOCKED_MESSAGE =
  "A decision needs something that could prove it wrong. Choose the metric it should move, the value you expect it to reach, and the date you will check.";

export const DECISION_STATUS_LABEL: Record<DecisionStatus, string> = {
  pending: "Awaiting your call",
  open: "In flight",
  confirmed: "Worked",
  refuted: "Did not work",
  inconclusive: "Cannot tell yet",
};

/** Counted, never `.length`. */
export const countWhere = <T,>(rows: T[], fn: (r: T) => boolean): number =>
  rows.reduce((n, r) => (fn(r) ? n + 1 : n), 0);

const todayISO = () => new Date().toISOString().slice(0, 10);

export async function loadDecisions(): Promise<Decision[]> {
  const { data, error } = await supabase
    .from("decisions" as any)
    .select("*")
    .order("decided_on", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as any[]) as Decision[];
}

export const pendingDecisions = (d: Decision[]) => d.filter((x) => x.status === "pending");
export const openDecisions = (d: Decision[]) => d.filter((x) => x.status === "open");
export const settledDecisions = (d: Decision[]) =>
  d.filter((x) => x.status === "confirmed" || x.status === "refuted" || x.status === "inconclusive");

/** Whole days from today until the review date; negative means overdue. */
export function daysUntilReview(review_on: string | null, on = todayISO()): number | null {
  if (!review_on) return null;
  const a = Date.parse(`${review_on}T00:00:00Z`);
  const b = Date.parse(`${on}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((a - b) / 86400000);
}

/**
 * Decisions whose review date has arrived and that are still open. Same
 * definition the brief's `decisions_due` SQL function uses.
 */
export function dueDecisions(d: Decision[], on = todayISO()): Decision[] {
  return openDecisions(d).filter((x) => {
    const left = daysUntilReview(x.review_on, on);
    return left !== null && left <= 0;
  });
}

/** "4 decisions reviewed, 1 of them confirmed." — kept whether or not it flatters. */
export function decisionScoreboard(d: Decision[]): { reviewed: number; confirmed: number; line: string } {
  const settled = settledDecisions(d);
  const reviewed = countWhere(settled, () => true);
  const confirmed = countWhere(settled, (x) => x.status === "confirmed");
  if (reviewed === 0) {
    return { reviewed, confirmed, line: "No decision has been reviewed yet. Nothing here is keeping score of you so far." };
  }
  return {
    reviewed,
    confirmed,
    line: `${reviewed} decision${reviewed === 1 ? "" : "s"} reviewed, ${confirmed} of them confirmed.`,
  };
}

export type DecisionDraft = {
  title: string;
  decision: string;
  rationale: string;
  expected_outcome: string;
  metric_key: string;
  expected_value: string;
  review_on: string;
  status: "pending" | "open";
};

/** The falsifiability gate. Returns the message the founder sees, or null. */
export function validateDecision(d: DecisionDraft): string | null {
  if (!d.title.trim()) return "A decision needs a title.";
  if (!d.decision.trim()) return "Write down what was actually decided.";
  if (d.status === "pending") return null;
  const hasMetric = !!d.metric_key;
  const hasValue = d.metric_key === "none" || d.expected_value.trim() !== "";
  const hasDate = !!d.review_on;
  if (hasMetric && hasValue && hasDate) return null;
  return DECISION_BLOCKED_MESSAGE;
}

/**
 * Save a decision. The baseline is read from today's brief for the chosen
 * metric — the founder is never asked to type it, because he would guess, and
 * a guessed baseline makes the whole comparison worthless.
 */
export async function saveDecision(d: DecisionDraft, m: AdminMetrics | null) {
  const blocked = validateDecision(d);
  if (blocked) throw new Error(blocked);
  const key = d.metric_key && d.metric_key !== "none" ? (d.metric_key as MetricKey) : null;
  const baseline = key && m ? metricValue(m, key) : null;
  const { error } = await supabase.from("decisions" as any).insert({
    decided_on: todayISO(),
    title: d.title.trim(),
    decision: d.decision.trim(),
    rationale: d.rationale.trim() || null,
    expected_outcome: d.expected_outcome.trim() || null,
    metric_key: d.status === "open" ? d.metric_key : d.metric_key || null,
    baseline_value: baseline,
    expected_value: key && d.expected_value.trim() !== "" ? Number(d.expected_value) : null,
    review_on: d.review_on || null,
    status: d.status,
  });
  if (error) throw error;
}

/**
 * Settle a decision: capture the actual value from the live metric, stamp the
 * review date and keep the note. Nothing is ever deleted — a refuted decision
 * is the most valuable row in the table.
 */
export async function settleDecision(
  decision: Decision,
  verdict: "confirmed" | "refuted" | "inconclusive",
  note: string,
  m: AdminMetrics | null,
) {
  const key =
    decision.metric_key && decision.metric_key !== "none" ? (decision.metric_key as MetricKey) : null;
  const actual = key && m ? metricValue(m, key) : null;
  const { error } = await supabase
    .from("decisions" as any)
    .update({
      status: verdict,
      actual_value: actual,
      reviewed_on: todayISO(),
      review_note: note.trim() || null,
    })
    .eq("id", decision.id);
  if (error) throw error;
}

/** "You expected Published to reach 3 by today. It is 1." */
export function reviewSentence(d: Decision, m: AdminMetrics | null): string {
  const head = `On ${d.decided_on} you decided: ${d.title}.`;
  if (!d.metric_key || d.metric_key === "none") {
    return `${head} There is no funnel metric on this one — judge it yes or no: ${d.expected_outcome ?? d.decision}`;
  }
  const label = FUNNEL_ORDER.find((f) => f.key === d.metric_key)?.label ?? d.metric_key;
  const live = m ? metricValue(m, d.metric_key as MetricKey) : null;
  return `${head} You expected ${label} to reach ${d.expected_value ?? "?"} by today. It is ${live ?? "unknown"}.`;
}
