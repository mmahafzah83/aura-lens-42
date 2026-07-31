import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { C, Label, MONO, SERIF } from "@/components/admin/cockpit/ui";

/**
 * /admin — "System health".
 *
 * Renders the LATEST qa-sentinel run, one row per check. A sentinel that has
 * not run in 30h is itself a failure, so the whole panel goes amber.
 */

type Row = {
  id: string;
  run_at: string;
  check_key: string;
  status: "pass" | "warn" | "fail";
  detail: string | null;
};

const NAMES: Record<string, string> = {
  overnight_freshness: "The night produced work",
  cron_heartbeat: "Scheduled jobs are running",
  faults_last_24h: "Errors in the last 24 hours",
  founding_seats_sane: "Founding seat count is sane",
  landing_up: "The public site is up",
  published_counts_consistent: "Published numbers add up",
};

const DOT: Record<Row["status"], string> = { pass: C.teal, warn: C.amber, fail: C.ox };

function relative(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const d = Math.floor(h / 24);
  return `${d} day${d === 1 ? "" : "s"} ago`;
}

export default function SystemHealthPanel() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("qa_runs")
        .select("id, run_at, check_key, status, detail")
        .order("run_at", { ascending: false })
        .limit(60);
      if (cancelled) return;
      if (error) setError(error.message);
      else {
        const all = (data ?? []) as unknown as Row[];
        const latest = all.length ? all[0].run_at : null;
        setRows(latest ? all.filter((r) => r.run_at === latest) : []);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const runAt = rows[0]?.run_at ?? null;
  const stale = !runAt || Date.now() - new Date(runAt).getTime() > 30 * 3600_000;

  return (
    <section
      style={{
        background: C.card,
        border: `1px solid ${stale ? C.amber : C.rule}`,
        borderRadius: 4,
        padding: "20px 22px",
        marginBottom: 18,
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
          <Label>Health</Label>
          <h2 style={{ margin: 0, fontFamily: SERIF, fontSize: 22, fontWeight: 500, color: C.ink }}>System health</h2>
        </div>
        {runAt && (
          <div style={{ fontFamily: MONO, fontSize: 11, color: stale ? C.damber : C.muted }}>
            checked {relative(runAt)}
          </div>
        )}
      </div>

      {stale && !loading && (
        <div style={{ marginTop: 12, fontSize: 13, color: C.damber }}>
          {runAt
            ? `Sentinel has not run since ${new Date(runAt).toLocaleString()} — a silent sentinel is itself a failure.`
            : "Sentinel has never run — a silent sentinel is itself a failure."}
        </div>
      )}

      <div style={{ marginTop: 14 }}>
        {loading ? (
          <div style={{ fontFamily: MONO, fontSize: 12, color: C.muted }}>Loading checks…</div>
        ) : error ? (
          <div style={{ fontSize: 13, color: C.ox }}>{error}</div>
        ) : rows.length === 0 ? (
          <div style={{ fontFamily: MONO, fontSize: 12, color: C.muted }}>No checks recorded yet.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {rows.map((r) => (
              <div
                key={r.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "12px minmax(190px, 260px) 1fr",
                  gap: 12,
                  alignItems: "start",
                  padding: "10px 0",
                  borderTop: `1px solid ${C.rule}`,
                }}
              >
                <span
                  aria-label={r.status}
                  title={r.status}
                  style={{
                    width: 9,
                    height: 9,
                    borderRadius: "50%",
                    background: DOT[r.status],
                    marginTop: 6,
                    display: "inline-block",
                  }}
                />
                <div style={{ fontFamily: SERIF, fontSize: 16, color: C.ink, lineHeight: 1.3 }}>
                  {NAMES[r.check_key] ?? r.check_key}
                </div>
                <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.5 }}>{r.detail}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}