import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, RefreshCw, FileText } from "lucide-react";

const MONO = "'IBM Plex Mono', monospace";
const TYPES = ["cv", "portfolio", "project", "testimonial", "talk", "other"];
const LABELS = ["latest", "best", "target"];

const REASONS: Record<string, string> = {
  no_cv: "No document is labelled as a CV for this member.",
  no_snapshot: "This member has no LinkedIn profile snapshot on file.",
  unparseable: "The comparison came back unreadable twice. Nothing was saved.",
};

type Doc = {
  id: string;
  filename: string | null;
  display_title: string | null;
  status: string | null;
  document_type: string | null;
  cv_label: string | null;
  created_at: string;
};

type Finding = { what?: string; why_it_matters?: string; do_this?: string; weight?: string };

type Crosscheck = {
  headline_finding?: string | null;
  findings?: Finding[];
  defensibility?: string[];
  cv_is_behind?: string[];
  reading_the_shape?: string | null;
  profile_vs_voice?: string | null;
  headline_suggestion?: string | null;
  cv_count?: number;
};

type RunResult = { ok?: boolean; cv_count?: number; crosscheck?: Crosscheck; reason?: string; error?: string } | null;

const field = {
  fontSize: 13,
  padding: "7px 10px",
  borderRadius: 6,
  background: "var(--ob-field, rgba(255,255,255,0.02))",
  color: "var(--glass, #eaeaf0)",
  border: "0.5px solid var(--hair, rgba(255,255,255,0.15))",
} as const;

const btn = (disabled: boolean) => ({
  display: "inline-flex" as const,
  alignItems: "center" as const,
  gap: 6,
  fontSize: 12,
  padding: "6px 10px",
  borderRadius: 6,
  background: "transparent",
  color: "var(--glass, #eaeaf0)",
  border: "0.5px solid var(--hair, rgba(255,255,255,0.15))",
  cursor: disabled ? ("default" as const) : ("pointer" as const),
  opacity: disabled ? 0.6 : 1,
});

async function invoke(fn: string, body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke(fn, { body });
  if (error) {
    let details = error.message;
    try {
      const ctx = (error as unknown as { context?: { text?: () => Promise<string> } }).context;
      if (ctx?.text) details = await ctx.text();
    } catch { /* ignore */ }
    try { return JSON.parse(details); } catch { return { ok: false, error: details }; }
  }
  return data;
}

