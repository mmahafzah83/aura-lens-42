// home-address — THE CHIEF OF STAFF BRAIN
//
// Three phases, in order:
//   A. Facts   — SQL only. Every number Aura says out loud is computed here.
//   B. Decide  — lens + ranked moves, deterministic code. No model.
//   C. Address — the model writes prose from the facts. It never sees the DB
//                and never produces a number. A post-generation guard rejects
//                any integer that is not present in the facts object.
//
// Idempotent per (user_id, address_date) unless { force: true }.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { logEfError } from "../_shared/observe.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const FN = "home-address";
const FOUNDER_ID = "9e0c6ee1-6562-4fdc-89ba-d62b39f02bb3";
const MODEL = "google/gemini-3-flash-preview";

const TIERS: Record<string, { name: string; next: string | null; nextFloor: number | null }> = {
  observer:   { name: "Observer",   next: "Explorer",   nextFloor: 15 },
  explorer:   { name: "Explorer",   next: "Strategist", nextFloor: 35 },
  strategist: { name: "Strategist", next: "Voice",      nextFloor: 60 },
  voice:      { name: "Voice",      next: "Presence",   nextFloor: 80 },
  presence:   { name: "Presence",   next: null,         nextFloor: null },
};

const PUBLISHED_STATUSES = ["published", "confirmed"];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function daysBetween(a: Date, b: Date): number {
  return Math.floor((a.getTime() - b.getTime()) / 86400000);
}
function isoDaysAgo(n: number): string {
  return new Date(Date.now() - n * 86400000).toISOString();
}

// ─────────────────────────────────────────────────────────── PHASE A: FACTS

type Facts = Record<string, any>;

