import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.99.3";
import { logError } from "../_shared/logError.ts";

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
    const actorId = userData.user.id;

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

      const [profiles, entries, signals, posts, snaps, nudges] = await Promise.all([
        admin.from("diagnostic_profiles").select("user_id, first_name, sector_focus").in("user_id", ids),
        admin.from("entries").select("user_id").in("user_id", ids),
        admin.from("strategic_signals").select("user_id").in("user_id", ids),
        admin.from("linkedin_posts").select("user_id").in("user_id", ids),
        admin.from("score_snapshots").select("user_id, score, created_at").in("user_id", ids).order("created_at", { ascending: false }),
        admin.from("lifecycle_emails").select("user_id, email_type, sent_at").in("user_id", ids).order("sent_at", { ascending: false }),
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
      const latestNudge = new Map<string, { type: string; at: string }>();
      (nudges.data ?? []).forEach((n: any) => {
        if (!latestNudge.has(n.user_id) && n.sent_at) {
          latestNudge.set(n.user_id, { type: n.email_type, at: n.sent_at });
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
          last_nudge_type: latestNudge.get(u.id)?.type ?? null,
          last_nudge_at: latestNudge.get(u.id)?.at ?? null,
        };
      });
      return json({ rows });
    }

    if (action === "user_detail") {
      const target = String(body?.user_id || "");
      if (!target) return json({ error: "user_id required" }, 400);
      const [capturesRes, signalsRes, postsRes, snapsRes, nudgesRes, actionsRes] = await Promise.all([
        admin.from("entries")
          .select("id, title, content, image_url, created_at")
          .eq("user_id", target).order("created_at", { ascending: false }).limit(10),
        admin.from("strategic_signals")
          .select("id, signal_title, confidence, status, created_at")
          .eq("user_id", target).eq("status", "active").order("created_at", { ascending: false }).limit(20),
        admin.from("linkedin_posts")
          .select("id, source_type, tracking_status, post_text, created_at")
          .eq("user_id", target).order("created_at", { ascending: false }).limit(10),
        admin.from("score_snapshots")
          .select("score, tier, created_at")
          .eq("user_id", target).order("created_at", { ascending: false }).limit(10),
        admin.from("lifecycle_emails")
          .select("email_type, sent_at, metadata")
          .eq("user_id", target).order("sent_at", { ascending: false }).limit(10),
        admin.from("admin_action_log")
          .select("action, task, result, detail, target_ref, created_at")
          .eq("target_user_id", target).order("created_at", { ascending: false }).limit(10),
      ]);
      const captures = (capturesRes.data ?? []).map((e: any) => ({
        id: e.id,
        title: e.title,
        snippet: (e.content ?? "").slice(0, 200),
        image_url: e.image_url,
        created_at: e.created_at,
      }));
      const posts = (postsRes.data ?? []).map((p: any) => ({
        id: p.id,
        source_type: p.source_type,
        tracking_status: p.tracking_status,
        snippet: (p.post_text ?? "").slice(0, 200),
        created_at: p.created_at,
      }));
      const nudges = (nudgesRes.data ?? []).map((n: any) => ({
        email_type: n.email_type,
        sent_at: n.sent_at,
        subject: n.metadata?.subject ?? null,
      }));
      return json({
        captures,
        signals: signalsRes.data ?? [],
        posts,
        imprint_history: snapsRes.data ?? [],
        nudges,
        actions: actionsRes.data ?? [],
      });
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
        const score = out?.score ?? out?.imprint ?? out?.total ?? out?.aura_score ?? null;
        await admin.from("admin_action_log").insert({
          actor_id: actorId,
          action: "run_for_user",
          task: "recompute_score",
          target_user_id: target,
          result: res.ok ? "ok" : "error",
          detail: res.ok ? { imprint: score } : { message: out?.error ?? "invoke failed" },
        });
        return json({ ok: res.ok, result: out }, res.ok ? 200 : 500);
      }

      if (task === "send_nudge") {
        const ALLOWED = ["day1", "day3", "day7", "inactive"] as const;
        const requested = String(body?.email_type ?? "inactive");
        if (!ALLOWED.includes(requested as any)) {
          return json({ error: "invalid email_type" }, 400);
        }
        let status: "sent" | "skipped" | "error" = "error";
        let reason: string | null = null;
        let message: string | null = null;
        let out: any = {};
        try {
          const res = await fetch(`${SUPABASE_URL}/functions/v1/send-lifecycle-email`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${SERVICE}`,
              apikey: SERVICE,
            },
            body: JSON.stringify({ user_id: target, email_type: requested }),
          });
          out = await res.json().catch(() => ({}));
          if (!res.ok) {
            status = "error";
            message = out?.error ?? `HTTP ${res.status}`;
          } else if (out?.skipped) {
            status = "skipped";
            reason = String(out.skipped);
          } else if (out?.success) {
            status = "sent";
          } else {
            status = "error";
            message = "unexpected response";
          }
        } catch (e: any) {
          status = "error";
          message = e?.message ?? "invoke error";
        }
        await admin.from("admin_action_log").insert({
          actor_id: actorId,
          action: "run_for_user",
          task: "send_nudge",
          target_user_id: target,
          target_ref: requested,
          result: status,
          detail: status === "skipped" ? { reason } : status === "error" ? { message } : {},
        });
        return json({ ok: status !== "error", status, reason, message, result: out });
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

      const TARGET_ACTIVATION_PCT = 70;
      const TARGET_WITH_SIGNAL_PCT = 50;

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
      const safeIds = realIds.length ? realIds : ["00000000-0000-0000-0000-000000000000"];
      const errWindow = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const [profilesRes, entriesRes, signalsRes, spendTodayRes, spendMonthRes, budgetRes, postsRes, snapsRes, errorsRes, hbCapRes, hbSigRes, hbErrRes] = await Promise.all([
        admin.from("diagnostic_profiles").select("user_id, first_name, sector_focus").in("user_id", realIds.length ? realIds : ["00000000-0000-0000-0000-000000000000"]),
        admin.from("entries").select("user_id, created_at").in("user_id", realIds.length ? realIds : ["00000000-0000-0000-0000-000000000000"]),
        admin.from("strategic_signals").select("user_id, created_at, status").in("user_id", realIds.length ? realIds : ["00000000-0000-0000-0000-000000000000"]),
        admin.from("ai_usage_log").select("est_cost_usd").gte("created_at", startOfToday.toISOString()),
        admin.from("ai_usage_log").select("est_cost_usd").gte("created_at", startOfMonth.toISOString()),
        admin.from("admin_settings").select("value").eq("key", "monthly_ai_budget_usd").maybeSingle(),
        admin.from("linkedin_posts").select("user_id, source_type, tracking_status, created_at").in("user_id", safeIds),
        admin.from("score_snapshots").select("user_id, score, created_at").in("user_id", safeIds).order("created_at", { ascending: false }),
        admin.from("ef_error_log").select("function_name, error_message, created_at").gte("created_at", errWindow.toISOString()).order("created_at", { ascending: false }).limit(50),
        admin.from("entries").select("id", { count: "exact", head: true }).gte("created_at", startOfToday.toISOString()),
        admin.from("strategic_signals").select("id", { count: "exact", head: true }).gte("created_at", startOfToday.toISOString()),
        admin.from("ef_error_log").select("id", { count: "exact", head: true }).gte("created_at", startOfToday.toISOString()),
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

      // Prev-week comparison — derived only from already-fetched arrays
      const weekAgoMs = weekAgo.getTime();
      const twoWeeksAgoMs = weekAgoMs - 7 * dayMs;
      const existedPrev = realUsers.filter((u) => u.created_at && new Date(u.created_at).getTime() <= weekAgoMs);
      const existedPrevIds = new Set(existedPrev.map((u) => u.id));
      const usersPrev = existedPrev.length;
      const capturedByPrev = new Set<string>();
      for (const e of entries as any[]) {
        if (new Date(e.created_at).getTime() <= weekAgoMs && existedPrevIds.has(e.user_id)) capturedByPrev.add(e.user_id);
      }
      const signalByPrev = new Set<string>();
      for (const s of signals as any[]) {
        if (new Date(s.created_at).getTime() <= weekAgoMs && existedPrevIds.has(s.user_id)) signalByPrev.add(s.user_id);
      }
      const activatedPrev = capturedByPrev.size;
      const withSignalPrev = signalByPrev.size;
      const newPrevWeek = realUsers.filter((u) => {
        if (!u.created_at) return false;
        const t = new Date(u.created_at).getTime();
        return t >= twoWeeksAgoMs && t < weekAgoMs;
      }).length;
      const activationPctNow = totalUsers > 0 ? Math.round((activated / totalUsers) * 100) : 0;
      const activationPctPrev = usersPrev > 0 ? Math.round((activatedPrev / usersPrev) * 100) : 0;
      const withSignalPctNow = totalUsers > 0 ? Math.round((withSignal / totalUsers) * 100) : 0;
      const withSignalPctPrev = usersPrev > 0 ? Math.round((withSignalPrev / usersPrev) * 100) : 0;
      const projectedSpend = dayOfMonth > 0 ? (spendMonth / dayOfMonth) * daysInMonth : spendMonth;
      const overPace = spendMonth > budget * (dayOfMonth / daysInMonth);

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
      // Issues in last 24h from ef_error_log
      const errorRows = (errorsRes.data ?? []) as any[];
      const issues = {
        count: errorRows.length,
        recent: errorRows.slice(0, 5).map((r) => ({
          function_name: r.function_name,
          error_message: r.error_message,
          created_at: r.created_at,
          plain: explainFunction(String(r.function_name || "")),
        })),
      };
      const heartbeat = {
        captures_today: Number(hbCapRes.count ?? 0),
        signals_today: Number(hbSigRes.count ?? 0),
        ef_errors_today: Number(hbErrRes.count ?? 0),
      };
      if (issues.count > 0) {
        attention.unshift({ severity: "high", text: `${issues.count} function errors in last 24h`, link: "/admin" });
      }
      const trimmed = attention.slice(0, 6);
      if (trimmed.length === 0) {
        trimmed.push({ severity: "low", text: "All healthy — no action needed.", link: "/admin/people" });
      }

      const firstCapture = activated;
      const firstSignal = withSignal;

      // Biggest leak — 8-stage journey drop
      const posts = (postsRes.data ?? []) as any[];
      const snaps = (snapsRes.data ?? []) as any[];
      const activeSigCount = new Map<string, number>();
      for (const s of signals as any[]) {
        if (String(s.status ?? "active") === "active") {
          activeSigCount.set(s.user_id, (activeSigCount.get(s.user_id) ?? 0) + 1);
        }
      }
      const draftCount = new Map<string, number>();
      const publishCount = new Map<string, number>();
      for (const p of posts) {
        if (p.source_type === "aura" || p.source_type === "aura_generated") {
          draftCount.set(p.user_id, (draftCount.get(p.user_id) ?? 0) + 1);
        }
        if (p.tracking_status === "published") {
          publishCount.set(p.user_id, (publishCount.get(p.user_id) ?? 0) + 1);
        }
      }
      const latestScore = new Map<string, number>();
      for (const s of snaps) {
        if (!latestScore.has(s.user_id) && typeof s.score === "number") latestScore.set(s.user_id, Number(s.score));
      }
      type StageKey = "signed_up" | "onboarded" | "first_capture" | "first_signal" | "first_draft" | "first_publish" | "active_rhythm" | "growing";
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
        const caps = captureCount.get(uid) ?? 0;
        const sigs = activeSigCount.get(uid) ?? 0;
        const drafts = draftCount.get(uid) ?? 0;
        const pubs = publishCount.get(uid) ?? 0;
        const last = lastCapture.get(uid);
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
      const stageCounts: Record<StageKey, number> = {
        signed_up: 0, onboarded: 0, first_capture: 0, first_signal: 0,
        first_draft: 0, first_publish: 0, active_rhythm: 0, growing: 0,
      };
      for (const u of realUsers) {
        const k = stageOf(u.id);
        const idx = STAGES.findIndex((s) => s.key === k);
        for (let i = 0; i <= idx; i++) stageCounts[STAGES[i].key] += 1;
      }
      const prePublish = new Set<StageKey>(["signed_up", "onboarded", "first_capture", "first_signal", "first_draft"]);
      let leakIdx = 1;
      let leakDrop = -1;
      let leakPrePublish = false;
      for (let i = 1; i < STAGES.length; i++) {
        const prev = stageCounts[STAGES[i - 1].key];
        const curr = stageCounts[STAGES[i].key];
        const dropCount = prev - curr;
        const isPre = prePublish.has(STAGES[i].key);
        // Prefer pre-publish stage on tie
        if (dropCount > leakDrop || (dropCount === leakDrop && isPre && !leakPrePublish)) {
          leakIdx = i;
          leakDrop = dropCount;
          leakPrePublish = isPre;
        }
      }
      const biggest_leak = {
        from_label: STAGES[leakIdx - 1].label,
        to_label: STAGES[leakIdx].label,
        stuck_count: Math.max(0, leakDrop),
      };

      // Last-14-days trends — derived from already-fetched entries/signals/posts (no new queries)
      const trendDays = 14;
      const trendStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
      trendStart.setUTCDate(trendStart.getUTCDate() - (trendDays - 1));
      const dayKeys: string[] = [];
      const dayLabels: string[] = [];
      const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
      for (let i = 0; i < trendDays; i++) {
        const d = new Date(trendStart.getTime() + i * dayMs);
        const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
        dayKeys.push(key);
        dayLabels.push(`${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`);
      }
      const dayIndex = new Map<string, number>(dayKeys.map((k, i) => [k, i]));
      const bucketKey = (iso: string) => {
        const d = new Date(iso);
        return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
      };
      const capturesArr = new Array(trendDays).fill(0);
      const activeSets: Set<string>[] = Array.from({ length: trendDays }, () => new Set<string>());
      const signalsArr = new Array(trendDays).fill(0);
      const postsArr = new Array(trendDays).fill(0);
      for (const e of entries as any[]) {
        if (!e.created_at) continue;
        const idx = dayIndex.get(bucketKey(e.created_at));
        if (idx === undefined) continue;
        capturesArr[idx] += 1;
        if (e.user_id) activeSets[idx].add(e.user_id);
      }
      for (const s of signals as any[]) {
        if (!s.created_at) continue;
        const idx = dayIndex.get(bucketKey(s.created_at));
        if (idx === undefined) continue;
        signalsArr[idx] += 1;
      }
      for (const p of posts as any[]) {
        if (!p.created_at) continue;
        const idx = dayIndex.get(bucketKey(p.created_at));
        if (idx === undefined) continue;
        postsArr[idx] += 1;
      }
      const activeArr = activeSets.map((s) => s.size);
      const trends = {
        labels: dayLabels,
        series: [
          { key: "captures", label: "Captures",     color: "#B08D3A", values: capturesArr },
          { key: "active",   label: "Active users", color: "#36C5B0", values: activeArr },
          { key: "signals",  label: "Signals",      color: "#D4B056", values: signalsArr },
          { key: "posts",    label: "Posts",        color: "#8B8B8B", values: postsArr },
        ],
      };

      const signed = (n: number) => n === 0 ? "±0" : (n > 0 ? `+${n}` : `−${Math.abs(n)}`);
      const usersDelta = totalUsers - usersPrev;
      const activationDelta = activationPctNow - activationPctPrev;
      const withSignalDelta = withSignalPctNow - withSignalPctPrev;
      const newWeekDelta = newThisWeek - newPrevWeek;
      const activationNote = activationPctNow < TARGET_ACTIVATION_PCT ? `${totalUsers - activated} not activated yet` : null;
      const withSignalNote = withSignalPctNow < TARGET_WITH_SIGNAL_PCT ? `${activated - withSignal} capturing, no signal yet` : null;
      const spendNote = overPace ? `over pace — projected $${projectedSpend.toFixed(0)}` : null;
      const kpis = [
        {
          key: "users",
          label: "Users",
          value: String(totalUsers),
          sub: null,
          delta: signed(usersDelta),
          sentiment: usersDelta > 0 ? "good" : "neutral",
          target: null,
          note: null,
          link: null,
        },
        {
          key: "activation",
          label: "Activated",
          value: `${activationPctNow}%`,
          sub: `${activated}/${totalUsers}`,
          delta: `${signed(activationDelta)}pts`,
          sentiment: activationDelta > 0 ? "good" : activationDelta < 0 ? "bad" : "neutral",
          target: `target ${TARGET_ACTIVATION_PCT}%`,
          note: activationNote,
          link: activationNote ? "/admin/journey" : null,
        },
        {
          key: "with_signal",
          label: "With signal",
          value: `${withSignalPctNow}%`,
          sub: `${withSignal}/${totalUsers}`,
          delta: `${signed(withSignalDelta)}pts`,
          sentiment: withSignalDelta > 0 ? "good" : withSignalDelta < 0 ? "bad" : "neutral",
          target: `target ${TARGET_WITH_SIGNAL_PCT}%`,
          note: withSignalNote,
          link: withSignalNote ? "/admin/journey" : null,
        },
        {
          key: "new_this_week",
          label: "New this week",
          value: String(newThisWeek),
          sub: null,
          delta: `${signed(newWeekDelta)} vs last wk`,
          sentiment: newWeekDelta > 0 ? "good" : newWeekDelta < 0 ? "bad" : "neutral",
          target: null,
          note: null,
          link: null,
        },
        {
          key: "spend",
          label: "Spend this month",
          value: `$${spendMonth.toFixed(2)}`,
          sub: `${pctBudget.toFixed(0)}% of $${budget}`,
          delta: `proj $${projectedSpend.toFixed(0)}`,
          sentiment: overPace ? "bad" : "good",
          target: `budget $${budget}`,
          note: spendNote,
          link: spendNote ? "/admin/cost" : null,
        },
      ];

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
        issues,
        heartbeat,
        biggest_leak,
        kpis,
        trends,
      });
    }

    if (action === "output_rollup") {
      const [postsRes, metricsRes] = await Promise.all([
        admin.from("linkedin_posts").select("tracking_status, source_type, source_signal_id, published_at, created_at"),
        admin.from("linkedin_post_metrics").select("post_id, snapshot_date, impressions, members_reached"),
      ]);
      if (postsRes.error) return json({ error: postsRes.error.message }, 500);
      if (metricsRes.error) return json({ error: metricsRes.error.message }, 500);

      const posts = postsRes.data ?? [];
      const metrics = metricsRes.data ?? [];

      const published = posts.filter((p: any) => p.tracking_status === "published");
      const publishedTotal = published.length;
      const cutoff = Date.now() - 30 * 24 * 3600 * 1000;
      const published30d = published.filter((p: any) => {
        const t = new Date(p.published_at ?? p.created_at ?? 0).getTime();
        return t >= cutoff;
      }).length;
      const fromSignal = published.filter((p: any) => p.source_signal_id != null);
      const fromSignalCount = fromSignal.length;
      const fromSignalPct = publishedTotal > 0 ? Math.round((fromSignalCount / publishedTotal) * 100) : 0;
      const signalsConverted = new Set(fromSignal.map((p: any) => p.source_signal_id)).size;
      const auraGenerated = posts.filter((p: any) => p.source_type === "aura" || p.source_type === "aura_generated").length;

      // Dedupe metrics to latest snapshot per post_id
      const latestByPost = new Map<string, any>();
      let metricsAsOf: string | null = null;
      for (const m of metrics) {
        if (!m.post_id) continue;
        const prev = latestByPost.get(m.post_id);
        if (!prev || String(m.snapshot_date) > String(prev.snapshot_date)) {
          latestByPost.set(m.post_id, m);
        }
        if (!metricsAsOf || String(m.snapshot_date) > metricsAsOf) {
          metricsAsOf = m.snapshot_date;
        }
      }
      let impressions = 0;
      let membersReached = 0;
      for (const m of latestByPost.values()) {
        impressions += Number(m.impressions ?? 0);
        membersReached += Number(m.members_reached ?? 0);
      }

      return json({
        published_total: publishedTotal,
        published_30d: published30d,
        from_signal_pct: fromSignalPct,
        from_signal_count: fromSignalCount,
        signals_converted: signalsConverted,
        aura_generated: auraGenerated,
        impressions,
        members_reached: membersReached,
        metrics_as_of: metricsAsOf,
      });
    }

    return json({ error: "unknown action" }, 400);
  } catch (e: any) {
    EdgeRuntime.waitUntil(logError("admin-console", e, { user_id: null }));
    return json({ error: e?.message ?? "internal error" }, 500);
  }
});