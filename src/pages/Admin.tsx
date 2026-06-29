import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import AdminShell from "@/components/admin/AdminShell";
import {
  Activity,
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Loader2,
  XCircle,
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
    to: "/admin/experience",
    label: "Experience",
    description: "Run QA walkthroughs and monitor flows",
  },
  {
    to: "/admin/design-system",
    label: "Design system",
    description: "Manage design tokens and versions",
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

export default function Admin() {
  const [latest, setLatest] = useState<HealthCheck | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <AdminShell title="Overview" subtitle="Admin at-a-glance">
      <div className="grid gap-6">
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
