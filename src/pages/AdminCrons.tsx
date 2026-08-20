import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import AdminShell from "@/components/admin/AdminShell";
import { toast } from "sonner";
import { Loader2, AlertCircle, PlayCircle, RefreshCw } from "lucide-react";

const CANVAS = "#F2F5F9";
const CARD = "#FFFFFF";
const BORDER = "#E2E7EE";
const INK = "#0F1519";
const MUTED = "#5B6673";
const ACTION = "#0670C4";
const OKC = "#12805C";
const WARNC = "#E0A82E";
const FAILC = "#C0392B";
const MONO = "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace";
const INTER = "Inter, ui-sans-serif, system-ui, -apple-system, sans-serif";

const num: React.CSSProperties = { fontFamily: MONO, fontVariantNumeric: "tabular-nums" };

type CronRow = {
  jobid: number;
  jobname: string;
  schedule: string;
  active: boolean;
  last_status: string | null;
  last_start: string | null;
  last_msg: string | null;
};

type FreshRow = {
  check_key: string;
  claim: string;
  last_row_at: string | null;
  hours_stale: number | null;
  state: "OK" | "WARN" | "FAIL" | "NO_DATA";
};

type SnapRow = { failure_kind: string | null; requested_at: string | null };

const card: React.CSSProperties = {
  background: CARD,
  border: `1px solid ${BORDER}`,
  borderRadius: 12,
  padding: 20,
};
const th: React.CSSProperties = {
  textAlign: "left",
  fontSize: 11,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: MUTED,
  padding: "10px 12px",
  borderBottom: `1px solid ${BORDER}`,
  whiteSpace: "nowrap",
};
const td: React.CSSProperties = {
  padding: "10px 12px",
  borderBottom: `1px solid ${BORDER}`,
  color: INK,
  fontSize: 13,
  verticalAlign: "top",
};
const h2: React.CSSProperties = {
  margin: 0,
  fontFamily: INTER,
  fontSize: 17,
  fontWeight: 700,
  letterSpacing: "-0.01em",
  color: INK,
};

function relativeTime(iso: string | null): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const STATE_META: Record<FreshRow["state"], { color: string; word: string }> = {
  OK: { color: OKC, word: "On time" },
  WARN: { color: WARNC, word: "Late" },
  FAIL: { color: FAILC, word: "Not landing" },
  NO_DATA: { color: MUTED, word: "No data yet" },
};

function Dot({ color }: { color: string }) {
  return (
    <span
      aria-hidden
      style={{
        width: 8,
        height: 8,
        borderRadius: 999,
        background: color,
        display: "inline-block",
        flex: "0 0 auto",
      }}
    />
  );
}

function statusBadge(status: string | null) {
  const s = (status || "").toLowerCase();
  let color = "#9A6F12";
  let bg = "rgba(224,168,46,0.14)";
  const label = status || "no runs";
  if (s === "succeeded") { color = OKC; bg = "rgba(18,128,92,0.12)"; }
  else if (s === "failed") { color = FAILC; bg = "rgba(192,57,43,0.12)"; }
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: "0.03em",
        color,
        background: bg,
        border: `1px solid ${color}33`,
      }}
    >
      {label}
    </span>
  );
}

