import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, RefreshCw, Send, ChevronDown, ChevronRight } from "lucide-react";
import AdminShell from "@/components/admin/AdminShell";

type Stage = {
  key: string;
  label: string;
  count: number;
  pct_of_total: number;
  drop_from_prev_pct: number;
};
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
  stages: Stage[];
  stuck: Record<string, StuckUser[]>;
  flags: {
    churn_risk: Array<{ user_id: string; name_or_email: string; stage: string; days_inactive: number }>;
    near_win: Array<{ user_id: string; name_or_email: string; score: number; target: number }>;
  };
};

const ACCENT = "#dc2626";
const RISK_COLOR: Record<string, string> = { high: "#dc2626", med: "#d97706", low: "#16a34a" };

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
  const [data, setData] = useState<Payload | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const load = async () => {
    setLoading(true); setError(null);
    const { data: res, error } = await supabase.functions.invoke("admin-console", {
      body: { action: "journey" },
    });
    if (error) {
      setError(error.message || "Failed to load");
      setLoading(false);
      return;
    }
    setData(res as Payload);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const maxDropKey = useMemo(() => {
    if (!data) return null;
    let best: { key: string; drop: number } | null = null;
    for (let i = 1; i < data.stages.length; i++) {
      const s = data.stages[i];
      if (!best || s.drop_from_prev_pct > best.drop) best = { key: s.key, drop: s.drop_from_prev_pct };
    }
    return best && best.drop > 0 ? best.key : null;
  }, [data]);

  const maxCount = useMemo(() => {
    if (!data) return 1;
    return Math.max(1, ...data.stages.map((s) => s.count));
  }, [data]);

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
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 20 }}>
        <button style={btn} onClick={load} disabled={loading}>
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      {loading ? (
        <div style={{ ...card, textAlign: "center", padding: 48, color: "var(--glass-2)" }}>
          <Loader2 className="w-4 h-4 animate-spin inline mr-2" /> Loading journey…
        </div>
      ) : error ? (
        <div style={{ ...card, textAlign: "center", padding: 32, color: "#fca5a5" }}>{error}</div>
      ) : !data ? (
        <div style={{ ...card, textAlign: "center", padding: 48, color: "var(--glass-2)" }}>No data.</div>
      ) : (
        <>
          {/* Funnel */}
          <div style={{ ...card, marginBottom: 24 }}>
            <div style={{ ...kpiLabel, marginBottom: 16 }}>Journey funnel</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {data.stages.map((s, i) => {
                const width = `${Math.max(4, (s.count / maxCount) * 100)}%`;
                const isLeak = s.key === maxDropKey;
                return (
                  <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ width: 140, fontSize: 13, color: "var(--glass)" }}>{s.label}</div>
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
                        {s.count} · {s.pct_of_total}%
                      </div>
                    </div>
                    <div style={{ width: 96, fontSize: 12, color: isLeak ? ACCENT : "var(--glass-2)", textAlign: "right", fontWeight: isLeak ? 600 : 400 }}>
                      {i === 0 ? "—" : `−${s.drop_from_prev_pct}%`}
                    </div>
                  </div>
                );
              })}
            </div>
            {maxDropKey && (
              <div style={{ marginTop: 16, fontSize: 12, color: "var(--glass-2)" }}>
                <span style={{ color: ACCENT, fontWeight: 600 }}>Priority leak:</span>{" "}
                {data.stages.find((s) => s.key === maxDropKey)?.label}
              </div>
            )}
          </div>

          {/* Predictive strip */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 24 }}>
            <div style={card}>
              <div style={{ ...kpiLabel, marginBottom: 8 }}>About to go silent ({data.flags.churn_risk.length})</div>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.7, color: "var(--glass)" }}>
                {data.flags.churn_risk.length === 0 && <li style={{ color: "var(--glass-2)", listStyle: "none", marginLeft: -18 }}>None.</li>}
                {data.flags.churn_risk.map((u) => (
                  <li key={u.user_id}>
                    {u.name_or_email} <span style={{ color: "var(--glass-2)" }}>· {u.stage} · {u.days_inactive}d inactive</span>
                  </li>
                ))}
              </ul>
            </div>
            <div style={card}>
              <div style={{ ...kpiLabel, marginBottom: 8 }}>Near a tier jump ({data.flags.near_win.length})</div>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.7, color: "var(--glass)" }}>
                {data.flags.near_win.length === 0 && <li style={{ color: "var(--glass-2)", listStyle: "none", marginLeft: -18 }}>None.</li>}
                {data.flags.near_win.map((u) => (
                  <li key={u.user_id}>
                    {u.name_or_email} <span style={{ color: "var(--glass-2)" }}>· {u.score} → {u.target}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Accordion */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {data.stages.map((s) => {
              const stuck = data.stuck[s.key] ?? [];
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
                    <span style={{ fontSize: 14, fontWeight: 500 }}>{s.label}</span>
                    <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--glass-2)" }}>
                      {stuck.length} stuck
                    </span>
                  </button>
                  {isOpen && (
                    <div style={{ marginTop: 14 }}>
                      {stuck.length === 0 ? (
                        <div style={{ fontSize: 13, color: "var(--glass-2)" }}>No one stuck at this stage.</div>
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