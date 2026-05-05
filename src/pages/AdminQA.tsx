import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import html2canvas from "html2canvas";
import { runDomAudit, type QaResult } from "@/utils/qaInteractionAudit";
import { Loader2, Copy, ChevronDown, ChevronRight } from "lucide-react";

const ADMIN_USER_ID = "9e0c6ee1-6562-4fdc-89ba-d62b39f02bb3";
const DOM_ROUTES = ["/home", "/intelligence", "/publish", "/impact", "/my-story"];
const KNOWN_KEY = "qa_known_issues_v1";

type ResultRow = {
  id: string;
  run_id: string;
  run_at: string;
  layer: string;
  category: string;
  test_id: string;
  test_name: string;
  status: "pass" | "fail" | "warn";
  details: any;
};

type RunSummary = { run_id: string; run_at: string; total: number; pass: number; warn: number; fail: number };

const STATUS_COLORS: Record<string, string> = {
  pass: "#16a34a",
  warn: "#d97706",
  fail: "#dc2626",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      style={{
        background: STATUS_COLORS[status] || "#666",
        color: "white",
        fontSize: 11,
        padding: "2px 8px",
        borderRadius: 4,
        textTransform: "uppercase",
        fontFamily: "var(--font-mono, monospace)",
        letterSpacing: 0.5,
      }}
    >
      {status}
    </span>
  );
}

function ScoreBar({ score }: { score: number }) {
  const color = score >= 7 ? STATUS_COLORS.pass : score >= 5 ? STATUS_COLORS.warn : STATUS_COLORS.fail;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
      <div style={{ flex: 1, height: 8, background: "rgba(255,255,255,0.08)", borderRadius: 4, overflow: "hidden" }}>
        <div style={{ width: `${(score / 10) * 100}%`, height: "100%", background: color }} />
      </div>
      <span style={{ fontFamily: "var(--font-mono, monospace)", minWidth: 32, textAlign: "right" }}>{score.toFixed(1)}</span>
    </div>
  );
}

function genFixPrompt(r: ResultRow): string {
  const d = r.details || {};
  const description = d.description || r.test_name;
  const expected = d.expected ?? "(see test definition)";
  const actual = d.actual ?? JSON.stringify(d).slice(0, 240);
  const location = d.element || d.page || r.category;
  return `Fix ${r.test_name}: ${description}. Expected: ${expected}. Actual: ${actual}. Location: ${location}. DO NOT change anything else.`;
}

