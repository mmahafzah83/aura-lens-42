import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Download, Loader2 } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import AdminShell from "@/components/admin/AdminShell";
import { downloadBlob } from "@/lib/download";

type UsageRow = {
  id: string;
  created_at: string;
  user_id: string | null;
  function_name: string;
  provider: string;
  model: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  total_tokens: number | null;
  est_cost_usd: number | string | null;
  success: boolean | null;
};

const money = (n: number) =>
  n >= 100 ? `$${n.toFixed(0)}` : `$${n.toFixed(2)}`;
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

const card: React.CSSProperties = {
  background: "var(--ob-panel)",
  border: "1px solid var(--hair)",
  borderRadius: 8,
  padding: 20,
};
const h2: React.CSSProperties = {
  fontFamily: "'Cormorant Garamond', Georgia, serif",
  fontSize: 22,
  color: "var(--glass)",
  margin: "0 0 12px 0",
  fontWeight: 500,
};
const kpiLabel: React.CSSProperties = {
  fontSize: 11,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "var(--glass-2)",
  marginBottom: 8,
};
const kpiValue: React.CSSProperties = {
  fontFamily: "'Cormorant Garamond', Georgia, serif",
  fontSize: 32,
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
};
const td: React.CSSProperties = {
  fontSize: 13,
  color: "var(--glass)",
  padding: "8px 10px",
  borderBottom: "1px solid var(--hair)",
};

