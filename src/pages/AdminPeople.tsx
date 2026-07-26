import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Download, Loader2, X, RefreshCw, Send } from "lucide-react";
import { Copy, Check } from "lucide-react";
import AdminShell from "@/components/admin/AdminShell";
import AdminLegend from "@/components/admin/AdminLegend";
import { downloadBlob } from "@/lib/download";
import { formatSmartDate } from "@/lib/formatDate";
import { AdminMetrics, freshnessLine, loadAdminMetrics, published, signedUp } from "@/lib/adminMetrics";

type Row = {
  user_id: string;
  email: string | null;
  signed_up: string | null;
  last_seen: string | null;
  first_name: string | null;
  sector_focus: string | null;
  captures: number;
  signals: number;
  posts: number;
  imprint: number | null;
  last_nudge_type: string | null;
  last_nudge_at: string | null;
};

type Stage = "Observer" | "Explorer" | "Strategist" | "Voice" | "Presence";
type Status = "activated" | "stalled" | "at-risk" | "new";

const FOUNDER_HINTS = ["mmahafzah8386@gmail.com", "mahafdhah"];

const stageOf = (imprint: number | null): Stage => {
  const s = imprint ?? 0;
  if (s >= 80) return "Presence";
  if (s >= 60) return "Voice";
  if (s >= 35) return "Strategist";
  if (s >= 15) return "Explorer";
  return "Observer";
};

const statusOf = (r: Row): Status => {
  const now = Date.now();
  const signedAgo = r.signed_up ? (now - new Date(r.signed_up).getTime()) / 86400_000 : 999;
  const seenAgo = r.last_seen ? (now - new Date(r.last_seen).getTime()) / 86400_000 : 999;
  if (signedAgo < 1) return "new";
  if (r.captures === 0) return "at-risk";
  if (r.captures <= 2 && seenAgo > 3) return "stalled";
  return "activated";
};

