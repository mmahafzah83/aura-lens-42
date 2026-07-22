import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import AdminShell from "@/components/admin/AdminShell";
import TodaysStatus from "@/components/TodaysStatus";
import HealthFindingsPanel from "@/components/admin/HealthFindingsPanel";
import SendTestEmailPanel from "@/components/admin/SendTestEmailPanel";
import {
  Activity,
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Loader2,
  XCircle,
  TrendingDown,
  Bug,
} from "lucide-react";

type ProviderResult = {
  provider: string;
  ok: boolean;
  status: number;
  detail?: string;
};

type HealthCheck = {
  id: string;
  run_at: string;
  results: ProviderResult[];
  checked: number;
  failed: number;
};

const ADMIN_PAGES = [
  {
    to: "/admin/people",
    label: "People",
    description: "User journeys and lifecycle cockpit",
  },
  {
    to: "/admin/journey",
    label: "Journey",
    description: "Funnel stages and where users are stuck",
  },
  {
    to: "/admin/cost",
    label: "Cost",
    description: "AI spend and budget tracking",
  },
  {
    to: "/admin/crons",
    label: "Crons",
    description: "Scheduled jobs — status and manual runs",
  },
  {
    to: "/admin/access",
    label: "Access",
    description: "Manage beta allowlist and invitations",
  },
  {
    to: "/admin/qa",
    label: "QA",
    description: "Review audit reports and checks",
  },
  {
    to: "/admin/guide-health",
    label: "Guide health",
    description: "Inspect guide page status",
  },
  {
    to: "/admin/appearance",
    label: "Appearance",
    description: "Legacy design tokens and atmosphere panels",
  },
  {
    to: "/admin/standard",
    label: "Standard",
    description: "View the Aura standard",
  },
];

const providerName = (provider: string) => {
  const map: Record<string, string> = {
    openai: "OpenAI",
    anthropic: "Anthropic",
    perplexity: "Perplexity",
    resend: "Resend",
  };
  return map[provider] || provider;
};

const formatRunAt = (iso: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const fmt = (n: number) => {
  if (!Number.isFinite(n)) return "0";
  if (n >= 1_000_000) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1000) return (n / 1000).toFixed(n >= 10000 ? 0 : 1) + "K";
  return String(n);
};

const cardStyle = {
  backgroundColor: "var(--ob-panel)",
  border: "1px solid var(--hair)",
  borderRadius: 12,
  padding: "24px",
};

const mutedStyle = {
  color: "var(--glass-2)",
  fontSize: 13,
};

