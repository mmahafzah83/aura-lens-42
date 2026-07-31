import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let token: unknown;
  try {
    const body = await req.json();
    token = body?.token;
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  if (typeof token !== "string" || token.length === 0 || token.length > 512) {
    return json({ error: "token must be a non-empty string under 512 characters" }, 400);
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data, error } = await admin.rpc("check_invite_token", { p_token: token });
  if (error) {
    console.error("[check-invite-token] rpc failed:", error.message);
    return json({ error: "check_failed" }, 500);
  }

  const status = (data as { status?: string } | null)?.status ?? "not_found";
  return json({ status });
});
