import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ADMIN_USER_ID = "9e0c6ee1-6562-4fdc-89ba-d62b39f02bb3";

const TABLES = [
  "entries", "strategic_signals", "diagnostic_profiles", "linkedin_posts",
  "score_snapshots", "user_milestones", "industry_trends", "aura_conversation_memory",
  "documents", "authority_voice_profiles", "market_mirror_cache", "design_system",
  "beta_allowlist", "notification_events",
];

const EDGE_FUNCTIONS = [
  "detect-signals-v2", "calculate-aura-score", "generate-authority-content",
  "chat-aura", "ingest-capture", "detect-patterns", "generate-silence-alarm",
  "generate-market-mirror", "detect-market-gaps",
];

const SCHEMA_EXPECTATIONS: Record<string, string[]> = {
  strategic_signals: ["velocity_status", "signal_velocity", "commercial_validation_score", "last_decay_at"],
  score_snapshots: ["tier"],
  user_milestones: ["acknowledged", "shared"],
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims?.sub) return json({ error: "Unauthorized" }, 401);
    const userId = claimsData.claims.sub as string;
    if (userId !== ADMIN_USER_ID) return json({ error: "Forbidden" }, 403);

    const admin = createClient(supabaseUrl, serviceKey);
    const run_id = crypto.randomUUID();
    const results: any[] = [];

    const push = (category: string, test_id: string, test_name: string, status: "pass" | "fail" | "warn", details: any) => {
      results.push({ run_id, run_by: userId, layer: "backend", category, test_id, test_name, status, details });
    };

    const safe = async (fn: () => Promise<void>, category: string, test_id: string, test_name: string) => {
      try { await fn(); } catch (e: any) {
        push(category, test_id, test_name, "fail", { error: e?.message ?? String(e) });
      }
    };

    // GROUP 1 — Database Health
    for (const table of TABLES) {
      await safe(async () => {
        const { count, error } = await admin.from(table).select("*", { count: "exact", head: true });
        if (error) throw error;
        const rowCount = count ?? 0;
        let nullUserIds: number | null = null;
        // Try counting nulls — if column doesn't exist, ignore
        try {
          const { count: nullCount, error: nErr } = await admin
            .from(table).select("*", { count: "exact", head: true }).is("user_id", null);
          if (!nErr) nullUserIds = nullCount ?? 0;
        } catch { /* no user_id column */ }
        const status: "pass" | "warn" | "fail" =
          rowCount === 0 ? "warn" : (nullUserIds && nullUserIds > 0 ? "fail" : "pass");
        push("db_health", `db.${table}`, `Table ${table}`, status,
          { row_count: rowCount, null_user_ids: nullUserIds, empty: rowCount === 0 });
      }, "db_health", `db.${table}`, `Table ${table}`);
    }

    // GROUP 2 — Edge Function Health
    for (const fn of EDGE_FUNCTIONS) {
      await safe(async () => {
        const url = `${supabaseUrl}/functions/v1/${fn}`;
        const t0 = Date.now();
        const ctrl = new AbortController();
        const timeout = setTimeout(() => ctrl.abort(), 15000);
        let statusCode = 0;
        let errored = false;
        try {
          const r = await fetch(url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${serviceKey}`,
              apikey: serviceKey,
            },
            body: JSON.stringify({ healthCheck: true }),
            signal: ctrl.signal,
          });
          statusCode = r.status;
          await r.text().catch(() => "");
        } catch (_e) {
          errored = true;
        } finally {
          clearTimeout(timeout);
        }
        const ms = Date.now() - t0;
        const timedOut = errored && ms >= 15000;
        const status: "pass" | "warn" | "fail" =
          timedOut || statusCode >= 500 ? "fail" : (statusCode === 0 ? "warn" : "pass");
        push("ef_health", `ef.${fn}`, `Edge function ${fn}`, status,
          { http_status: statusCode, response_ms: ms, timed_out: timedOut });
      }, "ef_health", `ef.${fn}`, `Edge function ${fn}`);
    }

    // GROUP 3 — Data Integrity
    await safe(async () => {
      const { count: c1 } = await admin.from("strategic_signals")
        .select("*", { count: "exact", head: true }).or("fragment_count.eq.0,fragment_count.is.null");
      push("data_integrity", "di.signals_no_evidence", "Signals without evidence",
        (c1 ?? 0) > 0 ? "warn" : "pass", { count: c1 ?? 0 });
    }, "data_integrity", "di.signals_no_evidence", "Signals without evidence");

    await safe(async () => {
      const { count } = await admin.from("entries")
        .select("*", { count: "exact", head: true }).is("user_id", null);
      push("data_integrity", "di.orphaned_entries", "Orphaned entries",
        (count ?? 0) > 0 ? "fail" : "pass", { count: count ?? 0 });
    }, "data_integrity", "di.orphaned_entries", "Orphaned entries");

    await safe(async () => {
      const { data } = await admin.from("score_snapshots")
        .select("created_at").order("created_at", { ascending: false }).limit(1).maybeSingle();
      const last = data?.created_at ? new Date(data.created_at as string).getTime() : 0;
      const ageDays = last ? (Date.now() - last) / 86400000 : Infinity;
      push("data_integrity", "di.score_freshness", "Score snapshot freshness",
        ageDays > 7 ? "warn" : "pass", { last_created_at: data?.created_at ?? null, age_days: ageDays });
    }, "data_integrity", "di.score_freshness", "Score snapshot freshness");

    await safe(async () => {
      const { data } = await admin.from("industry_trends")
        .select("fetched_at").order("fetched_at", { ascending: false }).limit(1).maybeSingle();
      const last = data?.fetched_at ? new Date(data.fetched_at as string).getTime() : 0;
      const ageDays = last ? (Date.now() - last) / 86400000 : Infinity;
      push("data_integrity", "di.trends_freshness", "Industry trends freshness",
        ageDays > 14 ? "warn" : "pass", { last_fetched_at: data?.fetched_at ?? null, age_days: ageDays });
    }, "data_integrity", "di.trends_freshness", "Industry trends freshness");

    await safe(async () => {
      const { count } = await admin.from("design_system")
        .select("*", { count: "exact", head: true }).eq("is_active", true);
      push("data_integrity", "di.active_design_system", "Active design system rows",
        count === 1 ? "pass" : "fail", { active_count: count ?? 0 });
    }, "data_integrity", "di.active_design_system", "Active design system rows");

    await safe(async () => {
      const { count } = await admin.from("user_milestones")
        .select("*", { count: "exact", head: true }).eq("acknowledged", false);
      push("data_integrity", "di.unacked_milestones", "Unacknowledged milestones",
        "pass", { count: count ?? 0 });
    }, "data_integrity", "di.unacked_milestones", "Unacknowledged milestones");

    // GROUP 4 — Schema Validation
    for (const [table, expected] of Object.entries(SCHEMA_EXPECTATIONS)) {
      await safe(async () => {
        const { data, error } = await admin
          .schema("information_schema" as any)
          .from("columns" as any)
          .select("column_name")
          .eq("table_schema", "public")
          .eq("table_name", table);
        if (error) throw error;
        const present = new Set((data ?? []).map((r: any) => r.column_name as string));
        const missing = expected.filter((c) => !present.has(c));
        push("schema", `schema.${table}`, `Schema columns on ${table}`,
          missing.length === 0 ? "pass" : "fail",
          { expected, missing, present: Array.from(present) });
      }, "schema", `schema.${table}`, `Schema columns on ${table}`);
    }

    // Persist results
    if (results.length > 0) {
      const { error: insertErr } = await admin.from("qa_audit_results").insert(results);
      if (insertErr) console.error("qa_audit_results insert failed:", insertErr.message);
    }

    const summary = {
      run_id,
      total: results.length,
      pass: results.filter((r) => r.status === "pass").length,
      warn: results.filter((r) => r.status === "warn").length,
      fail: results.filter((r) => r.status === "fail").length,
    };

    return json({ ok: true, summary, results }, 200);
  } catch (e) {
    console.error("run-qa-audit error", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}