import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import html2canvas from "html2canvas";
import { runDomAudit } from "@/utils/qaInteractionAudit";
import { Loader2, Copy, ChevronDown, ChevronRight, X, Download } from "lucide-react";

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

type IframeStatus = {
  route: string;
  state: "pending" | "ok" | "fail";
  ms?: number;
  tests?: number;
  error?: string;
};

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
        fontSize: 12,
        fontWeight: 600,
        padding: "4px 10px",
        borderRadius: 5,
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

function genBatchFixPrompt(category: string, rows: ResultRow[]): string {
  const fails = rows.filter((r) => r.status !== "pass");
  if (fails.length === 0) return "";
  const byPage: Record<string, ResultRow[]> = {};
  fails.forEach((r) => {
    const page = (r.details?.page as string) || (r.test_id.split(".")[0] || "unknown");
    (byPage[page] ||= []).push(r);
  });
  const pages = Object.keys(byPage);
  let out = `Fix ${fails.length} ${category} issues across ${pages.join(", ")}:\n`;
  for (const page of pages) {
    out += `\nPage: /${page === "unknown" ? "" : page}\n`;
    for (const r of byPage[page]) {
      const d = r.details || {};
      const desc = d.description || r.test_name;
      const loc = d.element || "(unknown element)";
      const exp = d.expected ?? "—";
      const act = d.actual ?? "—";
      out += `- ${desc} at ${loc}\n  ${exp} → ${act}\n`;
    }
  }
  out += `\nFor each issue, change actual to match expected. Fix all of them in one pass.\nDO NOT change anything else. Only fix the listed issues.`;
  return out;
}

function genFullBatchFixPrompt(rows: ResultRow[]): string {
  const fails = rows.filter((r) => r.status !== "pass");
  if (fails.length === 0) return "";
  const byCat: Record<string, ResultRow[]> = {};
  fails.forEach((r) => { (byCat[r.category] ||= []).push(r); });
  let out = `# Aura QA — Full Batch Fix\n\nFix ${fails.length} issues across ${Object.keys(byCat).length} categories:\n`;
  for (const cat of Object.keys(byCat)) {
    out += `\n## ${cat.toUpperCase()} (${byCat[cat].length})\n`;
    out += genBatchFixPrompt(cat, byCat[cat]).split("\n").slice(1).join("\n") + "\n";
  }
  return out;
}

function genMarkdownReport(rows: ResultRow[], summary: { total: number; pass: number; warn: number; fail: number; rate: number }, runId: string | null): string {
  const now = new Date().toISOString();
  let md = `# Aura QA Report\n\n- Run ID: ${runId || "(none)"}\n- Date: ${now}\n- Total: ${summary.total} • Pass: ${summary.pass} • Warn: ${summary.warn} • Fail: ${summary.fail} • Pass rate: ${summary.rate}%\n\n`;
  const byPage: Record<string, ResultRow[]> = {};
  rows.forEach((r) => {
    const page = (r.details?.page as string) || (r.test_id.split(".")[0] || "unknown");
    (byPage[page] ||= []).push(r);
  });
  md += `## Per-page breakdown\n\n`;
  for (const page of Object.keys(byPage)) {
    const list = byPage[page];
    const p = list.filter(r => r.status === "pass").length;
    const w = list.filter(r => r.status === "warn").length;
    const f = list.filter(r => r.status === "fail").length;
    md += `- **${page}** — ${list.length} tests • ${p} pass / ${w} warn / ${f} fail\n`;
  }
  md += `\n## Failures\n\n`;
  rows.filter(r => r.status !== "pass").forEach((r) => {
    const d = r.details || {};
    md += `### [${r.category}] ${r.test_name} (${r.status})\n`;
    md += `- test_id: \`${r.test_id}\`\n`;
    if (d.element) md += `- location: \`${d.element}\`\n`;
    if (d.expected !== undefined) md += `- expected: ${d.expected}\n`;
    if (d.actual !== undefined) md += `- actual: ${d.actual}\n`;
    if (d.description) md += `- ${d.description}\n`;
    md += `\n`;
  });
  md += `## Batch fix prompts\n\n`;
  const byCat: Record<string, ResultRow[]> = {};
  rows.filter(r => r.status !== "pass").forEach((r) => { (byCat[r.category] ||= []).push(r); });
  for (const cat of Object.keys(byCat)) {
    md += `### ${cat}\n\n\`\`\`\n${genBatchFixPrompt(cat, byCat[cat])}\n\`\`\`\n\n`;
  }
  return md;
}

