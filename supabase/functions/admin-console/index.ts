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

    if (action === "journey") {
      const now = new Date();
      const dayMs = 86400000;
      const weekAgo = new Date(now.getTime() - 7 * dayMs);

      // Auth users (paged)
      const users: Array<{ id: string; email: string | null; created_at: string | null; last_sign_in_at: string | null }> = [];
      {
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
      }
      const isTest = (email: string | null) => {
        if (!email) return false;
        const e = email.toLowerCase();
        return e.startsWith("test") || e.includes("+test") || e.endsWith("@example.com") || e.includes("@test.");
      };
      const realUsers = users.filter((u) => u.id !== FOUNDER_ID && !isTest(u.email));
      const realIds = realUsers.map((u) => u.id);
      const safeIds = realIds.length ? realIds : ["00000000-0000-0000-0000-000000000000"];

      const [profilesRes, entriesRes, signalsRes, postsRes, snapsRes] = await Promise.all([
        admin.from("diagnostic_profiles").select("user_id, first_name, sector_focus").in("user_id", safeIds),
        admin.from("entries").select("user_id, created_at").in("user_id", safeIds),
        admin.from("strategic_signals").select("user_id, status").in("user_id", safeIds),
        admin.from("linkedin_posts").select("user_id, source_type, tracking_status, created_at").in("user_id", safeIds),
        admin.from("score_snapshots").select("user_id, score, created_at").in("user_id", safeIds).order("created_at", { ascending: false }),
      ]);

      const profileMap = new Map<string, { first_name: string | null; sector_focus: string | null }>();
      for (const p of (profilesRes.data ?? []) as any[]) {
        profileMap.set(p.user_id, { first_name: p.first_name, sector_focus: p.sector_focus });
      }

      const capCount = new Map<string, number>();
      const lastCap = new Map<string, number>();
      for (const e of (entriesRes.data ?? []) as any[]) {
        capCount.set(e.user_id, (capCount.get(e.user_id) ?? 0) + 1);
        const t = new Date(e.created_at).getTime();
        if (!lastCap.has(e.user_id) || t > (lastCap.get(e.user_id) ?? 0)) lastCap.set(e.user_id, t);
      }
      const activeSignalCount = new Map<string, number>();
      for (const s of (signalsRes.data ?? []) as any[]) {
        if (String(s.status ?? "active") === "active") {
          activeSignalCount.set(s.user_id, (activeSignalCount.get(s.user_id) ?? 0) + 1);
        }
      }
      const draftCount = new Map<string, number>();
      const publishCount = new Map<string, number>();
      const lastPostAt = new Map<string, number>();
      for (const p of (postsRes.data ?? []) as any[]) {
        if (p.source_type === "aura" || p.source_type === "aura_generated") {
          draftCount.set(p.user_id, (draftCount.get(p.user_id) ?? 0) + 1);
        }
        if (p.tracking_status === "published") {
          publishCount.set(p.user_id, (publishCount.get(p.user_id) ?? 0) + 1);
        }
        const t = new Date(p.created_at).getTime();
        if (!lastPostAt.has(p.user_id) || t > (lastPostAt.get(p.user_id) ?? 0)) lastPostAt.set(p.user_id, t);
      }
      const latestScore = new Map<string, number>();
      for (const s of (snapsRes.data ?? []) as any[]) {
        if (!latestScore.has(s.user_id) && typeof s.score === "number") latestScore.set(s.user_id, Number(s.score));
      }

      type StageKey =
        | "signed_up"
        | "onboarded"
        | "first_capture"
        | "first_signal"
        | "first_draft"
        | "first_publish"
        | "active_rhythm"
        | "growing";
      const STAGES: { key: StageKey; label: string }[] = [
        { key: "signed_up", label: "Signed up" },
        { key: "onboarded", label: "Onboarded" },
        { key: "first_capture", label: "First capture" },
        { key: "first_signal", label: "First signal" },
        { key: "first_draft", label: "First draft" },
        { key: "first_publish", label: "First publish" },
        { key: "active_rhythm", label: "Active rhythm" },
        { key: "growing", label: "Growing" },
      ];

      const stageOf = (uid: string): StageKey => {
        const prof = profileMap.get(uid);
        const caps = capCount.get(uid) ?? 0;
        const sigs = activeSignalCount.get(uid) ?? 0;
        const drafts = draftCount.get(uid) ?? 0;
        const pubs = publishCount.get(uid) ?? 0;
        const last = lastCap.get(uid);
        const rhythm = !!last && (now.getTime() - last) / dayMs <= 7 && caps >= 3;
        const score = latestScore.get(uid) ?? 0;
        if (score >= 35 || pubs >= 3) return "growing";
        if (rhythm) return "active_rhythm";
        if (pubs > 0) return "first_publish";
        if (drafts > 0) return "first_draft";
        if (sigs > 0) return "first_signal";
        if (caps > 0) return "first_capture";
        if (prof?.sector_focus) return "onboarded";
        return "signed_up";
      };

      const stageByUser = new Map<string, StageKey>();
      for (const u of realUsers) stageByUser.set(u.id, stageOf(u.id));

      const stageIndex = (k: StageKey) => STAGES.findIndex((s) => s.key === k);
      const counts: Record<StageKey, number> = {
        signed_up: 0, onboarded: 0, first_capture: 0, first_signal: 0,
        first_draft: 0, first_publish: 0, active_rhythm: 0, growing: 0,
      };
      // Monotonic: user counted at reached stage and every prior stage
      for (const [, k] of stageByUser) {
        const idx = stageIndex(k);
        for (let i = 0; i <= idx; i++) counts[STAGES[i].key] += 1;
      }
      const total = realUsers.length || 1;
      const stages = STAGES.map((s, i) => {
        const c = counts[s.key];
        const prev = i === 0 ? c : counts[STAGES[i - 1].key];
        const drop = i === 0 ? 0 : prev > 0 ? ((prev - c) / prev) * 100 : 0;
        return {
          key: s.key,
          label: s.label,
          count: c,
          pct_of_total: +((c / total) * 100).toFixed(1),
          drop_from_prev_pct: +drop.toFixed(1),
        };
      });

      const RECS: Record<StageKey, { text: string; nudge: "day1" | "inactive" | null }> = {
        signed_up: { text: "Resend onboarding / personal welcome", nudge: "day1" },
        onboarded: { text: "Activation gap — send first-capture nudge; check article-fetch fix", nudge: "inactive" },
        first_capture: { text: "Encourage 1–2 more captures from varied sources so a signal forms", nudge: "inactive" },
        first_signal: { text: "Signal ready — nudge to draft from their top signal", nudge: "inactive" },
        first_draft: { text: "Draft sitting — lifecycle cron auto-nudges at 24h; ping if >3 days", nudge: null },
        first_publish: { text: "Encourage weekly cadence", nudge: "inactive" },
        active_rhythm: { text: "Broaden topics / richer sources to climb tiers", nudge: null },
        growing: { text: "—", nudge: null },
      };

      const label = (u: { id: string; email: string | null }) =>
        profileMap.get(u.id)?.first_name || u.email || u.id.slice(0, 8);

      const stuck: Record<string, any[]> = {};
      for (const s of STAGES) stuck[s.key] = [];
      for (const u of realUsers) {
        const k = stageByUser.get(u.id)!;
        if (k === "growing") continue;
        const signedAgo = u.created_at ? (now.getTime() - new Date(u.created_at).getTime()) / dayMs : 0;
        const lastActivity = Math.max(lastCap.get(u.id) ?? 0, lastPostAt.get(u.id) ?? 0, u.last_sign_in_at ? new Date(u.last_sign_in_at).getTime() : 0);
        const activityAgo = lastActivity ? (now.getTime() - lastActivity) / dayMs : Infinity;
        const prePublishStages: StageKey[] = ["signed_up", "onboarded", "first_capture", "first_signal", "first_draft"];
        const risk =
          prePublishStages.includes(k) && activityAgo >= 3
            ? "high"
            : activityAgo >= 6
            ? "med"
            : "low";
        const rec = RECS[k];
        stuck[k].push({
          user_id: u.id,
          name_or_email: label(u),
          days_since_signup: +signedAgo.toFixed(1),
          last_seen: u.last_sign_in_at,
          risk,
          recommendation: rec.text,
          suggested_nudge: rec.nudge,
        });
      }

      // Flags
      const churnRisk: any[] = [];
      const nearWin: any[] = [];
      const targets = [15, 35, 60, 80];
      for (const u of realUsers) {
        const k = stageByUser.get(u.id)!;
        const idx = stageIndex(k);
        const lastActivity = Math.max(lastCap.get(u.id) ?? 0, lastPostAt.get(u.id) ?? 0);
        const activityAgo = lastActivity ? (now.getTime() - lastActivity) / dayMs : Infinity;
        const pubs = publishCount.get(u.id) ?? 0;
        if (idx <= 3 && activityAgo >= 3 && activityAgo <= 6 && pubs === 0) {
          churnRisk.push({ user_id: u.id, name_or_email: label(u), stage: k, days_inactive: +activityAgo.toFixed(1) });
        }
        const score = latestScore.get(u.id);
        if (typeof score === "number") {
          for (const t of targets) {
            if (score < t && t - score <= 5) {
              nearWin.push({ user_id: u.id, name_or_email: label(u), score: Math.round(score), target: t });
              break;
            }
          }
        }
      }

      return json({ stages, stuck, flags: { churn_risk: churnRisk, near_win: nearWin } });
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