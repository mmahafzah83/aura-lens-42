import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AlertTriangle, CheckCircle2, Info, Loader2, RefreshCw } from "lucide-react";

type Finding = {
  id: string;
  code: string;
  severity: "critical" | "warn" | "info";
  detail: string;
  first_seen: string;
  last_seen: string;
  resolved_at: string | null;
};

const SEV_COLOR: Record<Finding["severity"], string> = {
  critical: "#dc2626",
  warn: "#d97706",
  info: "#0891b2",
};

function age(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

export default function HealthFindingsPanel() {
  const [rows, setRows] = useState<Finding[]>([]);
  const [loading, setLoading] = useState(true);
  const [showResolved, setShowResolved] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    let q = supabase.from("health_findings" as any).select("*").order("last_seen", { ascending: false }).limit(200);
    if (!showResolved) q = q.is("resolved_at", null);
    const { data, error } = await q;
    if (error) setError(error.message);
    else setRows((data || []) as unknown as Finding[]);
    setLoading(false);
  };

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [showResolved]);

  const runAudit = async () => {
    setRunning(true);
    try {
      await supabase.functions.invoke("aura-health-audit", { body: {} });
      await load();
    } finally {
      setRunning(false);
    }
  };

  return (
    <section style={{
      padding: 20, borderRadius: 12,
      background: "var(--ob-panel, #0e0f14)",
      border: "0.5px solid var(--hair, rgba(255,255,255,0.08))",
    }}>
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0, color: "var(--glass, #eaeaf0)" }}>
            System health
          </h2>
          <p style={{ fontSize: 12, color: "var(--glass-2, #8a8a95)", margin: "4px 0 0" }}>
            Invariant-based self-audit. Findings open when checks fail; auto-resolve when they pass.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--glass-2, #8a8a95)" }}>
            <input type="checkbox" checked={showResolved} onChange={e => setShowResolved(e.target.checked)} />
            Show resolved
          </label>
          <button
            onClick={runAudit}
            disabled={running}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              fontSize: 12, padding: "6px 10px", borderRadius: 6,
              background: "transparent", color: "var(--glass, #eaeaf0)",
              border: "0.5px solid var(--hair, rgba(255,255,255,0.15))",
              cursor: running ? "default" : "pointer",
            }}
          >
            {running ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            Run audit now
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2" style={{ color: "var(--glass-2, #8a8a95)", fontSize: 13 }}>
          <Loader2 className="w-4 h-4 animate-spin" /> Loading findings…
        </div>
      ) : error ? (
        <div style={{ color: "#F87171", fontSize: 13 }}>{error}</div>
      ) : rows.length === 0 ? (
        <div className="flex items-center gap-2" style={{ color: "var(--glass-2, #8a8a95)", fontSize: 13 }}>
          <CheckCircle2 size={14} style={{ color: "#10b981" }} />
          {showResolved ? "No findings recorded." : "No open findings — all checks passing."}
        </div>
      ) : (
        <div className="flex flex-col" style={{ gap: 8 }}>
          {rows.map(r => {
            const Icon = r.severity === "info" ? Info : AlertTriangle;
            const resolved = !!r.resolved_at;
            return (
              <div key={r.id} style={{
                display: "grid",
                gridTemplateColumns: "auto 1fr auto",
                alignItems: "start", gap: 12,
                padding: "10px 12px", borderRadius: 8,
                background: "var(--ob-field, rgba(255,255,255,0.02))",
                border: `0.5px solid ${resolved ? "rgba(255,255,255,0.06)" : SEV_COLOR[r.severity] + "55"}`,
                opacity: resolved ? 0.55 : 1,
              }}>
                <Icon size={14} style={{ marginTop: 2, color: SEV_COLOR[r.severity] }} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <span style={{
                      fontFamily: "'IBM Plex Mono', monospace",
                      fontSize: 10, letterSpacing: "0.06em",
                      color: SEV_COLOR[r.severity], textTransform: "uppercase",
                    }}>{r.severity}</span>
                    <code style={{ fontSize: 11, color: "var(--glass, #eaeaf0)" }}>{r.code}</code>
                    {resolved && <span style={{ fontSize: 10, color: "#10b981" }}>resolved</span>}
                  </div>
                  <div style={{ fontSize: 13, color: "var(--glass, #eaeaf0)", marginTop: 3, lineHeight: 1.4 }}>
                    {r.detail}
                  </div>
                </div>
                <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: "var(--glass-2, #8a8a95)", whiteSpace: "nowrap" }}>
                  {resolved ? `resolved ${age(r.resolved_at!)} ago` : `age ${age(r.first_seen)}`}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}