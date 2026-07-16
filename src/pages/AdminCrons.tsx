import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import AdminShell from "@/components/admin/AdminShell";
import { toast } from "sonner";
import { Loader2, AlertCircle, PlayCircle, RefreshCw } from "lucide-react";

type CronRow = {
  jobid: number;
  jobname: string;
  schedule: string;
  active: boolean;
  last_status: string | null;
  last_start: string | null;
  last_msg: string | null;
};

const card: React.CSSProperties = {
  background: "var(--ob-panel)",
  border: "1px solid var(--hair)",
  borderRadius: 12,
  padding: 20,
};
const th: React.CSSProperties = {
  textAlign: "left",
  fontSize: 11,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "var(--glass-2)",
  padding: "10px 12px",
  borderBottom: "1px solid var(--hair)",
  whiteSpace: "nowrap",
};
const td: React.CSSProperties = {
  padding: "10px 12px",
  borderBottom: "1px solid var(--hair)",
  color: "var(--glass)",
  fontSize: 13,
  verticalAlign: "top",
};

function relativeTime(iso: string | null): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  const diff = Date.now() - t;
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function statusBadge(status: string | null) {
  const s = (status || "").toLowerCase();
  let color = "#d97706"; // amber
  let bg = "rgba(217,119,6,0.12)";
  let label = status || "no runs";
  if (s === "succeeded") { color = "#16a34a"; bg = "rgba(22,163,74,0.14)"; }
  else if (s === "failed") { color = "#dc2626"; bg = "rgba(220,38,38,0.14)"; }
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [running, setRunning] = useState<Record<number, boolean>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase.rpc("admin_list_crons");
    if (error) {
      setError(error.message || "Failed to load crons");
      setRows([]);
    } else {
      const list = (data as any[] as CronRow[]) || [];
      list.sort((a, b) => {
        const af = (a.last_status || "").toLowerCase() === "failed" ? 0 : 1;
        const bf = (b.last_status || "").toLowerCase() === "failed" ? 0 : 1;
        if (af !== bf) return af - bf;
        return (a.jobname || "").localeCompare(b.jobname || "");
      });
      setRows(list);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const runNow = async (row: CronRow) => {
    setRunning((r) => ({ ...r, [row.jobid]: true }));
    try {
      const { data, error } = await supabase.rpc("admin_run_cron", { p_jobid: row.jobid });
      if (error) throw error;
      const msg = typeof data === "string" ? data : `${row.jobname} triggered`;
      toast.success(msg);
      setTimeout(() => { load(); }, 1500);
    } catch (e: any) {
      toast.error(e?.message || "Could not trigger cron");
    } finally {
      setRunning((r) => ({ ...r, [row.jobid]: false }));
    }
  };

  const total = rows.length;
  const healthy = rows.filter((r) => (r.last_status || "").toLowerCase() === "succeeded").length;
  const notHealthy = total - healthy;

  return (
    <AdminShell title="Crons" subtitle="Scheduler ops — inspect and manually trigger jobs">
      <div className="grid gap-6">
        {/* Health strip */}
        <section style={card}>
          <div className="flex items-center flex-wrap gap-6">
            <div>
              <div style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--glass-2)" }}>Total</div>
              <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 28, color: "var(--glass)", fontWeight: 500, lineHeight: 1, marginTop: 4 }}>{total}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--glass-2)" }}>Healthy</div>
              <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 28, color: "#16a34a", fontWeight: 500, lineHeight: 1, marginTop: 4 }}>{healthy}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--glass-2)" }}>Not healthy</div>
              <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 28, color: notHealthy > 0 ? "#dc2626" : "var(--glass)", fontWeight: 500, lineHeight: 1, marginTop: 4 }}>{notHealthy}</div>
            </div>
            <div style={{ marginLeft: "auto" }}>
              <button
                onClick={load}
                disabled={loading}
                className="flex items-center gap-2"
                style={{
                  padding: "8px 14px",
                  borderRadius: 8,
                  background: "var(--ob-raised)",
                  border: "1px solid var(--hair)",
                  color: "var(--glass)",
                  fontSize: 13,
                  cursor: loading ? "not-allowed" : "pointer",
                }}
              >
                <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
                Refresh
              </button>
            </div>
          </div>
        </section>

        {/* Table */}
        <section style={card}>
          {loading && (
            <div className="flex items-center gap-2" style={{ color: "var(--glass-2)", fontSize: 13 }}>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Loading crons…</span>
            </div>
          )}
          {!loading && error && (
            <div className="flex items-start gap-2" style={{ color: "#F87171", fontSize: 13 }}>
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
          {!loading && !error && rows.length === 0 && (
            <p style={{ color: "var(--glass-2)", fontSize: 13, margin: 0 }}>No cron jobs registered.</p>
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
                    <th style={th}>Status</th>
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
                        <td style={{ ...td, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 12, color: "var(--glass-2)" }}>{r.schedule}</td>
                        <td style={td}>{r.active ? "yes" : "no"}</td>
                        <td style={td} title={r.last_start || ""}>{relativeTime(r.last_start)}</td>
                        <td style={td}>{statusBadge(r.last_status)}</td>
                        <td
                          style={{ ...td, maxWidth: 320, cursor: msg ? "pointer" : "default", color: "var(--glass-2)", whiteSpace: isOpen ? "pre-wrap" : "nowrap", overflow: isOpen ? "visible" : "hidden", textOverflow: "ellipsis" }}
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
                              padding: "6px 10px",
                              borderRadius: 6,
                              background: "var(--ob-raised)",
                              border: "1px solid var(--hair)",
                              color: "var(--glass)",
                              fontSize: 12,
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
          <p style={{ marginTop: 14, fontSize: 12, color: "var(--glass-2)" }}>
            Run now fires the job immediately; its effect shows in the app. The run-history row is written only by the scheduler, so last-run may not change from a manual trigger.
          </p>
        </section>
      </div>
    </AdminShell>
  );
}