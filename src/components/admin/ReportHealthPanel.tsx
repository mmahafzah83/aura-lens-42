import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, RefreshCw } from "lucide-react";

type Row = {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  answered_at: string | null;
  days_stuck: number | null;
};

export default function ReportHealthPanel() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Row[]>([]);
  const [count, setCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase.functions.invoke("admin-console", {
        body: { action: "report_health" },
      });
      if (err) throw err;
      setRows((data?.rows as Row[]) ?? []);
      setCount(Number(data?.count ?? 0));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const regenerate = async (userId: string) => {
    setBusyId(userId);
    setError(null);
    try {
      const { data, error: err } = await supabase.functions.invoke("admin-regenerate-report", {
        body: { user_id: userId },
      });
      if (err) throw err;
      if (data && data.ok === false) throw new Error(data.error || "Regeneration failed");
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const cellStyle: React.CSSProperties = {
    padding: "8px 10px",
    fontSize: 12,
    color: "var(--glass, #eaeaf0)",
    borderTop: "0.5px solid var(--hair, rgba(255,255,255,0.08))",
    textAlign: "left",
  };

  return (
    <section
      style={{
        padding: 20,
        borderRadius: 12,
        background: "var(--ob-panel, #0e0f14)",
        border: "0.5px solid var(--hair, rgba(255,255,255,0.08))",
      }}
    >
      <div className="mb-4 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0, color: "var(--glass, #eaeaf0)" }}>
            Report health
          </h2>
          <p style={{ fontSize: 12, color: "var(--glass-2, #8a8a95)", margin: "4px 0 0" }}>
            Users who answered the brand assessment but never received a report.
          </p>
        </div>
        <button
          onClick={() => void load()}
          disabled={loading}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontSize: 12,
            padding: "6px 10px",
            borderRadius: 6,
            background: "transparent",
            color: "var(--glass, #eaeaf0)",
            border: "0.5px solid var(--hair, rgba(255,255,255,0.15))",
            cursor: loading ? "default" : "pointer",
            opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
          Refresh
        </button>
      </div>

      {error && (
        <div
          style={{
            padding: 10,
            marginBottom: 12,
            borderRadius: 8,
            fontSize: 12,
            color: "var(--glass, #eaeaf0)",
            background: "var(--ob-field, rgba(255,255,255,0.02))",
            border: "0.5px solid rgba(220,38,38,0.4)",
          }}
        >
          {error}
        </div>
      )}

      {loading ? (
        <p style={{ fontSize: 12, color: "var(--glass-2, #8a8a95)", margin: 0 }}>Checking…</p>
      ) : count === 0 ? (
        <p style={{ fontSize: 13, color: "var(--glass-2, #8a8a95)", margin: 0 }}>
          All reports complete — 0 users stuck.
        </p>
      ) : (
        <>
          <p style={{ fontSize: 12, color: "var(--glass-2, #8a8a95)", margin: "0 0 8px" }}>
            {count} user{count === 1 ? "" : "s"} stuck.
          </p>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["Name", "Email", "Answered", "Days stuck", ""].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: "0 10px 8px",
                        fontSize: 11,
                        textAlign: "left",
                        fontWeight: 500,
                        color: "var(--glass-2, #8a8a95)",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.user_id}>
                    <td style={cellStyle}>
                      {[r.first_name, r.last_name].filter(Boolean).join(" ") || "—"}
                    </td>
                    <td style={cellStyle}>{r.email || "—"}</td>
                    <td style={cellStyle}>
                      {r.answered_at ? new Date(r.answered_at).toLocaleDateString() : "—"}
                    </td>
                    <td style={cellStyle}>{r.days_stuck ?? "—"}</td>
                    <td style={{ ...cellStyle, textAlign: "right" }}>
                      <button
                        onClick={() => void regenerate(r.user_id)}
                        disabled={busyId === r.user_id}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                          fontSize: 12,
                          padding: "5px 9px",
                          borderRadius: 6,
                          background: "transparent",
                          color: "var(--glass, #eaeaf0)",
                          border: "0.5px solid var(--hair, rgba(255,255,255,0.15))",
                          cursor: busyId === r.user_id ? "default" : "pointer",
                          opacity: busyId === r.user_id ? 0.6 : 1,
                        }}
                      >
                        {busyId === r.user_id ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          <RefreshCw size={12} />
                        )}
                        Regenerate
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