const STATUS_COLOR: Record<Status, string> = {
  activated: "#16a34a",
  stalled: "#d97706",
  "at-risk": "#dc2626",
  new: "#3b82f6",
};

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
  marginBottom: 6,
};
const kpiValue: React.CSSProperties = {
  fontFamily: "'Cormorant Garamond', Georgia, serif",
  fontSize: 28,
  color: "var(--glass)",
  fontWeight: 500,
  lineHeight: 1,
};
const th: React.CSSProperties = {
  textAlign: "left",
  fontSize: 11,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "var(--glass-2)",
  padding: "8px 10px",
  borderBottom: "1px solid var(--hair)",
  whiteSpace: "nowrap",
};
const td: React.CSSProperties = {
  fontSize: 13,
  color: "var(--glass)",
  padding: "8px 10px",
  borderBottom: "1px solid var(--hair)",
  whiteSpace: "nowrap",
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

const fmtDate = (iso: string | null) =>
  !iso ? "—" : new Date(iso).toISOString().slice(0, 10);

function Drilldown({
  row,
  onClose,
  onRecompute,
  onSendNudge,
}: {
  row: Row;
  onClose: () => void;
  onRecompute: (uid: string) => Promise<void>;
  onSendNudge: (uid: string, emailType: string) => Promise<void>;
}) {
  const [loading, setLoading] = useState(true);
  const [captures, setCaptures] = useState<any[]>([]);
  const [signals, setSignals] = useState<any[]>([]);
  const [posts, setPosts] = useState<any[]>([]);
  const [snaps, setSnaps] = useState<any[]>([]);
  const [nudges, setNudges] = useState<any[]>([]);
  const [actions, setActions] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [nudgeType, setNudgeType] = useState<string>("inactive");
  const [nudgeBusy, setNudgeBusy] = useState(false);

  const loadDetail = async () => {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("admin-console", {
      body: { action: "user_detail", user_id: row.user_id },
    });
    if (error) {
      toast.error(error.message || "Failed to load user detail");
      setLoading(false);
      return;
    }
    const d = (data ?? {}) as any;
    setCaptures(d.captures ?? []);
    setSignals(d.signals ?? []);
    setPosts(d.posts ?? []);
    setSnaps(d.imprint_history ?? []);
    setNudges(d.nudges ?? []);
    setActions(d.actions ?? []);
    setLoading(false);
  };

  useEffect(() => { loadDetail(); }, [row.user_id]);

  const lastNudge = nudges[0];

  return (
    <div
      role="dialog"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        zIndex: 60,
        display: "flex",
        justifyContent: "flex-end",
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(560px, 100vw)",
          height: "100vh",
          overflowY: "auto",
          background: "var(--ob-bg)",
          borderLeft: "1px solid var(--hair)",
          padding: 24,
          color: "var(--glass)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: 16 }}>
          <div>
            <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 24 }}>
              {row.first_name || row.email || row.user_id.slice(0, 8)}
            </div>
            <div style={{ fontSize: 12, color: "var(--glass-2)", marginTop: 4 }}>
              {row.email} · imprint {row.imprint ?? "—"} · {stageOf(row.imprint)}
            </div>
            <div style={{ fontSize: 12, color: "var(--glass-2)", marginTop: 4 }}>
              {lastNudge
                ? `Last nudge: ${lastNudge.email_type} · ${formatSmartDate(lastNudge.sent_at)}`
                : "No nudge sent yet"}
            </div>
          </div>
          <button style={btn} onClick={onClose} aria-label="Close"><X size={12} /></button>
        </div>
        <button
          style={{ ...btn, marginBottom: 20 }}
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await onRecompute(row.user_id);
            setBusy(false);
          }}
        >
          <RefreshCw size={12} /> {busy ? "Recomputing…" : "Recompute score"}
        </button>

        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 20, flexWrap: "wrap" }}>
          <select
            value={nudgeType}
            onChange={(e) => setNudgeType(e.target.value)}
            disabled={nudgeBusy}
            style={{
              background: "transparent",
              color: "var(--glass)",
              border: "1px solid var(--hair)",
              borderRadius: 4,
              padding: "6px 10px",
              fontSize: 12,
            }}
          >
            <option value="inactive">Re-engagement (inactive)</option>
            <option value="day1">Day 1</option>
            <option value="day3">Day 3</option>
            <option value="day7">Day 7</option>
          </select>
          <button
            style={btn}
            disabled={nudgeBusy}
            onClick={async () => {
              setNudgeBusy(true);
              await onSendNudge(row.user_id, nudgeType);
              await loadDetail();
              setNudgeBusy(false);
            }}
          >
            <Send size={12} /> {nudgeBusy ? "Sending…" : "Send nudge"}
          </button>
        </div>

        {loading ? (
          <div style={{ color: "var(--glass-2)" }}><Loader2 className="animate-spin inline w-4 h-4" /> Loading…</div>
        ) : (
          <>
            <Section title={`Recent captures (${captures.length})`}>
              {captures.map((c) => (
                <li key={c.id}>{c.title || (c.snippet ? c.snippet.slice(0, 60) : "(untitled)")} <span style={{ color: "var(--glass-2)" }}>· {fmtDate(c.created_at)}</span></li>
              ))}
            </Section>
            <Section title={`Recent signals (${signals.length})`}>
              {signals.map((s) => (
                <li key={s.id}>{s.signal_title || "(untitled)"} <span style={{ color: "var(--glass-2)" }}>· conf {typeof s.confidence === "number" ? s.confidence.toFixed(2) : "—"} · {fmtDate(s.created_at)}</span></li>
              ))}
            </Section>
            <Section title={`Recent posts (${posts.length})`}>
              {posts.map((p) => (
                <li key={p.id}>{(p.snippet || "").slice(0, 90) || "(empty)"} <span style={{ color: "var(--glass-2)" }}>· {p.source_type} / {p.tracking_status} · {fmtDate(p.created_at)}</span></li>
              ))}
            </Section>
            <Section title={`Imprint history (${snaps.length})`}>
              {snaps.map((s, i) => (
                <li key={i}>{Math.round(s.score)}{s.tier ? ` · ${s.tier}` : ""} <span style={{ color: "var(--glass-2)" }}>· {fmtDate(s.created_at)}</span></li>
              ))}
            </Section>
            <Section title={`Nudge history (${nudges.length})`}>
              {nudges.map((n, i) => (
                <li key={i}>{n.email_type} <span style={{ color: "var(--glass-2)" }}>· {fmtDate(n.sent_at)}</span></li>
              ))}
            </Section>
            <Section title={`Recent actions (${actions.length})`}>
              {actions.map((a, i) => (
                <li key={i}>{a.task || a.action} → {a.result || "—"} <span style={{ color: "var(--glass-2)" }}>· {fmtDate(a.created_at)}</span></li>
              ))}
            </Section>
          </>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ ...kpiLabel, marginBottom: 8 }}>{title}</div>
      <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.7 }}>
        {children}
        {(children as any)?.length === 0 && <li style={{ color: "var(--glass-2)", listStyle: "none", marginLeft: -18 }}>None yet.</li>}
      </ul>
    </div>
  );
}

