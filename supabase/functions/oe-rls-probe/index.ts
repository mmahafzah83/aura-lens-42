/**
 * THE RLS PROBE — every day, we try to break in, and record that we could not.
 *
 * A policy that is never tested is a belief. So once a day a throwaway member
 * is created, signed in, and made to reach for ANOTHER member's rows on the
 * tables that hold a member's private record: his evidence, his cards, his
 * decisions, his faces. Every read must come back empty and every write must
 * be refused. Anything else is a breach and is written to ef_error_log at
 * 'error', which the invariant run then reports.
 *
 * The throwaway member is deleted at the end of the run, pass or fail.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { withRun } from "../_shared/oeRun.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-cron-secret",
};
const FN = "oe-rls-probe";
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

/** The tables a member's private record lives in, and a harmless column to
 *  attempt a write on. */
const TABLES: Array<{ table: string; write: Record<string, unknown> }> = [
  { table: "oe_member_evidence", write: { confidence: 0.99 } },
  { table: "oe_cards", write: { sent_at: new Date().toISOString() } },
  { table: "oe_taps", write: { note: "probe" } },
  { table: "oe_faces", write: { weight: 0.99 } },
];

Deno.serve(withRun("rls_probe", async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = Deno.env.get("SUPABASE_URL");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  const secret = Deno.env.get("cron_secret") || Deno.env.get("CRON_SECRET") || "";
  const bearer = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!url || !service || !anon) return json({ error: "Backend credentials missing" }, 500);
  if (!((secret && req.headers.get("x-cron-secret") === secret) || bearer === service)) {
    return json({ error: "Forbidden" }, 403);
  }

  const admin = createClient(url, service);
  const email = `rls-probe+${Date.now()}@aura-intel.invalid`;
  const password = crypto.randomUUID() + crypto.randomUUID();
  let probeUserId: string | null = null;
  const findings: Array<{ table: string; action: string; result: string; rows?: number }> = [];

  try {
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email, password, email_confirm: true,
    });
    if (createError) throw new Error(`probe user: ${createError.message}`);
    probeUserId = created.user?.id ?? null;

    const member = createClient(url, anon);
    const { error: signInError } = await member.auth.signInWithPassword({ email, password });
    if (signInError) throw new Error(`probe sign-in: ${signInError.message}`);

    for (const { table, write } of TABLES) {
      // A real row belonging to somebody else, found with the service key.
      const { data: victim } = await admin.from(table)
        .select("id,user_id").neq("user_id", probeUserId).limit(1).maybeSingle();
      if (!victim?.id) { findings.push({ table, action: "read", result: "no_other_member_row" }); continue; }

      const { data: readRows, error: readError } = await member.from(table)
        .select("id").eq("id", victim.id);
      const readCount = readRows?.length ?? 0;
      findings.push({
        table, action: "read", rows: readCount,
        result: readError ? "refused" : readCount === 0 ? "empty" : "LEAKED",
      });

      const { data: written, error: writeError } = await member.from(table)
        .update(write).eq("id", victim.id).select("id");
      findings.push({
        table, action: "write", rows: written?.length ?? 0,
        result: writeError ? "refused" : (written?.length ?? 0) === 0 ? "no_row_touched" : "WROTE",
      });
    }

    const breaches = findings.filter((f) => f.result === "LEAKED" || f.result === "WROTE");
    await admin.from("ef_error_log").insert({
      function_name: FN,
      severity: breaches.length ? "error" : "info",
      error_message: breaches.length
        ? `RLS probe found ${breaches.length} breach(es)`
        : `RLS probe clean across ${TABLES.length} tables`,
      context: { findings },
    });
    return json({ ok: breaches.length === 0, findings });
  } catch (e) {
    const message = String((e as Error)?.message ?? e);
    await admin.from("ef_error_log").insert({
      function_name: FN, severity: "error",
      error_message: `RLS probe did not complete: ${message}`, context: { findings },
    });
    return json({ error: message, findings }, 500);
  } finally {
    if (probeUserId) await admin.auth.admin.deleteUser(probeUserId).catch(() => undefined);
  }
}));