function Sparkline({ values, color }: { values: number[]; color: string }) {
  const w = 120;
  const h = 32;
  const pad = 2;
  if (!values || values.length === 0) {
    return <svg width={w} height={h} />;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const n = values.length;
  const xAt = (i: number) => n === 1 ? w / 2 : pad + (i * (w - pad * 2)) / (n - 1);
  const yAt = (v: number) => max === min ? h / 2 : pad + (h - pad * 2) - ((v - min) / range) * (h - pad * 2);
  const points = values.map((v, i) => `${xAt(i)},${yAt(v)}`).join(" ");
  const lastX = xAt(n - 1);
  const lastY = yAt(values[n - 1]);
  return (
    <svg width={w} height={h} style={{ display: "block" }}>
      <polyline
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
      <circle cx={lastX} cy={lastY} r={2.5} fill={color} />
    </svg>
  );
}

export default function Admin() {
  const [latest, setLatest] = useState<HealthCheck | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [brief, setBrief] = useState<any | null>(null);
  const [briefLoading, setBriefLoading] = useState(true);
  const [briefError, setBriefError] = useState<string | null>(null);
  const [output, setOutput] = useState<any | null>(null);
  const [outputLoading, setOutputLoading] = useState(true);
  const [outputError, setOutputError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function fetchLatest() {
      try {
        setLoading(true);
        setError(null);
        const { data, error } = await supabase.functions.invoke(
          "api-health-sentinel",
          { body: { latest: true } }
        );
        if (cancelled) return;
        if (error) throw error;
        setLatest(data?.latest || null);
      } catch (e: any) {
        if (cancelled) return;
        console.warn("API health latest fetch failed", e);
        setError(e?.message || "Could not load API health");
        setLatest(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchLatest();
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setBriefLoading(true);
        setBriefError(null);
        const { data, error } = await supabase.functions.invoke("admin-console", {
          body: { action: "overview_brief" },
        });
        if (cancelled) return;
        if (error) throw error;
        setBrief(data);
      } catch (e: any) {
        if (cancelled) return;
        setBriefError(e?.message || "Could not load brief");
      } finally {
        if (!cancelled) setBriefLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setOutputLoading(true);
        setOutputError(null);
        const { data, error } = await supabase.functions.invoke("admin-console", {
          body: { action: "output_rollup" },
        });
        if (cancelled) return;
        if (error) throw error;
        setOutput(data);
      } catch (e: any) {
        if (cancelled) return;
        setOutputError(e?.message || "Could not load output");
      } finally {
        if (!cancelled) setOutputLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);
  const drop = (prev: number, curr: number) => (prev > 0 ? Math.round(((prev - curr) / prev) * 100) : 0);
  const sevColor = (s: string) => (s === "high" ? "#dc2626" : s === "med" ? "#d97706" : "#16a34a");

  const relTime = (iso: string) => {
    const diff = (Date.now() - new Date(iso).getTime()) / 1000;
    if (diff < 60) return `${Math.floor(diff)}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  };
  const trim = (s: string, n = 140) => (s && s.length > n ? s.slice(0, n) + "…" : s || "");

  return (
    <AdminShell title="Overview" subtitle="Admin at-a-glance">
      <div className="grid gap-6">
        <TodaysStatus />
        <HealthFindingsPanel />
        <SendTestEmailPanel />
        {/* Founder brief */}
        <section style={cardStyle}>
          <div className="flex items-baseline justify-between flex-wrap gap-2 mb-4">
            <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0, color: "var(--glass)" }}>
              Brief — {new Date().toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
            </h2>
            {brief && (
              <span style={mutedStyle}>
                {brief.today.new_users} new users · {brief.today.new_captures} captures · {brief.today.new_signals} signals today
              </span>
            )}
          </div>

          {briefLoading && (
            <div className="flex items-center gap-2" style={mutedStyle}>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Loading brief…</span>
            </div>
          )}
          {!briefLoading && briefError && (
            <div className="flex items-start gap-2" style={{ ...mutedStyle, color: "#F87171" }}>
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{briefError}</span>
            </div>
          )}
          {!briefLoading && !briefError && brief && (
            <div className="grid gap-5">
              {/* KPI cards */}
              <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))" }}>
                {(brief.kpis && Array.isArray(brief.kpis) ? brief.kpis : [
                  { label: "Users", value: String(brief.totals.users) },
                  { label: "Activated", value: `${pct(brief.totals.activated, brief.totals.users)}%`, sub: `${brief.totals.activated}/${brief.totals.users}` },
                  { label: "With signal", value: `${pct(brief.totals.with_signal, brief.totals.users)}%`, sub: `${brief.totals.with_signal}/${brief.totals.users}` },
                  { label: "New this week", value: String(brief.totals.new_this_week) },
                  { label: "Spend this month", value: `$${brief.month.spend_usd.toFixed(2)}`, sub: `${brief.month.pct_budget}% of $${brief.month.budget_usd}` },
                ]).map((k: any) => {
                  const sentimentColor = k.sentiment === "good" ? "#36C5B0" : k.sentiment === "bad" ? "#F87171" : "var(--glass-2)";
                  return (
                    <div key={k.key || k.label} style={{ padding: "12px 14px", borderRadius: 8, backgroundColor: "var(--ob-raised)", border: "1px solid var(--hair)" }}>
                      <div style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--glass-2)", marginBottom: 6 }}>{k.label}</div>
                      <div style={{ fontSize: 22, color: "var(--glass)", fontWeight: 500, lineHeight: 1 }}>{k.value}</div>
                      {k.delta && (
                        <div style={{ display: "inline-block", marginTop: 8, fontSize: 11, color: sentimentColor, backgroundColor: "var(--ob-panel)", border: "1px solid var(--hair)", borderRadius: 999, padding: "2px 8px" }}>
                          {k.delta}
                        </div>
                      )}
                      {k.sub && <div style={{ ...mutedStyle, marginTop: 6 }}>{k.sub}</div>}
                      {k.target && <div style={{ ...mutedStyle, marginTop: 4, fontSize: 11 }}>{k.target}</div>}
                      {k.note && (
                        k.link ? (
                          <Link to={k.link} style={{ display: "block", marginTop: 6, fontSize: 12, color: "var(--brand)", textDecoration: "none" }}>
                            {k.note} →
                          </Link>
                        ) : (
                          <div style={{ ...mutedStyle, marginTop: 6, fontSize: 12 }}>{k.note}</div>
                        )
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Last 14 days trends */}
              {brief.trends && Array.isArray(brief.trends.series) && (
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--glass)", marginBottom: 8 }}>Last 14 days</div>
                  <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
                    {brief.trends.series.map((s: any) => {
                      const total = (s.values || []).reduce((a: number, b: number) => a + Number(b || 0), 0);
                      return (
                        <div key={s.key} style={{ padding: "12px 14px", borderRadius: 8, backgroundColor: "var(--ob-raised)", border: "1px solid var(--hair)" }}>
                          <div style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--glass-2)" }}>{s.label}</div>
                          <div style={{ fontSize: 20, color: "var(--glass)", fontWeight: 500, marginTop: 4 }}>{total}</div>
                          <div style={{ marginTop: 8 }}>
                            <Sparkline values={s.values || []} color={s.color} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Attention */}
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--glass)", marginBottom: 8 }}>Needs your attention</div>
                <div className="grid gap-2">
                  {brief.attention.map((a: any, i: number) => (
                    <Link
                      key={i}
                      to={a.link}
                      className="flex items-center justify-between"
                      style={{
                        padding: "10px 12px",
                        borderRadius: 8,
                        backgroundColor: "var(--ob-raised)",
                        border: "1px solid var(--hair)",
                        borderLeft: `3px solid ${sevColor(a.severity)}`,
                        textDecoration: "none",
                      }}
                    >
                      <span style={{ color: "var(--glass)", fontSize: 14 }}>{a.text}</span>
                      <ArrowRight className="w-4 h-4 shrink-0" style={{ color: "var(--glass-2)" }} />
                    </Link>
                  ))}
                </div>
              </div>

              {/* Funnel */}
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--glass)", marginBottom: 8 }}>Funnel</div>
                <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))" }}>
                  {[
                    { label: "Signed up", value: brief.funnel.signed_up, prev: null as number | null },
                    { label: "Onboarded", value: brief.funnel.onboarded, prev: brief.funnel.signed_up },
                    { label: "First capture", value: brief.funnel.first_capture, prev: brief.funnel.onboarded },
                    { label: "First signal", value: brief.funnel.first_signal, prev: brief.funnel.first_capture },
                  ].map((f) => (
                    <div key={f.label} style={{ padding: "10px 12px", borderRadius: 8, backgroundColor: "var(--ob-raised)", border: "1px solid var(--hair)" }}>
                      <div style={{ ...mutedStyle }}>{f.label}</div>
                      <div style={{ fontSize: 18, color: "var(--glass)", fontWeight: 500, marginTop: 4 }}>{f.value}</div>
                      {f.prev !== null && (
                        <div style={{ ...mutedStyle, marginTop: 2 }}>
                          {drop(f.prev, f.value)}% drop
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Content output roll-up */}
        <section style={cardStyle}>
          <div className="flex items-baseline justify-between flex-wrap gap-2 mb-4">
            <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0, color: "var(--glass)" }}>
              Content output
            </h2>
            <span style={mutedStyle}>Across all accounts</span>
          </div>
          {outputLoading && (
            <div className="flex items-center gap-2" style={mutedStyle}>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Loading…</span>
            </div>
          )}
          {!outputLoading && outputError && (
            <div className="flex items-start gap-2" style={{ ...mutedStyle, color: "#F87171" }}>
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{outputError}</span>
            </div>
          )}
          {!outputLoading && !outputError && output && (
            <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
              {[
                { label: "Published", value: String(output.published_total ?? 0), sub: `${output.published_30d ?? 0} in last 30d` },
                { label: "From signal", value: `${output.from_signal_pct ?? 0}%`, sub: `${output.from_signal_count ?? 0}/${output.published_total ?? 0} publishes · ${output.signals_converted ?? 0} signals` },
                { label: "Aura-generated", value: String(output.aura_generated ?? 0), sub: "drafts + published" },
                { label: "Impressions", value: fmt(Number(output.impressions ?? 0)), sub: "tracked content" },
                { label: "Reach", value: fmt(Number(output.members_reached ?? 0)), sub: output.metrics_as_of ? `as of ${new Date(output.metrics_as_of).toLocaleDateString(undefined, { month: "short", day: "numeric" })}` : "—" },
              ].map((k) => (
                <div key={k.label} style={{ padding: "12px 14px", borderRadius: 8, backgroundColor: "var(--ob-raised)", border: "1px solid var(--hair)" }}>
                  <div style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--glass-2)", marginBottom: 6 }}>{k.label}</div>
                  <div style={{ fontSize: 22, color: "var(--glass)", fontWeight: 500, lineHeight: 1 }}>{k.value}</div>
                  <div style={{ ...mutedStyle, marginTop: 6 }}>{k.sub}</div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Biggest leak banner */}
        {brief?.biggest_leak && brief.biggest_leak.stuck_count > 0 && (
          <Link
            to="/admin/journey"
            className="flex items-center gap-3"
            style={{
              padding: "12px 16px",
              borderRadius: 10,
              backgroundColor: "var(--ob-panel)",
              border: "1px solid var(--hair)",
              borderLeft: "3px solid var(--brand)",
              textDecoration: "none",
            }}
          >
            <TrendingDown className="w-4 h-4 shrink-0" style={{ color: "var(--brand)" }} />
            <span style={{ color: "var(--glass)", fontSize: 14 }}>
              Biggest leak: <strong style={{ color: "var(--brand)" }}>{brief.biggest_leak.from_label} → {brief.biggest_leak.to_label}</strong> — {brief.biggest_leak.stuck_count} stuck
            </span>
            <ArrowRight className="w-4 h-4 shrink-0 ml-auto" style={{ color: "var(--glass-2)" }} />
          </Link>
        )}

        {/* Issues today */}
        {brief?.issues && (
          <section style={cardStyle}>
            <div className="flex items-center gap-3 mb-4">
              <div
                className="flex items-center justify-center"
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  backgroundColor: "var(--ob-raised)",
                  border: "1px solid var(--hair)",
                  color: brief.issues.count > 0 ? "#F87171" : "var(--brand)",
                }}
              >
                <Bug className="w-5 h-5" />
              </div>
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0, color: "var(--glass)" }}>Issues today</h2>
                <p style={{ margin: 0, ...mutedStyle }}>
                  {brief.issues.count === 0 ? (
                    "No errors in the last 24h ✓"
                  ) : (
                    <span style={{ color: "#F87171" }}>{brief.issues.count} error{brief.issues.count === 1 ? "" : "s"} in the last 24h</span>
                  )}
                </p>
              </div>
            </div>
            {brief.issues.count > 0 && (
              <div className="grid gap-2">
                {brief.issues.recent.map((it: any, i: number) => (
                  <div
                    key={i}
                    style={{
                      padding: "10px 12px",
                      borderRadius: 8,
                      backgroundColor: "var(--ob-raised)",
                      border: "1px solid var(--hair)",
                      borderLeft: "3px solid #dc2626",
                    }}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span style={{ color: "var(--glass)", fontSize: 13, fontFamily: "monospace" }}>{it.function_name}</span>
                      <span style={mutedStyle}>{relTime(it.created_at)}</span>
                    </div>
                    <div style={{ ...mutedStyle, marginTop: 4 }}>{trim(it.error_message)}</div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* API Health board */}
        <section style={cardStyle}>
          <div className="flex items-center gap-3 mb-5">
            <div
              className="flex items-center justify-center"
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                backgroundColor: "var(--ob-raised)",
                border: "1px solid var(--hair)",
                color: "var(--brand)",
              }}
            >
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <h2
                style={{
                  fontSize: 18,
                  fontWeight: 600,
                  margin: 0,
                  color: "var(--glass)",
                }}
              >
                API health
              </h2>
              <p style={{ margin: 0, ...mutedStyle }}>Latest sentinel result</p>
            </div>
          </div>

          {loading && (
            <div className="flex items-center gap-2" style={mutedStyle}>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Loading health status…</span>
            </div>
          )}

          {!loading && error && (
            <div
              className="flex items-start gap-2"
              style={{
                ...mutedStyle,
                color: "#F87171",
              }}
            >
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {!loading && !error && !latest && (
            <p style={mutedStyle}>No sentinel result yet.</p>
          )}

          {!loading && latest && (
            <div>
              <div className="flex items-center gap-2 mb-4" style={mutedStyle}>
                <span>Run at {formatRunAt(latest.run_at)}</span>
                <span>·</span>
                <span>
                  {latest.failed === 0 ? (
                    <span style={{ color: "#36C5B0" }}>All systems healthy</span>
                  ) : (
                    <span style={{ color: "#F87171" }}>
                      {latest.failed} of {latest.checked} providers failing
                    </span>
                  )}
                </span>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {latest.results.map((r) => (
                  <div
                    key={r.provider}
                    className="flex items-center justify-between"
                    style={{
                      padding: "12px 14px",
                      borderRadius: 8,
                      backgroundColor: "var(--ob-raised)",
                      border: "1px solid var(--hair)",
                    }}
                  >
                    <div className="flex items-center gap-2">
                      {r.ok ? (
                        <CheckCircle2 className="w-4 h-4" style={{ color: "#36C5B0" }} />
                      ) : (
                        <XCircle className="w-4 h-4" style={{ color: "#F87171" }} />
                      )}
                      <span style={{ color: "var(--glass)", fontSize: 14 }}>
                        {providerName(r.provider)}
                      </span>
                    </div>
                    <span style={{ color: "var(--glass-2)", fontSize: 13 }}>
                      HTTP {r.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Link list to the other admin pages */}
        <section style={cardStyle}>
          <h2
            style={{
              fontSize: 18,
              fontWeight: 600,
              margin: "0 0 16px",
              color: "var(--glass)",
            }}
          >
            Admin pages
          </h2>
          <div className="grid gap-2">
            {ADMIN_PAGES.map((page) => (
              <Link
                key={page.to}
                to={page.to}
                className="group flex items-center justify-between"
                style={{
                  padding: "14px 16px",
                  borderRadius: 8,
                  backgroundColor: "var(--ob-raised)",
                  border: "1px solid var(--hair)",
                  textDecoration: "none",
                  transition: "background-color .2s ease",
                }}
              >
                <div className="flex flex-col">
                  <span
                    style={{
                      color: "var(--glass)",
                      fontSize: 14,
                      fontWeight: 500,
                    }}
                  >
                    {page.label}
                  </span>
                  <span style={mutedStyle}>{page.description}</span>
                </div>
                <ArrowRight
                  className="w-4 h-4 shrink-0"
                  style={{ color: "var(--glass-2)", transition: "color .2s ease" }}
                />
              </Link>
            ))}
          </div>
        </section>
      </div>
    </AdminShell>
  );
}