const AdminQA = () => {
  const navigate = useNavigate();
  const [authChecked, setAuthChecked] = useState(false);

  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<string>("");
  const [currentRunId, setCurrentRunId] = useState<string | null>(null);
  const [results, setResults] = useState<ResultRow[]>([]);
  const [history, setHistory] = useState<RunSummary[]>([]);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [knownIssues, setKnownIssues] = useState<Set<string>>(new Set());
  const [compareSel, setCompareSel] = useState<string[]>([]);
  const [compareData, setCompareData] = useState<{ a: ResultRow[]; b: ResultRow[] } | null>(null);
  const [elapsedMs, setElapsedMs] = useState<number>(0);

  const screenshotsRef = useRef<{ page: string; imageBase64: string }[]>([]);
  const iframeContainerRef = useRef<HTMLDivElement | null>(null);

  // Auth gate
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (cancelled) return;
      if (!session) { navigate("/auth", { replace: true }); return; }
      if (session.user.id !== ADMIN_USER_ID) { navigate("/home", { replace: true }); return; }
      setAuthChecked(true);
    })();
    return () => { cancelled = true; };
  }, [navigate]);

  // Load known issues
  useEffect(() => {
    try {
      const raw = localStorage.getItem(KNOWN_KEY);
      if (raw) setKnownIssues(new Set(JSON.parse(raw)));
    } catch { /* noop */ }
  }, []);

  const persistKnown = (s: Set<string>) => {
    setKnownIssues(new Set(s));
    localStorage.setItem(KNOWN_KEY, JSON.stringify(Array.from(s)));
  };

  // Load history on mount
  useEffect(() => {
    if (!authChecked) return;
    fetchHistory();
  }, [authChecked]);

  // Resume mid-run after navigation? We restrict cross-route DOM audits to same-page virtual paths via SPA navigate.
  // The SPA stays mounted, so this component remains alive across navigate() calls.

  async function fetchHistory() {
    const { data, error } = await supabase
      .from("qa_audit_results")
      .select("run_id, run_at, status")
      .order("run_at", { ascending: false })
      .limit(2000);
    if (error) { toast.error("Failed to load history"); return; }
    const byRun = new Map<string, RunSummary>();
    (data || []).forEach((r: any) => {
      const key = r.run_id;
      if (!key) return;
      const cur = byRun.get(key) || { run_id: key, run_at: r.run_at, total: 0, pass: 0, warn: 0, fail: 0 };
      cur.total += 1;
      if (r.status === "pass") cur.pass += 1;
      else if (r.status === "warn") cur.warn += 1;
      else if (r.status === "fail") cur.fail += 1;
      if (new Date(r.run_at) > new Date(cur.run_at)) cur.run_at = r.run_at;
      byRun.set(key, cur);
    });
    setHistory(Array.from(byRun.values()).sort((a, b) => +new Date(b.run_at) - +new Date(a.run_at)).slice(0, 30));
  }

  async function loadRun(run_id: string) {
    const { data, error } = await supabase
      .from("qa_audit_results")
      .select("*")
      .eq("run_id", run_id)
      .order("category", { ascending: true })
      .order("test_id", { ascending: true });
    if (error) { toast.error("Failed to load run"); return [] as ResultRow[]; }
    setResults((data as ResultRow[]) || []);
    setCurrentRunId(run_id);
    return (data as ResultRow[]) || [];
  }

  // ---------------- Orchestrator ----------------
  async function runBackend(run_id: string): Promise<void> {
    setProgress("Layer 1/3 — Backend audit… ~8s");
    try {
      const { error } = await supabase.functions.invoke("run-qa-audit", { body: { layer: "backend" } });
      if (error) {
        const msg = error.message || String(error);
        if (/not\s*found|404/i.test(msg)) {
          toast.error("Backend audit EF not found — skip to DOM audit");
        } else {
          toast.error(`Backend audit failed: ${msg}. Check that run-qa-audit EF is deployed.`);
        }
      }
    } catch (e: any) {
      toast.error(`Backend audit failed: ${e?.message || String(e)}. Check that run-qa-audit EF is deployed.`);
    }
    void run_id;
  }

  async function loadIframe(src: string): Promise<HTMLIFrameElement | null> {
    const container = iframeContainerRef.current;
    if (!container) return null;
    // Clean up previous iframe
    container.innerHTML = "";
    const iframe = document.createElement("iframe");
    iframe.style.width = "1280px";
    iframe.style.height = "900px";
    iframe.style.border = "0";
    iframe.style.position = "absolute";
    iframe.style.left = "-99999px";
    iframe.style.top = "0";
    iframe.setAttribute("aria-hidden", "true");
    container.appendChild(iframe);
    await new Promise<void>((resolve) => {
      const done = () => resolve();
      iframe.addEventListener("load", done, { once: true });
      iframe.src = src;
    });
    // Extra settle delay for SPA hydration
    await new Promise((r) => setTimeout(r, 2000));
    return iframe;
  }

  async function runDomAcrossRoutes(run_id: string, userId: string): Promise<void> {
    setProgress("Layer 2/3 — DOM audit across pages…");
    screenshotsRef.current = [];
    const allRows: any[] = [];

    // Always include current page (admin/qa) results too — using local document
    let crossOriginBlocked = false;

    for (const route of DOM_ROUTES) {
      const page = route.replace(/^\//, "") || "root";
      setProgress(`Layer 2/3 — DOM audit on ${page}…`);
      let iframe: HTMLIFrameElement | null = null;
      try {
        iframe = await loadIframe(route);
      } catch (e) {
        console.warn("iframe load failed", route, e);
      }
      if (!iframe) continue;

      let doc: Document | null = null;
      try {
        doc = iframe.contentDocument;
        // Touch it to trigger any cross-origin throw
        void doc?.body;
      } catch {
        crossOriginBlocked = true;
        doc = null;
      }

      if (!doc) {
        crossOriginBlocked = true;
        allRows.push({
          run_id, run_by: userId, layer: "dom", category: "iframe",
          test_id: `${page}.iframe.blocked`,
          test_name: `[${page}] iframe DOM access blocked`,
          status: "warn",
          details: { description: "contentDocument unavailable; skipped DOM audit for this page", page },
        });
        continue;
      }

      let domResults: QaResult[] = [];
      try {
        domResults = await runDomAudit(doc);
      } catch (e: any) {
        domResults = [{ testId: "dom.crash", testName: "DOM audit crashed", category: "dom", status: "fail", details: { description: e?.message || String(e), page } }];
      }
      domResults.forEach((d) => {
        allRows.push({
          run_id, run_by: userId, layer: "dom",
          category: d.category,
          test_id: `${page}.${d.testId}`,
          test_name: `[${page}] ${d.testName}`,
          status: d.status,
          details: { ...d.details, page },
        });
      });

      // Capture screenshot of iframe body (best effort)
      try {
        if (doc.body) {
          const canvas = await html2canvas(doc.body, {
            width: 1280,
            height: 900,
            scale: 0.6,
            useCORS: true,
            backgroundColor: null,
            logging: false,
          } as any);
          const dataUrl = canvas.toDataURL("image/png");
          screenshotsRef.current.push({ page, imageBase64: dataUrl.replace(/^data:image\/png;base64,/, "") });
        }
      } catch (e) {
        console.warn("screenshot failed for", page, e);
      }
    }

    // Cleanup iframe
    if (iframeContainerRef.current) iframeContainerRef.current.innerHTML = "";

    if (crossOriginBlocked) {
      toast.message("DOM audit limited to current page. For full DOM audit, visit each page and run 'DOM Only' from that page.");
    }

    if (allRows.length > 0) {
      const { error } = await supabase.from("qa_audit_results").insert(allRows);
      if (error) toast.error(`Failed to save DOM results: ${error.message}`);
    }
  }

  async function runAi(run_id: string): Promise<void> {
    if (screenshotsRef.current.length === 0) {
      setProgress("Layer 3/3 — Skipped (no screenshots).");
      return;
    }
    setProgress(`Layer 3/3 — AI evaluation on ${screenshotsRef.current.length} pages… (~${screenshotsRef.current.length * 6}s)`);
    const { error } = await supabase.functions.invoke("qa-ai-evaluate", {
      body: { screenshots: screenshotsRef.current, run_id },
    });
    if (error) toast.error(`AI evaluation failed: ${error.message}`);
  }

  async function runFull(layers: { backend: boolean; dom: boolean; ai: boolean }) {
    if (running) return;
    setRunning(true);
    setResults([]);
    setElapsedMs(0);
    const t0 = Date.now();
    const run_id = crypto.randomUUID();
    setCurrentRunId(run_id);
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user.id || ADMIN_USER_ID;
    try {
      if (layers.backend) await runBackend(run_id);
      if (layers.dom) await runDomAcrossRoutes(run_id, userId);
      if (layers.ai) await runAi(run_id);
      setProgress("Loading results…");
      await loadRun(run_id);
      await fetchHistory();
      toast.success("Audit complete");
    } catch (e: any) {
      toast.error(`Audit aborted: ${e?.message || String(e)}`);
    } finally {
      setElapsedMs(Date.now() - t0);
      setProgress("");
      setRunning(false);
    }
  }

  // ---------------- Derived ----------------
  const visibleResults = useMemo(
    () => results.filter((r) => !knownIssues.has(r.test_id)),
    [results, knownIssues],
  );

  const summary = useMemo(() => {
    const total = visibleResults.length;
    const pass = visibleResults.filter((r) => r.status === "pass").length;
    const fail = visibleResults.filter((r) => r.status === "fail").length;
    const warn = visibleResults.filter((r) => r.status === "warn").length;
    const rate = total > 0 ? Math.round((pass / total) * 100) : 0;
    return { total, pass, fail, warn, rate };
  }, [visibleResults]);

  const layerSummary = (layer: string) => {
    const list = visibleResults.filter((r) => r.layer === layer);
    const total = list.length;
    const pass = list.filter((r) => r.status === "pass").length;
    return { total, pass, rate: total ? Math.round((pass / total) * 100) : 0 };
  };

  const groupBy = (rows: ResultRow[]) => {
    const m: Record<string, ResultRow[]> = {};
    rows.forEach((r) => { (m[r.category] ||= []).push(r); });
    return m;
  };

  const backendRows = visibleResults.filter((r) => r.layer === "backend");
  const domRows = visibleResults.filter((r) => r.layer === "dom");
  const aiRows = visibleResults.filter((r) => r.layer === "ai");

  function toggleGroup(k: string) { setOpenGroups((p) => ({ ...p, [k]: !p[k] })); }

  function copyText(s: string) {
    navigator.clipboard.writeText(s).then(() => toast.success("Copied"));
  }

  function markKnown(test_id: string) {
    const next = new Set(knownIssues); next.add(test_id); persistKnown(next);
    toast.success("Marked as known issue");
  }

  async function loadCompare() {
    if (compareSel.length !== 2) { toast.error("Select exactly 2 runs"); return; }
    const [{ data: a }, { data: b }] = await Promise.all([
      supabase.from("qa_audit_results").select("*").eq("run_id", compareSel[0]),
      supabase.from("qa_audit_results").select("*").eq("run_id", compareSel[1]),
    ]);
    setCompareData({ a: (a as ResultRow[]) || [], b: (b as ResultRow[]) || [] });
  }

  const compareDiff = useMemo(() => {
    if (!compareData) return null;
    const mapA = new Map(compareData.a.map((r) => [r.test_id, r.status]));
    const mapB = new Map(compareData.b.map((r) => [r.test_id, r.status]));
    const flips: { test_id: string; from: string; to: string }[] = [];
    new Set([...mapA.keys(), ...mapB.keys()]).forEach((id) => {
      const fa = mapA.get(id) || "missing";
      const fb = mapB.get(id) || "missing";
      if (fa !== fb) flips.push({ test_id: id, from: fa, to: fb });
    });
    return flips;
  }, [compareData]);

  // ---------------- Render ----------------
  if (!authChecked) {
    return <div style={{ padding: 32, color: "var(--ink)", background: "var(--bg, #0a0a0a)", minHeight: "100vh" }}>Checking access…</div>;
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: "var(--bg, #0a0a0a)",
      color: "var(--ink, #ECECEC)",
      fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
      padding: "32px 40px 80px",
    }}>
      <header style={{ marginBottom: 32 }}>
        <button
          onClick={() => navigate("/admin")}
          style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.1)", color: "var(--ink-2,#999)", padding: "6px 12px", borderRadius: 6, marginBottom: 16, cursor: "pointer" }}
        >
          ← Admin
        </button>
        <h1 style={{ fontFamily: "var(--font-display,'Cormorant Garamond',serif)", fontSize: 40, fontWeight: 500, margin: 0 }}>
          QA Audit Console
        </h1>
        <p style={{ color: "var(--ink-2,#999)", marginTop: 4 }}>Backend + DOM + AI evaluation across the Aura surface.</p>
      </header>

      {/* Section 1 — Run Controls */}
      <Section title="Run controls">
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <PrimaryBtn disabled={running} onClick={() => runFull({ backend: true, dom: true, ai: true })}>
            {running ? <Loader2 size={14} className="animate-spin" /> : null} Run full audit
          </PrimaryBtn>
          <SecondaryBtn disabled={running} onClick={() => runFull({ backend: true, dom: false, ai: false })}>Backend only</SecondaryBtn>
          <SecondaryBtn disabled={running} onClick={() => runFull({ backend: false, dom: true, ai: false })}>DOM only</SecondaryBtn>
          <SecondaryBtn disabled={running} onClick={() => runFull({ backend: false, dom: false, ai: true })}>AI evaluation only</SecondaryBtn>
        </div>
        {(running || progress) && (
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 13, color: "var(--ink-2,#999)" }}>{progress}</div>
            <div style={{ marginTop: 6, height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden" }}>
              <div style={{ height: "100%", width: running ? "60%" : "100%", background: "var(--brand,#C5A55A)", transition: "width 0.4s" }} />
            </div>
          </div>
        )}
      </Section>

      {/* Section 2 — Summary */}
      {results.length > 0 && (
        <>
          <Section title="Results summary">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
              <Stat label="Total" value={summary.total} />
              <Stat label="Pass" value={summary.pass} color={STATUS_COLORS.pass} />
              <Stat label="Warn" value={summary.warn} color={STATUS_COLORS.warn} />
              <Stat label="Fail" value={summary.fail} color={STATUS_COLORS.fail} />
            </div>
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 13, color: "var(--ink-2,#999)", display: "flex", justifyContent: "space-between" }}>
                <span>Overall pass rate</span>
                <span style={{ fontFamily: "var(--font-mono,monospace)" }}>{summary.rate}% • {(elapsedMs / 1000).toFixed(1)}s</span>
              </div>
              <div style={{ marginTop: 6, height: 8, background: "rgba(255,255,255,0.08)", borderRadius: 4, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${summary.rate}%`, background: STATUS_COLORS.pass }} />
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginTop: 16 }}>
              {(["backend", "dom", "ai"] as const).map((l) => {
                const s = layerSummary(l);
                return (
                  <div key={l} style={cardStyle}>
                    <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.8, color: "var(--ink-2,#999)" }}>{l}</div>
                    <div style={{ fontFamily: "var(--font-mono,monospace)", fontSize: 24, marginTop: 4 }}>{s.rate}%</div>
                    <div style={{ fontSize: 12, color: "var(--ink-2,#999)" }}>{s.pass} / {s.total} passing</div>
                  </div>
                );
              })}
            </div>
          </Section>

          {/* Section 2B — Backend */}
          {backendRows.length > 0 && (
            <Section title="Backend audit">
              {Object.entries(groupBy(backendRows)).map(([cat, rows]) => (
                <Group key={cat} cat={cat} rows={rows} open={openGroups[`be-${cat}`]} onToggle={() => toggleGroup(`be-${cat}`)}
                  onCopyFix={(r) => copyText(genFixPrompt(r))} onMarkKnown={markKnown} />
              ))}
            </Section>
          )}

          {/* Section 2C — DOM */}
          {domRows.length > 0 && (
            <Section title="DOM interaction audit">
              {Object.entries(groupBy(domRows)).map(([cat, rows]) => (
                <Group key={cat} cat={cat} rows={rows} open={openGroups[`dom-${cat}`]} onToggle={() => toggleGroup(`dom-${cat}`)}
                  onCopyFix={(r) => copyText(genFixPrompt(r))} onMarkKnown={markKnown} />
              ))}
            </Section>
          )}

          {/* Section 2D — AI */}
          {aiRows.length > 0 && (
            <Section title="AI evaluation">
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))", gap: 16 }}>
                {aiRows.map((r) => {
                  const d = r.details || {};
                  const dims: any[] = Array.isArray(d.dimensions) ? d.dimensions : [];
                  const overall = Number(d.overall_score);
                  return (
                    <div key={r.id} style={cardStyle}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                        <h3 style={{ fontFamily: "var(--font-display,serif)", fontSize: 22, margin: 0 }}>{d.page || r.test_id}</h3>
                        <span style={{ fontFamily: "var(--font-mono,monospace)", fontSize: 28, color: STATUS_COLORS[r.status] }}>
                          {isFinite(overall) ? overall.toFixed(1) : "—"}
                        </span>
                      </div>
                      <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                        {dims.map((dim, i) => (
                          <div key={i}>
                            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--ink-2,#999)" }}>
                              <span>{dim.name}</span>
                            </div>
                            <ScoreBar score={Number(dim.score) || 0} />
                            {dim.explanation && <div style={{ fontSize: 11, color: "var(--ink-2,#888)", marginTop: 2 }}>{dim.explanation}</div>}
                          </div>
                        ))}
                      </div>
                      {Array.isArray(d.critical_issues) && d.critical_issues.length > 0 && (
                        <div style={{ marginTop: 12, padding: 10, background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.3)", borderRadius: 6 }}>
                          <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.6, color: STATUS_COLORS.fail, marginBottom: 4 }}>Critical issues</div>
                          <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12 }}>
                            {d.critical_issues.map((s: string, i: number) => <li key={i}>{s}</li>)}
                          </ul>
                        </div>
                      )}
                      {Array.isArray(d.suggestions) && d.suggestions.length > 0 && (
                        <div style={{ marginTop: 8, padding: 10, background: "rgba(217,119,6,0.08)", border: "1px solid rgba(217,119,6,0.3)", borderRadius: 6 }}>
                          <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.6, color: STATUS_COLORS.warn, marginBottom: 4 }}>Suggestions</div>
                          <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12 }}>
                            {d.suggestions.map((s: string, i: number) => <li key={i}>{s}</li>)}
                          </ul>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </Section>
          )}
        </>
      )}

      {/* Section 3 — History */}
      <Section title="History">
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: "left", color: "var(--ink-2,#999)", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.6 }}>
              <th style={thStyle}>When</th>
              <th style={thStyle}>Total</th>
              <th style={thStyle}>Pass rate</th>
              <th style={thStyle}>P / W / F</th>
              <th style={thStyle}>Compare</th>
              <th style={thStyle}></th>
            </tr>
          </thead>
          <tbody>
            {history.map((h) => {
              const rate = h.total ? Math.round((h.pass / h.total) * 100) : 0;
              return (
                <tr key={h.run_id} style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                  <td style={tdStyle}>{new Date(h.run_at).toLocaleString()}</td>
                  <td style={tdStyle}>{h.total}</td>
                  <td style={tdStyle}>{rate}%</td>
                  <td style={tdStyle}>
                    <span style={{ color: STATUS_COLORS.pass }}>{h.pass}</span> /{" "}
                    <span style={{ color: STATUS_COLORS.warn }}>{h.warn}</span> /{" "}
                    <span style={{ color: STATUS_COLORS.fail }}>{h.fail}</span>
                  </td>
                  <td style={tdStyle}>
                    <input
                      type="checkbox"
                      checked={compareSel.includes(h.run_id)}
                      onChange={(e) => {
                        const next = e.target.checked
                          ? [...compareSel, h.run_id].slice(-2)
                          : compareSel.filter((id) => id !== h.run_id);
                        setCompareSel(next);
                      }}
                    />
                  </td>
                  <td style={tdStyle}>
                    <button onClick={() => loadRun(h.run_id)} style={linkBtn}>View</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {compareSel.length === 2 && (
          <div style={{ marginTop: 12 }}>
            <SecondaryBtn onClick={loadCompare}>Compare selected runs</SecondaryBtn>
          </div>
        )}
        {compareDiff && (
          <div style={{ marginTop: 16, ...cardStyle }}>
            <div style={{ fontSize: 12, color: "var(--ink-2,#999)", marginBottom: 8 }}>{compareDiff.length} tests changed</div>
            <div style={{ maxHeight: 320, overflowY: "auto" }}>
              {compareDiff.map((f, i) => (
                <div key={i} style={{ fontFamily: "var(--font-mono,monospace)", fontSize: 12, padding: "4px 0", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                  {f.test_id}: <span style={{ color: STATUS_COLORS[f.from] || "#999" }}>{f.from}</span> → <span style={{ color: STATUS_COLORS[f.to] || "#999" }}>{f.to}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </Section>

      {/* Known issues */}
      {knownIssues.size > 0 && (
        <Section title={`Known issues (${knownIssues.size})`}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {Array.from(knownIssues).map((id) => (
              <button key={id} onClick={() => { const n = new Set(knownIssues); n.delete(id); persistKnown(n); }}
                style={{ ...secondaryBtnStyle, fontSize: 11, padding: "4px 8px" }}>
                {id} ✕
              </button>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
};

/* ---------------- Subcomponents ---------------- */

const cardStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 8,
  padding: 14,
};

const thStyle: React.CSSProperties = { padding: "8px 10px", fontWeight: 500 };
const tdStyle: React.CSSProperties = { padding: "8px 10px" };
const linkBtn: React.CSSProperties = { background: "transparent", border: "1px solid rgba(255,255,255,0.15)", color: "var(--ink,#ECECEC)", padding: "4px 10px", borderRadius: 4, cursor: "pointer", fontSize: 12 };

const primaryBtnStyle: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 8,
  background: "var(--brand,#C5A55A)", color: "#0a0a0a", border: "none",
  padding: "10px 18px", borderRadius: 6, fontWeight: 600, cursor: "pointer",
};
const secondaryBtnStyle: React.CSSProperties = {
  background: "transparent", color: "var(--ink,#ECECEC)",
  border: "1px solid rgba(255,255,255,0.15)", padding: "10px 14px",
  borderRadius: 6, cursor: "pointer",
};

function PrimaryBtn(p: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...p} style={{ ...primaryBtnStyle, opacity: p.disabled ? 0.5 : 1, ...(p.style || {}) }} />;
}
function SecondaryBtn(p: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...p} style={{ ...secondaryBtnStyle, opacity: p.disabled ? 0.5 : 1, ...(p.style || {}) }} />;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginTop: 32 }}>
      <h2 style={{ fontFamily: "var(--font-display,'Cormorant Garamond',serif)", fontSize: 24, fontWeight: 500, margin: "0 0 12px", borderBottom: "1px solid rgba(255,255,255,0.08)", paddingBottom: 8 }}>{title}</h2>
      {children}
    </section>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div style={cardStyle}>
      <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.8, color: "var(--ink-2,#999)" }}>{label}</div>
      <div style={{ fontFamily: "var(--font-mono,monospace)", fontSize: 28, marginTop: 4, color: color || "var(--ink,#ECECEC)" }}>{value}</div>
    </div>
  );
}

function Group({ cat, rows, open, onToggle, onCopyFix, onMarkKnown }: {
  cat: string;
  rows: ResultRow[];
  open: boolean;
  onToggle: () => void;
  onCopyFix: (r: ResultRow) => void;
  onMarkKnown: (test_id: string) => void;
}) {
  const fail = rows.filter((r) => r.status === "fail").length;
  const warn = rows.filter((r) => r.status === "warn").length;
  return (
    <div style={{ ...cardStyle, marginBottom: 10 }}>
      <button onClick={onToggle} style={{ background: "none", border: "none", color: "inherit", width: "100%", display: "flex", alignItems: "center", gap: 8, cursor: "pointer", padding: 0, textAlign: "left" }}>
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span style={{ textTransform: "uppercase", letterSpacing: 0.6, fontSize: 12, color: "var(--ink-2,#999)" }}>{cat}</span>
        <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--ink-2,#999)" }}>
          {rows.length} • <span style={{ color: STATUS_COLORS.fail }}>{fail} fail</span> • <span style={{ color: STATUS_COLORS.warn }}>{warn} warn</span>
        </span>
      </button>
      {open && (
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
          {rows.map((r) => <ResultRowView key={r.id} r={r} onCopyFix={onCopyFix} onMarkKnown={onMarkKnown} />)}
        </div>
      )}
    </div>
  );
}

function ResultRowView({ r, onCopyFix, onMarkKnown }: {
  r: ResultRow;
  onCopyFix: (r: ResultRow) => void;
  onMarkKnown: (test_id: string) => void;
}) {
  const [open, setOpen] = useState(r.status !== "pass");
  const d = r.details || {};
  return (
    <div style={{ borderTop: "1px solid rgba(255,255,255,0.05)", paddingTop: 6 }}>
      <button onClick={() => setOpen((p) => !p)} style={{ background: "none", border: "none", color: "inherit", width: "100%", display: "flex", alignItems: "center", gap: 10, cursor: "pointer", padding: 4, textAlign: "left" }}>
        <StatusBadge status={r.status} />
        <span style={{ fontFamily: "var(--font-mono,monospace)", fontSize: 11, color: "var(--ink-2,#999)" }}>{r.test_id}</span>
        <span style={{ fontSize: 13 }}>{r.test_name}</span>
      </button>
      {open && (
        <div style={{ padding: "6px 8px 8px 28px", fontSize: 12, color: "var(--ink-2,#bbb)" }}>
          {d.description && <div style={{ marginBottom: 4 }}>{d.description}</div>}
          {d.element && <div><span style={{ color: "var(--ink-2,#888)" }}>Element:</span> <code>{String(d.element)}</code></div>}
          {(d.expected !== undefined) && <div><span style={{ color: "var(--ink-2,#888)" }}>Expected:</span> <code>{String(d.expected)}</code></div>}
          {(d.actual !== undefined) && <div><span style={{ color: "var(--ink-2,#888)" }}>Actual:</span> <code>{String(d.actual)}</code></div>}
          {Array.isArray(d.samples) && d.samples.length > 0 && (
            <details style={{ marginTop: 4 }}>
              <summary style={{ cursor: "pointer" }}>{d.samples.length} samples</summary>
              <pre style={{ fontSize: 11, whiteSpace: "pre-wrap", margin: "4px 0", color: "var(--ink-2,#888)" }}>{d.samples.map((s: any) => typeof s === "string" ? s : JSON.stringify(s)).join("\n")}</pre>
            </details>
          )}
          {r.status === "fail" && (
            <div style={{ marginTop: 8, display: "flex", gap: 6 }}>
              <button onClick={() => onCopyFix(r)} style={{ ...secondaryBtnStyle, padding: "4px 10px", fontSize: 11, display: "inline-flex", alignItems: "center", gap: 4 }}>
                <Copy size={11} /> Generate fix prompt
              </button>
              <button onClick={() => onMarkKnown(r.test_id)} style={{ ...secondaryBtnStyle, padding: "4px 10px", fontSize: 11 }}>
                Mark as known issue
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default AdminQA;