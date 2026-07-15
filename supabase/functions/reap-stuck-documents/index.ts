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

  const cutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { data, error } = await admin
    .from("documents")
    .update({
      status: "error",
      error_message:
        "Processing exceeded time limit — please re-upload or split the file.",
    })
    .eq("status", "processing")
    .lt("created_at", cutoff)
    .select("id");

  if (error) {
    console.error("[reap-stuck-documents] update failed:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const reaped = data?.length ?? 0;
  console.log(`[reap-stuck-documents] reaped=${reaped}`);
  return new Response(JSON.stringify({ reaped }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});