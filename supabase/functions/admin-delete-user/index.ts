import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { isAdmin } from "../_shared/adminRole.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// The database enforces the cascade on delete of an auth user — verified 2026-08-26.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

/** Page through every auth account to resolve an email to its user id. */
async function resolveUserIdByEmail(
  admin: any,
  email: string,
): Promise<{ id: string | null; error: string | null }> {
  for (let page = 1; page <= 50; page++) {
    const { data: list, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) return { id: null, error: error.message };
    const batch = list?.users ?? [];
    const found = batch.find((u: any) => (u.email || "").trim().toLowerCase() === email);
    if (found) return { id: found.id, error: null };
    if (batch.length < 200) break;
  }
  return { id: null, error: null };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let admin: any = null;
  let callerId: string | null = null;
  let resolvedEmail: string | null = null;
  let target_user_id: string | null = null;

  /** Truthful audit row. Never swallows the insert error. */
  const logOutcome = async (result: "deleted" | "not_found" | "failed", detail?: string) => {
    if (!admin) return;
    const { error } = await admin.from("admin_action_log").insert({
      actor_id: callerId,
      action: "delete_user",
      task: "delete_user",
      target_ref: resolvedEmail ?? target_user_id ?? "",
      result: detail ? `${result}: ${detail}`.slice(0, 500) : result,
    });
    if (error) console.error("[admin-delete-user] admin_action_log insert failed:", error.message);
  };

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
    callerId = (claimsData?.claims?.sub as string | undefined) ?? null;
    if (claimsErr || !callerId) {
      console.error("[admin-delete-user] auth failed", claimsErr);
      return json({ error: "Unauthorized" }, 401);
    }
    if (!(await isAdmin(userClient, callerId))) return json({ error: "Forbidden" }, 403);

    const body = await req.json().catch(() => ({} as any));
    target_user_id = typeof body.target_user_id === "string" ? body.target_user_id.trim() : null;
    const target_email: string | null =
      typeof body.target_email === "string" ? body.target_email.trim().toLowerCase() : null;

    if (!target_user_id && !target_email) {
      return json({ error: "target_user_id or target_email required" }, 400);
    }
    if (target_user_id && !UUID_RE.test(target_user_id)) {
      return json({ error: "Invalid target_user_id format" }, 400);
    }

    admin = createClient(supabaseUrl, serviceKey);
    resolvedEmail = target_email;

    if (target_user_id) {
      const { data: authUser } = await admin.auth.admin.getUserById(target_user_id);
      if (authUser?.user?.email) resolvedEmail = authUser.user.email.toLowerCase();
    } else if (target_email) {
      const { id, error: listErr } = await resolveUserIdByEmail(admin, target_email);
      if (listErr) {
        await logOutcome("failed", `listUsers: ${listErr}`);
        return json({ error: `Could not read auth users: ${listErr}` }, 500);
      }
      target_user_id = id;
      if (!target_user_id) {
        // Last resort: the profile table carries the same id.
        const { data: prof } = await admin
          .from("diagnostic_profiles").select("user_id").ilike("email", target_email).maybeSingle();
        target_user_id = (prof?.user_id as string | undefined) ?? null;
      }
    }

    if (!target_user_id) {
      await logOutcome("not_found");
      return json({
        error: `No auth account found for ${resolvedEmail ?? "that identifier"}. Nothing was deleted.`,
      }, 404);
    }

    if (target_user_id === callerId) {
      return json({ error: "Cannot delete your own account" }, 400);
    }
    if (await isAdmin(admin, target_user_id)) {
      return json({ error: "cannot delete admin" }, 403);
    }

    // Allowlist row goes first — it is keyed by email, not by user id.
    if (resolvedEmail) {
      const { error: allowErr } = await admin
        .from("beta_allowlist").delete().eq("email", resolvedEmail);
      if (allowErr) console.log(`[admin-delete-user] allowlist: ${allowErr.message}`);
    }

    const { error: authErr } = await admin.auth.admin.deleteUser(target_user_id);
    if (authErr && !/not found/i.test(authErr.message)) {
      await logOutcome("failed", authErr.message);
      return json({ error: `Delete failed: ${authErr.message}` }, 500);
    }

    // Prove it: the account must genuinely be gone before we claim success.
    const { data: after, error: afterErr } = await admin.auth.admin.getUserById(target_user_id);
    if (after?.user?.id) {
      await logOutcome("failed", "still present after delete");
      return json({
        error: `The account for ${resolvedEmail ?? target_user_id} still exists after the delete. Nothing was removed.`,
      }, 500);
    }
    if (afterErr && !/not found/i.test(afterErr.message)) {
      console.warn("[admin-delete-user] verification read failed", afterErr.message);
    }

    await logOutcome("deleted");
    return json({
      success: true,
      deleted_user_id: target_user_id,
      deleted_email: resolvedEmail,
      cascade: true,
    });
  } catch (e: any) {
    console.error("[admin-delete-user] error", e);
    await logOutcome("failed", e?.message);
    return json({ error: e?.message || "Server error" }, 500);
  }
});
