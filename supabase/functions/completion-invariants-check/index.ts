import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";
  const cronHeader = req.headers.get("x-cron-secret") || "";
  if (!CRON_SECRET || cronHeader !== CRON_SECRET) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceRoleKey);

  const findings: Array<{ assertion: string; detail: Record<string, unknown> }> = [];
  const summary: Record<string, unknown> = {};

  try {
    // ============ ASSERTION 1: Stuck publish attempt ============
    // A real client publish attempt should resolve to published or failed within 1 h.
    // We flag only attempts between 1 h and 48 h old: "stuck" window = 1 h–48 h.
    // Beyond 48 h an unconfirmed attempt is treated as user-abandoned and self-clears.
    {
      const cutoff1h = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const cutoff48h = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
      const { count, error: cErr } = await admin
        .from("linkedin_posts")
        .select("id", { count: "exact", head: true })
        .not("publish_attempted_at", "is", null)
        .not("tracking_status", "in", "(published,failed)")
        .is("published_at", null)
        .lt("publish_attempted_at", cutoff1h)
        .gt("publish_attempted_at", cutoff48h);
      if (cErr) throw new Error(`assertion_1_count: ${cErr.message}`);
      const { data: rows, error: rErr } = await admin
        .from("linkedin_posts")
        .select("id, user_id, publish_attempted_at")
        .not("publish_attempted_at", "is", null)
        .not("tracking_status", "in", "(published,failed)")
        .is("published_at", null)
        .lt("publish_attempted_at", cutoff1h)
        .gt("publish_attempted_at", cutoff48h)
        .order("publish_attempted_at", { ascending: true })
        .limit(50);
      if (rErr) throw new Error(`assertion_1_rows: ${rErr.message}`);
      const now = Date.now();
      const oldestHours = (rows ?? []).length
        ? Math.max(...(rows ?? []).map((r: any) => (now - Date.parse(r.publish_attempted_at)) / 3_600_000))
        : 0;
      const userIds = [...new Set((rows ?? []).map((r: any) => r.user_id).filter(Boolean))];
      const postIds = (rows ?? []).map((r: any) => r.id);
      const pass = (count ?? 0) === 0;
      summary.stuck_publish_attempt = {
        pass,
        count: count ?? 0,
        oldest_hours: Math.round(oldestHours),
        user_ids: userIds,
        post_ids: postIds,
      };
      if (!pass) findings.push({ assertion: "stuck_publish_attempt", detail: summary.stuck_publish_attempt as any });
    }

    // ============ ASSERTION 2: Stuck ingestion (documents & entries) ============
    {
      const cutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      // Fetch old rows, then filter to those without any evidence_fragments via source_registry.
      const [docsRes, entRes] = await Promise.all([
        admin.from("documents").select("id, user_id, created_at").lt("created_at", cutoff),
        admin.from("entries").select("id, user_id, created_at").lt("created_at", cutoff),
      ]);
      if (docsRes.error) throw new Error(`assertion_2_docs: ${docsRes.error.message}`);
      if (entRes.error) throw new Error(`assertion_2_entries: ${entRes.error.message}`);

      async function unprocessed(rows: any[], source_type: string) {
        if (rows.length === 0) return [] as any[];
        const ids = rows.map((r) => r.id);
        const { data: sr, error } = await admin
          .from("source_registry")
          .select("source_id, fragment_count")
          .eq("source_type", source_type)
          .in("source_id", ids);
        if (error) throw new Error(`sr_${source_type}: ${error.message}`);
        const withFrag = new Set(
          (sr ?? []).filter((r) => (r.fragment_count ?? 0) > 0).map((r) => r.source_id),
        );
        return rows.filter((r) => !withFrag.has(r.id));
      }

      const stuckDocs = await unprocessed(docsRes.data ?? [], "document");
      const stuckEntries = await unprocessed(entRes.data ?? [], "entry");
      const total = stuckDocs.length + stuckEntries.length;
      const pass = total === 0;
      summary.stuck_ingestion = {
        pass,
        documents_count: stuckDocs.length,
        entries_count: stuckEntries.length,
        document_ids: stuckDocs.slice(0, 50).map((r) => r.id),
        entry_ids: stuckEntries.slice(0, 50).map((r) => r.id),
        user_ids: [...new Set([...stuckDocs, ...stuckEntries].map((r) => r.user_id))],
      };
      if (!pass) findings.push({ assertion: "stuck_ingestion", detail: summary.stuck_ingestion as any });
    }

    // ============ ASSERTION 3: Stage liveness (7d, distinct users) ============
    let signalsUsers = 0;
    let opensUsers = 0;
    {
      const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
      async function distinct(table: string, col: string, filter?: (q: any) => any): Promise<number> {
        let q = admin.from(table).select("user_id").gte(col, since).not("user_id", "is", null);
        if (filter) q = filter(q);
        const { data, error } = await q;
        if (error) throw new Error(`liveness_${table}: ${error.message}`);
        return new Set((data ?? []).map((r: any) => r.user_id)).size;
      }
      const captures = await distinct("entries", "created_at");
      const signals = await distinct("strategic_signals", "created_at");
      const opens = await distinct("signal_engagements", "last_opened_at");
      const drafts = await distinct("linkedin_posts", "created_at", (q) => q.eq("tracking_status", "draft"));
      const published = await distinct("linkedin_posts", "published_at");
      signalsUsers = signals;
      opensUsers = opens;
      const stages = { captures, signals, opens, drafts, published };
      const zero = Object.entries(stages).filter(([, v]) => v === 0).map(([k]) => k);
      const pass = zero.length === 0;
      summary.stage_liveness = { pass, stages, zero_stages: zero };
      if (!pass) findings.push({ assertion: "stage_liveness", detail: summary.stage_liveness as any });
    }

    // ============ ASSERTION 4: Funnel trend (self-calibrating) ============
    // Compare today's 7-day signal-open rate against the trailing 28-day median of
    // the same ratio. Fail only when today is >30% below median AND >=14 samples exist.
    {
      const today = new Date().toISOString().slice(0, 10);
      const ratio = signalsUsers > 0 ? Number((opensUsers / signalsUsers).toFixed(4)) : 0;

      // Persist today's ratio (upsert on day). Do this even during baselining so
      // the history builds up.
      await admin.from("funnel_daily_ratio").upsert({
        day: today,
        opens_users: opensUsers,
        signals_users: signalsUsers,
        ratio,
      }, { onConflict: "day" });

      const since28 = new Date(Date.now() - 28 * 86_400_000).toISOString().slice(0, 10);
      const { data: hist, error: hErr } = await admin
        .from("funnel_daily_ratio")
        .select("day, ratio")
        .gte("day", since28)
        .lt("day", today);
      if (hErr) throw new Error(`assertion_4_hist: ${hErr.message}`);
      const sample = (hist ?? []).map((r: any) => Number(r.ratio)).filter((n) => Number.isFinite(n));
      const sampleSize = sample.length;

      let median = 0;
      if (sampleSize > 0) {
        const sorted = [...sample].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        median = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
      }
      const dropPct = median > 0 ? Number((((median - ratio) / median) * 100).toFixed(1)) : 0;

      let status: "baselining" | "ok" | "degraded";
      let pass: boolean;
      if (sampleSize < 14) {
        status = "baselining";
        pass = true;
      } else if (dropPct > 30) {
        status = "degraded";
        pass = false;
      } else {
        status = "ok";
        pass = true;
      }

      summary.funnel_trend = {
        pass,
        status,
        ratio_today: ratio,
        median_28d: Number(median.toFixed(4)),
        drop_pct: dropPct,
        sample_size: sampleSize,
        signals_users: signalsUsers,
        opens_users: opensUsers,
      };
      if (!pass) findings.push({ assertion: "funnel_trend", detail: summary.funnel_trend as any });
    }

    // ============ ASSERTION 5: Signal-open instrumentation live ============
    // Guards the bump_signal_engagement call sites. Passes when at least one
    // signal_engagements row has last_opened_at inside the trailing 7 days.
    {
      const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
      const { count, error } = await admin
        .from("signal_engagements")
        .select("user_id", { count: "exact", head: true })
        .gte("last_opened_at", since);
      if (error) throw new Error(`assertion_5: ${error.message}`);
      const rows_7d = count ?? 0;
      const pass = rows_7d >= 1;
      summary.signal_open_instrumentation = { pass, rows_7d, threshold: 1 };
      if (!pass) findings.push({ assertion: "signal_open_instrumentation", detail: summary.signal_open_instrumentation as any });
    }

    // ============ ASSERTION 6: No high-severity errors (excluding own output) ============
    // ef_error_log is now the single substrate for both heartbeats and errors, so the
    // old "no info rows" check was unsatisfiable. Real trouble = any severity='high'
    // row written by ANOTHER function in the trailing 24h. Rows written by this
    // check itself are always excluded — a monitor that reacts to its own output can
    // never clear.
    {
      const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
      const { data: highRows, error } = await admin
        .from("ef_error_log")
        .select("function_name")
        .eq("severity", "high")
        .neq("function_name", "completion-invariants-check")
        .gte("created_at", since)
        .limit(2000);
      if (error) throw new Error(`assertion_6_count: ${error.message}`);
      const high_rows_24h = (highRows ?? []).length;
      const offending_functions = [
        ...new Set((highRows ?? []).map((r: any) => r.function_name).filter(Boolean)),
      ];
      const pass = high_rows_24h === 0;
      summary.no_high_severity_errors = { pass, high_rows_24h, offending_functions };
      if (!pass) findings.push({ assertion: "no_high_severity_errors", detail: summary.no_high_severity_errors as any });
    }

    // ============ ASSERTION 7: No empty-body draft rows ============
    // Guards the empty-body publish guard. Passes when zero linkedin_posts
    // rows have tracking_status='draft' and null/whitespace-only post_text.
    {
      // Null-body drafts
      const { count: nullCount, error: nErr } = await admin
        .from("linkedin_posts")
        .select("id", { count: "exact", head: true })
        .eq("tracking_status", "draft")
        .is("post_text", null);
      if (nErr) throw new Error(`assertion_7_null: ${nErr.message}`);
      // Whitespace-only drafts (regex: nothing but whitespace)
      const { data: wsRows, error: wErr } = await admin
        .from("linkedin_posts")
        .select("id, post_text")
        .eq("tracking_status", "draft")
        .not("post_text", "is", null)
        .limit(1000);
      if (wErr) throw new Error(`assertion_7_ws: ${wErr.message}`);
      const wsOffenders = (wsRows ?? []).filter((r: any) => typeof r.post_text === "string" && r.post_text.trim().length === 0);
      const empty_body_count = (nullCount ?? 0) + wsOffenders.length;
      const pass = empty_body_count === 0;
      summary.no_empty_body_drafts = {
        pass,
        empty_body_count,
        null_body_count: nullCount ?? 0,
        whitespace_only_count: wsOffenders.length,
        sample_ids: wsOffenders.slice(0, 50).map((r: any) => r.id),
      };
      if (!pass) findings.push({ assertion: "no_empty_body_drafts", detail: summary.no_empty_body_drafts as any });
    }

    // ============ Write outcome ============
    if (findings.length > 0) {
      for (const f of findings) {
        await admin.from("ef_error_log").insert({
          function_name: "completion-invariants-check",
          severity: "high",
          error_message: `COMPLETION_INVARIANTS fail assertion=${f.assertion}`,
          context: f.detail,
        });
      }
    } else {
      await admin.from("ef_error_log").insert({
        function_name: "completion-invariants-check",
        severity: "info",
        error_message: "COMPLETION_INVARIANTS ok assertions=7",
        context: summary,
      });
    }

    return new Response(
      JSON.stringify({ ok: findings.length === 0, assertions: summary, findings: findings.map((f) => f.assertion) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[completion-invariants-check] fatal:", msg);
    try {
      await admin.from("ef_error_log").insert({
        function_name: "completion-invariants-check",
        severity: "critical",
        error_message: `COMPLETION_INVARIANTS threw: ${msg}`,
        context: { partial_summary: summary },
      });
    } catch (_) {}
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});