async function gatherFacts(admin: SupabaseClient, userId: string): Promise<Facts> {
  const now = new Date();
  const today = dayKey(now);

  const [
    profileR, entriesR, fragR, sourcesR, signalsR, imprintR, facetsR,
    postsR, findingsR, contentR, connR,
  ] = await Promise.all([
    admin.from("diagnostic_profiles")
      .select("created_at, last_visit_at, last_active_at").eq("user_id", userId).maybeSingle(),
    admin.from("entries").select("id, created_at").eq("user_id", userId)
      .order("created_at", { ascending: false }).limit(2000),
    admin.from("evidence_fragments").select("id", { count: "exact", head: true }).eq("user_id", userId),
    admin.from("source_registry").select("id", { count: "exact", head: true }).eq("user_id", userId),
    admin.from("strategic_signals")
      .select("id, signal_title, status, fragment_count, signal_velocity, velocity_status, created_at, updated_at, priority_score, supporting_evidence_ids")
      .eq("user_id", userId).order("priority_score", { ascending: false, nullsFirst: false }).limit(200),
    admin.from("imprint_snapshots").select("imprint, tier, components, created_at")
      .eq("user_id", userId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    admin.from("facet_states").select("facet, value").eq("user_id", userId),
    admin.from("linkedin_posts")
      .select("id, title, post_text, tracking_status, created_at, published_at, publish_attempted_at, source_signal_id, source_metadata")
      .eq("user_id", userId).order("created_at", { ascending: false }).limit(1000),
    admin.from("agent_findings").select("id, status, themes, created_at")
      .eq("user_id", userId).gte("created_at", isoDaysAgo(1)),
    admin.from("content_items").select("id, title, signal_id, status, created_at")
      .eq("user_id", userId).gte("created_at", isoDaysAgo(1)),
    admin.from("linkedin_connections").select("id").eq("user_id", userId).eq("status", "active").limit(1),
  ]);

  const profile: any = profileR.data ?? {};
  const entries: any[] = entriesR.data ?? [];
  const signals: any[] = (signalsR.data ?? []);
  const posts: any[] = postsR.data ?? [];
  const facetRows: any[] = facetsR.data ?? [];

  // — signup / visit —
  const signup = profile.created_at ? new Date(profile.created_at) : null;
  const lastVisit = profile.last_visit_at ? new Date(profile.last_visit_at) : null;
  const days_since_signup = signup ? daysBetween(now, signup) : null;
  const days_since_last_visit = lastVisit ? daysBetween(now, lastVisit) : null;

  // — captures —
  const captures_total = entries.length;
  const last_capture_date = entries[0]?.created_at ? dayKey(new Date(entries[0].created_at)) : null;
  const weekAgo = Date.now() - 7 * 86400000;
  const captures_this_week = entries.filter((e) => new Date(e.created_at).getTime() >= weekAgo).length;
  const captured_today = last_capture_date === today;
  let weeks_with_a_capture_last_4 = 0;
  for (let w = 0; w < 4; w++) {
    const hi = Date.now() - w * 7 * 86400000;
    const lo = hi - 7 * 86400000;
    if (entries.some((e) => {
      const t = new Date(e.created_at).getTime();
      return t > lo && t <= hi;
    })) weeks_with_a_capture_last_4++;
  }

  // — signals —
  const active = signals.filter((s) => s.status === "active");
  const signals_active = active.length;
  const signals_accelerating = active.filter((s) => s.velocity_status === "accelerating").length;

  const signalIdsWithPublished = new Set<string>();
  for (const p of posts) {
    if (!PUBLISHED_STATUSES.includes(p.tracking_status)) continue;
    if (p.source_signal_id) signalIdsWithPublished.add(p.source_signal_id);
    const ids = p?.source_metadata?.signal_ids;
    if (Array.isArray(ids)) ids.forEach((i: string) => signalIdsWithPublished.add(i));
  }
  const signals_never_published_from =
    active.filter((s) => !signalIdsWithPublished.has(s.id)).length;

  const topRaw = active[0] ?? null;
  let top_signal: any = null;
  if (topRaw) {
    let first_fragment_date: string | null = null;
    const evIds: string[] = Array.isArray(topRaw.supporting_evidence_ids) ? topRaw.supporting_evidence_ids : [];
    if (evIds.length) {
      const { data: fr } = await admin.from("evidence_fragments")
        .select("created_at").in("id", evIds.slice(0, 100))
        .order("created_at", { ascending: true }).limit(1).maybeSingle();
      if (fr?.created_at) first_fragment_date = dayKey(new Date(fr.created_at));
    }
    // did it gain fragments in the last 7 days?
    let gained_last_7d = false;
    if (evIds.length) {
      const { count } = await admin.from("evidence_fragments")
        .select("id", { count: "exact", head: true })
        .in("id", evIds.slice(0, 100)).gte("created_at", isoDaysAgo(7));
      gained_last_7d = (count ?? 0) > 0;
    }
    top_signal = {
      id: topRaw.id,
      title: topRaw.signal_title,
      fragment_count: topRaw.fragment_count ?? 0,
      velocity: topRaw.velocity_status ?? null,
      first_fragment_date,
      gained_last_7d,
    };
  }

  // — imprint —
  const snap: any = imprintR.data ?? null;
  const imprint = snap?.imprint != null ? Math.round(Number(snap.imprint)) : null;
  const tierKey: string | null = snap?.tier ?? null;
  const tierDef = tierKey ? TIERS[tierKey] : null;
  const componentsRaw = snap?.components ?? {};
  const components = {
    signal: componentsRaw?.signal != null ? Math.round(Number(componentsRaw.signal)) : null,
    content: componentsRaw?.content != null ? Math.round(Number(componentsRaw.content)) : null,
    capture: componentsRaw?.capture != null ? Math.round(Number(componentsRaw.capture)) : null,
  };
  const points_to_next_band =
    imprint != null && tierDef?.nextFloor != null ? Math.max(0, tierDef.nextFloor - imprint) : null;

  // — facets —
  const facets = facetRows.map((f) => ({ facet: f.facet, value: Number(f.value) }));
  const facets_at_zero = facets.filter((f) => f.value === 0).map((f) => f.facet);

  // — drafts / published —
  const drafts = posts.filter((p) => p.tracking_status === "draft");
  const drafts_total = drafts.length;
  const drafts_from_signals = drafts.filter(
    (p) => p.source_signal_id || (Array.isArray(p?.source_metadata?.signal_ids) && p.source_metadata.signal_ids.length),
  ).length;
  const publishedRows = posts.filter((p) => PUBLISHED_STATUSES.includes(p.tracking_status));
  const published_total = publishedRows.length;
  const published_through_aura = publishedRows.filter((p) => !!p.publish_attempted_at).length;
  const attempts = posts.filter((p) => !!p.publish_attempted_at);
  const publish_attempts = attempts.length;
  const last_publish_attempt = attempts
    .map((p) => p.publish_attempted_at)
    .sort()
    .reverse()[0] ?? null;

  // — last night —
  const findings: any[] = findingsR.data ?? [];
  const themes = new Set<string>();
  findings.forEach((f) => (f.themes ?? []).forEach((t: string) => themes.add(t)));
  const nightDrafts = posts.filter(
    (p) => p.tracking_status === "draft" && new Date(p.created_at).getTime() >= Date.now() - 86400000,
  );
  const contentItems: any[] = contentR.data ?? [];
  const newestSignalDraft = nightDrafts.find(
    (p) => p.source_signal_id || (Array.isArray(p?.source_metadata?.signal_ids) && p.source_metadata.signal_ids.length),
  ) ?? null;
  let newest_signal_draft: any = null;
  if (newestSignalDraft) {
    const sid = newestSignalDraft.source_signal_id || newestSignalDraft.source_metadata?.signal_ids?.[0] || null;
    const linked = signals.find((s) => s.id === sid) ?? null;
    newest_signal_draft = {
      id: newestSignalDraft.id,
      title: newestSignalDraft.title || (newestSignalDraft.post_text || "").slice(0, 80) || null,
      signal_id: sid,
      fragment_count: linked?.fragment_count ?? null,
    };
  }
  const last_night = {
    sources_read: findings.length,
    themes_strengthened: themes.size,
    drafts_written: nightDrafts.length + contentItems.filter((c) => c.status === "draft").length,
    newest_signal_draft,
  };

  return {
    as_of: today,
    days_since_signup,
    days_since_last_visit,
    last_capture_date,
    captured_today,
    captures_total,
    captures_this_week,
    weeks_with_a_capture_last_4,
    fragments_total: fragR.count ?? 0,
    distinct_sources: sourcesR.count ?? 0,
    signals_active,
    signals_accelerating,
    signals_never_published_from,
    top_signal,
    imprint,
    tier: tierDef?.name ?? null,
    components,
    points_to_next_band,
    next_band_name: tierDef?.next ?? null,
    facets,
    facets_at_zero,
    drafts_total,
    drafts_from_signals,
    published_total,
    published_through_aura,
    publish_attempts,
    last_publish_attempt,
    last_night,
    linkedin_connected: (connR.data ?? []).length > 0,
  };
}

// ───────────────────────────────────────────────────────── PHASE B: DECIDE

function chooseLens(f: Facts): { lens: string; lens_reason: string } {
  const dss = f.days_since_signup;
  const dslv = f.days_since_last_visit;

  if (dss != null && dss <= 7) return { lens: "shape", lens_reason: "you are in your first week" };
  if (f.captures_total === 0) return { lens: "shape", lens_reason: "nothing has been captured yet" };
  if (f.published_through_aura === 0 && f.facets_at_zero.length >= 2) {
    return { lens: "shape", lens_reason: "parts of your picture are still blank" };
  }
  if (dslv != null && dslv >= 3) {
    return { lens: "record", lens_reason: `you were away ${dslv} days` };
  }
  if (dss != null && dss >= 14) {
    return { lens: "record", lens_reason: "you have enough history to read a pattern" };
  }
  if (f.top_signal?.gained_last_7d && f.drafts_total > 0) {
    return { lens: "room", lens_reason: "your strongest signal moved this week and a draft is waiting" };
  }
  return { lens: "shape", lens_reason: "the picture is still forming" };
}

type Move = {
  rank: number; key: string; title: string; what: string; why: string;
  how: string; outcome: string; cta_route: string; est_minutes: number;
};

function chooseMoves(f: Facts): Move[] {
  const c: Omit<Move, "rank">[] = [];

  if (f.drafts_total > 0) {
    const d = f.last_night?.newest_signal_draft;
    c.push({
      key: "publish_draft",
      title: d?.title ? `Publish the draft on ${d.title}` : "Publish a waiting draft",
      what: "Read the draft Aura wrote, edit what does not sound like you, then publish it.",
      why: `drafts_total is ${f.drafts_total} and published_through_aura is ${f.published_through_aura}.`,
      how: "Open the library, pick the draft, make your edits, press publish.",
      outcome: "One idea leaves your notes and reaches the people who need it.",
      cta_route: "/dashboard?tab=library",
      est_minutes: 8,
    });
  }

  if (f.signals_never_published_from > 0 && f.top_signal) {
    c.push({
      key: "draft_from_signal",
      title: `Turn "${f.top_signal.title}" into a post`,
      what: "Take your strongest unpublished signal into the composer and draft from it.",
      why: `signals_never_published_from is ${f.signals_never_published_from} and top_signal.fragment_count is ${f.top_signal.fragment_count}.`,
      how: "Open the signal, read the evidence behind it, then send it to the composer.",
      outcome: "The reading you have already done becomes something publishable.",
      cta_route: "/dashboard?tab=signals",
      est_minutes: 12,
    });
  }

  if (!f.captured_today) {
    c.push({
      key: "capture",
      title: "Capture one thing you read today",
      what: "Paste a link, a report or a post you disagreed with.",
      why: `captures_this_week is ${f.captures_this_week} and captures_total is ${f.captures_total}.`,
      how: "Use the capture box on Home. A link is enough.",
      outcome: "Aura has something new to read tonight.",
      cta_route: "/dashboard?tab=home",
      est_minutes: 2,
    });
  }

  if (!f.linkedin_connected) {
    c.push({
      key: "connect_linkedin",
      title: "Connect LinkedIn",
      what: "Let Aura read how your posts actually performed.",
      why: `linkedin_connected is false and published_total is ${f.published_total}.`,
      how: "Open settings and connect your account. Nothing publishes without you.",
      outcome: "Drafts start being written from what your audience already rewards.",
      cta_route: "/dashboard?tab=settings",
      est_minutes: 3,
    });
  }

  if (f.facets_at_zero.length > 0) {
    c.push({
      key: "fill_facet",
      title: `Fill the blank in ${f.facets_at_zero[0]}`,
      what: "Add evidence for the part of your picture that is still empty.",
      why: `facets_at_zero includes ${f.facets_at_zero[0]}.`,
      how: "Capture something that shows that side of your work.",
      outcome: "Aura stops staying quiet where you are strongest but silent.",
      cta_route: "/dashboard?tab=identity",
      est_minutes: 5,
    });
  }

  return c.slice(0, 3).map((m, i) => ({ rank: i + 1, ...m }));
}

// ──────────────────────────────────────────────────────── PHASE C: ADDRESS

const SYSTEM_PROMPT = `You are Aura, this person's chief of staff. You have read their LinkedIn, their assessment, their calibration and everything they have captured. Speak as someone who knows them, to a senior professional. Never as a chatbot, never as a coach.

Use only the numbers in the facts object. Never compute, estimate, round differently, or invent one. If a fact is absent, say nothing about it.

Write 4 to 6 sentences. Second person. Open with the sharpest true observation, not a greeting.
Name what they have done before naming what is missing.
No exclamation marks. No emoji. No praise of Aura. Do not describe features.
Banned words: authority (as a noun), trajectory, personal brand, thought leader, leverage (as a verb), utilize, facilitate, unlock, elevate, empower, seamless, journey, unleash, supercharge.
If captures_total is 0, do not imply they have done work. Be warm, honest, and point at the single first step.

Return plain markdown. No headings, no bullet lists, no preamble.`;

function collectIntegers(obj: unknown, out: Set<number>) {
  if (obj == null) return;
  if (typeof obj === "number") {
    if (Number.isFinite(obj)) out.add(Math.round(obj));
    return;
  }
  if (typeof obj === "string") {
    for (const m of obj.matchAll(/\d+/g)) out.add(parseInt(m[0], 10));
    return;
  }
  if (Array.isArray(obj)) return obj.forEach((v) => collectIntegers(v, out));
  if (typeof obj === "object") return Object.values(obj as any).forEach((v) => collectIntegers(v, out));
}

function integersIn(text: string): number[] {
  return [...text.matchAll(/\d+/g)].map((m) => parseInt(m[0], 10));
}

function fallbackAddress(f: Facts, lens: string): string {
  if (f.captures_total === 0) {
    return `Nothing has reached Aura yet, so there is nothing to read back to you. The fastest way to change that is one link — something you read this week and had an opinion about. Aura reads it tonight and shows you what it found. Everything else here starts from that first piece.`;
  }
  const bits: string[] = [];
  bits.push(`You have ${f.captures_total} captures on file, ${f.captures_this_week} of them this week.`);
  if (f.signals_active > 0) bits.push(`Aura is holding ${f.signals_active} active signals drawn from them.`);
  if (f.drafts_total > 0) bits.push(`${f.drafts_total} drafts are waiting on you.`);
  bits.push(`You have published ${f.published_total} posts, ${f.published_through_aura} of them through Aura.`);
  if (lens === "record" && f.days_since_last_visit != null) {
    bits.push(`It has been ${f.days_since_last_visit} days since you last looked.`);
  }
  return bits.join(" ");
}

async function writeAddress(
  apiKey: string, facts: Facts, lens: string, lensReason: string,
): Promise<{ text: string; model: string | null; rejected: boolean }> {
  const lensBrief = {
    record: "Focus on what they have built and what the record now shows.",
    room: "Focus on the conversation happening now and where they should stand in it.",
    shape: "Focus on the shape of what they are building and the next piece it needs.",
  }[lens] ?? "";

  const userMsg = `Lens: ${lens}. ${lensBrief}\nReason for the lens (already shown to them, do not repeat it verbatim): ${lensReason}\n\nFacts:\n${JSON.stringify(facts, null, 2)}`;

  let text = "";
  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userMsg },
        ],
      }),
    });
    if (!res.ok) throw new Error(`gateway ${res.status}`);
    const data = await res.json();
    text = String(data?.choices?.[0]?.message?.content ?? "").trim();
  } catch (_) {
    return { text: fallbackAddress(facts, lens), model: null, rejected: true };
  }

  if (!text) return { text: fallbackAddress(facts, lens), model: null, rejected: true };

  const allowed = new Set<number>();
  collectIntegers(facts, allowed);
  const bad = integersIn(text).filter((n) => !allowed.has(n));
  if (bad.length > 0) {
    return { text: fallbackAddress(facts, lens), model: null, rejected: true };
  }
  return { text, model: MODEL, rejected: false };
}

