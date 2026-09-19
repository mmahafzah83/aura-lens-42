/**
 * oe-rls-probe — TEMPORARY. Proves the row-level rules by attacking them.
 *
 * Creates a throwaway confirmed account, signs in as it, and then tries, as an
 * ordinary signed-in member who owns none of the data, to:
 *   (a) read another member's oe_notebook row
 *   (b) read another member's oe_serves row
 *   (c) insert a member preference into oe_world_facts
 *   (d) update another member's oe_direction
 * All four must fail or return nothing. The throwaway account is deleted at the
 * end. Raw responses are returned verbatim — no interpretation.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
  const CRON_SECRET = Deno.env.get("cron_secret") || Deno.env.get("CRON_SECRET") || "";
  const cronHeader = req.headers.get("x-cron-secret") || "";
  const bearer = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!((CRON_SECRET && cronHeader === CRON_SECRET) || bearer === SERVICE_ROLE)) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const body = await req.json().catch(() => ({} as any));
  const victim = String(body.victim_user_id ?? "9e0c6ee1-6562-4fdc-89ba-d62b39f02bb3");
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  const email = `rls-probe-${crypto.randomUUID()}@example.com`;
  const password = crypto.randomUUID() + "Aa1!";
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
  });
  if (createErr) {
    return new Response(JSON.stringify({ error: `create_user: ${createErr.message}` }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const attackerId = created.user!.id;

  const anonClient = createClient(SUPABASE_URL, ANON, { auth: { persistSession: false } });
  const { data: session, error: signInErr } = await anonClient.auth.signInWithPassword({ email, password });
  if (signInErr || !session.session) {
    await admin.auth.admin.deleteUser(attackerId);
    return new Response(JSON.stringify({ error: `sign_in: ${signInErr?.message}` }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const token = session.session.access_token;
  const asMember = createClient(SUPABASE_URL, ANON, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const results: Record<string, unknown> = { attacker_user_id: attackerId, victim_user_id: victim };

  const a = await asMember.from("oe_notebook").select("id,rule_text,user_id").eq("user_id", victim);
  results.a_read_other_notebook = { rows: a.data?.length ?? 0, data: a.data, error: a.error?.message ?? null };

  const b = await asMember.from("oe_serves").select("id,user_id,why").eq("user_id", victim);
  results.b_read_other_serves = { rows: b.data?.length ?? 0, data: b.data, error: b.error?.message ?? null };

  const c = await asMember.from("oe_world_facts").insert({
    kind: `rls_probe_${attackerId}`,
    payload: { note: "a member preference does not belong in Book Three" },
  }).select();
  results.c_insert_world_fact = { rows: c.data?.length ?? 0, data: c.data, error: c.error?.message ?? null };

  const d = await asMember.from("oe_direction").update({ mix: "win" }).eq("user_id", victim).select();
  results.d_update_other_direction = { rows: d.data?.length ?? 0, data: d.data, error: d.error?.message ?? null };

  await admin.from("ef_error_log").insert({
    function_name: "oe-rls-probe",
    severity: "info",
    error_message: "RLS_PROBE result",
    context: results,
  });

  await admin.from("oe_world_facts").delete().eq("kind", `rls_probe_${attackerId}`);
  await admin.auth.admin.deleteUser(attackerId);

  return new Response(JSON.stringify(results, null, 2), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
