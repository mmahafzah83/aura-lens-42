import { createClient } from "npm:@supabase/supabase-js@2";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
import JSZip from "https://esm.sh/jszip@3.10.1";

// User-content tables only. Internal/telemetry tables (ef_error_log, job_queue,
// sync_*, product_events, output_leak_log, ai_usage_log, *_retired_*) are
// operations data and are deliberately excluded.
const TABLES = [
  "diagnostic_profiles",
  "entries",
  "documents",
  "evidence_fragments",
  "strategic_signals",
  "signal_engagements",
  "signal_topic_preferences",
  "linkedin_posts",
  "linkedin_post_metrics",
  "authority_voice_profiles",
  "training_logs",
  "draft_edits",
  "score_snapshots",
  "imprint_snapshots",
  "user_milestones",
  "weekly_missions",
  "impact_narratives",
  "focus_accounts",
  "aura_conversation_memory",
  "chat_conversations",
  "chat_messages",
  "beta_feedback",
] as const;

const FRIENDLY: Record<string, string> = {
  diagnostic_profiles: "Your profile",
  entries: "Captures (things you saved)",
  documents: "Documents you uploaded",
  evidence_fragments: "Evidence pulled from your reading",
  strategic_signals: "Signals",
  signal_engagements: "Signals you opened",
  signal_topic_preferences: "Topic preferences",
  linkedin_posts: "Posts and drafts",
  linkedin_post_metrics: "Post performance",
  authority_voice_profiles: "Your voice profile",
  training_logs: "Voice training",
  draft_edits: "Your edits",
  score_snapshots: "Imprint history",
  imprint_snapshots: "Imprint history (daily)",
  user_milestones: "Milestones",
  weekly_missions: "Weekly missions",
  impact_narratives: "Impact notes",
  focus_accounts: "Accounts you follow",
  aura_conversation_memory: "Ask Aura conversations",
  chat_conversations: "Ask Aura conversations",
  chat_messages: "Ask Aura conversations",
  beta_feedback: "Feedback you sent",
};

const friendly = (t: string) => FRIENDLY[t] ?? t;

// Machine-generated index structures. Never exported: unreadable and not content.
const EXCLUDED_COLUMNS = new Set([
  "embedding",
  "tsv",
  "search_vector",
  "fts",
  "content_embedding",
]);

function stripRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(row ?? {})) {
    if (EXCLUDED_COLUMNS.has(k)) continue;
    out[k] = row[k];
  }
  return out;
}

