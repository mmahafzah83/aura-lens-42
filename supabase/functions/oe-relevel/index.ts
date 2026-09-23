/**
 * oe-relevel — re-reads the ladder level of every live opportunity from its own
 * title, in code, and corrects the stored level_band where the two disagree.
 *
 * No model, no outside call, no cost. The title parser is the shared one, so a
 * change to the parser can be applied to the whole pool by calling this once.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { parseLevel } from "../_shared/oeEligibility.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const CRON_SECRET = Deno.env.get("cron_secret") || Deno.env.get("CRON_SECRET") || "";
  const cronHeader = req.headers.get("x-cron-secret") || "";
  const bearer = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!((!!CRON_SECRET && cronHeader === CRON_SECRET) || bearer === SERVICE_ROLE)) {
    return json({ error: "Forbidden" }, 403);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  let checked = 0;
  let changed = 0;
  const sample: Array<{ title: string; old: string | null; new: string | null }> = [];

  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from("oe_opportunities")
      .select("id, title, scope, level_band")
      .eq("alive", true)
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) return json({ error: error.message }, 500);
    const rows = data ?? [];
    if (!rows.length) break;

    for (const row of rows) {
      checked++;
      const next = parseLevel(row.title as string, (row.scope as string) ?? null);
      const current = (row.level_band as string | null) ?? null;
      if (next === current) continue;
      const { error: upErr } = await admin
        .from("oe_opportunities").update({ level_band: next }).eq("id", row.id);
      if (upErr) continue;
      changed++;
      if (sample.length < 10) {
        sample.push({ title: String(row.title ?? ""), old: current, new: next });
      }
    }
    if (rows.length < PAGE) break;
  }

  return json({ checked, changed, sample });
});