export default function CvCrosscheckPanel() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [docs, setDocs] = useState<Doc[] | null>(null);
  const [docsError, setDocsError] = useState<string | null>(null);
  const [saved, setSaved] = useState<Record<string, string>>({});
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RunResult>(null);

  const loadDocs = async () => {
    if (!email.trim()) return;
    setLoading(true);
    setDocs(null);
    setDocsError(null);
    setResult(null);
    const out = await invoke("admin-list-documents", { email: email.trim() });
    if (out?.ok) setDocs(out.documents as Doc[]);
    else setDocsError(out?.error || "Could not load documents.");
    setLoading(false);
  };

  const setDocField = async (doc: Doc, patch: Partial<Pick<Doc, "document_type" | "cv_label">>) => {
    const next = { ...doc, ...patch } as Doc;
    if (patch.document_type !== undefined && patch.document_type !== "cv") next.cv_label = null;
    setDocs((prev) => (prev ? prev.map((d) => (d.id === doc.id ? next : d)) : prev));
    const out = await invoke("admin-set-document-type", { id: doc.id, ...patch });
    setSaved((s) => ({ ...s, [doc.id]: out?.ok ? "saved" : out?.error || "not saved" }));
  };

  const run = async () => {
    if (!email.trim()) return;
    setRunning(true);
    setResult(null);
    const out = await invoke("cv-crosscheck", { email: email.trim() });
    setResult(out as RunResult);
    setRunning(false);
  };

  const c = result?.crosscheck;
  const failText = result && !result.ok
    ? REASONS[result.reason ?? ""] || result.reason || result.error
    : "";

  const bullets = (title: string, arr?: string[]) => {
    const items = (arr ?? []).filter((s) => typeof s === "string" && s.trim());
    return items.length ? (
      <div style={{ marginTop: 10 }}>
        <div style={{ color: "var(--glass-2, #8a8a95)" }}>{title}</div>
        {items.map((s, i) => (
          <div key={i}>· {s}</div>
        ))}
      </div>
    ) : null;
  };

  const findings = (c?.findings ?? []).filter((f) => f && (f.what || f.do_this));

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
          CV cross-check
        </h2>
        <p style={{ fontSize: 12, color: "var(--glass-2, #8a8a95)", margin: "4px 0 0" }}>
          Label a member's documents, then compare their CV against their public LinkedIn profile.
        </p>
      </div>

      <div className="flex items-center gap-2 flex-wrap mb-4">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="user@example.com"
          style={{ ...field, flex: "1 1 240px" }}
        />
        <button onClick={loadDocs} disabled={loading || !email.trim()} style={btn(loading || !email.trim())}>
          {loading ? <Loader2 size={12} className="animate-spin" /> : <FileText size={12} />}
          Load documents
        </button>
        <button onClick={run} disabled={running || !email.trim()} style={btn(running || !email.trim())}>
          {running ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
          Run cross-check
        </button>
      </div>

      {docsError && (
        <div style={{ fontFamily: MONO, fontSize: 12, color: "#C0392B", marginBottom: 12 }}>{docsError}</div>
      )}

      {docs && (
        <div style={{ display: "grid", gap: 8, marginBottom: 16 }}>
          {docs.length === 0 && (
            <div style={{ fontFamily: MONO, fontSize: 12, color: "var(--glass-2, #8a8a95)" }}>
              No documents on file.
            </div>
          )}
          {docs.map((d) => (
            <div
              key={d.id}
              className="flex items-center gap-2 flex-wrap"
              style={{
                padding: 10,
                borderRadius: 8,
                background: "var(--ob-field, rgba(255,255,255,0.02))",
                border: "0.5px solid var(--hair, rgba(255,255,255,0.08))",
              }}
            >
              <div style={{ flex: "1 1 200px", fontSize: 13, color: "var(--glass, #eaeaf0)" }}>
                {d.display_title || d.filename || "(untitled)"}
              </div>
              <div style={{ fontFamily: MONO, fontSize: 11, color: "var(--glass-2, #8a8a95)" }}>
                {new Date(d.created_at).toISOString().slice(0, 10)}
              </div>
              <select
                value={d.document_type ?? ""}
                onChange={(e) => setDocField(d, { document_type: (e.target.value || null) as Doc["document_type"] })}
                style={{ ...field, fontSize: 12, padding: "5px 8px" }}
              >
                <option value="">(unset)</option>
                {TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              <select
                value={d.cv_label ?? ""}
                disabled={d.document_type !== "cv"}
                onChange={(e) => setDocField(d, { cv_label: (e.target.value || null) as Doc["cv_label"] })}
                style={{
                  ...field,
                  fontSize: 12,
                  padding: "5px 8px",
                  opacity: d.document_type !== "cv" ? 0.5 : 1,
                }}
              >
                <option value="">(unset)</option>
                {LABELS.map((l) => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
              {saved[d.id] && (
                <span style={{ fontFamily: MONO, fontSize: 11, color: saved[d.id] === "saved" ? "#12805C" : "#C0392B" }}>
                  {saved[d.id]}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {result && (
        <div
          style={{
            padding: 12,
            borderRadius: 8,
            background: "var(--ob-field, rgba(255,255,255,0.02))",
            border: `0.5px solid ${result.ok ? "rgba(16,185,129,0.4)" : "rgba(220,38,38,0.4)"}`,
            fontFamily: MONO,
            fontSize: 12,
            color: "var(--glass, #eaeaf0)",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          <div style={{ marginBottom: 6 }}>
            <span style={{ color: result.ok ? "#12805C" : "#C0392B" }}>{result.ok ? "OK" : "FAIL"}</span>
            {result.ok && typeof result.cv_count === "number" && <> · {result.cv_count} CV(s)</>}
          </div>
          {result.ok ? (
            <div>
              {c?.headline_finding && (
                <div style={{ fontSize: 14, lineHeight: 1.5, fontWeight: 600, marginBottom: 10 }}>
                  {c.headline_finding}
                </div>
              )}

              {findings.length > 0 && (
                <div style={{ display: "grid", gap: 10 }}>
                  {findings.map((f, i) => (
                    <div key={i}>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span>{f.what}</span>
                        {f.weight && (
                          <span
                            style={{
                              fontSize: 10,
                              padding: "1px 6px",
                              borderRadius: 4,
                              textTransform: "uppercase",
                              letterSpacing: ".08em",
                              color: f.weight === "high" ? "#9A6F12" : "var(--glass-2, #8a8a95)",
                              border: `0.5px solid ${f.weight === "high" ? "rgba(245,158,11,0.4)" : "var(--hair, rgba(255,255,255,0.15))"}`,
                            }}
                          >
                            {f.weight}
                          </span>
                        )}
                      </div>
                      {f.why_it_matters && (
                        <div style={{ color: "var(--glass-2, #8a8a95)" }}>{f.why_it_matters}</div>
                      )}
                      {f.do_this && <div style={{ marginTop: 2 }}>→ {f.do_this}</div>}
                    </div>
                  ))}
                </div>
              )}

              {bullets("Check before you claim this", c?.defensibility)}
              {bullets("Your CV is behind here", c?.cv_is_behind)}

              {c?.reading_the_shape && <div style={{ marginTop: 10 }}>{c.reading_the_shape}</div>}
              {c?.profile_vs_voice && <div style={{ marginTop: 6 }}>{c.profile_vs_voice}</div>}

              {c?.headline_suggestion && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ color: "var(--glass-2, #8a8a95)" }}>A headline you could use</div>
                  <div>{c.headline_suggestion}</div>
                </div>
              )}
            </div>
          ) : (
            <div style={{ color: "var(--glass-2, #8a8a95)" }}>{failText}</div>
          )}
        </div>
      )}
    </section>
  );
}
