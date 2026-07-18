import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Mail } from "lucide-react";

type Result = {
  ok?: boolean;
  status?: number;
  body?: string;
  recipient?: string;
  from?: string;
  message_key?: string;
  error?: string;
} | null;

export default function SendTestEmailPanel() {
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<Result>(null);

  const send = async () => {
    setSending(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("admin-send-test-email", { body: {} });
      if (error) {
        // Extract the raw response body from the FunctionsHttpError context if present.
        let details = error.message;
        try {
          const ctx = (error as unknown as { context?: { text?: () => Promise<string> } }).context;
          if (ctx?.text) details = await ctx.text();
        } catch { /* ignore */ }
        setResult({ ok: false, error: details });
      } else {
        setResult(data as Result);
      }
    } catch (e) {
      setResult({ ok: false, error: (e as Error).message });
    } finally {
      setSending(false);
    }
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
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0, color: "var(--glass, #eaeaf0)" }}>
            Send test email
          </h2>
          <p style={{ fontSize: 12, color: "var(--glass-2, #8a8a95)", margin: "4px 0 0" }}>
            Sends one email to your signed-in address through the same Resend path lifecycle emails use.
            Writes the attempt to lifecycle_email_log regardless of outcome.
          </p>
        </div>
        <button
          onClick={send}
          disabled={sending}
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
            cursor: sending ? "default" : "pointer",
          }}
        >
          {sending ? <Loader2 size={12} className="animate-spin" /> : <Mail size={12} />}
          Send test email
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
            <span style={{ color: result.ok ? "#10b981" : "#dc2626" }}>
              {result.ok ? "OK" : "FAIL"}
            </span>
            {typeof result.status === "number" && <> · HTTP {result.status}</>}
            {result.recipient && <> · to {result.recipient}</>}
            {result.from && <> · from {result.from}</>}
            {result.message_key && <> · logged as {result.message_key}</>}
          </div>
          <div style={{ color: "var(--glass-2, #8a8a95)" }}>
            {result.error ? result.error : result.body || "(empty response body)"}
          </div>
        </div>
      )}
    </section>
  );
}