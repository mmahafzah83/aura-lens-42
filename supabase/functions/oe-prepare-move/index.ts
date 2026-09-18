/**
 * oe-prepare-move — the move itself. Everything before this only found things.
 *
 * Lane A (the record has a way in) → an application pack: what they ask, three
 * points built only from his own cited material, a short note in his voice, and
 * the one thing to correct first. Before any of it is built the way in is
 * knocked on: a dead route is our bounced email, and we say so rather than hand
 * him a pack addressed to nobody.
 *
 * Lane B (no way in yet) → the post that puts his name on the topic before a
 * call opens. Written from his own voice profile, his own captures, and the
 * record as the reason it is timely, then dropped into the Content Studio he
 * already has as a draft.
 *
 * A member prepares only his own move. Numbers may appear only when they come
 * out of a cited item; every Arabic line passes the register gate.
 */
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { logAIUsage } from "../_shared/logAIUsage.ts";
import { logEfError } from "../_shared/observe.ts";
import { OE_REGISTER_FOR_PROMPT, registerFault } from "../_shared/oeRegister.ts";
import { generationMetadata } from "../_shared/generationMeta.ts";
import { PROMPT_VERSION, writeLineage } from "../_shared/provenance.ts";
import { findUnsourcedNumbers } from "../_shared/numberGuard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const FN = "oe-prepare-move";
const MODEL = "google/gemini-3-flash-preview";
const PACK_VERSION = "m1-1.0";
const POST_VERSION = "m2-1.0";
const BANNED = /\bthought leader|personal brand|trajectory|leverage\b/i;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normaliseJson(text: string): any {
  let t = (text || "").trim();
  if (t.startsWith("```")) t = t.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try { return JSON.parse(t); } catch {
    const s = t.indexOf("{"), e = t.lastIndexOf("}");
    if (s >= 0 && e > s) return JSON.parse(t.slice(s, e + 1));
    throw new Error("unparseable model output");
  }
}

function asVector(v: unknown): number[] | null {
  if (Array.isArray(v)) return v as number[];
  if (typeof v === "string") { try { const p = JSON.parse(v); return Array.isArray(p) ? p : null; } catch { return null; } }
  return null;
}

const wordsOf = (s: string) => String(s ?? "").toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean);

/** Longest run of consecutive words the line copied out of the item. */
function quotedRun(line: string, item: string): number {
  const L = wordsOf(line), I = wordsOf(item).slice(0, 600);
  let best = 0;
  for (let i = 0; i < I.length; i++) {
    for (let j = 0; j < L.length; j++) {
      let k = 0;
      while (i + k < I.length && j + k < L.length && I[i + k] === L[j + k]) k++;
      if (k > best) best = k;
    }
  }
  return best;
}