export default function AdminCrons() {
  const [rows, setRows] = useState<CronRow[]>([]);
  const [fresh, setFresh] = useState<FreshRow[]>([]);
  const [freshErr, setFreshErr] = useState<string | null>(null);
  const [snaps, setSnaps] = useState<SnapRow[]>([]);
  const [snapsErr, setSnapsErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [running, setRunning] = useState<Record<number, boolean>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setFreshErr(null);
    setSnapsErr(null);

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const [cronRes, freshRes, snapRes] = await Promise.all([
      supabase.rpc("admin_list_crons"),
      supabase.rpc("cockpit_freshness" as any),
      supabase
        .from("request_snapshots" as any)
        .select("failure_kind, requested_at")
        .gte("requested_at", since)
        .limit(20000),
    ]);

    if (cronRes.error) {
      setError(cronRes.error.message || "Failed to load crons");
      setRows([]);
    } else {
      const list = ((cronRes.data as any[]) || []) as CronRow[];
      list.sort((a, b) => {
        const af = (a.last_status || "").toLowerCase() === "failed" ? 0 : 1;
        const bf = (b.last_status || "").toLowerCase() === "failed" ? 0 : 1;
        if (af !== bf) return af - bf;
        return (a.jobname || "").localeCompare(b.jobname || "");
      });
      setRows(list);
    }

    if (freshRes.error) { setFreshErr(freshRes.error.message); setFresh([]); }
    else setFresh(((freshRes.data as any[]) || []) as FreshRow[]);

    if (snapRes.error) { setSnapsErr(snapRes.error.message); setSnaps([]); }
    else setSnaps(((snapRes.data as any[]) || []) as SnapRow[]);

    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const runNow = async (row: CronRow) => {
    setRunning((r) => ({ ...r, [row.jobid]: true }));
    try {
      const { data, error } = await supabase.rpc("admin_run_cron", { p_jobid: row.jobid });
      if (error) throw error;
      toast.success(typeof data === "string" ? data : `${row.jobname} triggered`);
      setTimeout(() => { load(); }, 1500);
    } catch (e: any) {
      toast.error(e?.message || "Could not trigger cron");
    } finally {
      setRunning((r) => ({ ...r, [row.jobid]: false }));
    }
  };

  const req = useMemo(() => {
    const total = snaps.length;
    const neverLeft = snaps.filter((s) => s.failure_kind === "never_left").length;
    const timedOut = snaps.filter((s) => s.failure_kind === "timed_out").length;
    const failed = snaps.filter((s) => s.failure_kind && s.failure_kind !== "ok").length;
    const pct = total ? (failed / total) * 100 : 0;

    // direction over the last six hours: first three hours vs last three hours
    const now = Date.now();
    const win = (fromH: number, toH: number) =>
      snaps.filter((s) => {
        if (!s.requested_at) return false;
        const age = (now - new Date(s.requested_at).getTime()) / 3600000;
        return age >= toH && age < fromH;
      });
    const older = win(6, 3);
    const newer = win(3, 0);
    const rate = (arr: SnapRow[]) =>
      arr.length ? arr.filter((s) => s.failure_kind && s.failure_kind !== "ok").length / arr.length : null;
    const ro = rate(older);
    const rn = rate(newer);
    let direction = "Not enough captured history yet to name a direction.";
    if (ro !== null && rn !== null) {
      const delta = (rn - ro) * 100;
      if (delta > 1) direction = "Failures are rising over the last six hours.";
      else if (delta < -1) direction = "Failures are falling over the last six hours.";
      else direction = "Failures are steady over the last six hours.";
    }
    return { total, neverLeft, timedOut, failed, pct, direction };
  }, [snaps]);

  const nothingCaptured = !snapsErr && req.total === 0;

  return (
    <AdminShell title="Crons" subtitle="Did the work land — outcomes first, dispatch second">
      <div className="grid gap-6" style={{ background: CANVAS }}>
        {/* Refresh — single primary action */}
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-2"
            style={{
              minHeight: 44,
              padding: "10px 16px",
              borderRadius: 8,
              background: ACTION,
              border: "1px solid transparent",
              color: "#FFFFFF",
              fontSize: 13,
              fontWeight: 600,
              cursor: loading ? "not-allowed" : "pointer",
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#04477C"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = ACTION; }}
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        {/* 1 · Did the work land */}
        <section style={card}>
          <h2 style={h2}>Did the work land</h2>
          <p style={{ margin: "6px 0 16px", fontSize: 13, color: MUTED }}>
            Each line is a claim about real output, checked against the table that would hold it.
          </p>
          {freshErr && (
            <div className="flex items-start gap-2" style={{ color: FAILC, fontSize: 13 }}>
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{freshErr}</span>
            </div>
          )}
          {!freshErr && fresh.length === 0 && !loading && (
            <p style={{ fontSize: 13, color: MUTED, margin: 0 }}>No checks are enabled.</p>
          )}
          {fresh.map((f) => {
            const meta = STATE_META[f.state] ?? STATE_META.NO_DATA;
            return (
              <div
                key={f.check_key}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "12px 0",
                  borderTop: `1px solid ${BORDER}`,
                  flexWrap: "wrap",
                }}
              >
                <Dot color={meta.color} />
                <span style={{ fontSize: 14, color: INK, flex: "1 1 260px" }}>{f.claim}</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: meta.color, whiteSpace: "nowrap" }}>
                  {meta.word}
                </span>
                <span style={{ ...num, fontSize: 12, color: MUTED, minWidth: 90, textAlign: "right" }}>
                  {f.hours_stale === null ? "—" : `${Number(f.hours_stale).toFixed(1)}h old`}
                </span>
              </div>
            );
          })}
        </section>

        {/* 2 · Requests */}
        <section style={card}>
          <h2 style={h2}>Requests</h2>
          <p style={{ margin: "6px 0 16px", fontSize: 13, color: MUTED }}>
            Captured outcomes of scheduled HTTP calls over the last 24 hours.
          </p>
          {snapsErr && (
            <div className="flex items-start gap-2" style={{ color: FAILC, fontSize: 13 }}>
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{snapsErr}</span>
            </div>
          )}
          {nothingCaptured ? (
            <p style={{ fontSize: 13, color: MUTED, margin: 0 }}>
              Nothing has been captured yet. The capture job runs every five minutes — these numbers are
              unknown, not zero.
            </p>
          ) : (
            !snapsErr && (
              <>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 28 }}>
                  {[
                    { label: "Total", value: String(req.total), color: INK },
                    { label: "Never left", value: String(req.neverLeft), color: req.neverLeft ? FAILC : INK },
                    { label: "Timed out", value: String(req.timedOut), color: req.timedOut ? WARNC : INK },
                    { label: "Failure rate", value: `${req.pct.toFixed(1)}%`, color: req.pct > 1 ? FAILC : INK },
                  ].map((s) => (
                    <div key={s.label}>
                      <div style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: MUTED }}>
                        {s.label}
                      </div>
                      <div style={{ ...num, fontSize: 28, color: s.color, fontWeight: 500, lineHeight: 1, marginTop: 4 }}>
                        {s.value}
                      </div>
                    </div>
                  ))}
                </div>
                <p style={{ marginTop: 16, marginBottom: 0, fontSize: 13, color: INK }}>{req.direction}</p>
              </>
            )
          )}
        </section>

        {/* 3 · Jobs */}
        <section style={card}>
          <h2 style={h2}>Jobs</h2>
          <p style={{ margin: "6px 0 16px", fontSize: 13, color: MUTED }}>
            The scheduler's own record of what it handed off.
          </p>
          {loading && (
            <div className="flex items-center gap-2" style={{ color: MUTED, fontSize: 13 }}>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Loading crons…</span>
            </div>
          )}
          {!loading && error && (
            <div className="flex items-start gap-2" style={{ color: FAILC, fontSize: 13 }}>
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
          {!loading && !error && rows.length === 0 && (
            <p style={{ color: MUTED, fontSize: 13, margin: 0 }}>No cron jobs registered.</p>
          )}
          {!loading && !error && rows.length > 0 && (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={th}>Job</th>
                    <th style={th}>Schedule</th>
                    <th style={th}>Active</th>
                    <th style={th}>Last run</th>
                    <th style={th}>Dispatched</th>
                    <th style={th}>Message</th>
                    <th style={th}></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const isOpen = !!expanded[r.jobid];
                    const msg = r.last_msg || "";
                    const truncated = msg.length > 80 ? msg.slice(0, 80) + "…" : msg;
                    return (
                      <tr key={r.jobid}>
                        <td style={{ ...td, fontWeight: 500 }}>{r.jobname}</td>
                        <td style={{ ...td, ...num, fontSize: 12, color: MUTED }}>{r.schedule}</td>
                        <td style={td}>{r.active ? "yes" : "no"}</td>
                        <td style={{ ...td, ...num, fontSize: 12 }} title={r.last_start || ""}>
                          {relativeTime(r.last_start)}
                        </td>
                        <td style={td}>{statusBadge(r.last_status)}</td>
                        <td
                          style={{
                            ...td,
                            maxWidth: 320,
                            cursor: msg ? "pointer" : "default",
                            color: MUTED,
                            whiteSpace: isOpen ? "pre-wrap" : "nowrap",
                            overflow: isOpen ? "visible" : "hidden",
                            textOverflow: "ellipsis",
                          }}
                          onClick={() => msg && setExpanded((e) => ({ ...e, [r.jobid]: !e[r.jobid] }))}
                        >
                          {isOpen ? msg : truncated || "—"}
                        </td>
                        <td style={td}>
                          <button
                            onClick={() => runNow(r)}
                            disabled={!!running[r.jobid]}
                            className="flex items-center gap-1"
                            style={{
                              minHeight: 44,
                              padding: "8px 12px",
                              borderRadius: 8,
                              background: CARD,
                              border: `1px solid ${BORDER}`,
                              color: ACTION,
                              fontSize: 12,
                              fontWeight: 600,
                              cursor: running[r.jobid] ? "not-allowed" : "pointer",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {running[r.jobid] ? <Loader2 className="w-3 h-3 animate-spin" /> : <PlayCircle className="w-3 h-3" />}
                            Run now
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p style={{ marginTop: 14, marginBottom: 0, fontSize: 12, color: MUTED }}>
            "Dispatched" means the scheduler queued the call — not that the work completed. A job can
            dispatch successfully and still do nothing. The block above is the one that matters.
          </p>
        </section>
      </div>
    </AdminShell>
  );
}