const BOM = "\uFEFF";

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let s: string;
  if (typeof value === "boolean") s = value ? "TRUE" : "FALSE";
  else if (typeof value === "object") s = JSON.stringify(value);
  else s = String(value);
  // Neutralise spreadsheet formula injection.
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(rows: Record<string, unknown>[]): string {
  const cols: string[] = [];
  for (const row of rows) {
    for (const k of Object.keys(row ?? {})) if (!cols.includes(k)) cols.push(k);
  }
  const lines = [cols.map(csvCell).join(",")];
  for (const row of rows) lines.push(cols.map((c) => csvCell(row?.[c])).join(","));
  return BOM + lines.join("\r\n") + "\r\n";
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function buildIndexHtml(opts: {
  now: Date;
  userId: string;
  userEmail?: string;
  counts: Record<string, number>;
  empty: string[];
  errored: { table: string; error: string }[];
}): string {
  const { now, userId, userEmail, counts, empty, errored } = opts;
  const who = esc(userEmail || userId);
  const date = now.toISOString().slice(0, 10);

  const rows = Object.keys(counts)
    .filter((t) => counts[t] > 0)
    .sort((a, b) => friendly(a).localeCompare(friendly(b)))
    .map(
      (t) => `<tr>
      <td><strong>${esc(friendly(t))}</strong><br><span class="raw">${esc(t)}</span></td>
      <td class="num">${counts[t]}</td>
      <td><a href="readable/${esc(t)}.csv">${esc(t)}.csv</a></td>
      <td><a href="data/${esc(t)}.json">${esc(t)}.json</a></td>
    </tr>`,
    )
    .join("\n");

  const emptyList = empty.length
    ? `<p class="muted">Nothing stored here yet: ${empty
        .map((t) => esc(friendly(t)))
        .filter((v, i, a) => a.indexOf(v) === i)
        .join(", ")}.</p>`
    : "";

  const erroredList = errored.length
    ? `<p class="muted">Could not be read: ${errored
        .map((e) => `${esc(friendly(e.table))} (${esc(e.error)})`)
        .join("; ")}.</p>`
    : "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Your Aura data</title>
<style>
  body { background:#F1ECE1; color:#1B1712; margin:0; padding:48px 20px;
         font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
         font-size:15px; line-height:1.6; }
  .wrap { max-width:760px; margin:0 auto; }
  h1, h2 { font-family:Georgia,"Times New Roman",serif; font-weight:600; letter-spacing:-0.01em; }
  h1 { font-size:30px; margin:0 0 6px; }
  h2 { font-size:19px; margin:36px 0 10px; }
  .meta { color:#1B1712; opacity:0.65; font-size:13px; margin:0 0 24px; }
  hr { border:0; border-top:1px solid #DCD4C4; margin:28px 0; }
  table { border-collapse:collapse; width:100%; }
  th, td { text-align:left; padding:10px 8px; border-bottom:1px solid #DCD4C4; vertical-align:top; }
  th { font-size:12px; text-transform:uppercase; letter-spacing:0.08em; opacity:0.6; font-weight:600; }
  td.num, th.num { text-align:right; white-space:nowrap; }
  .raw { font-size:12px; opacity:0.5; }
  a { color:#6E2A26; }
  .muted { color:#1B1712; opacity:0.7; font-size:14px; }
</style>
</head>
<body>
<div class="wrap">
  <h1>Your Aura data</h1>
  <p class="meta">Exported ${esc(date)} &middot; ${who}</p>
  <p>This archive is everything Aura holds about your account. It is yours to keep, read,
  or move somewhere else. The files in <strong>readable/</strong> are plain CSV — double-click
  one to open it in Excel, Numbers or Google Sheets. The same information is in
  <strong>data/</strong> as JSON if you or a developer want to import it into another system.</p>
  <hr>
  <h2>What is in here</h2>
  <table>
    <thead><tr><th>Section</th><th class="num">Rows</th><th>Spreadsheet</th><th>JSON</th></tr></thead>
    <tbody>
${rows || '<tr><td colspan="4" class="muted">No records were found for this account.</td></tr>'}
    </tbody>
  </table>
  ${emptyList}
  ${erroredList}
  <hr>
  <h2>Notes</h2>
  <p class="muted">Documents you uploaded are listed as records (file names and details) but the
  original files themselves are not included in this version of the export. Operational records
  such as error logs, job queues and usage metering are not included, because they are system
  records rather than your content.</p>
  <p class="muted">Internal search index data used to power similarity matching is not included;
  it is machine-generated and not readable.</p>
  <p class="muted">This page contains no tracking and makes no internet requests.</p>
</div>
</body>
</html>
`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Caller-scoped client only. RLS enforces row ownership; no service role here.
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const token = authHeader.replace("Bearer ", "");
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
  if (claimsError || !claimsData?.claims?.sub) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const userId = claimsData.claims.sub as string;
  const userEmail = (claimsData.claims as Record<string, unknown>).email as string | undefined;

  const zip = new JSZip();
  const dataFolder = zip.folder("data")!;
  const readableFolder = zip.folder("readable")!;
  const counts: Record<string, number> = {};
  const empty: string[] = [];
  const errored: { table: string; error: string }[] = [];

  const PAGE = 1000;

  // Sequential on purpose: keeps memory flat and avoids timeouts.
  for (const table of TABLES) {
    try {
      // Paginate: PostgREST caps a single response, so page until short read.
      const rows: unknown[] = [];
      let from = 0;
      let failed: string | null = null;
      for (;;) {
        const { data, error } = await supabase
          .from(table)
          .select("*")
          .eq("user_id", userId)
          .range(from, from + PAGE - 1);
        if (error) { failed = error.message; break; }
        const batch = data ?? [];
        rows.push(...batch);
        if (batch.length < PAGE) break;
        from += PAGE;
      }
      if (failed) {
        errored.push({ table, error: failed });
        continue;
      }
      counts[table] = rows.length;
      if (rows.length === 0) {
        empty.push(table);
        continue;
      }
      dataFolder.file(`${table}.json`, JSON.stringify(rows, null, 2));
      readableFolder.file(`${table}.csv`, toCsv(rows as Record<string, unknown>[]));
    } catch (e) {
      errored.push({ table, error: e instanceof Error ? e.message : String(e) });
    }
  }

  const now = new Date();
  const manifest = {
    export_generated_at: now.toISOString(),
    user_id: userId,
    tables_requested: TABLES.length,
    row_counts: counts,
    skipped_empty_tables: empty,
    errored_tables: errored,
  };
  zip.file("manifest.json", JSON.stringify(manifest, null, 2));

  zip.file("index.html", buildIndexHtml({ now, userId, userEmail, counts, empty, errored }));

  zip.file(
    "README.txt",
    [
      "Aura data export",
      "",
      `Generated: ${now.toISOString()}`,
      `Account: ${userId}`,
      "",
      "What is in this archive",
      "-----------------------",
      "index.html   Start here. Open it in any web browser. It lists everything in this",
      "             archive in plain English, with row counts and links to each file.",
      "readable/    One CSV file per section, ready to open in Excel, Numbers or Sheets.",
      "             Saved with a UTF-8 byte order mark so Arabic text displays correctly.",
      "data/        The same information as JSON, for moving it into another system.",
      "",
      "Sections that held no rows for your account are not written as files; they are listed in",
      "manifest.json under skipped_empty_tables, and on index.html under 'Nothing stored here",
      "yet'. Any section that could not be read is listed under errored_tables with the reason.",
      "",
      "manifest.json lists the export timestamp, your account identifier, the row count for",
      "each table, and the skipped or errored tables.",
      "",
      "Uploaded source files",
      "---------------------",
      "Documents you uploaded (for example PDFs) are listed as metadata records in",
      "data/documents.json (and readable/documents.csv), including their file names. The raw",
      "file contents are not included in this version of the export.",
      "",
      "Operational and telemetry records (error logs, job queues, usage metering) are not",
      "part of this export because they are system records rather than your content.",
      "",
    ].join("\n"),
  );

  const bytes = await zip.generateAsync({ type: "uint8array" });
  const stamp = now.toISOString().slice(0, 10);

  return new Response(bytes, {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="aura-data-export-${stamp}.zip"`,
    },
  });
});
