import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { isAdmin } from "../_shared/adminRole.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/**
 * Every auth account, paged in full — this is the source of truth for the
 * admin Users tab. Allowlist rows are joined on for context only; an account
 * with no allowlist row still appears.
 */
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const token = authHeader.replace("Bearer ", "");
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
    const callerId = claimsData?.claims?.sub;
    if (claimsErr || !(await isAdmin(userClient, callerId))) {
      console.error("[admin-active-users] auth failed", claimsErr, callerId);
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey);

    // 1) Every auth account — page through, never a single 1000-row page.
    type AuthUser = { id: string; email: string | null; created_at: string; last_sign_in_at: string | null };
    const authUsers: AuthUser[] = [];
    for (let page = 1; page <= 50; page++) {
      const { data: list, error: listErr } = await admin.auth.admin.listUsers({ page, perPage: 200 });
      if (listErr) {
        console.error("[admin-active-users] listUsers failed", listErr);
        return new Response(JSON.stringify({ error: `Could not read auth users: ${listErr.message}` }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const batch = list?.users ?? [];
      for (const u of batch) {
        authUsers.push({
          id: u.id,
          email: u.email ?? null,
          created_at: u.created_at,
          last_sign_in_at: u.last_sign_in_at ?? null,
        });
      }
      if (batch.length < 200) break;
    }

    // 2) Context tables, read once each.
    const [{ data: profiles }, { data: roles }, { data: allow }] = await Promise.all([
      admin.from("diagnostic_profiles").select("user_id, first_name, last_name, sector_focus, account_type, plan, trial_ends_at"),
      admin.from("user_roles").select("user_id, role"),
      admin.from("beta_allowlist").select("email, sector, user_id, activated_at, status"),
    ]);

    const profileByUser = new Map<string, any>();
    for (const p of profiles ?? []) profileByUser.set(p.user_id as string, p);
    const rolesByUser = new Map<string, string[]>();
    for (const r of roles ?? []) {
      const arr = rolesByUser.get(r.user_id as string) ?? [];
      arr.push(r.role as string);
      rolesByUser.set(r.user_id as string, arr);
    }
    const allowByEmail = new Map<string, any>();
    const allowByUser = new Map<string, any>();
    for (const a of allow ?? []) {
      if (a.email) allowByEmail.set(String(a.email).toLowerCase(), a);
      if (a.user_id) allowByUser.set(a.user_id as string, a);
    }

    // 3) Capture counts (member-saved only) per user.
    const capturesByUser = new Map<string, number>();
    const { data: entryRows } = await admin
      .from("entries").select("user_id").eq("source_type", "user").limit(100000);
    for (const e of entryRows ?? []) {
      const k = e.user_id as string;
      capturesByUser.set(k, (capturesByUser.get(k) ?? 0) + 1);
    }

    const users = authUsers.map((u) => {
      const prof = profileByUser.get(u.id);
      const emailKey = (u.email ?? "").toLowerCase();
      const allowRow = allowByUser.get(u.id) ?? (emailKey ? allowByEmail.get(emailKey) : null);
      const roleList = rolesByUser.get(u.id) ?? [];
      const name = [prof?.first_name, prof?.last_name].filter(Boolean).join(" ").trim();
      return {
        user_id: u.id,
        email: u.email,
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at,
        account_type: prof?.account_type ?? null,
        plan: prof?.plan ?? null,
        trial_ends_at: prof?.trial_ends_at ?? null,
        role: roleList.includes("admin") ? "admin" : (roleList[0] ?? null),
        has_profile: !!prof,
        first_name: prof?.first_name ?? null,
        full_name: name || null,
        sector: prof?.sector_focus ?? allowRow?.sector ?? null,
        allowlist_status: allowRow?.status ?? null,
        activated_at: allowRow?.activated_at ?? null,
        captures: capturesByUser.get(u.id) ?? 0,
      };
    });

    users.sort((a, b) => {
      const ta = a.last_sign_in_at ? new Date(a.last_sign_in_at).getTime() : 0;
      const tb = b.last_sign_in_at ? new Date(b.last_sign_in_at).getTime() : 0;
      return tb - ta;
    });

    return new Response(JSON.stringify({ users, total: users.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("[admin-active-users] error", e);
    return new Response(JSON.stringify({ error: e?.message || "Server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