function BudgetBar({ spend, budget }: { spend: number; budget: number }) {
  const ratio = budget > 0 ? spend / budget : 0;
  const color = ratio > 1 ? "#dc2626" : ratio > 0.7 ? "#d97706" : "#16a34a";
  return (
    <div style={{ marginTop: 12 }}>
      <div
        style={{
          height: 6,
          background: "var(--hair)",
          borderRadius: 3,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${Math.min(100, ratio * 100)}%`,
            background: color,
            transition: "width .3s ease",
          }}
        />
      </div>
      <div style={{ marginTop: 6, fontSize: 11, color: "var(--glass-2)" }}>
        {(ratio * 100).toFixed(0)}% of {money(budget)} budget
      </div>
    </div>
  );
}

export default function AdminCost() {
  const [loading, setLoading] = useState(true);
  const [rows30, setRows30] = useState<UsageRow[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [budget, setBudget] = useState<number>(150);
  const [budgetInput, setBudgetInput] = useState<string>("150");
  const [savingBudget, setSavingBudget] = useState(false);

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const dayOfMonth = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const thirtyAgo = new Date(now.getTime() - 30 * 86400_000);
  const sevenAgo = new Date(now.getTime() - 7 * 86400_000);
  const fourteenAgo = new Date(now.getTime() - 14 * 86400_000);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [usageRes, budgetRes] = await Promise.all([
        supabase
          .from("ai_usage_log")
          .select("id, created_at, user_id, function_name, provider, model, input_tokens, output_tokens, total_tokens, est_cost_usd, success")
          .gte("created_at", thirtyAgo.toISOString())
          .order("created_at", { ascending: false })
          .limit(50000),
        supabase
          .from("admin_settings")
          .select("value")
          .eq("key", "monthly_ai_budget_usd")
          .maybeSingle(),
      ]);
      if (usageRes.error) {
        console.error(usageRes.error);
        toast.error("Failed to load usage data");
      }
      const usage = (usageRes.data ?? []) as UsageRow[];
      setRows30(usage);

      const amt = (budgetRes.data as any)?.value?.amount;
      if (typeof amt === "number") {
        setBudget(amt);
        setBudgetInput(String(amt));
      }

      const userIds = Array.from(
        new Set(usage.map((r) => r.user_id).filter((x): x is string => !!x))
      );
      if (userIds.length) {
        const { data: profiles } = await supabase
          .from("diagnostic_profiles")
          .select("user_id, first_name")
          .in("user_id", userIds);
        const map: Record<string, string> = {};
        (profiles ?? []).forEach((p: any) => {
          if (p.first_name) map[p.user_id] = p.first_name;
        });
        setNames(map);
      }
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const nameOf = (uid: string | null) =>
    !uid ? "—" : names[uid] || uid.slice(0, 8);

  const rowsMonth = useMemo(
    () => rows30.filter((r) => new Date(r.created_at) >= monthStart),
    [rows30, monthStart]
  );

  const num = (v: any) => (typeof v === "string" ? parseFloat(v) : v) || 0;

  const spendMonth = useMemo(
    () => rowsMonth.reduce((s, r) => s + num(r.est_cost_usd), 0),
    [rowsMonth]
  );
  const callsMonth = rowsMonth.length;
  const successMonth = rowsMonth.filter((r) => r.success !== false).length;
  const successRate = callsMonth ? successMonth / callsMonth : 1;
  const tokensMonth = rowsMonth.reduce(
    (s, r) => s + (r.input_tokens || 0) + (r.output_tokens || 0),
    0
  );
  const activeUsers = new Set(
    rowsMonth.map((r) => r.user_id).filter(Boolean)
  ).size;
  const perUser = activeUsers ? spendMonth / activeUsers : 0;
  const projected = dayOfMonth > 0 ? (spendMonth / dayOfMonth) * daysInMonth : 0;

  // By provider
  const byProvider = useMemo(() => {
    const m = new Map<string, { spend: number; calls: number; tokens: number }>();
    for (const r of rowsMonth) {
      const k = r.provider || "unknown";
      const cur = m.get(k) || { spend: 0, calls: 0, tokens: 0 };
      cur.spend += num(r.est_cost_usd);
      cur.calls += 1;
      cur.tokens += (r.input_tokens || 0) + (r.output_tokens || 0);
      m.set(k, cur);
    }
    return Array.from(m.entries()).sort((a, b) => b[1].spend - a[1].spend);
  }, [rowsMonth]);

  const byFunction = useMemo(() => {
    const m = new Map<string, { spend: number; calls: number; tokens: number }>();
    for (const r of rowsMonth) {
      const k = r.function_name || "unknown";
      const cur = m.get(k) || { spend: 0, calls: 0, tokens: 0 };
      cur.spend += num(r.est_cost_usd);
      cur.calls += 1;
      cur.tokens += (r.input_tokens || 0) + (r.output_tokens || 0);
      m.set(k, cur);
    }
    return Array.from(m.entries()).sort((a, b) => b[1].spend - a[1].spend);
  }, [rowsMonth]);

  const byModel = useMemo(() => {
    const m = new Map<string, { spend: number; calls: number; tokens: number }>();
    for (const r of rowsMonth) {
      const k = r.model || "—";
      const cur = m.get(k) || { spend: 0, calls: 0, tokens: 0 };
      cur.spend += num(r.est_cost_usd);
      cur.calls += 1;
      cur.tokens += (r.input_tokens || 0) + (r.output_tokens || 0);
      m.set(k, cur);
    }
    return Array.from(m.entries()).sort((a, b) => b[1].spend - a[1].spend);
  }, [rowsMonth]);

  const byUser = useMemo(() => {
    const m = new Map<string, { spend: number; calls: number; tokens: number }>();
    for (const r of rowsMonth) {
      const k = r.user_id || "anonymous";
      const cur = m.get(k) || { spend: 0, calls: 0, tokens: 0 };
      cur.spend += num(r.est_cost_usd);
      cur.calls += 1;
      cur.tokens += (r.input_tokens || 0) + (r.output_tokens || 0);
      m.set(k, cur);
    }
    return Array.from(m.entries())
      .sort((a, b) => b[1].spend - a[1].spend)
      .slice(0, 10);
  }, [rowsMonth]);

  const daily = useMemo(() => {
    const m = new Map<string, number>();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 86400_000);
      const k = d.toISOString().slice(0, 10);
      m.set(k, 0);
    }
    for (const r of rows30) {
      const k = r.created_at.slice(0, 10);
      if (m.has(k)) m.set(k, (m.get(k) || 0) + num(r.est_cost_usd));
    }
    return Array.from(m.entries()).map(([date, spend]) => ({
      date: date.slice(5),
      spend: +spend.toFixed(4),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows30]);

  const recommendations = useMemo(() => {
    const recs: string[] = [];
    const topFn = byFunction[0];
    if (projected > budget && topFn) {
      recs.push(
        `Projected ${money(projected)} exceeds your ${money(budget)} budget — biggest driver is ${topFn[0]} at ${pct(topFn[1].spend / (spendMonth || 1))}.`
      );
    }
    if (topFn && spendMonth > 0 && topFn[1].spend / spendMonth > 0.5) {
      recs.push(
        `${topFn[0]} is ${pct(topFn[1].spend / spendMonth)} of spend — consider caching or gating regenerations.`
      );
    }
    // Provider WoW
    const provWeek: Record<string, number> = {};
    const provPrev: Record<string, number> = {};
    for (const r of rows30) {
      const t = new Date(r.created_at).getTime();
      const p = r.provider || "unknown";
      if (t >= sevenAgo.getTime()) provWeek[p] = (provWeek[p] || 0) + 1;
      else if (t >= fourteenAgo.getTime()) provPrev[p] = (provPrev[p] || 0) + 1;
    }
    for (const p of Object.keys(provWeek)) {
      const prev = provPrev[p] || 0;
      if (prev > 0 && provWeek[p] > 2 * prev) {
        const mult = (provWeek[p] / prev).toFixed(1);
        recs.push(`${p} usage up ${mult}x week-over-week.`);
      }
    }
    const failed7 = rows30.filter(
      (r) => r.success === false && new Date(r.created_at) >= sevenAgo
    ).length;
    if (failed7 > 5) {
      recs.push(`${failed7} failed AI calls this week — check function logs.`);
    }
    if (budget > 0 && spendMonth < budget * 0.25) {
      recs.push(
        "Well within budget — headroom to run richer models or more generation."
      );
    }
    return recs.slice(0, 3);
  }, [byFunction, projected, budget, spendMonth, rows30, sevenAgo, fourteenAgo]);

  const saveBudget = async () => {
    const amt = parseFloat(budgetInput);
    if (!isFinite(amt) || amt < 0) {
      toast.error("Enter a valid positive number");
      return;
    }
    setSavingBudget(true);
    const { error } = await supabase
      .from("admin_settings")
      .upsert(
        { key: "monthly_ai_budget_usd", value: { amount: amt } as any },
        { onConflict: "key" }
      );
    setSavingBudget(false);
    if (error) {
      toast.error("Could not update budget");
      return;
    }
    setBudget(amt);
    toast.success("Budget updated");
  };

  const exportCsv = () => {
    const header = [
      "created_at",
      "user_id",
      "user_name",
      "function_name",
      "provider",
      "model",
      "input_tokens",
      "output_tokens",
      "est_cost_usd",
      "success",
    ];
    const esc = (v: any) => {
      const s = v == null ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [header.join(",")];
    for (const r of rowsMonth) {
      lines.push(
        [
          r.created_at,
          r.user_id ?? "",
          nameOf(r.user_id),
          r.function_name,
          r.provider,
          r.model ?? "",
          r.input_tokens ?? 0,
          r.output_tokens ?? 0,
          num(r.est_cost_usd),
          r.success ?? true,
        ]
          .map(esc)
          .join(",")
      );
    }
    downloadBlob(
      new Blob([lines.join("\n")], { type: "text/csv" }),
      `ai-usage-${now.toISOString().slice(0, 10)}.csv`
    );
  };

  if (loading) {
    return (
      <AdminShell title="AI cost & usage" subtitle="Executive spend report">
        <div style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--glass-2)" }}>
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading usage…
        </div>
      </AdminShell>
    );
  }

  const empty = rows30.length === 0;

  return (
    <AdminShell title="AI cost & usage" subtitle="Executive spend report — current month + trailing 30 days">
      {empty ? (
        <div style={{ ...card, textAlign: "center", padding: 48, color: "var(--glass-2)" }}>
          No AI usage logged yet — data appears after the next AI call or cron run.
        </div>
      ) : (
        <>
          {/* KPI CARDS */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 16,
              marginBottom: 28,
            }}
          >
            <div style={card}>
              <div style={kpiLabel}>Spend this month</div>
              <div style={kpiValue}>{money(spendMonth)}</div>
              <BudgetBar spend={spendMonth} budget={budget} />
            </div>
            <div style={card}>
              <div style={kpiLabel}>Projected month-end</div>
              <div style={kpiValue}>{money(projected)}</div>
              <div style={{ marginTop: 8, fontSize: 11, color: "var(--glass-2)" }}>
                Day {dayOfMonth} of {daysInMonth}
              </div>
            </div>
            <div style={card}>
              <div style={kpiLabel}>AI calls this month</div>
              <div style={kpiValue}>{callsMonth.toLocaleString()}</div>
              <div style={{ marginTop: 8, fontSize: 11, color: "var(--glass-2)" }}>
                Success {(successRate * 100).toFixed(1)}%
              </div>
            </div>
            <div style={card}>
              <div style={kpiLabel}>Tokens this month</div>
              <div style={kpiValue}>
                {tokensMonth >= 1_000_000
                  ? `${(tokensMonth / 1_000_000).toFixed(2)}M`
                  : tokensMonth >= 1_000
                  ? `${(tokensMonth / 1_000).toFixed(1)}k`
                  : tokensMonth.toString()}
              </div>
              <div style={{ marginTop: 8, fontSize: 11, color: "var(--glass-2)" }}>
                Input + output
              </div>
            </div>
            <div style={card}>
              <div style={kpiLabel}>Cost / active user</div>
              <div style={kpiValue}>{money(perUser)}</div>
              <div style={{ marginTop: 8, fontSize: 11, color: "var(--glass-2)" }}>
                {activeUsers} active users
              </div>
            </div>
          </div>

          {/* Recommendations + Budget + Export */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "2fr 1fr",
              gap: 16,
              marginBottom: 28,
            }}
          >
            <div style={card}>
              <h2 style={h2}>Recommendations</h2>
              {recommendations.length === 0 ? (
                <div style={{ color: "var(--glass-2)", fontSize: 13 }}>
                  Nothing urgent — spend and reliability look healthy.
                </div>
              ) : (
                <ol style={{ margin: 0, paddingLeft: 20, color: "var(--glass)", fontSize: 14, lineHeight: 1.6 }}>
                  {recommendations.map((r, i) => (
                    <li key={i} style={{ marginBottom: 6 }}>{r}</li>
                  ))}
                </ol>
              )}
            </div>
            <div style={card}>
              <h2 style={h2}>Budget</h2>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ color: "var(--glass-2)", fontSize: 13 }}>$</span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={budgetInput}
                  onChange={(e) => setBudgetInput(e.target.value)}
                  style={{
                    background: "var(--ob-bg)",
                    border: "1px solid var(--hair)",
                    color: "var(--glass)",
                    padding: "6px 10px",
                    borderRadius: 4,
                    fontSize: 14,
                    width: 100,
                  }}
                />
                <button
                  onClick={saveBudget}
                  disabled={savingBudget}
                  style={{
                    background: "var(--glass)",
                    color: "var(--ob-bg)",
                    border: "none",
                    borderRadius: 4,
                    padding: "6px 12px",
                    fontSize: 12,
                    cursor: "pointer",
                    fontWeight: 600,
                  }}
                >
                  {savingBudget ? "…" : "Save"}
                </button>
              </div>
              <button
                onClick={exportCsv}
                style={{
                  marginTop: 14,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  background: "transparent",
                  color: "var(--glass)",
                  border: "1px solid var(--hair)",
                  borderRadius: 4,
                  padding: "6px 12px",
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                <Download size={12} /> Export CSV
              </button>
            </div>
          </div>

          {/* Trend */}
          <div style={{ ...card, marginBottom: 28 }}>
            <h2 style={h2}>Daily spend — last 30 days</h2>
            <div style={{ width: "100%", height: 240 }}>
              <ResponsiveContainer>
                <BarChart data={daily}>
                  <CartesianGrid stroke="var(--hair)" vertical={false} />
                  <XAxis dataKey="date" stroke="var(--glass-2)" fontSize={11} />
                  <YAxis stroke="var(--glass-2)" fontSize={11} tickFormatter={(v) => `$${v}`} />
                  <Tooltip
                    contentStyle={{
                      background: "var(--ob-bg)",
                      border: "1px solid var(--hair)",
                      color: "var(--glass)",
                      fontSize: 12,
                    }}
                    formatter={(v: any) => [`$${Number(v).toFixed(4)}`, "spend"]}
                  />
                  <Bar dataKey="spend" fill="#C5A55A" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Where spend is going */}
          <div style={{ ...card, marginBottom: 28 }}>
            <h2 style={h2}>By provider</h2>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={th}>Provider</th>
                  <th style={th}>Calls</th>
                  <th style={th}>Tokens</th>
                  <th style={th}>Spend</th>
                </tr>
              </thead>
              <tbody>
                {byProvider.map(([k, v]) => (
                  <tr key={k}>
                    <td style={td}>{k}</td>
                    <td style={td}>{v.calls.toLocaleString()}</td>
                    <td style={td}>{v.tokens.toLocaleString()}</td>
                    <td style={td}>
                      {k === "lovable" && v.spend === 0
                        ? "free tier — no cash cost"
                        : money(v.spend)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ ...card, marginBottom: 28 }}>
            <h2 style={h2}>By function</h2>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={th}>Function</th>
                  <th style={th}>Calls</th>
                  <th style={th}>Tokens</th>
                  <th style={th}>Spend</th>
                  <th style={th}>% of total</th>
                </tr>
              </thead>
              <tbody>
                {byFunction.map(([k, v]) => (
                  <tr key={k}>
                    <td style={td}>{k}</td>
                    <td style={td}>{v.calls.toLocaleString()}</td>
                    <td style={td}>{v.tokens.toLocaleString()}</td>
                    <td style={td}>{money(v.spend)}</td>
                    <td style={td}>{spendMonth > 0 ? pct(v.spend / spendMonth) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div style={card}>
              <h2 style={h2}>By model</h2>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={th}>Model</th>
                    <th style={th}>Calls</th>
                    <th style={th}>Spend</th>
                  </tr>
                </thead>
                <tbody>
                  {byModel.map(([k, v]) => (
                    <tr key={k}>
                      <td style={td}>{k}</td>
                      <td style={td}>{v.calls.toLocaleString()}</td>
                      <td style={td}>{money(v.spend)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={card}>
              <h2 style={h2}>Top users by spend</h2>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={th}>User</th>
                    <th style={th}>Calls</th>
                    <th style={th}>Tokens</th>
                    <th style={th}>Spend</th>
                  </tr>
                </thead>
                <tbody>
                  {byUser.map(([uid, v]) => (
                    <tr key={uid}>
                      <td style={td}>{nameOf(uid === "anonymous" ? null : uid)}</td>
                      <td style={td}>{v.calls.toLocaleString()}</td>
                      <td style={td}>{v.tokens.toLocaleString()}</td>
                      <td style={td}>{money(v.spend)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </AdminShell>
  );
}