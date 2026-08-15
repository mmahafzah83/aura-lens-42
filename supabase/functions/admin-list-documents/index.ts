import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { withObserve } from "../_shared/observe.ts";
import { isAdmin } from "../_shared/adminRole.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

serve(withObserve("admin-list-documents", async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

  const anon = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);
  const { data: userData, error: userErr } = await anon.auth.getUser(authHeader.replace("Bearer ", ""));
  if (userErr || !userData?.user) return json({ error: "Unauthorized" }, 401);
  if (!(await isAdmin(admin, userData.user.id))) return json({ error: "Forbidden" }, 403);

  const body = await req.json().catch(() => ({}));
  const email: string | undefined = typeof body?.email === "string" ? body.email.trim() : undefined;
  let targetId: string | undefined = typeof body?.user_id === "string" ? body.user_id.trim() : undefined;

  if (!targetId && email) {
    const needle = email.toLowerCase();
    for (let page = 1; page <= 20 && !targetId; page++) {
      const { data: list, error: listErr } = await admin.auth.admin.listUsers({ page, perPage: 200 });
      if (listErr) return json({ error: listErr.message }, 500);
      const hit = list.users.find((u) => (u.email || "").toLowerCase() === needle);
      if (hit) targetId = hit.id;
      if (!list.users.length || list.users.length < 200) break;
    }
    if (!targetId) return json({ error: "user not found" }, 404);
  }
  if (!targetId) return json({ error: "email or user_id required" }, 400);

  const { data, error } = await admin
    .from("documents")
    .select("id, filename, display_title, status, document_type, cv_label, created_at")
    .eq("user_id", targetId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) return json({ error: error.message }, 500);

  return json({ ok: true, user_id: targetId, documents: data ?? [] });
}));
