import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, RefreshCw } from "lucide-react";

type Result = {
  ok?: boolean;
  anthropic_status?: number;
  wrote?: boolean;
  result_keys?: number;
  report?: Record<string, any>;
  error?: string;
  details?: string;
} | null;

export default function RegenerateReportPanel() {
  const [email, setEmail] = useState("");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<Result>(null);

  const run = async () => {
    if (!email.trim()) return;
    setRunning(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("admin-regenerate-report", {
        body: { email: email.trim() },
      });
      if (error) {
        let details = error.message;
        try {
          const ctx = (error as unknown as { context?: { text?: () => Promise<string> } }).context;
          if (ctx?.text) details = await ctx.text();
        } catch { /* ignore */ }
        let parsed: Result = null;
        try { parsed = JSON.parse(details); } catch { /* ignore */ }
        setResult(parsed?.error ? { ...parsed, ok: false } : { ok: false, error: details });
      } else {
        setResult(data as Result);
      }
    } catch (e) {
      setResult({ ok: false, error: (e as Error).message });
    } finally {
      setRunning(false);
    }
  };

  const r = result?.report;
  const preview = r
    ? [r.primary_archetype, r.positioning_statement, r.market_read]
        .filter((s) => typeof s === "string" && s.trim())
        .join("\n\n")
        .slice(0, 600)
    : "";

  return (
    <section
      style={{
        padding: 20,
        borderRadius: 12,
        background: "var(--ob-panel, #0e0f14)",
        border: "0.5px solid var(--hair, rgba(255,255,255,0.08))",
      }}
    >
      <div className="mb-4">
        <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0, color: "var(--glass, #eaeaf0)" }}>
          Regenerate brand report
        </h2>
        <p style={{ fontSize: 12, color: "var(--glass-2, #8a8a95)", margin: "4px 0 0" }}>
          Re-runs the brand assessment from the user's own saved answers and writes the result to their profile.
          Nothing is emailed.
        </p>
      </div>

      <div className="flex items-center gap-2 flex-wrap mb-4">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="user@example.com"
          style={{
            flex: "1 1 240px",
            fontSize: 13,
            padding: "7px 10px",
            borderRadius: 6,
            background: "var(--ob-field, rgba(255,255,255,0.02))",
            color: "var(--glass, #eaeaf0)",
            border: "0.5px solid var(--hair, rgba(255,255,255,0.15))",
          }}
        />
        <button
          onClick={run}
          disabled={running || !email.trim()}
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
            cursor: running || !email.trim() ? "default" : "pointer",
            opacity: running || !email.trim() ? 0.6 : 1,
          }}
        >
          {running ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
          Regenerate
        </button>
      </div>

      {result && (
        <div
          style={{
            padding: 12,
            borderRadius: 8,
            background: "var(--ob-field, rgba(255,255,255,0.02))",
            border: `0.5px solid ${result.ok ? "rgba(16,185,129,0.4)" : "rgba(220,38,38,0.4)"}`,
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: 12,
            color: "var(--glass, #eaeaf0)",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          <div style={{ marginBottom: 6 }}>
            <span style={{ color: result.ok ? "#10b981" : "#dc2626" }}>{result.ok ? "OK" : "FAIL"}</span>
            {typeof result.anthropic_status === "number" && <> · anthropic {result.anthropic_status}</>}
            {typeof result.result_keys === "number" && <> · {result.result_keys} keys</>}
            {result.wrote && <> · written</>}
          </div>
          <div style={{ color: "var(--glass-2, #8a8a95)" }}>
            {result.ok ? preview || "(no preview available)" : `${result.error || "Unknown error"}${result.details ? `\n${result.details}` : ""}`}
          </div>
        </div>
      )}
    </section>
  );
}
