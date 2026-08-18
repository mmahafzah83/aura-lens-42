import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

/**
 * draft-owner-check — D122.
 *
 * A member clicks "Open your draft" from a lifecycle email while signed into a
 * second account. RLS returns zero rows, and the dashboard used to tell them
 * the draft was gone. That is untrue (law #138).
 *
 * This function answers one narrow question with the service role:
 * does this draft id exist, and is the caller its owner? When it is owned by
 * somebody else we return a MASKED owner email so the viewer can recognise
 * their other account without us leaking an address they do not own.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** m•••••h@gmail.com — first and last character of the local part only. */
function maskEmail(email: string | null | undefined): string | null {
  if (!email || typeof email !== "string" || !email.includes("@")) return null;
  const [local, domain] = email.split("@");
  if (!local) return null;
  if (local.length <= 2) return `${local[0] ?? ""}•••@${domain}`;
  return `${local[0]}•••••${local[local.length - 1]}@${domain}`;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "").trim();
    const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
    const callerId = (claimsData?.claims as Record<string, unknown> | undefined)?.sub as
      | string
      | undefined;
    if (claimsErr || !callerId) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const draftId = typeof body?.draft_id === "string" ? body.draft_id.trim() : "";
    const src = body?.src === "content_items" || body?.src === "linkedin_posts" ? body.src : null;
    if (!UUID.test(draftId)) return json({ error: "Invalid draft_id" }, 400);

    const admin = createClient(supabaseUrl, serviceKey);

    const tables = src ? [src] : ["linkedin_posts", "content_items"];
    let ownerId: string | null = null;
    for (const table of tables) {
      const { data, error } = await admin
        .from(table)
        .select("user_id")
        .eq("id", draftId)
        .maybeSingle();
      if (error) continue;
      if (data?.user_id) {
        ownerId = data.user_id as string;
        break;
      }
    }

    if (!ownerId) return json({ exists: false, is_owner: false, owner_email_masked: null });
    if (ownerId === callerId) return json({ exists: true, is_owner: true, owner_email_masked: null });

    const { data: ownerUser } = await admin.auth.admin.getUserById(ownerId);
    return json({
      exists: true,
      is_owner: false,
      owner_email_masked: maskEmail(ownerUser?.user?.email ?? null),
    });
  } catch (e) {
    console.error("[draft-owner-check] failed", e);
    return json({ error: "Internal error" }, 500);
  }
});