async function gateway(key: string, system: string, user: string) {
  const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL, temperature: 0.4, response_format: { type: "json_object" },
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!r.ok) throw new Error(`gateway ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const data = await r.json();
  return { content: data?.choices?.[0]?.message?.content || "", usage: data?.usage || {} };
}

/** A line is kept only if it is clean in both languages. Reject → regenerate once → drop. */
/**
 * Inside a name, a banned word is a name: "the General Authority for
 * Competition" is who issued the notice, not our vocabulary slipping.
 * A Title Case run of two or more capitalised words is read as a name.
 */
const PROPER_NOUN_RUN = /\b(?:[A-Z][\p{L}&'’-]*)(?:\s+(?:of|for|the|and|&|[A-Z][\p{L}&'’-]*)){1,}\b/gu;
function stripProperNouns(text: string): string {
  return text.replace(PROPER_NOUN_RUN, (run) => {
    const caps = run.split(/\s+/).filter((w) => /^[A-Z]/.test(w));
    return caps.length >= 2 ? " " : run;
  });
}

function lineFault(text: string, lang: "en" | "ar"): string | null {
  const t = String(text ?? "").trim();
  if (!t) return "empty";
  const named = stripProperNouns(t);
  if (BANNED.test(named)) return `banned word: ${named.match(BANNED)?.[0]}`;
  return registerFault(named, lang);
}

/** Every line of a block, checked. Returns the faults found, by line. */
function blockFaults(text: string, lang: "en" | "ar"): Array<{ line: string; fault: string }> {
  return String(text ?? "").split("\n").map((l) => l.trim()).filter(Boolean)
    .map((line) => ({ line, fault: lineFault(line, lang) ?? "" }))
    .filter((r) => r.fault);
}

/** Knock on the way in. A 404, a 410 or silence means the door is not there. */
async function routeAlive(url: string): Promise<{ alive: boolean; status: number | null; note: string }> {
  const attempt = async (method: "HEAD" | "GET") => {
    const r = await fetch(url, {
      method, redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36" },
      signal: AbortSignal.timeout(15_000),
    });
    return r.status;
  };
  try {
    let status = await attempt("HEAD");
    // Some hosts refuse HEAD but serve the page perfectly well.
    if (status === 403 || status === 405 || status === 501) status = await attempt("GET");
    if (status === 404 || status === 410) return { alive: false, status, note: `route returned ${status}` };
    if (status >= 500) return { alive: false, status, note: `route returned ${status}` };
    return { alive: true, status, note: "ok" };
  } catch (e) {
    return { alive: false, status: null, note: `route did not answer: ${(e as Error)?.message ?? "no response"}` };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
  const admin: SupabaseClient = createClient(SUPABASE_URL, SERVICE_ROLE);
  const lovableKey = Deno.env.get("LOVABLE_API_KEY") || "";

  const body = await req.json().catch(() => ({} as any));
  const opportunityId = String(body.opportunity_id ?? "");

  // ── who is asking ─────────────────────────────────────────────────────
  const authHeader = req.headers.get("authorization") || "";
  const bearer = authHeader.replace(/^Bearer\s+/i, "");
  const CRON_SECRET = Deno.env.get("cron_secret") || Deno.env.get("CRON_SECRET") || "";
  const cronHeader = req.headers.get("x-cron-secret") || "";
  const machine = (!!CRON_SECRET && cronHeader === CRON_SECRET) || bearer === SERVICE_ROLE;

  let userId: string | null = null;
  if (machine) {
    userId = body.user_id ? String(body.user_id) : null;
  } else if (bearer) {
    const asUser = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } });
    const { data: claims } = await asUser.auth.getUser();
    userId = claims?.user?.id ?? null;
  }
  if (!userId) return json({ error: "Unauthorized" }, 401);
  if (!opportunityId) return json({ error: "opportunity_id required" }, 400);

  const startedAt = new Date().toISOString();
  const counts = { lines_rejected: 0, regenerated: 0, numbers_dropped: 0 };
  const rejected: Array<{ line: string; fault: string }> = [];
  let costUsd = 0;

  try {
    if (!lovableKey) throw new Error("LOVABLE_API_KEY not configured");

    const { data: o } = await admin.from("oe_opportunities")
      .select("id, title, scope, sector, chair_type, time_kind, location, deadline, signal_date, issuer_raw, issuer_id, requirements, evidence_quote, source_url, route_url, route_kind, route_dead, embedding")
      .eq("id", opportunityId).maybeSingle();
    if (!o) return json({ ok: false, error: "opportunity not found" }, 404);

    const { data: profile } = await admin.from("diagnostic_profiles")
      .select("content_language, full_name, current_role, sector_focus")
      .eq("user_id", userId).maybeSingle();
    const lang = (profile?.content_language === "ar" ? "ar" : "en") as "ar" | "en";

    const { data: match } = await admin.from("oe_matches")
      .select("id, lane, requirement_check, met_count, total_count, score_avg")
      .eq("user_id", userId).eq("opportunity_id", o.id)
      .order("judged_at", { ascending: false }).limit(1).maybeSingle();

    // His own eight closest items — the only ground anything here may stand on.
    const vec = asVector(o.embedding);
    const { data: own, error: ownErr } = vec
      ? await admin.rpc("oe_member_evidence", { p_user_id: userId, p_embedding: `[${vec.join(",")}]`, p_k: 8 })
      : { data: [], error: null } as any;
    if (ownErr) throw new Error(`oe_member_evidence: ${ownErr.message}`);
    const mine = ((own ?? []) as any[]).filter((r) => String(r.body ?? "").trim().length > 40);
    if (!mine.length) {
      return json({ ok: false, reason: "no_evidence", message: "Nothing of your own sits close enough to this to build a move from." });
    }
    const allowed = new Map<string, any>(mine.map((r: any) => [String(r.id), r]));
    const evidenceText = mine.map((r: any) => `${r.title ?? ""} ${r.body ?? ""}`).join("\n");
    const mineBlock = mine.map((r: any, i: number) => [
      `${i + 1}. kind=${r.kind} id=${r.id} date=${String(r.occurred_at ?? "").slice(0, 10)}`,
      `"${String(r.title ? `${r.title}. ` : "")}${String(r.body ?? "").replace(/\s+/g, " ").slice(0, 1200)}"`,
    ].join("\n")).join("\n\n");

    const oppBlock = JSON.stringify({
      title: o.title, scope: o.scope, issuer: o.issuer_raw, sector: o.sector,
      chair_type: o.chair_type, location: o.location, deadline: o.deadline,
      signal_date: o.signal_date, time_kind: o.time_kind, quote: o.evidence_quote,
      requirements: (Array.isArray(o.requirements) ? o.requirements : [])
        .map((r: any, i: number) => ({ id: `req:${i}`, text: typeof r === "string" ? r : String(r?.text ?? "") })),
    });

    const laneA = !!o.route_url && o.route_kind && o.route_kind !== "none" && o.route_kind !== "not_checked";

    // ── D. THE ROUTE MUST BE ALIVE ───────────────────────────────────────
    if (laneA) {
      const check = await routeAlive(String(o.route_url));
      if (!check.alive) {
        await admin.from("oe_opportunities").update({ route_dead: true }).eq("id", o.id);
        await admin.from("oe_runs").insert({
          run_kind: "prepare_move", user_id: userId, started_at: startedAt,
          finished_at: new Date().toISOString(), outcome: "ok",
          counts: { ...counts, route_dead: 1 }, cost_usd: 0,
        });
        return json({
          ok: false, reason: "route_dead", route_url: o.route_url,
          status: check.status, message: check.note,
        });
      }
      if (o.route_dead) await admin.from("oe_opportunities").update({ route_dead: false }).eq("id", o.id);
    }

    // ── C. THE MOVE ──────────────────────────────────────────────────────
    let kind: "application_pack" | "positioning_post";
    let content: Record<string, unknown>;
    let postId: string | null = null;

    if (laneA) {
      kind = "application_pack";
      const system =
        `You prepare one senior professional's application for one named chair, in ${lang === "ar" ? "Arabic" : "English"}, ` +
        `second person, plain words, no label words, no percentages. ${OE_REGISTER_FOR_PROMPT} ` +
        `Return strict JSON {your_three_points:[{point, cite:{kind,id}, quote, date}], the_note:string, fix_first:string|null}. ` +
        `Every point must come from HIS OWN MATERIAL, cite it by id, and carry a quote of 3 to 15 words copied verbatim from it. ` +
        `the_note is a message to the issuer or named contact, in his voice, at most 120 words, no flattery, no adjectives about himself. ` +
        `fix_first: the one line in his professional identity to correct before sending, or null. ` +
        `Never write a number that does not appear in HIS OWN MATERIAL.`;
      const userMsg = [
        `HIS OWN MATERIAL:\n${mineBlock}`,
        `THE CHAIR:\n${oppBlock}`,
        `WHAT THEY ASK, ALREADY CHECKED:\n${JSON.stringify(match?.requirement_check ?? [])}`,
        `ALLOWED CITE IDS: ${[...allowed.keys()].join(", ")}`,
      ].join("\n\n");

      let parsed: any = null;
      for (let attempt = 0; attempt < 2 && !parsed; attempt++) {
        const out = await gateway(lovableKey, system, userMsg);
        costUsd += 0.0008;
        await logAIUsage({
          user_id: userId, function_name: FN, provider: "lovable", model: MODEL,
          input_tokens: out.usage?.prompt_tokens ?? 0, output_tokens: out.usage?.completion_tokens ?? 0,
          metadata: { prompt_version: PACK_VERSION, opportunity_id: o.id, attempt: attempt + 1 },
        });
        const rec = normaliseJson(out.content);
        const faults = [
          ...blockFaults(String(rec?.the_note ?? ""), lang),
          ...(Array.isArray(rec?.your_three_points) ? rec.your_three_points : [])
            .map((p: any) => ({ line: String(p?.point ?? ""), fault: lineFault(String(p?.point ?? ""), lang) ?? "" }))
            .filter((r: any) => r.fault),
        ];
        if (faults.length && attempt === 0) { counts.regenerated++; rejected.push(...faults); continue; }
        rejected.push(...faults);
        parsed = rec;
      }

      const points = (Array.isArray(parsed?.your_three_points) ? parsed.your_three_points : [])
        .map((p: any) => {
          const citeId = String(p?.cite?.id ?? "");
          const item = allowed.get(citeId);
          const quote = String(p?.quote ?? "").trim();
          const words = wordsOf(quote).length;
          const verified = !!item && words >= 3 && words <= 15 &&
            quotedRun(quote, `${item?.title ?? ""} ${item?.body ?? ""}`) >= Math.min(3, words);
          const point = String(p?.point ?? "").trim();
          if (!verified || lineFault(point, lang)) { counts.lines_rejected++; return null; }
          return {
            point, quote, cite: { kind: String(item.kind), id: citeId },
            date: String(item.occurred_at ?? "").slice(0, 10),
          };
        })
        .filter(Boolean)
        .slice(0, 3);

      let note = String(parsed?.the_note ?? "").trim();
      const noteNumbers = findUnsourcedNumbers(note, evidenceText);
      if (noteNumbers.length) { counts.numbers_dropped += noteNumbers.length; note = ""; }
      if (note && blockFaults(note, lang).length) { counts.lines_rejected++; note = ""; }
      const fixFirst = String(parsed?.fix_first ?? "").trim();

      content = {
        what_they_ask: match?.requirement_check ?? [],
        met_count: match?.met_count ?? 0,
        total_count: match?.total_count ?? 0,
        your_three_points: points,
        the_note: note || null,
        fix_first: fixFirst && !lineFault(fixFirst, lang) ? fixFirst : null,
        route_url: o.route_url,
        route_kind: o.route_kind,
        deadline: o.deadline,
        language: lang,
      };
    } else {
      kind = "positioning_post";
      const { data: voice } = await admin.from("authority_voice_profiles")
        .select("tone, preferred_structures, storytelling_patterns, example_posts, vocabulary_preferences, allowed_endings")
        .eq("user_id", userId).eq("is_primary", true).maybeSingle();

      const system =
        `You write one LinkedIn post for this professional, in ${lang === "ar" ? "Arabic" : "English"}, in HIS voice. ` +
        `${OE_REGISTER_FOR_PROMPT} No label words, no percentages, no hashtags, no emoji, no flattery. ` +
        `Return strict JSON {hook:string, post_text:string, why_now:string, cited_evidence:[{kind,id,quote,date}]}. ` +
        `The post puts his name on this topic BEFORE any call opens: it is not an application and it asks for nothing. ` +
        `post_text is 90 to 200 words, short sentences, his own substance only. ` +
        `Every claim of fact must come from HIS OWN MATERIAL and appear in cited_evidence with a quote of 3 to 15 words ` +
        `copied verbatim from the cited item. Never write a number that does not appear in HIS OWN MATERIAL. ` +
        `why_now is one sentence naming the record as the reason this is timely.`;
      const userMsg = [
        `HIS VOICE:\n${JSON.stringify({
          tone: voice?.tone ?? null,
          preferred_structures: voice?.preferred_structures ?? null,
          storytelling_patterns: voice?.storytelling_patterns ?? null,
          vocabulary_preferences: voice?.vocabulary_preferences ?? null,
          allowed_endings: voice?.allowed_endings ?? null,
          example_posts: Array.isArray(voice?.example_posts) ? (voice!.example_posts as any[]).slice(0, 3) : voice?.example_posts ?? null,
        })}`,
        `HIS OWN MATERIAL:\n${mineBlock}`,
        `WHY IT IS TIMELY (the record):\n${oppBlock}`,
        `ALLOWED CITE IDS: ${[...allowed.keys()].join(", ")}`,
      ].join("\n\n");

      let parsed: any = null;
      for (let attempt = 0; attempt < 2 && !parsed; attempt++) {
        const out = await gateway(lovableKey, system, userMsg);
        costUsd += 0.001;
        await logAIUsage({
          user_id: userId, function_name: FN, provider: "lovable", model: MODEL,
          input_tokens: out.usage?.prompt_tokens ?? 0, output_tokens: out.usage?.completion_tokens ?? 0,
          metadata: { prompt_version: POST_VERSION, opportunity_id: o.id, attempt: attempt + 1 },
        });
        const rec = normaliseJson(out.content);
        const faults = [
          ...blockFaults(String(rec?.post_text ?? ""), lang),
          ...blockFaults(String(rec?.hook ?? ""), lang),
          ...blockFaults(String(rec?.why_now ?? ""), lang),
        ];
        if (faults.length && attempt === 0) { counts.regenerated++; rejected.push(...faults); continue; }
        rejected.push(...faults);
        parsed = rec;
      }

      // A line the register refuses is dropped, not laundered.
      const kept = String(parsed?.post_text ?? "").split("\n")
        .filter((line: string) => {
          const t = line.trim();
          if (!t) return true;
          if (lineFault(t, lang)) { counts.lines_rejected++; return false; }
          return true;
        });
      let postText = kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();

      // No number may enter that his own material does not carry.
      const unsourced = findUnsourcedNumbers(postText, evidenceText);
      if (unsourced.length) {
        counts.numbers_dropped += unsourced.length;
        postText = postText.split("\n")
          .filter((line: string) => !unsourced.some((n) => line.includes(n)))
          .join("\n").trim();
      }
      if (!postText) throw new Error("nothing survived the register and number checks");

      const cited = (Array.isArray(parsed?.cited_evidence) ? parsed.cited_evidence : [])
        .map((c: any) => {
          const item = allowed.get(String(c?.id ?? ""));
          if (!item) return null;
          const quote = String(c?.quote ?? "").trim();
          const words = wordsOf(quote).length;
          const verified = words >= 3 && words <= 15 &&
            quotedRun(quote, `${item?.title ?? ""} ${item?.body ?? ""}`) >= Math.min(3, words);
          return verified
            ? { kind: String(item.kind), id: String(c.id), quote, date: String(item.occurred_at ?? "").slice(0, 10) }
            : null;
        })
        .filter(Boolean);

      const hookLine = String(parsed?.hook ?? "").trim();
      const whyNow = String(parsed?.why_now ?? "").trim();

      // Into the Content Studio he already has, as a draft, with its lineage.
      const { data: post, error: postErr } = await admin.from("linkedin_posts").insert({
        user_id: userId,
        post_text: postText,
        title: o.title,
        hook: hookLine && !lineFault(hookLine, lang) ? hookLine : null,
        format_type: "post",
        tracking_status: "draft",
        source_type: "opportunity_move",
        authorship: "aura_drafted",
        made_by: "aura",
        arrived_by: "generated_in_place",
        confidence: "reported",
        produced_by: "oe-prepare-move",
        prompt_version: POST_VERSION,
        model_used: MODEL,
        ...generationMetadata(postText, { contentType: "linkedin_post", signalId: null, unsourcedRemoved: counts.numbers_dropped }),
        source_metadata: {
          opportunity_id: o.id,
          language: lang,
          _language: lang,
          why_now: whyNow || null,
          cited_evidence: cited,
        },
      }).select("id").maybeSingle();
      if (postErr) throw new Error(`draft insert: ${postErr.message}`);
      postId = post?.id ?? null;

      if (postId) {
        await writeLineage(admin, "linkedin_posts", postId, [
          ...cited.map((c: any) => ({
            kind: (c.kind === "post" ? "capture" : c.kind === "entry" ? "capture" : "evidence_fragment") as any,
            id: c.id, role: "evidence" as const, note: c.quote,
          })),
          { kind: "voice_profile" as const, id: null, role: "voice" as const, note: `prompt ${PROMPT_VERSION}` },
        ]);
      }

      content = {
        post_text: postText,
        why_now: whyNow || null,
        hook: hookLine && !lineFault(hookLine, lang) ? hookLine : null,
        cited_evidence: cited,
        language: lang,
      };
    }

    const { data: move } = await admin.from("oe_moves").insert({
      user_id: userId, opportunity_id: o.id,
      lane: match?.lane ?? (laneA ? "lane_open" : "lane_forming"),
      kind, content, status: "draft", linkedin_post_id: postId,
    }).select("id").maybeSingle();

    if (postId && move?.id) {
      await admin.from("linkedin_posts")
        .update({ source_metadata: { opportunity_id: o.id, move_id: move.id, language: lang, _language: lang, why_now: (content as any).why_now ?? null, cited_evidence: (content as any).cited_evidence ?? [] } })
        .eq("id", postId);
    }

    await admin.from("oe_runs").insert({
      run_kind: "prepare_move", user_id: userId, started_at: startedAt,
      finished_at: new Date().toISOString(), outcome: "ok",
      counts: { ...counts, kind, lane: laneA ? "lane_open" : "lane_forming" },
      cost_usd: +costUsd.toFixed(6),
    });

    return json({
      ok: true, move_id: move?.id ?? null, kind, content,
      linkedin_post_id: postId, register: { rejected, counts },
    });
  } catch (e) {
    const msg = String((e as Error).message ?? e).slice(0, 500);
    await admin.from("oe_runs").insert({
      run_kind: "prepare_move", user_id: userId, started_at: startedAt,
      finished_at: new Date().toISOString(), outcome: "error", counts,
      cost_usd: +costUsd.toFixed(6), error: msg,
    });
    await logEfError(admin, { function_name: FN, error: e, severity: "high", context: { user_id: userId, opportunity_id: opportunityId } });
    return json({ ok: false, error: msg }, 500);
  }
});
