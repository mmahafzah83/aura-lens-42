import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, RefreshCw, Send, ChevronDown, ChevronRight } from "lucide-react";
import AdminShell from "@/components/admin/AdminShell";
import {
  AdminMetrics,
  FUNNEL_ORDER,
  METRIC_DEFINITIONS,
  MetricKey,
  exclusionLine,
  freshnessLine,
  loadAdminMetrics,
  metricValue,
} from "@/lib/adminMetrics";

type StuckUser = {
  user_id: string;
  name_or_email: string;
  days_since_signup: number;
  last_seen: string | null;
  risk: "high" | "med" | "low";
  recommendation: string;
  suggested_nudge: "day1" | "day3" | "day7" | "first_signal" | "inactive" | null;
};
type Payload = {
  stages: { key: string; label: string }[];
  stuck: Record<string, StuckUser[]>;
  flags: {
    churn_risk: Array<{ user_id: string; name_or_email: string; stage: string; days_inactive: number }>;
    near_win: Array<{ user_id: string; name_or_email: string; score: number; target: number }>;
  };
};

/** Oxblood — the only accent this page uses. */
const ACCENT = "#6E2A26";
const RISK_COLOR: Record<string, string> = { high: "#6E2A26", med: "#d97706", low: "#16a34a" };

const card: React.CSSProperties = {
  background: "var(--ob-panel)",
  border: "1px solid var(--hair)",
  borderRadius: 8,
  padding: 16,
};
const kpiLabel: React.CSSProperties = {
  fontSize: 11,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "var(--glass-2)",
};
const btn: React.CSSProperties = {
  background: "transparent",
  color: "var(--glass)",
  border: "1px solid var(--hair)",
  borderRadius: 4,
  padding: "6px 12px",
  fontSize: 12,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
};