export default function AdminPeople() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [hideTest, setHideTest] = useState(true);
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);
  const [selected, setSelected] = useState<Row | null>(null);
  const [copiedUid, setCopiedUid] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase.functions.invoke("admin-console", {
      body: { action: "list_users" },
    });
    if (error) {
      setError(error.message || "Failed to load");
      setLoading(false);
      return;
    }
    setRows(((data as any)?.rows ?? []) as Row[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const arr = hideTest
      ? rows.filter((r) => {
          const e = (r.email || "").toLowerCase();
          if (!e) return true;
          if (e.includes("test")) return false;
          if (FOUNDER_HINTS.some((h) => e.includes(h))) return false;
          return true;
        })
      : rows.slice();
    arr.sort((a, b) => (b.signed_up || "").localeCompare(a.signed_up || ""));
    return arr;
  }, [rows, hideTest]);

  // Inactive (48h+): excludes test + founder; uses last_seen null OR > 48h.
  const inactive48 = useMemo(() => {
    const cutoff = Date.now() - 48 * 60 * 60 * 1000;
    return rows.filter((r) => {
      const e = (r.email || "").toLowerCase();
      if (FOUNDER_HINTS.some((h) => e.includes(h))) return false;
      if (e.includes("+test") || e.includes("test@")) return false;
      if (!r.last_seen) return true;
      return new Date(r.last_seen).getTime() < cutoff;
    });
  }, [rows]);

  const relativeSeen = (iso: string | null) => {
    if (!iso) return "never signed in";
    const diff = Date.now() - new Date(iso).getTime();
    const h = Math.floor(diff / 3600_000);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    return `${d}d ago`;
  };

  const copyWhatsApp = async (r: Row) => {
    const name = r.first_name || (r.email ? r.email.split("@")[0] : "");
    // Professional MSA (contemporary register, not dialect)
    const msg = `مرحباً${name ? ` ${name}` : ""}،\nلاحظتُ أنك لم تدخل إلى أورا منذ فترة. أردتُ الاطمئنان عليك — هل كل شيء على ما يُرام؟ يسعدني مساعدتك في أي وقت.`;
    try {
      await navigator.clipboard.writeText(msg);
      setCopiedUid(r.user_id);
      toast.success("Copied — send via WhatsApp");
      setTimeout(() => setCopiedUid((prev) => (prev === r.user_id ? null : prev)), 2000);
    } catch {
      toast.error("Copy failed");
    }
  };

  const totals = useMemo(() => {
    const t = { total: filtered.length, activated: 0, stalled: 0, atRisk: 0, newWeek: 0 };
    const weekAgo = Date.now() - 7 * 86400_000;
    for (const r of filtered) {
      const st = statusOf(r);
      if (st === "activated") t.activated += 1;
      if (st === "stalled") t.stalled += 1;
      if (st === "at-risk") t.atRisk += 1;
      if (r.signed_up && new Date(r.signed_up).getTime() >= weekAgo) t.newWeek += 1;
    }
    return t;
  }, [filtered]);

  const exportCsv = () => {
    const header = ["email","first_name","sector_focus","signed_up","last_seen","captures","signals","posts","imprint","stage","status"];
    const esc = (v: any) => {
      const s = v == null ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [header.join(",")];
    for (const r of filtered) {
      lines.push([
        r.email, r.first_name, r.sector_focus, r.signed_up, r.last_seen,
        r.captures, r.signals, r.posts, r.imprint,
        stageOf(r.imprint), statusOf(r),
      ].map(esc).join(","));
    }
    downloadBlob(new Blob([lines.join("\n")], { type: "text/csv" }), `people-${new Date().toISOString().slice(0,10)}.csv`);
  };

  const recompute = async (uid: string) => {
    const { data, error } = await supabase.functions.invoke("admin-console", {
      body: { action: "run_for_user", task: "recompute_score", user_id: uid },
    });
    if (error) { toast.error("Recompute failed"); return; }
    const res: any = (data as any)?.result ?? {};
    const score = res.score ?? res.imprint ?? res.total ?? res.aura_score;
    if (typeof score === "number") {
      toast.success(`New imprint: ${Math.round(score)}`);
      // Update row locally
      setRows((prev) => prev.map((r) => r.user_id === uid ? { ...r, imprint: Math.round(score) } : r));
    } else {
      toast.success("Score recomputed");
    }
  };

  const sendNudge = async (uid: string, emailType: string) => {
    const { data, error } = await supabase.functions.invoke("admin-console", {
      body: { action: "run_for_user", task: "send_nudge", user_id: uid, email_type: emailType },
    });
    if (error) { toast.error(`Failed: ${error.message || "invoke error"}`); return; }
    const payload = (data ?? {}) as any;
    const status = payload.status as "sent" | "skipped" | "error" | undefined;
    if (status === "sent") {
      toast.success("Nudge sent ✓");
    } else if (status === "skipped") {
      toast.message(`Already sent — skipped (${payload.reason ?? "already_sent"})`);
    } else {
      toast.error(`Failed: ${payload.message ?? payload.error ?? "unknown"}`);
    }
    // Refresh row's last_nudge in the table
    setRows((prev) => prev.map((r) => {
      if (r.user_id !== uid) return r;
      if (status === "sent") {
        return { ...r, last_nudge_type: emailType, last_nudge_at: new Date().toISOString() };
      }
      return r;
    }));
  };

  return (
    <AdminShell title="People" subtitle="User journeys, activation, and imprint health">
      <div style={{ display: "flex", gap: 12, marginBottom: 20, alignItems: "center", flexWrap: "wrap" }}>
        <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, color: "var(--glass-2)" }}>
          <input type="checkbox" checked={hideTest} onChange={(e) => setHideTest(e.target.checked)} />
          Hide test + founder accounts
        </label>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button style={btn} onClick={load} disabled={loading}>
            <RefreshCw size={12} /> Refresh
          </button>
          <button style={btn} onClick={exportCsv} disabled={loading || filtered.length === 0}>
            <Download size={12} /> Export CSV
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ ...card, textAlign: "center", padding: 48, color: "var(--glass-2)" }}>
          <Loader2 className="w-4 h-4 animate-spin inline mr-2" /> Loading people…
        </div>
      ) : error ? (
        <div style={{ ...card, textAlign: "center", padding: 32, color: "#fca5a5" }}>
          {error}
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ ...card, textAlign: "center", padding: 48, color: "var(--glass-2)" }}>
          No users match this view.
        </div>
      ) : (
        <>
          {inactive48.length > 0 && (
            <div
              style={{
                ...card,
                marginBottom: 20,
                borderLeft: "4px solid #F97316",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: "var(--glass-1)", textTransform: "uppercase", letterSpacing: 0.6 }}>
                  Inactive (48h+)
                </span>
                <span style={{ fontSize: 12, padding: "2px 8px", borderRadius: 999, background: "rgba(249,115,22,0.15)", color: "#F97316", border: "1px solid rgba(249,115,22,0.3)" }}>
                  {inactive48.length}
                </span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {inactive48.map((r) => {
                  const name = r.first_name || r.email || r.user_id;
                  const isCopied = copiedUid === r.user_id;
                  return (
                    <div
                      key={r.user_id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 12,
                        padding: "8px 10px",
                        borderRadius: 6,
                        border: "1px solid var(--hair)",
                        background: "var(--ob-panel)",
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13, color: "var(--glass-1)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {name}
                        </div>
                        <div style={{ fontSize: 11, color: "var(--glass-2)" }}>
                          Last seen {relativeSeen(r.last_seen)}
                        </div>
                      </div>
                      <button
                        onClick={() => copyWhatsApp(r)}
                        style={{ ...btn, whiteSpace: "nowrap" }}
                      >
                        {isCopied ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Copy WhatsApp</>}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div style={{ marginBottom: 16 }}>
            <AdminLegend
              title="What these statuses mean"
              items={[
                { color: STATUS_COLOR.new, label: "New", text: "signed up in the last 24h" },
                { color: STATUS_COLOR["at-risk"], label: "At-risk", text: "zero captures yet" },
                { color: STATUS_COLOR.stalled, label: "Stalled", text: "2 or fewer captures and not seen for 3+ days" },
                { color: STATUS_COLOR.activated, label: "Activated", text: "capturing regularly" },
              ]}
            />
          </div>
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
            gap: 12,
            marginBottom: 24,
          }}>
            <div style={card}><div style={kpiLabel}>Total</div><div style={kpiValue}>{totals.total}</div></div>
            <div style={card}><div style={kpiLabel}>Activated</div><div style={{ ...kpiValue, color: STATUS_COLOR.activated }}>{totals.activated}</div></div>
            <div style={card}><div style={kpiLabel}>Stalled</div><div style={{ ...kpiValue, color: STATUS_COLOR.stalled }}>{totals.stalled}</div></div>
            <div style={card}><div style={kpiLabel}>At-risk</div><div style={{ ...kpiValue, color: STATUS_COLOR["at-risk"] }}>{totals.atRisk}</div></div>
            <div style={card}><div style={kpiLabel}>New this week</div><div style={{ ...kpiValue, color: STATUS_COLOR.new }}>{totals.newWeek}</div></div>
          </div>

          <div style={{ ...card, padding: 0, overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
              <thead>
                <tr>
                  <th style={th}>Name / email</th>
                  <th style={th}>Signed up</th>
                  <th style={th}>Last seen</th>
                  <th style={th}>Captures</th>
                  <th style={th}>Signals</th>
                  <th style={th}>Posts</th>
                  <th style={th}>Imprint</th>
                  <th style={th}>Stage</th>
                  <th style={th}>Last nudge</th>
                  <th style={th}>Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const st = statusOf(r);
                  return (
                    <tr
                      key={r.user_id}
                      onClick={() => setSelected(r)}
                      style={{ cursor: "pointer" }}
                    >
                      <td style={td}>
                        <div>{r.first_name || "—"}</div>
                        <div style={{ fontSize: 11, color: "var(--glass-2)" }}>{r.email}</div>
                      </td>
                      <td style={td}>{fmtDate(r.signed_up)}</td>
                      <td style={td}>{fmtDate(r.last_seen)}</td>
                      <td style={td}>{r.captures}</td>
                      <td style={td}>{r.signals}</td>
                      <td style={td}>{r.posts}</td>
                      <td style={td}>{r.imprint ?? "—"}</td>
                      <td style={td}>{stageOf(r.imprint)}</td>
                      <td style={td}>
                        {r.last_nudge_at
                          ? <span>{r.last_nudge_type} <span style={{ color: "var(--glass-2)" }}>· {formatSmartDate(r.last_nudge_at)}</span></span>
                          : "—"}
                      </td>
                      <td style={td}>
                        <span style={{
                          background: STATUS_COLOR[st],
                          color: "white",
                          fontSize: 11,
                          fontWeight: 600,
                          padding: "3px 8px",
                          borderRadius: 4,
                        }}>{st}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {selected && (
        <Drilldown row={selected} onClose={() => setSelected(null)} onRecompute={recompute} onSendNudge={sendNudge} />
      )}
    </AdminShell>
  );
}