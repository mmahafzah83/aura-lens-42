/**
 * record-lineage — the human route's lineage writer.
 *
 * `prepare-weekly-drafts` writes lineage inline because it creates the row
 * itself. The composer creates its row from the browser, where the shared Deno
 * helper cannot be imported, so this function exists: the member's own JWT,
 * the row id they just created, and the contributions the generator handed
 * back. Ownership of the row is checked before anything is written.
 *
 * Never throws at the caller: a lineage failure must not cost a draft.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { writeLineage, type Contribution } from "../_shared/provenance.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const KINDS = new Set([
  "signal", "capture", "evidence_fragment", "document", "trend", "voice_profile",
]);
const ROLES = new Set(["topic", "evidence", "number", "background", "timing", "voice"]);
const TABLES = new Set(["linkedin_posts", "content_items"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "").trim();
  if (!token) return json({ error: "unauthorized" }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  const userId = userData?.user?.id;
  if (userErr || !userId) return json({ error: "unauthorized" }, 401);

  const body = await req.json().catch(() => ({} as any));
  const contentTable = String(body?.content_table ?? "");
  const contentId = String(body?.content_id ?? "");
  if (!TABLES.has(contentTable) || !UUID.test(contentId)) {
    return json({ error: "content_table and content_id are required" }, 400);
  }

  const raw = Array.isArray(body?.contributions) ? body.contributions : [];
  const contributions: Contribution[] = raw
    .filter((c: any) => c && KINDS.has(String(c.kind)) && ROLES.has(String(c.role)))
    .filter((c: any) => c.id == null || UUID.test(String(c.id)))
    .slice(0, 200)
    .map((c: any) => ({
      kind: c.kind,
      id: c.id ? String(c.id) : null,
      role: c.role,
      note: typeof c.note === "string" ? c.note.slice(0, 400) : null,
    }));
  if (contributions.length === 0) return json({ ok: true, written: 0 });

  // The row must belong to the caller. Nobody writes lineage onto someone
  // else's draft.
  const { data: owner } = await admin
    .from(contentTable)
    .select("id, user_id")
    .eq("id", contentId)
    .maybeSingle();
  if (!owner || (owner as any).user_id !== userId) return json({ error: "not found" }, 404);

  const written = await writeLineage(admin as any, contentTable as any, contentId, contributions);
  return json({ ok: true, written });
});
