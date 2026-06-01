import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const ADMIN_USER_ID = "9e0c6ee1-6562-4fdc-89ba-d62b39f02bb3";
const SAFETY_BATCH_CAP = 20;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    // --- Auth: service-role OR admin user only ---
    const authHeader = req.headers.get("Authorization") ?? "";
    const bearer = authHeader.replace("Bearer ", "").trim();
    const apikeyHeader =
      req.headers.get("apikey") || req.headers.get("x-api-key") || "";
    const isServiceRole =
      !!bearer && (bearer === SERVICE_ROLE_KEY || apikeyHeader === SERVICE_ROLE_KEY);

    if (!isServiceRole) {
      if (!bearer) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const anonClient = createClient(SUPABASE_URL, ANON_KEY, {
        global: { headers: { Authorization: `Bearer ${bearer}` } },
      });
      const { data: { user }, error: userErr } = await anonClient.auth.getUser(bearer);
      if (userErr || !user || user.id !== ADMIN_USER_ID) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    let body: any = {};
    try { body = await req.json(); } catch (_) { /* no body */ }

    const target_user_id: string = body?.target_user_id;
    if (!target_user_id || typeof target_user_id !== "string") {
      return new Response(JSON.stringify({ error: "target_user_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const rawBatchSize = Number(body?.batch_size ?? 5);
    const batch_size = Math.min(8, Math.max(1, Number.isFinite(rawBatchSize) ? rawBatchSize : 5));
    const _batch_n = Math.max(0, Number(body?._batch_n ?? 0));

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // --- Find unprocessed entries: no source_registry row where
    //     source_type='entry' AND source_id=entries.id AND user_id=target_user_id ---
    const { data: registryRows, error: regErr } = await admin
      .from("source_registry")
      .select("source_id")
      .eq("user_id", target_user_id)
      .eq("source_type", "entry");
    if (regErr) throw new Error(`registry query failed: ${regErr.message}`);
    const registeredIds = new Set((registryRows || []).map((r: any) => r.source_id));

    const { data: candidateEntries, error: entErr } = await admin
      .from("entries")
      .select("id, created_at")
      .eq("user_id", target_user_id)
      .order("created_at", { ascending: true })
      .limit(1000);
    if (entErr) throw new Error(`entries query failed: ${entErr.message}`);

    const unprocessed = (candidateEntries || []).filter((e: any) => !registeredIds.has(e.id));
    const batch = unprocessed.slice(0, batch_size);

    let processed_this_batch = 0;
    for (let i = 0; i < batch.length; i++) {
      const entry = batch[i];
      try {
        const { error: invErr } = await admin.functions.invoke("extract-evidence", {
          body: {
            source_type: "entry",
            source_id: entry.id,
            user_id: target_user_id,
          },
        });
        if (invErr) {
          console.warn("[backfill] extract-evidence invoke error:", entry.id, invErr);
        } else {
          processed_this_batch += 1;
        }
      } catch (e: any) {
        console.warn("[backfill] extract-evidence invoke threw:", entry.id, e?.message);
      }
      if (i < batch.length - 1) await sleep(500);
    }

    // --- Recompute remaining ---
    const { data: registryRows2 } = await admin
      .from("source_registry")
      .select("source_id")
      .eq("user_id", target_user_id)
      .eq("source_type", "entry");
    const registeredIds2 = new Set((registryRows2 || []).map((r: any) => r.source_id));
    const { data: entries2 } = await admin
      .from("entries")
      .select("id")
      .eq("user_id", target_user_id)
      .limit(1000);
    const remaining = (entries2 || []).filter((e: any) => !registeredIds2.has(e.id)).length;

    // --- Self-chain via waitUntil if more work and below safety cap ---
    if (remaining > 0 && _batch_n < SAFETY_BATCH_CAP) {
      // @ts-ignore EdgeRuntime.waitUntil is available in Supabase Edge Functions
      EdgeRuntime.waitUntil((async () => {
        try {
          // brief gap so detect-signals-v2 chain has room to start before next batch
          await sleep(1500);
          const { error: chainErr } = await admin.functions.invoke(
            "backfill-unprocessed-entries",
            {
              body: {
                target_user_id,
                batch_size,
                _batch_n: _batch_n + 1,
              },
            },
          );
          if (chainErr) {
            console.warn("[backfill] self-chain invoke error:", chainErr);
          }
        } catch (e: any) {
          console.warn("[backfill] self-chain threw:", e?.message);
        }
      })());
      console.log("[backfill] self-chained next batch:", _batch_n + 1, "remaining:", remaining);
    }

    return new Response(
      JSON.stringify({
        processed_this_batch,
        remaining,
        batch_n: _batch_n,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("backfill-unprocessed-entries error:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});