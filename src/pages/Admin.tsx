import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import AdminShell from "@/components/admin/AdminShell";
import HealthFindingsPanel from "@/components/admin/HealthFindingsPanel";
import SendTestEmailPanel from "@/components/admin/SendTestEmailPanel";
import RegenerateReportPanel from "@/components/admin/RegenerateReportPanel";
import ReportHealthPanel from "@/components/admin/ReportHealthPanel";
import { downloadBlob } from "@/lib/download";
import {
  Bar,
  Btn,
  C,
  CappedTable,
  Chip,
  Finding,
  Label,
  Modal,
  MONO,
  SERIF,
  Seg,
  Stat,
  Table,
  Unknown,
  Zone,
  ZoneCard,
} from "@/components/admin/cockpit/ui";
import { Loader2 } from "lucide-react";

/**
 * /admin — the founder cockpit.
 *
 * ONE BRAIN, THREE RENDERS. This page renders the SAME stored computation the
 * daily email renders: today's row in `daily_brief_snapshots`, written by the
 * `founder-daily-brief` edge function. The page never recomputes the headline
 * picture. Views and filters change what is DISPLAYED — never how a number is
 * computed, and never the audit.
 */

const DRILLDOWNS = [
  { to: "/admin/people", label: "People", d: "Per-user lifecycle detail" },
  { to: "/admin/journey", label: "Journey", d: "Funnel stages in depth" },
  { to: "/admin/cost", label: "Cost", d: "AI spend and budget" },
  { to: "/admin/crons", label: "Crons", d: "Scheduled jobs and manual runs" },
  { to: "/admin/access", label: "Access", d: "Allowlist and invitations" },
  { to: "/admin/qa", label: "QA", d: "Audit reports and checks" },
  { to: "/admin/guide-health", label: "Guide health", d: "Guide article coverage" },
  { to: "/admin/standard", label: "Standard", d: "The Aura standard" },
  { to: "/admin/experience", label: "Experience", d: "Experience configuration" },
  { to: "/admin/design-system", label: "Design system", d: "Tokens and versions" },
  { to: "/admin/appearance", label: "Appearance", d: "Atmosphere and backgrounds" },
];

type Snapshot = { payload: any; audit: any; brief_date: string; source: "stored" | "live" };
type ViewMode = "ceo" | "working" | "auditor";
type Who = "everybody" | "active" | "drifting" | "gone" | "never";

const N = (v: unknown): number | null =>
  v === null || v === undefined || Number.isNaN(Number(v)) ? null : Number(v);

const FUNNEL_STAGES: { key: string; label: string; stage?: string; from: string }[] = [
  { key: "invited", label: "Invited", from: "auth.users, founder and test accounts removed" },
  { key: "signed_in", label: "Signed in", stage: "signed_in", from: "auth.users.last_sign_in_at" },
  { key: "finished_setup", label: "Finished setup", stage: "finished_setup", from: "diagnostic_profiles" },
  { key: "captured", label: "Captured something", stage: "captured", from: "entries" },
  { key: "got_signal", label: "Got a signal", stage: "got_signal", from: "strategic_signals" },
  { key: "linkedin_live", label: "LinkedIn live", stage: "linkedin_live", from: "linkedin_connections.status = active" },
  { key: "opened_writer", label: "Opened the writer", stage: "opened_writer", from: "product_events composer_opened" },
  { key: "has_draft", label: "Holds a draft", stage: "has_draft", from: "content_items + aura-written linkedin_posts" },
  { key: "published", label: "Published", stage: "published", from: "linkedin_posts.tracking_status = published" },
];

const RANGES: { value: string; label: string }[] = [
  { value: "7", label: "7d" },
  { value: "14", label: "14d" },
  { value: "30", label: "30d" },
  { value: "90", label: "90d" },
  { value: "all", label: "All" },
];

const WHO_OPTIONS: { value: Who; label: string }[] = [
  { value: "everybody", label: "Everybody" },
  { value: "active", label: "Active" },
  { value: "drifting", label: "Drifting (7–14 days quiet)" },
  { value: "gone", label: "Gone (14+ days quiet)" },
  { value: "never", label: "Never started" },
];

const VIEW_KEY = "aura.admin.view";
const ZONES_KEY = "aura.admin.zones";

/** Severity order — anything red floats to the top, always. */
const RANK: Record<string, number> = { [C.ox]: 0, [C.damber]: 1, [C.amber]: 2, [C.teal]: 3, [C.muted]: 4 };

function daysAgo(value: unknown): number | null {
  if (!value) return null;
  const t = new Date(String(value)).getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor((Date.now() - t) / 86400000);
}

function nextMove(p: any): string {
  if (!p?.stages?.finished_setup) return "Has not finished setup — walk them through it personally.";
  if (Number(p.captures ?? 0) === 0) return "Nothing captured yet — ask them for one thing they read this week.";
  if (Number(p.signals ?? 0) === 0) return "Captures but no signal — check their signal run before messaging them.";
  if (Number(p.drafts ?? 0) > 0 && Number(p.published ?? 0) === 0) return "A draft is waiting — nudge them to send it.";
  if (p.linkedin !== "live") return "LinkedIn is not connected — offer to do it on a call.";
  if (Number(p.days_since_capture ?? 999) > 7) return "Quiet for over a week — ask what stopped them.";
  if (Number(p.published ?? 0) > 0) return "Publishing already — ask for a testimonial.";
  return "On track — leave them alone.";
}

function nudgeMessage(p: any): string {
  const name = p?.first_name ?? "there";
  if (Number(p?.drafts ?? 0) > 0)
    return `Hi ${name} — you have ${p.drafts} post${p.drafts === 1 ? "" : "s"} written and waiting in Aura. Want me to look over the top one with you today and get it out?`;
  if (Number(p?.captures ?? 0) === 0)
    return `Hi ${name} — Aura needs one thing from you to start: paste in something you read this week. Takes ten seconds and everything else follows from it.`;
  if (p?.linkedin !== "live")
    return `Hi ${name} — your LinkedIn isn't connected yet, so Aura can't publish for you or see how your posts land. Two minutes on a call and it's done. When suits?`;
  return `Hi ${name} — it's been ${p?.days_since_capture ?? "a while"} days since you added anything to Aura. What got in the way? I'd like to fix it.`;
}

