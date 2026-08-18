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

const TYPES = ["cv", "portfolio", "project", "testimonial", "talk", "other"];
const LABELS = ["latest", "best", "target"];

serve(withObserve("admin-set-document-type", async (req) => {
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
  const id: string | undefined = typeof body?.id === "string" ? body.id.trim() : undefined;
  if (!id) return json({ error: "id required" }, 400);

  const patch: Record<string, string | null> = {};

  if ("document_type" in body) {
    const v = body.document_type;
    if (v === null || v === "") patch.document_type = null;
    else if (typeof v === "string" && TYPES.includes(v)) patch.document_type = v;
    else return json({ error: "invalid document_type" }, 400);
  }

  if ("cv_label" in body) {
    const v = body.cv_label;
    if (v === null || v === "") patch.cv_label = null;
    else if (typeof v === "string" && LABELS.includes(v)) patch.cv_label = v;
    else return json({ error: "invalid cv_label" }, 400);
  }

  if (!Object.keys(patch).length) return json({ error: "nothing to update" }, 400);
  // Invariant: if this document is not a CV, it has no cv_label.
  // Fires whenever document_type is being set to anything other than 'cv',
  // including null — otherwise "(unset)" strands the label behind.
  if ("document_type" in patch && patch.document_type !== "cv") patch.cv_label = null;

  const { error } = await admin.from("documents").update(patch).eq("id", id);
  if (error) return json({ error: error.message }, 500);

  return json({ ok: true });
}));
