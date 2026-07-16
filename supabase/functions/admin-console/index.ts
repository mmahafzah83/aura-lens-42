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

      if (task === "recompute_score") {
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

      if (task === "send_nudge") {
        const ALLOWED = ["day1", "day3", "day7", "inactive"] as const;
        const requested = String(body?.email_type ?? "inactive");
        if (!ALLOWED.includes(requested as any)) {
          return json({ error: "invalid email_type" }, 400);
        }
        const res = await fetch(`${SUPABASE_URL}/functions/v1/send-lifecycle-email`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${SERVICE}`,
            apikey: SERVICE,
          },
          body: JSON.stringify({ user_id: target, email_type: requested }),
        });
        const out = await res.json().catch(() => ({}));
        return json({ ok: res.ok, result: out }, res.ok ? 200 : 500);
      }

      return json({ error: "unknown task" }, 400);
    }

    if (action === "overview_brief") {
      const now = new Date();
      const startOfToday = new Date(now); startOfToday.setUTCHours(0, 0, 0, 0);
      const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      const weekAgo = new Date(now.getTime() - 7 * 86400000);
      const dayMs = 86400000;
      const daysInMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
      const dayOfMonth = now.getUTCDate();

      // Auth users (paged)
      const users: Array<{ id: string; email: string | null; created_at: string | null; last_sign_in_at: string | null }> = [];
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
        if (page > 25) break;
      }

      const isTest = (email: string | null) => {
        if (!email) return false;
        const e = email.toLowerCase();
        return e.startsWith("test") || e.includes("+test") || e.endsWith("@example.com") || e.includes("@test.");
      };
      const realUsers = users.filter((u) => u.id !== FOUNDER_ID && !isTest(u.email));
      const realIds = realUsers.map((u) => u.id);

      // Parallel data fetch
      const [profilesRes, entriesRes, signalsRes, spendTodayRes, spendMonthRes, budgetRes] = await Promise.all([
        admin.from("diagnostic_profiles").select("user_id, first_name, sector_focus").in("user_id", realIds.length ? realIds : ["00000000-0000-0000-0000-000000000000"]),
        admin.from("entries").select("user_id, created_at").in("user_id", realIds.length ? realIds : ["00000000-0000-0000-0000-000000000000"]),
        admin.from("strategic_signals").select("user_id, created_at").in("user_id", realIds.length ? realIds : ["00000000-0000-0000-0000-000000000000"]),
        admin.from("ai_usage_log").select("est_cost_usd").gte("created_at", startOfToday.toISOString()),
        admin.from("ai_usage_log").select("est_cost_usd").gte("created_at", startOfMonth.toISOString()),
        admin.from("admin_settings").select("value").eq("key", "monthly_ai_budget_usd").maybeSingle(),
      ]);

      const profiles = profilesRes.data ?? [];
      const entries = entriesRes.data ?? [];
      const signals = signalsRes.data ?? [];

      const captureCount = new Map<string, number>();
      const lastCapture = new Map<string, number>();
      for (const e of entries as any[]) {
        captureCount.set(e.user_id, (captureCount.get(e.user_id) ?? 0) + 1);
        const t = new Date(e.created_at).getTime();
        if (!lastCapture.has(e.user_id) || t > (lastCapture.get(e.user_id) ?? 0)) {
          lastCapture.set(e.user_id, t);
        }
      }
      const signalCount = new Map<string, number>();
      for (const s of signals as any[]) {
        signalCount.set(s.user_id, (signalCount.get(s.user_id) ?? 0) + 1);
      }
      const profileMap = new Map<string, { first_name: string | null; sector_focus: string | null }>();
      for (const p of profiles as any[]) {
        profileMap.set(p.user_id, { first_name: p.first_name, sector_focus: p.sector_focus });
      }

      const totalUsers = realUsers.length;
      const activated = realUsers.filter((u) => (captureCount.get(u.id) ?? 0) > 0).length;
      const withSignal = realUsers.filter((u) => (signalCount.get(u.id) ?? 0) > 0).length;
      const newThisWeek = realUsers.filter((u) => u.created_at && new Date(u.created_at) >= weekAgo).length;
      const onboarded = realUsers.filter((u) => (profileMap.get(u.id)?.sector_focus ?? null)).length;

      const newUsersToday = realUsers.filter((u) => u.created_at && new Date(u.created_at) >= startOfToday).length;
      const newCapturesToday = (entries as any[]).filter((e) => new Date(e.created_at) >= startOfToday).length;
      const newSignalsToday = (signals as any[]).filter((s) => new Date(s.created_at) >= startOfToday).length;

      const spendToday = (spendTodayRes.data ?? []).reduce((n: number, r: any) => n + Number(r.est_cost_usd || 0), 0);
      const spendMonth = (spendMonthRes.data ?? []).reduce((n: number, r: any) => n + Number(r.est_cost_usd || 0), 0);
      const budgetVal = (budgetRes.data as any)?.value;
      const budget = Number(budgetVal?.amount ?? budgetVal ?? 150) || 150;
      const pctBudget = budget > 0 ? (spendMonth / budget) * 100 : 0;

      // Attention rules
      type Item = { severity: "high" | "med" | "low"; text: string; link: string };
      const attention: Item[] = [];
      const label = (u: { email: string | null; id: string }) =>
        profileMap.get(u.id)?.first_name || u.email || u.id.slice(0, 8);

      for (const u of realUsers) {
        const caps = captureCount.get(u.id) ?? 0;
        const signedAgo = u.created_at ? (now.getTime() - new Date(u.created_at).getTime()) / dayMs : 0;
        const seenAgo = u.last_sign_in_at ? (now.getTime() - new Date(u.last_sign_in_at).getTime()) / dayMs : Infinity;
        const lastCapAgo = lastCapture.has(u.id) ? (now.getTime() - (lastCapture.get(u.id) ?? 0)) / dayMs : Infinity;

        if (signedAgo > 1 && caps === 0) {
          attention.push({ severity: "high", text: `${label(u)} hasn't captured yet — at risk`, link: "/admin/people" });
          continue;
        }
        if (u.last_sign_in_at && caps === 0) {
          attention.push({ severity: "high", text: `${label(u)} logged in but hasn't captured — activation gap`, link: "/admin/people" });
          continue;
        }
        if (caps >= 1 && caps <= 2 && lastCapAgo >= 3) {
          attention.push({ severity: "med", text: `${label(u)} stalled at ${caps} capture${caps === 1 ? "" : "s"}`, link: "/admin/people" });
        }
      }

      const pacedBudget = budget * (dayOfMonth / daysInMonth);
      if (spendMonth > pacedBudget) {
        attention.push({ severity: "med", text: "AI spend pace above budget", link: "/admin/cost" });
      }

      const severityRank: Record<string, number> = { high: 0, med: 1, low: 2 };
      attention.sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);
      const trimmed = attention.slice(0, 6);
      if (trimmed.length === 0) {
        trimmed.push({ severity: "low", text: "All healthy — no action needed.", link: "/admin/people" });
      }

      const firstCapture = activated;
      const firstSignal = withSignal;

      return json({
        totals: {
          users: totalUsers,
          activated,
          with_signal: withSignal,
          new_this_week: newThisWeek,
        },
        today: {
          new_users: newUsersToday,
          new_captures: newCapturesToday,
          new_signals: newSignalsToday,
          spend_usd: +spendToday.toFixed(4),
        },
        month: {
          spend_usd: +spendMonth.toFixed(4),
          budget_usd: budget,
          pct_budget: +pctBudget.toFixed(1),
        },
        funnel: {
          signed_up: totalUsers,
          onboarded,
          first_capture: firstCapture,
          first_signal: firstSignal,
        },
        attention: trimmed,
      });
    }

    return json({ error: "unknown action" }, 400);
  } catch (e: any) {
    return json({ error: e?.message ?? "internal error" }, 500);
  }
});