function formatRunDate(s: string): string {
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
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
  const [iframeStatuses, setIframeStatuses] = useState<IframeStatus[]>([]);
  const [backendError, setBackendError] = useState<string | null>(null);
  const [batchModal, setBatchModal] = useState<{ title: string; text: string } | null>(null);

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
    setBackendError(null);
    try {
      const { error } = await supabase.functions.invoke("run-qa-audit", { body: { layer: "backend", run_id } });
      if (error) {
        const msg = error.message || String(error);
        setBackendError(msg);
        if (/not\s*found|404/i.test(msg)) {
          toast.error("Backend audit EF not found — skip to DOM audit");
        } else {
          toast.error(`Backend audit failed: ${msg}. Check that run-qa-audit EF is deployed.`);
        }
      }
    } catch (e: any) {
      const msg = e?.message || String(e);
      setBackendError(msg);
      toast.error(`Backend audit failed: ${msg}. Check that run-qa-audit EF is deployed.`);
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
    const statuses: IframeStatus[] = DOM_ROUTES.map(r => ({ route: r, state: "pending" }));
    setIframeStatuses(statuses);

    let crossOriginBlocked = false;

    for (let idx = 0; idx < DOM_ROUTES.length; idx++) {
      const route = DOM_ROUTES[idx];
      const page = route.replace(/^\//, "") || "root";
      setProgress(`Layer 2/3 — DOM audit on ${page}…`);
      const t0 = performance.now();
      let iframe: HTMLIFrameElement | null = null;
      try {
        iframe = await loadIframe(route);
      } catch (e) {
        console.warn("iframe load failed", route, e);
        statuses[idx] = { route, state: "fail", error: (e as any)?.message || String(e) };
        setIframeStatuses([...statuses]);
      }
      if (!iframe) {
        if (statuses[idx].state === "pending") {
          statuses[idx] = { route, state: "fail", error: "iframe not created" };
          setIframeStatuses([...statuses]);
        }
        continue;
      }

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
        statuses[idx] = { route, state: "fail", ms: Math.round(performance.now() - t0), error: "DOM access blocked" };
        setIframeStatuses([...statuses]);
        allRows.push({
          run_id, run_by: userId, layer: "dom", category: "iframe",
          test_id: `${page}.iframe.blocked`,
          test_name: `[${page}] iframe DOM access blocked`,
          status: "warn",
          details: { description: "contentDocument unavailable; skipped DOM audit for this page", page },
        });
        continue;
      }

      let testCount = 0;
      // Run the FULL DOM audit against the iframe's document
      try {
        const pageResults = await runDomAudit(doc);
        pageResults.forEach((d) => {
          allRows.push({
            run_id, run_by: userId, layer: "dom",
            category: d.category,
            test_id: `${page}.${d.testId}`,
            test_name: `[${page}] ${d.testName}`,
            status: d.status,
            details: { ...d.details, page },
          });
        });
        testCount = pageResults.length;
      } catch (e: any) {
        allRows.push({
          run_id, run_by: userId, layer: "dom", category: "iframe",
          test_id: `${page}.iframe.crash`,
          test_name: `[${page}] iframe DOM audit crashed`,
          status: "fail",
          details: { description: e?.message || String(e), page },
        });
        testCount += 1;
      }

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
      statuses[idx] = { route, state: "ok", ms: Math.round(performance.now() - t0), tests: testCount };
      setIframeStatuses([...statuses]);
    }

    // Cleanup iframe
    if (iframeContainerRef.current) iframeContainerRef.current.innerHTML = "";

    // NOTE: We intentionally do NOT audit /admin/qa itself — it's the testing tool, not the product.

    if (crossOriginBlocked) {
      toast.message("DOM audit limited. iframe DOM access was blocked for some routes.");
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

  function openBatchFix(category: string, rows: ResultRow[]) {
    const text = genBatchFixPrompt(category, rows);
    if (!text) { toast.message("No failures in this category"); return; }
    setBatchModal({ title: `Batch fix — ${category} (${rows.filter(r=>r.status!=="pass").length} issues)`, text });
  }

  function openFullBatchFix() {
    const text = genFullBatchFixPrompt(visibleResults);
    if (!text) { toast.message("No failures to fix"); return; }
    setBatchModal({ title: `Full batch fix`, text });
  }

  function exportReport() {
    const md = genMarkdownReport(visibleResults, summary, currentRunId);
    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `aura-qa-report-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.md`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
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
      color: "var(--ink, #F4EFE6)",
      fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
      fontSize: 15,
      lineHeight: 1.55,
      padding: "32px 40px 80px",
    }}>
      <header style={{ marginBottom: 32 }}>
        <button
          onClick={() => navigate("/admin")}
          style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.18)", color: "var(--ink, #F4EFE6)", padding: "6px 12px", borderRadius: 6, marginBottom: 16, cursor: "pointer", fontSize: 13, fontFamily: "var(--font-body, 'DM Sans', sans-serif)" }}
        >
          ← Admin
        </button>
        <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 48, fontWeight: 500, margin: 0, color: "#F4EFE6", letterSpacing: 0.2 }}>
          QA Audit Console
        </h1>
        <p style={{ color: "#B8B0A2", marginTop: 6, fontSize: 15 }}>Backend + DOM + AI evaluation across the Aura surface.</p>
      </header>
      {/* Hidden iframe container used by the DOM audit to load other routes without unmounting this page */}
      <div ref={iframeContainerRef} aria-hidden="true" style={{ position: "fixed", left: -99999, top: 0, width: 0, height: 0, overflow: "hidden", pointerEvents: "none" }} />

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
            <div style={{ fontSize: 14, color: "#D4CCBC" }}>{progress}</div>
            <div style={{ marginTop: 6, height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden" }}>
              <div style={{ height: "100%", width: running ? "60%" : "100%", background: "var(--brand,#C5A55A)", transition: "width 0.4s" }} />
            </div>
          </div>
        )}
      </Section>

      {/* Iframe audit status */}
      {iframeStatuses.length > 0 && (
        <Section title="Iframe audit status">
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {iframeStatuses.map((s) => (
              <div key={s.route} style={{
                ...cardStyle,
                display: "flex", alignItems: "center", gap: 12, padding: "10px 14px",
              }}>
                <span style={{ width: 18, fontSize: 16, color: s.state === "ok" ? STATUS_COLORS.pass : s.state === "fail" ? STATUS_COLORS.fail : "#999" }}>
                  {s.state === "ok" ? "✓" : s.state === "fail" ? "✗" : "…"}
                </span>
                <code style={{ fontFamily: "var(--font-mono, monospace)", fontSize: 14, color: "#F4EFE6", minWidth: 140 }}>{s.route}</code>
                <span style={{ fontSize: 13, color: "#B8B0A2" }}>
                  {s.state === "ok" && `loaded (${((s.ms || 0) / 1000).toFixed(1)}s) — ${s.tests || 0} tests run`}
                  {s.state === "fail" && `failed to load — ${s.error || "unknown error"}`}
                  {s.state === "pending" && "pending…"}
                </span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Backend error visibility */}
      {backendError && (
        <Section title="Backend audit error">
          <div style={{
            ...cardStyle,
            borderColor: "rgba(220,38,38,0.4)",
            background: "rgba(220,38,38,0.08)",
          }}>
            <div style={{ fontSize: 13, color: STATUS_COLORS.fail, fontWeight: 600, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.6 }}>
              run-qa-audit failed
            </div>
            <pre style={{ margin: 0, fontFamily: "var(--font-mono, monospace)", fontSize: 13, color: "#F4EFE6", whiteSpace: "pre-wrap" }}>{backendError}</pre>
          </div>
        </Section>
      )}

      {/* Section 2 — Summary */}
      {results.length > 0 && (
        <>
          <Section title="Results summary">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
              <Stat label="Total" value={summary.total} emphasis />
              <Stat label="Pass" value={summary.pass} color={STATUS_COLORS.pass} />
              <Stat label="Warn" value={summary.warn} color={STATUS_COLORS.warn} />
              <Stat label="Fail" value={summary.fail} color={STATUS_COLORS.fail} />
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
              <SecondaryBtn onClick={openFullBatchFix} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <Copy size={14} /> Generate FULL batch fix
              </SecondaryBtn>
              <SecondaryBtn onClick={exportReport} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <Download size={14} /> Export report
              </SecondaryBtn>
            </div>
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 15, color: "#F4EFE6", display: "flex", justifyContent: "space-between", fontWeight: 500 }}>
                <span>Overall pass rate</span>
                <span style={{ fontFamily: "var(--font-mono,monospace)", fontSize: 16 }}>{summary.rate}% &nbsp;•&nbsp; {(elapsedMs / 1000).toFixed(1)}s</span>
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
                    <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 0.8, color: "#B8B0A2", fontWeight: 600 }}>{l}</div>
                    <div style={{ fontFamily: "var(--font-mono,monospace)", fontSize: 28, marginTop: 4, color: "#F4EFE6" }}>{s.rate}%</div>
                    <div style={{ fontSize: 13, color: "#B8B0A2" }}>{s.pass} / {s.total} passing</div>
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
                  onCopyFix={(r) => copyText(genFixPrompt(r))} onMarkKnown={markKnown}
                  onBatchFix={() => openBatchFix(cat, rows)} />
              ))}
            </Section>
          )}

          {/* Section 2C — DOM */}
          {domRows.length > 0 && (
            <Section title="DOM interaction audit">
              {Object.entries(groupBy(domRows)).map(([cat, rows]) => (
                <Group key={cat} cat={cat} rows={rows} open={openGroups[`dom-${cat}`]} onToggle={() => toggleGroup(`dom-${cat}`)}
                  onCopyFix={(r) => copyText(genFixPrompt(r))} onMarkKnown={markKnown}
                  onBatchFix={() => openBatchFix(cat, rows)} />
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
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr style={{ textAlign: "left", color: "#D4CCBC", fontSize: 12, textTransform: "uppercase", letterSpacing: 0.6, fontWeight: 600 }}>
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
              const isCurrent = currentRunId === h.run_id;
              return (
                <tr key={h.run_id} style={{ borderTop: "1px solid rgba(255,255,255,0.08)", background: isCurrent ? "rgba(197,165,90,0.06)" : "transparent" }}>
                  <td style={{ ...tdStyle, whiteSpace: "nowrap", color: "#F4EFE6", fontFamily: "var(--font-mono, monospace)" }}>{formatRunDate(h.run_at)}</td>
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
                    <button onClick={() => loadRun(h.run_id)} style={linkBtn}>{isCurrent ? "Viewing" : "View"}</button>
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

      {batchModal && (
        <div onClick={() => setBatchModal(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "#15140f", border: "1px solid rgba(197,165,90,0.4)", borderRadius: 10, padding: 20, width: "min(900px, 100%)", maxHeight: "85vh", display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <h3 style={{ margin: 0, fontFamily: "'Cormorant Garamond', serif", fontSize: 24, color: "#F4EFE6" }}>{batchModal.title}</h3>
              <button onClick={() => setBatchModal(null)} style={{ background: "transparent", border: "none", color: "#F4EFE6", cursor: "pointer" }}><X size={18} /></button>
            </div>
            <textarea readOnly value={batchModal.text} style={{ width: "100%", flex: 1, minHeight: 360, background: "#0a0a0a", color: "#F4EFE6", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 6, padding: 12, fontFamily: "var(--font-mono, monospace)", fontSize: 13, lineHeight: 1.5 }} />
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <SecondaryBtn onClick={() => setBatchModal(null)}>Close</SecondaryBtn>
              <PrimaryBtn onClick={() => copyText(batchModal.text)}><Copy size={14} /> Copy to clipboard</PrimaryBtn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/* ---------------- Subcomponents ---------------- */

const cardStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 8,
  padding: 16,
};

const thStyle: React.CSSProperties = { padding: "10px 12px", fontWeight: 600 };
const tdStyle: React.CSSProperties = { padding: "10px 12px", color: "#F4EFE6" };
const linkBtn: React.CSSProperties = { background: "transparent", border: "1px solid rgba(255,255,255,0.2)", color: "#F4EFE6", padding: "5px 12px", borderRadius: 4, cursor: "pointer", fontSize: 13, fontFamily: "var(--font-body, 'DM Sans', sans-serif)" };

const primaryBtnStyle: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 8,
  background: "var(--brand,#C5A55A)", color: "#0a0a0a", border: "none",
  padding: "11px 20px", borderRadius: 6, fontWeight: 600, cursor: "pointer", fontSize: 14, fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
};
const secondaryBtnStyle: React.CSSProperties = {
  background: "transparent", color: "#F4EFE6",
  border: "1px solid rgba(255,255,255,0.2)", padding: "10px 16px",
  borderRadius: 6, cursor: "pointer", fontSize: 14, fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
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
      <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 28, fontWeight: 500, margin: "0 0 14px", borderBottom: "1px solid rgba(255,255,255,0.12)", paddingBottom: 10, color: "#F4EFE6", letterSpacing: 0.2 }}>{title}</h2>
      {children}
    </section>
  );
}

function Stat({ label, value, color, emphasis }: { label: string; value: number; color?: string; emphasis?: boolean }) {
  return (
    <div style={{ ...cardStyle, ...(emphasis ? { background: "rgba(197,165,90,0.08)", border: "1px solid rgba(197,165,90,0.4)" } : null) }}>
      <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 0.8, color: emphasis ? "var(--brand, #C5A55A)" : "#B8B0A2", fontWeight: 600 }}>{label}</div>
      <div style={{ fontFamily: "var(--font-mono,monospace)", fontSize: emphasis ? 40 : 30, marginTop: 6, color: color || "#F4EFE6", fontWeight: emphasis ? 700 : 500 }}>{value}</div>
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
  const pass = rows.filter((r) => r.status === "pass").length;
  return (
    <div style={{ ...cardStyle, marginBottom: 10 }}>
      <button onClick={onToggle} style={{ background: "none", border: "none", color: "inherit", width: "100%", display: "flex", alignItems: "center", gap: 8, cursor: "pointer", padding: 0, textAlign: "left" }}>
        {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        <span style={{ textTransform: "uppercase", letterSpacing: 0.6, fontSize: 16, color: "#F4EFE6", fontWeight: 700 }}>{cat}</span>
        <span style={{ marginLeft: "auto", fontSize: 13, color: "#D4CCBC", display: "inline-flex", gap: 10 }}>
          <span>{rows.length} total</span>
          <span style={{ color: STATUS_COLORS.pass }}>{pass} pass</span>
          <span style={{ color: STATUS_COLORS.warn }}>{warn} warn</span>
          <span style={{ color: STATUS_COLORS.fail }}>{fail} fail</span>
        </span>
      </button>
      {open && (
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
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
  const severity = (d.severity as string) || (r.status === "fail" ? "high" : r.status === "warn" ? "medium" : "low");
  const sevColor = severity === "critical" ? "#dc2626" : severity === "high" ? "#ea580c" : severity === "medium" ? "#d97706" : "#65a30d";
  const isColor = r.category === "colors" || r.category === "accessibility";
  const fg: string | undefined = (d as any).fg;
  const bg: string | undefined = (d as any).bg;
  return (
    <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 10 }}>
      <button onClick={() => setOpen((p) => !p)} style={{ background: "none", border: "none", color: "inherit", width: "100%", display: "flex", alignItems: "center", gap: 10, cursor: "pointer", padding: 4, textAlign: "left", flexWrap: "wrap" }}>
        <StatusBadge status={r.status} />
        {r.status !== "pass" && (
          <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 8px", borderRadius: 4, background: `${sevColor}22`, color: sevColor, border: `1px solid ${sevColor}66`, textTransform: "uppercase", letterSpacing: 0.4 }}>{severity}</span>
        )}
        <span style={{ fontSize: 14, color: "#F4EFE6", fontWeight: 500 }}>{r.test_name}</span>
        <span style={{ fontFamily: "var(--font-mono,monospace)", fontSize: 12, color: "#9C9485", marginLeft: "auto" }}>{r.test_id}</span>
      </button>
      {open && (
        <div style={{ padding: "10px 12px 12px 12px", fontSize: 14, color: "#D4CCBC", display: "flex", flexDirection: "column", gap: 6, marginTop: 6, background: "rgba(0,0,0,0.25)", borderRadius: 6 }}>
          {d.description && <div style={{ color: "#F4EFE6" }}>{d.description}</div>}
          {d.page && <div><Label>Location</Label><code style={codeStyle}>{String(d.page)}{d.element ? ` → ${String(d.element)}` : ""}</code></div>}
          {!d.page && d.element && <div><Label>Location</Label><code style={codeStyle}>{String(d.element)}</code></div>}
          {(d.expected !== undefined) && <div><Label>Expected</Label><code style={codeStyle}>{String(d.expected)}</code></div>}
          {(d.actual !== undefined) && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <Label>Actual</Label><code style={codeStyle}>{String(d.actual)}</code>
              {isColor && fg && bg && (
                <span style={{ display: "inline-flex", gap: 6, alignItems: "center", marginLeft: 8 }}>
                  <Swatch color={fg} label="fg" />
                  <Swatch color={bg} label="bg" />
                </span>
              )}
            </div>
          )}
          {Array.isArray(d.samples) && d.samples.length > 0 && (
            <details style={{ marginTop: 4 }}>
              <summary style={{ cursor: "pointer", color: "#B8B0A2", fontSize: 13 }}>{d.samples.length} samples</summary>
              <pre style={{ fontSize: 12, whiteSpace: "pre-wrap", margin: "6px 0", color: "#B8B0A2", fontFamily: "var(--font-mono, monospace)" }}>{d.samples.map((s: any) => typeof s === "string" ? s : JSON.stringify(s)).join("\n")}</pre>
            </details>
          )}
          {r.status !== "pass" && (
            <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button onClick={() => onCopyFix(r)} style={{ ...secondaryBtnStyle, padding: "6px 12px", fontSize: 13, display: "inline-flex", alignItems: "center", gap: 6 }}>
                <Copy size={13} /> Generate fix prompt
              </button>
              <button onClick={() => onMarkKnown(r.test_id)} style={{ ...secondaryBtnStyle, padding: "6px 12px", fontSize: 13 }}>
                Mark as known issue
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <span style={{ display: "inline-block", minWidth: 80, fontSize: 12, color: "#9C9485", textTransform: "uppercase", letterSpacing: 0.6, fontWeight: 600, marginRight: 8 }}>{children}</span>;
}

const codeStyle: React.CSSProperties = {
  fontFamily: "var(--font-mono, monospace)",
  fontSize: 13,
  color: "#F4EFE6",
  background: "rgba(255,255,255,0.05)",
  padding: "2px 6px",
  borderRadius: 4,
  wordBreak: "break-word",
};

function Swatch({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: "#B8B0A2" }}>
      <span style={{ width: 16, height: 16, borderRadius: 3, background: color, border: "1px solid rgba(255,255,255,0.2)" }} />
      <code style={{ fontFamily: "var(--font-mono,monospace)", fontSize: 12 }}>{label}: {color}</code>
    </span>
  );
}

export default AdminQA;