export default function AdminJourney() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);
  const [data, setData] = useState<Payload | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const load = async () => {
    setLoading(true); setError(null);
    try {
      // Funnel numbers: the one brain. Lists and actions: the journey helper.
      const [m, res] = await Promise.all([
        loadAdminMetrics(),
        supabase.functions.invoke("admin-console", { body: { action: "journey" } }),
      ]);
      setMetrics(m);
      if (res.error) throw new Error(res.error.message || "Failed to load journey lists");
      setData(res.data as Payload);
    } catch (e: any) {
      setError(e?.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  /** Funnel rows, derived only from the stored brief. */
  const stages = useMemo(() => {
    if (!metrics) return [] as {
      key: MetricKey; label: string; count: number | null; pct: number | null; drop: number | null;
    }[];
    const total = metricValue(metrics, "invited");
    return FUNNEL_ORDER.map((s, i) => {
      const count = metricValue(metrics, s.key);
      const prev = i === 0 ? null : metricValue(metrics, FUNNEL_ORDER[i - 1].key);
      const pct = total && total > 0 && count !== null ? Math.round((count / total) * 100) : null;
      const drop =
        i === 0 || prev === null || prev === 0 || count === null
          ? null
          : Math.round(((prev - count) / prev) * 100);
      return { key: s.key, label: s.label, count, pct, drop };
    });
  }, [metrics]);

  const maxDropKey = useMemo(() => {
    let best: { key: string; drop: number } | null = null;
    for (const s of stages) {
      if (s.drop !== null && (!best || s.drop > best.drop)) best = { key: s.key, drop: s.drop };
    }
    return best && best.drop > 0 ? best.key : null;
  }, [stages]);

  const maxCount = useMemo(
    () => Math.max(1, ...stages.map((s) => s.count ?? 0)),
    [stages],
  );

  const sendNudge = async (uid: string, email_type: "day1" | "day3" | "day7" | "first_signal" | "inactive") => {
    const { data: res, error } = await supabase.functions.invoke("admin-console", {
      body: { action: "run_for_user", task: "send_nudge", user_id: uid, email_type },
    });
    if (error) { toast.error(error.message || "Nudge failed"); return; }
    const payload = res as any;
    if (payload && payload.ok === false) {
      toast.error(String(payload?.result?.error || payload?.error || "Nudge failed"));
      return;
    }
    toast.success("Nudge sent");
  };

  const recompute = async (uid: string) => {
    const { error } = await supabase.functions.invoke("admin-console", {
      body: { action: "run_for_user", task: "recompute_score", user_id: uid },
    });
    if (error) { toast.error("Recompute failed"); return; }
    toast.success("Score recomputed");
  };

  return (
    <AdminShell title="Journey" subtitle="Full-funnel engine — where users stall, and what to do next">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <div style={{ fontSize: 12, color: "var(--glass-2)" }}>
          {metrics ? (
            <>
              {freshnessLine(metrics)} · {exclusionLine(metrics)}
            </>
          ) : (
            "—"
          )}
        </div>
        <button style={btn} onClick={load} disabled={loading}>
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      {loading ? (
        <div style={{ ...card, textAlign: "center", padding: 48, color: "var(--glass-2)" }}>
          <Loader2 className="w-4 h-4 animate-spin inline mr-2" /> Loading journey…
        </div>
      ) : error ? (
        <div style={{ ...card, textAlign: "center", padding: 32, color: ACCENT }}>{error}</div>
      ) : !metrics ? (
        <div style={{ ...card, textAlign: "center", padding: 48, color: "var(--glass-2)" }}>No data.</div>
      ) : (
        <>
          {/* Funnel — read straight from today's brief */}
          <div style={{ ...card, marginBottom: 24 }}>
            <div style={{ ...kpiLabel, marginBottom: 16 }}>Journey funnel</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {stages.map((s, i) => {
                const width = `${Math.max(4, ((s.count ?? 0) / maxCount) * 100)}%`;
                const isLeak = s.key === maxDropKey;
                return (
                  <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ width: 140, fontSize: 13, color: "var(--glass)" }} title={METRIC_DEFINITIONS[s.key]}>
                      {s.label}
                    </div>
                    <div style={{ flex: 1, height: 32, background: "rgba(255,255,255,0.03)", borderRadius: 4, position: "relative", overflow: "hidden" }}>
                      <div
                        style={{
                          width,
                          height: "100%",
                          background: isLeak ? ACCENT : "var(--hair)",
                          borderLeft: isLeak ? `3px solid ${ACCENT}` : "3px solid var(--glass-2)",
                          transition: "width .4s ease",
                          display: "flex",
                          alignItems: "center",
                          paddingLeft: 12,
                          fontSize: 12,
                          color: isLeak ? "#fff" : "var(--glass)",
                          fontWeight: 600,
                        }}
                      >
                        {s.count ?? "?"}{s.pct !== null ? ` · ${s.pct}%` : ""}
                      </div>
                    </div>
                    <div style={{ width: 96, fontSize: 12, color: isLeak ? ACCENT : "var(--glass-2)", textAlign: "right", fontWeight: isLeak ? 600 : 400 }}>
                      {i === 0 || s.drop === null ? "—" : `−${s.drop}%`}
                    </div>
                  </div>
                );
              })}
            </div>
            {maxDropKey && (
              <div style={{ marginTop: 16, fontSize: 12, color: "var(--glass-2)" }}>
                <span style={{ color: ACCENT, fontWeight: 600 }}>Priority leak:</span>{" "}
                {stages.find((s) => s.key === maxDropKey)?.label}
              </div>
            )}
          </div>

          {/* Predictive strip — lists, deliberately shown without a headline number */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 24 }}>
            <div style={card}>
              <div style={{ ...kpiLabel, marginBottom: 8 }}>About to go silent</div>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.7, color: "var(--glass)" }}>
                {(data?.flags?.churn_risk ?? []).map((u) => (
                  <li key={u.user_id}>
                    {u.name_or_email} <span style={{ color: "var(--glass-2)" }}>· {u.stage} · {u.days_inactive}d inactive</span>
                  </li>
                ))}
                {!(data?.flags?.churn_risk ?? [])[0] && (
                  <li style={{ color: "var(--glass-2)", listStyle: "none", marginLeft: -18 }}>None.</li>
                )}
              </ul>
            </div>
            <div style={card}>
              <div style={{ ...kpiLabel, marginBottom: 8 }}>Near a tier jump</div>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.7, color: "var(--glass)" }}>
                {(data?.flags?.near_win ?? []).map((u) => (
                  <li key={u.user_id}>
                    {u.name_or_email} <span style={{ color: "var(--glass-2)" }}>· {u.score} → {u.target}</span>
                  </li>
                ))}
                {!(data?.flags?.near_win ?? [])[0] && (
                  <li style={{ color: "var(--glass-2)", listStyle: "none", marginLeft: -18 }}>None.</li>
                )}
              </ul>
            </div>
          </div>

          {/* Accordion — stage counts from the brief, people lists from the helper */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {stages.map((s) => {
              const stuck = data?.stuck?.[s.key] ?? [];
              const isOpen = !!open[s.key];
              return (
                <div key={s.key} style={card}>
                  <button
                    onClick={() => setOpen((o) => ({ ...o, [s.key]: !o[s.key] }))}
                    style={{
                      width: "100%", background: "transparent", border: "none", color: "var(--glass)",
                      display: "flex", alignItems: "center", gap: 10, cursor: "pointer", padding: 0,
                    }}
                  >
                    {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{s.label}</span>
                    <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--glass-2)" }}>
                      {s.count ?? "?"} reached this step
                    </span>
                  </button>
                  {isOpen && (
                    <div style={{ marginTop: 12 }}>
                      <div style={{ fontSize: 11, color: "var(--glass-2)", marginBottom: 8 }}>
                        {METRIC_DEFINITIONS[s.key]}
                      </div>
                      {!stuck[0] ? (
                        <div style={{ fontSize: 13, color: "var(--glass-2)" }}>Nobody is stuck here.</div>
                      ) : (
                        <div style={{ overflowX: "auto" }}>
                          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
                            <thead>
                              <tr>
                                {["Name / email", "Signed up", "Risk", "Recommendation", "Actions"].map((h) => (
                                  <th key={h} style={{
                                    textAlign: "left", fontSize: 11, letterSpacing: "0.06em",
                                    textTransform: "uppercase", color: "var(--glass-2)",
                                    padding: "8px 10px", borderBottom: "1px solid var(--hair)",
                                  }}>{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {stuck.map((u) => (
                                <tr key={u.user_id}>
                                  <td style={cellStyle}>{u.name_or_email}</td>
                                  <td style={cellStyle}>{u.days_since_signup}d ago</td>
                                  <td style={cellStyle}>
                                    <span style={{
                                      background: RISK_COLOR[u.risk], color: "#fff", fontSize: 11,
                                      fontWeight: 600, padding: "3px 8px", borderRadius: 4,
                                    }}>{u.risk}</span>
                                  </td>
                                  <td style={{ ...cellStyle, whiteSpace: "normal", maxWidth: 380 }}>
                                    {u.recommendation}
                                  </td>
                                  <td style={cellStyle}>
                                    <div style={{ display: "flex", gap: 6 }}>
                                      {u.suggested_nudge && (
                                        <button style={btn} onClick={() => sendNudge(u.user_id, u.suggested_nudge as "day1" | "day3" | "day7" | "first_signal" | "inactive")}>
                                          <Send size={12} /> Send nudge
                                        </button>
                                      )}
                                      <button style={btn} onClick={() => recompute(u.user_id)}>
                                        <RefreshCw size={12} /> Recompute
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </AdminShell>
  );
}

const cellStyle: React.CSSProperties = {
  fontSize: 13,
  color: "var(--glass)",
  padding: "8px 10px",
  borderBottom: "1px solid var(--hair)",
  whiteSpace: "nowrap",
  verticalAlign: "top",
};
