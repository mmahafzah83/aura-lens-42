import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.99.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const FOUNDER_ID = "9e0c6ee1-6562-4fdc-89ba-d62b39f02bb3";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return json({ error: "unauthorized" }, 401);
    }

    // Verify the caller with their own JWT
    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "unauthorized" }, 401);
    if (userData.user.id !== FOUNDER_ID) return json({ error: "forbidden" }, 403);

    // Service-role client for data work
    const admin = createClient(SUPABASE_URL, SERVICE);

    let body: any = {};
    try { body = await req.json(); } catch { /* no body */ }
    const action = String(body?.action || "");

    if (action === "list_users") {
      // 1. Pull auth users (paged)
      const users: Array<{
        id: string; email: string | null;
        created_at: string | null; last_sign_in_at: string | null;
      }> = [];
      let page = 1;
      const perPage = 200;
      while (true) {
        const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
        if (error) return json({ error: error.message }, 500);
        const batch = data?.users ?? [];
        for (const u of batch) {
          users.push({
            id: u.id,
            email: u.email ?? null,
            created_at: u.created_at ?? null,
            last_sign_in_at: (u as any).last_sign_in_at ?? null,
          });
        }
        if (batch.length < perPage) break;
        page += 1;
        if (page > 25) break; // safety
      }
      const ids = users.map((u) => u.id);
      if (ids.length === 0) return json({ rows: [] });

      const [profiles, entries, signals, posts, snaps] = await Promise.all([
        admin.from("diagnostic_profiles").select("user_id, first_name, sector_focus").in("user_id", ids),
        admin.from("entries").select("user_id").in("user_id", ids),
        admin.from("strategic_signals").select("user_id").in("user_id", ids),
        admin.from("linkedin_posts").select("user_id").in("user_id", ids),
        admin.from("score_snapshots").select("user_id, score, created_at").in("user_id", ids).order("created_at", { ascending: false }),
      ]);

      const profileMap = new Map<string, { first_name: string | null; sector_focus: string | null }>();
      (profiles.data ?? []).forEach((p: any) =>
        profileMap.set(p.user_id, { first_name: p.first_name, sector_focus: p.sector_focus })
      );
      const count = (rows: any[] | null | undefined, id: string) =>
        (rows ?? []).reduce((n, r) => n + (r.user_id === id ? 1 : 0), 0);
      const latestSnap = new Map<string, number>();
      (snaps.data ?? []).forEach((s: any) => {
        if (!latestSnap.has(s.user_id) && typeof s.score === "number") {
          latestSnap.set(s.user_id, Math.round(s.score));
        }
      });

      const rows = users.map((u) => {
        const p = profileMap.get(u.id) || { first_name: null, sector_focus: null };
        return {
          user_id: u.id,
          email: u.email,
          signed_up: u.created_at,
          last_seen: u.last_sign_in_at,
          first_name: p.first_name,
          sector_focus: p.sector_focus,
          captures: count(entries.data as any[], u.id),
          signals: count(signals.data as any[], u.id),
          posts: count(posts.data as any[], u.id),
          imprint: latestSnap.get(u.id) ?? null,
        };
      });
      return json({ rows });
    }

    if (action === "run_for_user") {
      const target = String(body?.user_id || "");
      const task = String(body?.task || "");
      if (!target) return json({ error: "user_id required" }, 400);
      if (task !== "recompute_score") return json({ error: "unknown task" }, 400);

      const res = await fetch(`${SUPABASE_URL}/functions/v1/calculate-aura-score`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SERVICE}`,
          apikey: SERVICE,
        },
        body: JSON.stringify({ user_id: target }),
      });
      const out = await res.json().catch(() => ({}));
      return json({ ok: res.ok, result: out }, res.ok ? 200 : 500);
    }

    return json({ error: "unknown action" }, 400);
  } catch (e: any) {
    return json({ error: e?.message ?? "internal error" }, 500);
  }
});