// ───────────────────────────────────────────────────────────── GENERATION

async function generateFor(
  admin: SupabaseClient, apiKey: string, userId: string, force: boolean,
) {
  const today = dayKey(new Date());

  if (!force) {
    const { data: existing } = await admin.from("home_address")
      .select("*").eq("user_id", userId).eq("address_date", today).maybeSingle();
    if (existing) return { row: existing, cached: true, rejected: false };
  }

  const facts = await gatherFacts(admin, userId);
  const { lens, lens_reason } = chooseLens(facts);
  const moves = chooseMoves(facts);
  const { text, model, rejected } = await writeAddress(apiKey, facts, lens, lens_reason);

  if (rejected) {
    await logEfError(admin, {
      function_name: FN,
      error: "model address rejected — integer not present in facts, fallback stored",
      severity: "info",
      user_id: userId,
      context: { lens },
    });
  }

  const { data: row, error } = await admin.from("home_address").upsert({
    user_id: userId,
    address_date: today,
    lens,
    lens_reason,
    address_md: text,
    moves,
    facts,
    model,
    generated_at: new Date().toISOString(),
  }, { onConflict: "user_id,address_date" }).select().maybeSingle();
  if (error) throw error;

  return { row, cached: false, rejected };
}

// ──────────────────────────────────────────────────────────────── HANDLER

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  try {
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) throw new Error("LOVABLE_API_KEY is not configured");

    let body: any = {};
    try { body = await req.json(); } catch (_) { /* empty body is fine */ }
    const force = body?.force === true;

    // Vault secret name is LOWERCASE `cron_secret`.
    const CRON_SECRET = Deno.env.get("cron_secret") || Deno.env.get("CRON_SECRET") || "";
    const isCron = !!CRON_SECRET && req.headers.get("x-cron-secret") === CRON_SECRET;

    if (isCron) {
      const since = isoDaysAgo(30);
      const { data: recent } = await admin.from("diagnostic_profiles")
        .select("user_id, last_visit_at, last_active_at")
        .or(`last_visit_at.gte.${since},last_active_at.gte.${since}`)
        .limit(2000);
      const ids = [...new Set((recent ?? []).map((r: any) => r.user_id))];

      let ok = 0, failed = 0, rejected = 0;
      for (const id of ids) {
        try {
          const r = await generateFor(admin, apiKey, id, true);
          ok++;
          if (r.rejected) rejected++;
        } catch (e) {
          failed++;
          await logEfError(admin, { function_name: FN, error: e, severity: "high", user_id: id });
        }
      }
      await logEfError(admin, {
        function_name: FN,
        error: `cron run complete: ${ok} generated, ${failed} failed, ${rejected} fallbacks`,
        severity: "info",
        context: { mode: "cron", eligible: ids.length, ok, failed, rejected },
      });
      return json({ ok: true, mode: "cron", eligible: ids.length, generated: ok, failed, rejected });
    }

    // User-invoked path — requires the caller's JWT.
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const anon = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!);
    const { data: authData, error: authErr } = await anon.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authErr || !authData?.user?.id) return json({ error: "Unauthorized" }, 401);
    const userId = authData.user.id;

    const { row, cached, rejected } = await generateFor(admin, apiKey, userId, force);
    await logEfError(admin, {
      function_name: FN,
      error: cached ? "served cached address" : "generated address",
      severity: "info",
      user_id: userId,
      context: { mode: "user", cached, rejected, lens: (row as any)?.lens },
    });
    return json({ ok: true, cached, address: row });
  } catch (e) {
    console.error(`[${FN}]`, e);
    await logEfError(admin, { function_name: FN, error: e, severity: "high" });
    return json({ error: (e as Error)?.message ?? "Unknown error" }, 500);
  }
});