export default function Admin() {
  const [params, setParams] = useSearchParams();

  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const [stageOpen, setStageOpen] = useState<string | null>(null);
  const [sortSilent, setSortSilent] = useState(true);
  const [message, setMessage] = useState<{ title: string; body: string } | null>(null);
  const [verify, setVerify] = useState<any | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [actionNote, setActionNote] = useState<string | null>(null);
  const [, setTick] = useState(0);

  /* ---------- view + filters: every one of them lives in the URL ---------- */
  const storedView = (typeof localStorage !== "undefined" && localStorage.getItem(VIEW_KEY)) as ViewMode | null;
  const view: ViewMode = (params.get("view") as ViewMode) || storedView || "ceo";
  const range = params.get("range") ?? "14";
  const who = (params.get("who") as Who) ?? "everybody";
  const showFounder = params.get("founder") === "1";
  const showTest = params.get("test") === "1";

  const setParam = useCallback(
    (key: string, value: string | null, defaultValue: string) => {
      const next = new URLSearchParams(params);
      if (value === null || value === defaultValue) next.delete(key);
      else next.set(key, value);
      setParams(next, { replace: false });
    },
    [params, setParams],
  );

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_KEY, view);
    } catch {
      /* private mode — the URL still carries the view */
    }
  }, [view]);

  /* ---------- remembered expanded zones ---------- */
  const [openZones, setOpenZones] = useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(localStorage.getItem(ZONES_KEY) ?? "{}");
    } catch {
      return {};
    }
  });
  const toggleZone = (k: string) =>
    setOpenZones((prev) => {
      const next = { ...prev, [k]: !prev[k] };
      try {
        localStorage.setItem(ZONES_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });

  /* ---------- data: stored first, live dry run as fallback ---------- */
  const loadStored = useCallback(async () => {
    const today = new Date().toISOString().slice(0, 10);
    const { data, error } = await supabase
      .from("daily_brief_snapshots")
      .select("payload, audit, brief_date")
      .eq("brief_date", today)
      .maybeSingle();
    if (error) throw error;
    return data;
  }, []);

  const computeLive = useCallback(async () => {
    const { data, error } = await supabase.functions.invoke("founder-daily-brief", {
      body: { dry_run: true },
    });
    if (error) throw error;
    if (!data?.payload) throw new Error("The brief returned no payload.");
    return data;
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setErr(null);
        const stored = await loadStored();
        if (cancelled) return;
        if (stored?.payload) {
          setSnap({ payload: stored.payload, audit: stored.audit, brief_date: stored.brief_date, source: "stored" });
        } else {
          const live = await computeLive();
          if (cancelled) return;
          setSnap({ payload: live.payload, audit: live.audit, brief_date: live.payload.brief_date, source: "live" });
        }
      } catch (e: any) {
        if (!cancelled) setErr(e?.message || "Could not load today's brief.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadStored, computeLive]);

  /** Age the liveliness chip every 60 seconds without refetching anything. */
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 60000);
    return () => window.clearInterval(id);
  }, []);

  const refresh = async () => {
    try {
      setRefreshing(true);
      setErr(null);
      const live = await computeLive();
      setSnap({ payload: live.payload, audit: live.audit, brief_date: live.payload.brief_date, source: "live" });
      setVerify(null);
    } catch (e: any) {
      setErr(e?.message || "Refresh failed.");
    } finally {
      setRefreshing(false);
    }
  };

  const runVerify = async () => {
    try {
      setVerifying(true);
      const { data, error } = await supabase.rpc("founder_brief_verify" as any);
      if (error) throw error;
      setVerify(data);
    } catch (e: any) {
      setActionNote(e?.message || "Verification failed.");
    } finally {
      setVerifying(false);
    }
  };

  const p = snap?.payload;
  const audit = snap?.audit;
  const pairs: any[] = audit?.pairs ?? [];
  const pairOf = (k: string) => pairs.find((x) => x.key === k);

  /** The one place a headline number is read. Disagreement renders "?". */
  const headline = useCallback(
    (key: string, fallback?: number | null): number | null => {
      const pr = pairOf(key);
      if (pr) return pr.agree ? N(pr.a) : null;
      return fallback ?? null;
    },
    [pairs],
  );

  /* ---------- liveliness ---------- */
  const countedAt = p?.counted_at_utc ? new Date(String(p.counted_at_utc)) : null;
  const ageMinutes =
    countedAt && !Number.isNaN(countedAt.getTime())
      ? Math.max(0, Math.floor((Date.now() - countedAt.getTime()) / 60000))
      : null;
  const liveliness = (() => {
    if (ageMinutes === null) return { tone: C.muted, text: "AGE UNKNOWN", note: "the count carries no timestamp" };
    if (ageMinutes < 15) return { tone: C.teal, text: "LIVE", note: `counted ${ageMinutes} min ago` };
    if (ageMinutes < 18 * 60)
      return {
        tone: C.muted,
        text: "STORED",
        note: `counted at ${countedAt!.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })} today`,
      };
    return {
      tone: C.amber,
      text: "STALE",
      note: `counted ${Math.floor(ageMinutes / 60)} hours ago — press Refresh`,
    };
  })();

  /* ---------- filters (display only) ---------- */
  const rangeDays = range === "all" ? null : Number(range);
  const inRange = useCallback(
    (days: number | null | undefined) => {
      if (rangeDays === null) return true;
      if (days === null || days === undefined) return false;
      return Number(days) <= rangeDays;
    },
    [rangeDays],
  );

  const filtersDirty = range !== "14" || who !== "everybody" || showFounder || showTest;

  const allPeople: any[] = useMemo(() => {
    const rows = (p?.people ?? []) as any[];
    const sorted = [...rows];
    if (sortSilent) sorted.sort((a, b) => Number(b.days_since_capture ?? 9999) - Number(a.days_since_capture ?? 9999));
    else sorted.sort((a, b) => String(a.first_name).localeCompare(String(b.first_name)));
    return sorted;
  }, [p, sortSilent]);

  const people: any[] = useMemo(() => {
    if (who === "everybody") return allPeople;
    return allPeople.filter((r) => {
      const d = r.days_since_capture;
      const never = d === null || d === undefined || Number(r.captures ?? 0) === 0;
      if (who === "never") return never;
      if (never) return false;
      const n = Number(d);
      if (who === "active") return n < 7;
      if (who === "drifting") return n >= 7 && n < 14;
      return n >= 14;
    });
  }, [allPeople, who]);

  const draftList: any[] = useMemo(
    () => ((p?.drafts?.list ?? []) as any[]).filter((d) => inRange(N(d.age_days))),
    [p, inRange],
  );
  const failed: any[] = useMemo(
    () => ((p?.failed_publishes ?? []) as any[]).filter((f) => inRange(daysAgo(f.date))),
    [p, inRange],
  );
  const feedback: any[] = useMemo(
    () => ((p?.voc?.feedback ?? []) as any[]).filter((f) => inRange(daysAgo(f.date))),
    [p, inRange],
  );
  const milestones: any[] = useMemo(
    () => ((p?.voc?.milestones ?? []) as any[]).filter((m) => inRange(daysAgo(m.when))),
    [p, inRange],
  );

  const exportAudit = () => {
    const doc = {
      exported_at: new Date().toISOString(),
      brief_date: snap?.brief_date,
      source: snap?.source,
      excluded: p?.excluded,
      rule: "Every headline number is computed twice by two independent routes inside founder-daily-brief. This page renders that stored computation and does not recompute it. View mode and filters affect display only.",
      numbers: pairs.map((x) => ({
        key: x.key,
        label: x.label,
        route_a_description: x.route_a,
        route_b_description: x.route_b,
        route_a_value: x.a,
        route_b_value: x.b,
        agree: x.agree,
        note: x.note ?? null,
      })),
      live_verification: verify ?? "not run at export time",
      coverage: p?.coverage,
      counted_at_utc: p?.counted_at_utc,
    };
    downloadBlob(
      new Blob([JSON.stringify(doc, null, 2)], { type: "application/json" }),
      `aura-admin-audit-${snap?.brief_date ?? "today"}.json`,
    );
  };

  const runWorker = async (fn: string, label: string) => {
    setActionNote(`Running ${label}…`);
    const { error } = await supabase.functions.invoke(fn, { body: {} });
    setActionNote(error ? `${label} failed: ${error.message}` : `${label} finished. Refresh to see the effect.`);
  };

  const dot = (c: string) => (
    <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 8, background: c, marginRight: 8 }} />
  );

  /* ---------- shared pieces ---------- */
  const invited = headline("invited") ?? 0;

  const funnelBars = (clickable: boolean) =>
    FUNNEL_STAGES.map((s, i) => {
      const v = headline(s.key, N(p?.funnel?.[s.key]));
      const prev = i === 0 ? null : headline(FUNNEL_STAGES[i - 1].key, N(p?.funnel?.[FUNNEL_STAGES[i - 1].key]));
      const lost = prev !== null && v !== null ? prev - v : null;
      return (
        <Bar
          key={s.key}
          label={s.label}
          value={v}
          total={invited}
          colour={s.key === "published" ? C.teal : lost && lost > 0 ? C.amber : C.damber}
          note={lost === null ? s.from : lost > 0 ? `${lost} lost here${clickable ? " — click to see who" : ""}` : "nobody lost at this step"}
          onClick={clickable && s.stage ? () => setStageOpen(s.stage!) : undefined}
        />
      );
    });

  const weekLine = (() => {
    const wow = p?.week_over_week ?? p?.funnel_last_week ?? null;
    if (!wow)
      return (
        <>
          No week-earlier count is stored yet, so the change since last week is{" "}
          <Unknown reason="no prior snapshot to compare against" />. From tomorrow this line will read plainly.
        </>
      );
    return <>{String(wow.summary ?? "Change since last week is stored but carries no written summary.")}</>;
  })();

  const needs: any[] = p?.needs_you ?? [];
  const decide: any[] = p?.decide ?? [];
  const watch: any[] = p?.watch ?? [];

  const needsFindings = needs.map((item: any) => (
    <Finding
      key={item.fingerprint}
      colour={C.ox}
      finding={item.what}
      example={item.impact}
      recommendation={item.action}
      action={
        item.fingerprint?.startsWith("failed_publish") ? (
          <>
            <Btn tone="ox" onClick={() => runWorker("reap-stuck-publishes", "the publish retry worker")}>
              Run retry worker
            </Btn>
            <Link to="/admin/people" style={{ textDecoration: "none" }}>
              <Btn tone="quiet">Open people</Btn>
            </Link>
          </>
        ) : item.fingerprint?.startsWith("job_failed") ? (
          <Link to="/admin/crons" style={{ textDecoration: "none" }}>
            <Btn tone="ox">Open crons</Btn>
          </Link>
        ) : (
          <Link to="/admin/cost" style={{ textDecoration: "none" }}>
            <Btn tone="quiet">Open cost</Btn>
          </Link>
        )
      }
    />
  ));

  /* ================= CEO VIEW ================= */
  const ceoBody = p && (
    <>
      <section style={{ background: C.card, border: `1px solid ${C.rule}`, borderRadius: 4, padding: "22px 18px", marginBottom: 16 }}>
        <Label>Is the business moving?</Label>
        <div style={{ height: 16 }} />
        {funnelBars(false)}
        <div style={{ fontFamily: SERIF, fontSize: 17, lineHeight: 1.5, color: C.ink, marginTop: 18 }}>{weekLine}</div>
      </section>

      <section
        style={{
          background: C.card,
          border: `1px solid ${C.rule}`,
          borderLeft: `3px solid ${needs.length > 0 ? C.ox : C.teal}`,
          borderRadius: 4,
          padding: "22px 18px",
          marginBottom: 16,
        }}
      >
        <Label>Is anything on fire?</Label>
        <div style={{ height: 14 }} />
        {needs.length === 0 ? (
          <div style={{ fontFamily: SERIF, fontSize: 22, color: C.teal }}>Nothing needs you today.</div>
        ) : (
          needsFindings
        )}
      </section>

      <section style={{ background: C.card, border: `1px solid ${C.rule}`, borderRadius: 4, padding: "22px 18px", marginBottom: 16 }}>
        <Label>What should I do?</Label>
        <div style={{ height: 14 }} />
        {((p.recommendations ?? []) as string[]).slice(0, 3).map((r, i) => (
          <div key={i} style={{ display: "flex", gap: 14, alignItems: "flex-start", marginBottom: 16, flexWrap: "wrap" }}>
            <span style={{ fontFamily: MONO, fontSize: 22, color: C.muted, lineHeight: 1.2 }}>{i + 1}</span>
            <span style={{ flex: "1 1 220px", fontFamily: SERIF, fontSize: 19, lineHeight: 1.45, color: C.ink }}>{r}</span>
            <Btn tone="quiet" onClick={() => setMessage({ title: `Recommendation ${i + 1}`, body: r })}>
              Take it
            </Btn>
          </div>
        ))}
        {((p.recommendations ?? []) as string[]).length === 0 && (
          <div style={{ fontFamily: SERIF, fontSize: 18, color: C.muted }}>No recommendation today.</div>
        )}
      </section>

      <div style={{ fontFamily: MONO, fontSize: 11, color: C.muted, letterSpacing: ".04em" }}>
        {N(p.coverage?.measured_areas) ?? "?"} more areas measured
        {decide.length + watch.length === 0 ? ", all healthy" : `, ${decide.length + watch.length} worth a look`} —{" "}
        <button
          type="button"
          onClick={() => setParam("view", "working", "ceo")}
          style={{ all: "unset", cursor: "pointer", color: C.ink, borderBottom: `1px solid ${C.rule}` }}
        >
          open the working view
        </button>
        .
      </div>
    </>
  );

  /* ================= WORKING VIEW ================= */
  const zones: { key: string; n: number; title: string; tone: string; keyLine: React.ReactNode; quiet?: boolean; content: React.ReactNode }[] = [];

  if (p) {
    const drafts = headline("drafts_total");
    const publishedUsers = headline("published");
    const capturedUsers = headline("captured");

    zones.push({
      key: "today",
      n: 1,
      title: "Today",
      tone: needs.length > 0 ? C.ox : decide.length > 0 ? C.damber : C.teal,
      keyLine:
        needs.length > 0
          ? `${needs.length} thing${needs.length === 1 ? "" : "s"} need you right now.`
          : "Nothing is blocking a user right now.",
      content: (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 12, marginBottom: 18 }}>
            <Stat label="Needs you" value={needs.length} colour={C.ox} />
            <Stat label="Decide" value={decide.length} colour={C.damber} />
            <Stat label="Watch" value={watch.length} colour={C.amber} />
            <Stat label="Handled" value={N(p.handled) ?? 0} colour={C.teal} sub="quietly, by the machine" />
          </div>
          <div style={{ fontFamily: MONO, fontSize: 11, color: C.muted, marginBottom: 18 }}>
            oxblood = a user is blocked right now · dark amber = waiting on your decision · amber = keep an eye, no
            action · teal = healthy
          </div>
          {needs.length === 0 ? (
            <Finding
              colour={C.teal}
              finding="Nothing is blocking a user right now."
              example={`The last capture landed ${p.machine?.hours_since_capture ?? "?"} hours ago and no publish has failed.`}
              recommendation="Spend the day on one user conversation instead of the dashboard."
              countedFrom="linkedin_posts (failed), ef_error_log (critical), ops_alerts (open)"
            />
          ) : (
            needsFindings
          )}
          {decide.map((item: any) => (
            <Finding
              key={item.fingerprint}
              colour={C.damber}
              finding={item.what}
              example={item.impact}
              recommendation={item.action}
              action={
                <Btn
                  tone="quiet"
                  onClick={() =>
                    setMessage({ title: "The decision, written out", body: `${item.what}\n\n${item.impact}\n\n${item.action}` })
                  }
                >
                  Read the decision
                </Btn>
              }
            />
          ))}
          {watch.map((item: any) => (
            <Finding key={item.fingerprint} colour={C.amber} finding={item.what} example={item.impact} recommendation={item.action} />
          ))}
        </>
      ),
    });

    zones.push({
      key: "number",
      n: 2,
      title: "The number",
      tone: publishedUsers === 0 ? C.amber : C.teal,
      keyLine: `${capturedUsers ?? "?"} people have captured something; ${publishedUsers ?? "?"} have published.`,
      content: (
        <>
          {funnelBars(true)}
          <div style={{ height: 1, background: C.rule, margin: "20px 0" }} />
          <Finding
            colour={publishedUsers === 0 ? C.amber : C.teal}
            finding={`${capturedUsers ?? "?"} people have captured something; ${publishedUsers ?? "?"} have published.`}
            example={(() => {
              const stuck = allPeople.find((x) => Number(x.drafts ?? 0) > 0 && Number(x.published ?? 0) === 0);
              return stuck
                ? `${stuck.first_name} has ${stuck.drafts} draft${stuck.drafts === 1 ? "" : "s"} written and nothing published.`
                : "No single person is stuck between draft and publish right now.";
            })()}
            recommendation="Walk one person the whole way from draft to a live post this week. The funnel does not move on its own."
            countedFrom="entries; linkedin_posts.tracking_status = published"
          />
        </>
      ),
    });

    zones.push({
      key: "people",
      n: 3,
      title: "People",
      tone: people.length === 0 ? C.muted : C.damber,
      quiet: people.length === 0,
      keyLine:
        people.length === 0
          ? "Nothing to report at this filter."
          : `${people.length} ${who === "everybody" ? "people" : `people matching “${who}”`} — the longest silent is ${people[0]?.days_since_capture ?? "never"} days.`,
      content: (
        <>
          <Finding
            colour={C.damber}
            finding="This is the activation list. Every row is one real person and one thing you could do for them."
            example={
              people[0]
                ? `${people[0].first_name} — ${people[0].captures} captures, ${people[0].drafts} drafts, LinkedIn ${people[0].linkedin}, ${people[0].days_since_capture ?? "never"} days since last capture.`
                : "No users match this filter."
            }
            recommendation="Work top to bottom. The people who have been silent longest are the ones you are about to lose."
            action={
              <Btn tone="quiet" onClick={() => setSortSilent((s) => !s)}>
                Sort by {sortSilent ? "name" : "days silent"}
              </Btn>
            }
            countedFrom="entries, content_items, linkedin_posts, linkedin_connections.status"
          />
          <CappedTable
            head={["Person", "Captures", "Drafts", "LinkedIn", "Days silent", "Stage", "Next move", ""]}
            rows={people.map((r) => [
              r.first_name,
              r.captures,
              r.drafts,
              <span key="li" style={{ color: r.linkedin === "live" ? C.teal : r.linkedin === "dropped" ? C.ox : C.muted }}>
                {r.linkedin}
              </span>,
              r.days_since_capture === null || r.days_since_capture === undefined ? (
                <Unknown key="d" reason="never captured" />
              ) : (
                r.days_since_capture
              ),
              Number(r.published ?? 0) > 0
                ? "published"
                : Number(r.drafts ?? 0) > 0
                  ? "has draft"
                  : Number(r.signals ?? 0) > 0
                    ? "got signal"
                    : Number(r.captures ?? 0) > 0
                      ? "captured"
                      : "setup",
              <span key="nm" style={{ fontFamily: SERIF, fontSize: 14 }}>
                {nextMove(r)}
              </span>,
              <span key="a" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <Btn tone="quiet" onClick={() => setMessage({ title: `Nudge ${r.first_name}`, body: nudgeMessage(r) })}>
                  Draft nudge
                </Btn>
                <Link to={`/admin/people?user=${r.user_id ?? ""}`} style={{ textDecoration: "none" }}>
                  <Btn tone="quiet">Open profile</Btn>
                </Link>
              </span>,
            ])}
          />
        </>
      ),
    });

    const contentQuiet = draftList.length === 0 && failed.length === 0;
    zones.push({
      key: "content",
      n: 4,
      title: "Content and publishing",
      tone: failed.length > 0 ? C.ox : drafts && drafts > 0 ? C.damber : contentQuiet ? C.muted : C.teal,
      quiet: contentQuiet,
      keyLine:
        contentQuiet
          ? "Nothing to report at this filter."
          : drafts === null
            ? <Unknown reason="the two counting routes disagreed" />
            : `${drafts} drafts are written and waiting, the oldest for ${p.drafts?.oldest_days ?? "?"} days.`,
      content: (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 12, marginBottom: 18 }}>
            <Stat label="Drafts waiting" value={drafts ?? "?"} colour={C.damber} />
            <Stat
              label="Published posts"
              value={N(p.content?.published_total) ?? 0}
              colour={C.teal}
              sub={`${N(p.content?.published_30d) ?? 0} in 30 days`}
            />
            <Stat
              label="Draft → publish"
              value={
                drafts !== null && drafts + (N(p.content?.published_total) ?? 0) > 0
                  ? `${Math.round(((N(p.content?.published_total) ?? 0) / (drafts + (N(p.content?.published_total) ?? 0))) * 100)}%`
                  : "?"
              }
              sub="published as a share of all written work"
            />
            <Stat label="Failed publishes" value={headline("failed_publishes") ?? "?"} colour={C.ox} />
          </div>
          {draftList.length > 0 && (
            <>
              <Label>Drafts waiting</Label>
              <div style={{ height: 10 }} />
              <CappedTable
                head={["Owner", "Draft", "Age (days)", "Where", ""]}
                rows={draftList.map((d) => [
                  d.first_name,
                  String(d.title ?? "").slice(0, 60),
                  d.age_days,
                  d.source === "content_items" ? "studio" : "linkedin draft",
                  <Btn
                    key="n"
                    tone="quiet"
                    onClick={() =>
                      setMessage({
                        title: `Nudge ${d.first_name}`,
                        body: `Hi ${d.first_name} — the draft “${String(d.title ?? "").slice(0, 60)}” has been sitting in Aura for ${d.age_days} days. Shall I give it a final read and we get it out today?`,
                      })
                    }
                  >
                    Draft nudge
                  </Btn>,
                ])}
              />
            </>
          )}
          {failed.length > 0 && (
            <>
              <div style={{ height: 22 }} />
              <Label>Failed publishes</Label>
              <div style={{ height: 10 }} />
              <CappedTable
                head={["Person", "Date", "Error", ""]}
                rows={failed.map((f: any) => [
                  f.first_name,
                  f.date,
                  String(f.error).slice(0, 90),
                  <span key="a" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <Btn tone="ox" onClick={() => runWorker("reap-stuck-publishes", "the publish retry worker")}>
                      Retry publish
                    </Btn>
                    <Btn
                      tone="quiet"
                      onClick={() =>
                        setMessage({
                          title: `Message ${f.first_name}`,
                          body: `Hi ${f.first_name} — your post on ${f.date} did not go out. That was on us, not you. I'm fixing it now and will confirm the moment it is live.`,
                        })
                      }
                    >
                      Message the user
                    </Btn>
                  </span>,
                ])}
              />
            </>
          )}
        </>
      ),
    });

    zones.push({
      key: "intelligence",
      n: 5,
      title: "Intelligence",
      tone: Number(p.agent?.pending ?? 0) > 0 ? C.amber : C.teal,
      keyLine: `${N(p.signals?.live) ?? "?"} signals are live and the overnight agent covered ${N(p.agent?.users_covered) ?? 0} people this week.`,
      content: (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 12, marginBottom: 18 }}>
            <Stat label="Signals live" value={N(p.signals?.live) ?? "?"} colour={C.teal} />
            <Stat label="Made this week" value={N(p.signals?.created_7d) ?? "?"} />
            <Stat label="Gone stale" value={N(p.signals?.stale_30d) ?? "?"} colour={C.amber} sub="live but over 30 days old" />
            <Stat
              label="Signals read"
              value={p.signal_reads?.product_event_exists ? (N(p.signal_reads?.product_event_rows) ?? "?") : "?"}
              colour={C.muted}
              sub={p.signal_reads?.product_event_exists ? "product events" : "not measured"}
            />
          </div>
          <Finding
            colour={p.signal_reads?.product_event_exists ? C.teal : C.muted}
            finding={
              p.signal_reads?.product_event_exists
                ? "We can see whether the intelligence is being read."
                : "We still cannot say whether users read their signals."
            }
            example={`${N(p.signal_reads?.engagements) ?? 0} engagement rows exist, but there is no signal-open event in the product event log at all.`}
            recommendation="Add a signal-open event. Until then this is a gap in our instrumentation, not a fact about users."
            countedFrom="signal_engagements; product_events (no matching event name exists)"
          />
          <div style={{ height: 1, background: C.rule, margin: "18px 0" }} />
          <Label>The overnight agent</Label>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 12, marginTop: 12 }}>
            <Stat label="Found last night" value={N(p.agent?.last_night) ?? 0} />
            <Stat label="Found in 7 days" value={N(p.agent?.findings_7d) ?? 0} />
            <Stat label="Users covered" value={N(p.agent?.users_covered) ?? 0} />
            <Stat label="Still pending" value={N(p.agent?.pending) ?? 0} colour={C.amber} />
            <Stat label="Became captures" value={N(p.agent?.became_entries) ?? 0} colour={C.teal} />
          </div>
          <div style={{ height: 16 }} />
          <Finding
            colour={Number(p.agent?.pending ?? 0) > 0 ? C.amber : C.teal}
            finding={`The agent covered ${N(p.agent?.users_covered) ?? 0} people this week and ${N(p.agent?.pending) ?? 0} of its findings are still untouched.`}
            example={`${N(p.agent?.became_entries) ?? 0} of ${N(p.agent?.findings_7d) ?? 0} findings turned into something a user actually holds.`}
            recommendation="If pending stays high, the agent is producing work nobody wants. Cut the volume before you tune the prompt."
            countedFrom="agent_findings (last 7 days)"
          />
        </>
      ),
    });

    const vocQuiet = feedback.length === 0 && milestones.length === 0 && (p.voc?.guide_misses ?? []).length === 0;
    zones.push({
      key: "voc",
      n: 6,
      title: "Voice of the customer",
      tone: vocQuiet ? C.muted : C.damber,
      quiet: vocQuiet,
      keyLine: vocQuiet
        ? "Nothing to report at this filter."
        : `${feedback.length} score${feedback.length === 1 ? "" : "s"} and ${milestones.length} milestone${milestones.length === 1 ? "" : "s"} in this window.`,
      content: (
        <>
          <Label>Scores given</Label>
          <div style={{ height: 10 }} />
          {feedback.length === 0 ? (
            <div style={{ fontFamily: SERIF, color: C.muted }}>Nobody has scored Aura in this window.</div>
          ) : (
            <CappedTable
              head={["Person", "Score", "Date", "What they wrote"]}
              rows={feedback.map((f: any) => [
                f.first_name ?? "Someone",
                <span key="r" style={{ color: Number(f.rating) >= 9 ? C.teal : Number(f.rating) >= 7 ? C.amber : C.ox }}>
                  {f.rating}
                </span>,
                f.date,
                f.message ? String(f.message) : <span key="m" style={{ color: C.muted }}>score only, no written comment</span>,
              ])}
            />
          )}

          <div style={{ height: 22 }} />
          <Label>Help they asked for and did not get</Label>
          <div style={{ height: 10 }} />
          <CappedTable
            head={["Topic clicked", "Times", ""]}
            rows={(p.voc?.guide_misses ?? []).map((g: any) => [
              g.slug,
              g.count,
              <Link key="l" to="/admin/guide-health" style={{ textDecoration: "none" }}>
                <Btn tone="quiet">Write the article</Btn>
              </Link>,
            ])}
          />

          <div style={{ height: 22 }} />
          <Label>Milestones earned</Label>
          <div style={{ height: 10 }} />
          <CappedTable
            head={["Person", "Milestone", "When", ""]}
            rows={milestones.map((m: any, i: number) => [
              m.first_name ?? "Someone",
              m.name,
              m.when,
              <Btn
                key={i}
                tone="quiet"
                onClick={() =>
                  setMessage({
                    title: `Congratulate ${m.first_name ?? "them"}`,
                    body: `${m.first_name ?? "Hi"} — saw you hit "${m.name}" on ${m.when}. Genuinely well done. What's the next thing you want Aura to help you say?`,
                  })
                }
              >
                Congratulate
              </Btn>,
            ])}
          />

          <div style={{ height: 20 }} />
          <Finding
            colour={C.damber}
            finding="People are asking for help on topics that have nothing written behind them."
            example={
              (p.voc?.guide_misses ?? [])[0]
                ? `“${p.voc.guide_misses[0].slug}” was clicked ${p.voc.guide_misses[0].count} times and returns nothing.`
                : "No missing help topics recorded."
            }
            recommendation="Write the top missing article this week. It is the cheapest retention work available to you."
            countedFrom="guide_slug_misses, beta_feedback, user_milestones"
          />
        </>
      ),
    });

    const jobsFailed = (p.jobs?.failed ?? []).length;
    zones.push({
      key: "machine",
      n: 7,
      title: "The machine",
      tone: jobsFailed > 0 ? C.ox : Number(p.machine?.queue_failed ?? 0) > 0 ? C.amber : C.teal,
      keyLine:
        jobsFailed > 0 ? "Scheduled work failed in the last 24 hours." : "Every job that was due has run.",
      content: (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12, marginBottom: 20 }}>
            <Stat label="Spend this month" value={`$${N(p.machine?.spend_mtd) ?? 0}`} colour={Number(p.machine?.spend_mtd ?? 0) > 200 ? C.ox : C.teal} />
            <Stat
              label="Projected month"
              value={`$${(() => {
                const d = new Date();
                const day = d.getUTCDate();
                const days = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
                return ((Number(p.machine?.spend_mtd ?? 0) / day) * days).toFixed(0);
              })()}`}
              sub="at today's burn rate"
            />
            <Stat
              label="Queue"
              value={`${N(p.machine?.queue_pending) ?? 0} / ${N(p.machine?.queue_failed) ?? 0}`}
              sub="pending / failed"
              colour={Number(p.machine?.queue_failed ?? 0) > 0 ? C.amber : C.teal}
            />
            <Stat label="Invariants failing" value={N(p.machine?.open_findings) ?? 0} colour={Number(p.machine?.open_findings ?? 0) > 0 ? C.amber : C.teal} />
            <Stat
              label="AI providers up"
              value={`${(N(p.machine?.api_health?.checked) ?? 0) - (N(p.machine?.api_health?.failed) ?? 0)} / ${N(p.machine?.api_health?.checked) ?? 0}`}
              colour={Number(p.machine?.api_health?.failed ?? 0) > 0 ? C.ox : C.teal}
            />
            <Stat label="Hours since a capture" value={N(p.machine?.hours_since_capture) ?? "?"} colour={Number(p.machine?.hours_since_capture ?? 0) > 72 ? C.ox : C.teal} />
          </div>

          <Label>Automated work</Label>
          <div style={{ height: 10 }} />
          <CappedTable
            head={["Job", "State", "Schedule", "Last run"]}
            rows={[
              ...(p.jobs?.failed ?? []).map((j: any) => [j.name, <span key="s" style={{ color: C.ox }}>{dot(C.ox)}failed in 24h</span>, j.schedule, j.last_run ?? "never"]),
              ...(p.jobs?.dead ?? []).map((j: any) => [j.name, <span key="s" style={{ color: C.ox }}>{dot(C.ox)}missed its window</span>, j.schedule, j.last_run ?? "never"]),
              ...(p.jobs?.ok ?? []).map((j: any) => [j.name, <span key="s" style={{ color: C.teal }}>{dot(C.teal)}ran clean</span>, j.schedule, j.last_run ?? "never"]),
              ...(p.jobs?.not_due ?? []).map((j: any) => [j.name, <span key="s" style={{ color: C.muted }}>{dot(C.muted)}not due yet</span>, j.schedule, j.last_run ?? "never"]),
            ]}
          />
          <div style={{ height: 18 }} />
          <Finding
            colour={jobsFailed > 0 ? C.ox : C.teal}
            finding={jobsFailed > 0 ? "Scheduled work failed in the last 24 hours." : "Every job that was due has run."}
            example={
              (p.jobs?.failed ?? [])[0]
                ? `${p.jobs.failed[0].name} last ran ${p.jobs.failed[0].last_run ?? "never"}.`
                : `${(p.jobs?.not_due ?? []).length} weekly jobs are simply not due yet — that is not a fault.`
            }
            recommendation="Only chase a job once its own moment has passed. A Monday job is not broken on a Sunday."
            action={
              <Link to="/admin/crons" style={{ textDecoration: "none" }}>
                <Btn>Open crons</Btn>
              </Link>
            }
            countedFrom="cron.job + cron.job_run_details"
          />
        </>
      ),
    });

    zones.push({
      key: "proof",
      n: 8,
      title: "Proof",
      tone: Number(audit?.disagreements ?? 0) > 0 ? C.ox : C.teal,
      keyLine:
        Number(audit?.disagreements ?? 0) > 0
          ? `${audit.disagreements} numbers disagreed with their cross-check today.`
          : "Every headline number was counted twice and both routes agreed.",
      content: (
        <>
          <Finding
            colour={Number(audit?.disagreements ?? 0) > 0 ? C.ox : C.teal}
            finding="Each row below was computed once in SQL and once again through independent per-record counts."
            recommendation="Press “Verify against live data” before you quote any of these numbers to an outsider."
            action={
              <>
                <Btn onClick={runVerify} disabled={verifying}>
                  {verifying ? "Verifying…" : "Verify against live data"}
                </Btn>
                <Btn tone="quiet" onClick={exportAudit}>
                  Export audit
                </Btn>
                <Btn tone="quiet" onClick={() => setParam("view", "auditor", "ceo")}>
                  Open auditor view
                </Btn>
              </>
            }
          />
          {auditTable(pairs, verify)}
          {x_note(p)}
        </>
      ),
    });

    zones.push({
      key: "deeper",
      n: 9,
      title: "Go deeper",
      tone: C.muted,
      keyLine: `${DRILLDOWNS.length} detail pages behind this one.`,
      content: (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 10 }}>
          {DRILLDOWNS.map((d) => (
            <Link
              key={d.to}
              to={d.to}
              style={{ textDecoration: "none", border: `1px solid ${C.rule}`, borderRadius: 3, padding: "12px 14px", background: C.paper }}
            >
              <div style={{ fontFamily: SERIF, fontSize: 17, color: C.ink }}>{d.label}</div>
              <div style={{ fontFamily: MONO, fontSize: 11, color: C.muted, marginTop: 4 }}>{d.d}</div>
            </Link>
          ))}
        </div>
      ),
    });
  }

  const sortedZones = zones
    .map((z, i) => ({ z, i }))
    .sort((a, b) => (RANK[a.z.tone] ?? 9) - (RANK[b.z.tone] ?? 9) || a.i - b.i)
    .map(({ z }) => z);

  const workingBody = (
    <>
      {sortedZones.map((z) => (
        <ZoneCard
          key={z.key}
          n={z.n}
          title={z.title}
          tone={z.tone}
          keyLine={z.keyLine}
          quiet={z.quiet}
          open={!!openZones[z.key]}
          onToggle={() => toggleZone(z.key)}
        >
          {z.content}
        </ZoneCard>
      ))}
      <div style={{ background: "var(--ob-bg)", borderRadius: 6, padding: 18, display: "grid", gap: 16, marginTop: 24 }}>
        <HealthFindingsPanel />
        <ReportHealthPanel />
        <RegenerateReportPanel />
        <SendTestEmailPanel />
      </div>
    </>
  );

  /* ================= AUDITOR VIEW ================= */
  const auditorBody = p && (
    <Zone n={0} title="Every headline number, twice">
      <div style={{ fontFamily: MONO, fontSize: 11, color: C.muted, marginBottom: 16 }}>
        counted at {String(p.counted_at_utc)} UTC · brief date {snap?.brief_date} · source {snap?.source} ·{" "}
        {pairs.length} pairs · {Number(audit?.disagreements ?? 0)} disagreements
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 18 }}>
        <Btn onClick={runVerify} disabled={verifying}>
          {verifying ? "Verifying…" : "Verify against live data"}
        </Btn>
        <Btn tone="quiet" onClick={exportAudit}>
          Export audit
        </Btn>
      </div>
      <Table
        head={["Metric", "Route A", "A value", "Route B", "B value", "Agree", "Counted at (UTC)", "Live now"]}
        rows={pairs.map((x: any) => {
          const live = verify ? N(verify[x.key]) : null;
          return [
            x.label,
            x.route_a,
            x.a ?? "?",
            x.route_b,
            x.b ?? "?",
            x.agree ? "agree" : "DISAGREE",
            String(p.counted_at_utc),
            verify === null ? "not run" : live === null ? "not covered" : `${live} ${live === N(x.a) ? "pass" : "FAIL"}`,
          ];
        })}
      />
      <div style={{ height: 24 }} />
      <Label>Funnel, as stored</Label>
      <div style={{ height: 10 }} />
      <Table
        head={["Stage", "Value", "Counted from"]}
        rows={FUNNEL_STAGES.map((s) => [s.label, headline(s.key, N(p.funnel?.[s.key])) ?? "?", s.from])}
      />
      {x_note(p)}
    </Zone>
  );

  /* ---------- chrome ---------- */
  const stagePeople = stageOpen ? (p?.people ?? []).filter((r: any) => r?.stages && r.stages[stageOpen] !== true) : [];

  return (
    <AdminShell bleed>
      <div style={{ background: C.paper, minHeight: "100vh", padding: "28px 14px 80px" }}>
        <div style={{ maxWidth: 1080, margin: "0 auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 14, marginBottom: 22 }}>
            <div>
              <Label>Aura · founder cockpit</Label>
              <h1 style={{ margin: "8px 0 0", fontFamily: SERIF, fontSize: 34, fontWeight: 500, color: C.ink, lineHeight: 1.1 }}>
                {new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}
              </h1>
              <div style={{ fontFamily: MONO, fontSize: 11, color: C.muted, marginTop: 8 }}>
                Same computation as the daily email. Views and filters change what you see, never what was counted.
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <Chip tone={liveliness.tone} title={liveliness.note}>
                {liveliness.text} · {liveliness.note}
              </Chip>
              <Btn onClick={refresh} disabled={refreshing}>
                {refreshing ? "Refreshing…" : "Refresh now"}
              </Btn>
            </div>
          </div>

          <div style={{ marginBottom: 14 }}>
            <Seg<ViewMode>
              value={view}
              onChange={(v) => setParam("view", v, "ceo")}
              options={[
                { value: "ceo", label: "CEO" },
                { value: "working", label: "Working" },
                { value: "auditor", label: "Auditor" },
              ]}
            />
          </div>

          {/* ---------- filter bar ---------- */}
          <div
            style={{
              border: `1px solid ${C.rule}`,
              borderRadius: 4,
              background: C.card,
              padding: "12px 14px",
              marginBottom: 18,
              display: "flex",
              flexWrap: "wrap",
              gap: 16,
              alignItems: "center",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <Label>Period</Label>
              <Seg value={range} onChange={(v) => setParam("range", v, "14")} options={RANGES} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <Label>Who</Label>
              <select
                value={who}
                onChange={(e) => setParam("who", e.target.value, "everybody")}
                style={{
                  fontFamily: MONO,
                  fontSize: 11,
                  padding: "8px 10px",
                  border: `1px solid ${C.rule}`,
                  borderRadius: 3,
                  background: C.paper,
                  color: C.ink,
                }}
              >
                {WHO_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <label style={{ fontFamily: MONO, fontSize: 11, color: C.muted, display: "flex", gap: 8, alignItems: "center" }}>
              <input type="checkbox" checked={showFounder} onChange={(e) => setParam("founder", e.target.checked ? "1" : null, "")} />
              Founder account
            </label>
            <label style={{ fontFamily: MONO, fontSize: 11, color: C.muted, display: "flex", gap: 8, alignItems: "center" }}>
              <input type="checkbox" checked={showTest} onChange={(e) => setParam("test", e.target.checked ? "1" : null, "")} />
              Test accounts ({N(p?.excluded?.test_users) ?? 0} excluded)
            </label>
          </div>

          {filtersDirty && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 18 }}>
              <Chip tone={C.damber}>Filtered — not the whole picture</Chip>
              {range !== "14" && <Chip tone={C.damber}>Period: {range === "all" ? "all time" : `${range} days`}</Chip>}
              {who !== "everybody" && <Chip tone={C.damber}>Who: {who}</Chip>}
              {(showFounder || showTest) && (
                <Chip tone={C.damber} title="These accounts are excluded from the stored computation and cannot be added back without recomputing.">
                  Founder/test requested — still excluded from the stored count
                </Chip>
              )}
              <Btn tone="quiet" onClick={() => setParams(view === "ceo" ? {} : { view })}>
                Clear filters
              </Btn>
            </div>
          )}

          {actionNote && (
            <div style={{ fontFamily: MONO, fontSize: 12, color: C.ink, background: C.card, border: `1px solid ${C.rule}`, padding: "10px 12px", marginBottom: 18 }}>
              {actionNote}
            </div>
          )}

          {loading ? (
            <div style={{ display: "flex", alignItems: "center", gap: 10, color: C.muted, fontFamily: MONO, fontSize: 13 }}>
              <Loader2 className="w-4 h-4 animate-spin" /> Counting…
            </div>
          ) : err || !p ? (
            <div style={{ fontFamily: SERIF, fontSize: 17, color: C.ox }}>
              The cockpit could not read today&apos;s brief: {err ?? "no data"}. <Btn onClick={refresh}>Try again</Btn>
            </div>
          ) : view === "ceo" ? (
            ceoBody
          ) : view === "auditor" ? (
            auditorBody
          ) : (
            workingBody
          )}
        </div>
      </div>

      {stageOpen && (
        <Modal title={`Who has not reached “${FUNNEL_STAGES.find((s) => s.stage === stageOpen)?.label}”`} onClose={() => setStageOpen(null)}>
          {stagePeople.length === 0 ? (
            <div style={{ fontFamily: SERIF, color: C.muted }}>Everybody has reached this stage.</div>
          ) : (
            <Table
              head={["Person", "Captures", "LinkedIn", "Days silent"]}
              rows={stagePeople.map((r: any) => [r.first_name, r.captures, r.linkedin, r.days_since_capture ?? "never"])}
            />
          )}
        </Modal>
      )}

      {message && (
        <Modal title={message.title} onClose={() => setMessage(null)}>
          <div
            style={{
              fontFamily: SERIF,
              fontSize: 16,
              lineHeight: 1.6,
              color: C.ink,
              whiteSpace: "pre-wrap",
              border: `1px solid ${C.rule}`,
              padding: 14,
              background: C.paper,
            }}
          >
            {message.body}
          </div>
          <div style={{ marginTop: 14 }}>
            <Btn
              onClick={() => {
                navigator.clipboard?.writeText(message.body);
                setActionNote("Message copied.");
                setMessage(null);
              }}
            >
              Copy message
            </Btn>
          </div>
        </Modal>
      )}
    </AdminShell>
  );
}

/** The proof table, used by the working view. Unchanged arithmetic. */
function auditTable(pairs: any[], verify: any) {
  return (
    <Table
      head={["Claim", "Counted from", "Cross-check", "A / B", "Agree", "Live now"]}
      rows={pairs.map((x: any) => {
        const live = verify ? N(verify[x.key]) : null;
        return [
          x.label,
          x.route_a,
          x.route_b,
          `${x.a ?? "?"} / ${x.b ?? "?"}`,
          <span key="ag" style={{ color: x.agree ? C.teal : C.ox }}>
            {x.agree ? "✓" : "✗"}
          </span>,
          verify === null ? (
            <span key="l" style={{ color: C.muted }}>not run</span>
          ) : live === null ? (
            <span key="l" style={{ color: C.muted }}>not covered</span>
          ) : (
            <span key="l" style={{ color: live === N(x.a) ? C.teal : C.ox }}>
              {live} {live === N(x.a) ? "pass" : "FAIL"}
            </span>
          ),
        ];
      })}
    />
  );
}

/** Coverage line — what the page can and cannot see. */
function x_note(p: any) {
  const cov = p?.coverage;
  if (!cov) return null;
  return (
    <div style={{ marginTop: 20, border: `1px dashed ${C.rule}`, borderRadius: 3, padding: "14px 16px" }}>
      <Label>Coverage</Label>
      <div style={{ fontFamily: SERIF, fontSize: 16, color: C.ink, marginTop: 8 }}>
        {cov.measured_areas} of {cov.total_areas} areas of the business are actually measured.
      </div>
      <div style={{ fontFamily: MONO, fontSize: 11, color: C.muted, marginTop: 8 }}>
        Not measured: {(cov.unmeasured ?? []).join(" · ")}
      </div>
    </div>
  );
}