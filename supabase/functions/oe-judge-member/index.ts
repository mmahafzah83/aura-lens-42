/**
 * oe-judge-member — decides, for one member, whether any live opportunity is
 * worth his morning. Hard filters first (no model sees a record it should never
 * have seen), then hybrid retrieval per face, then one model call per item,
 * twice, so an unstable judgement can be seen and withheld. What survives the
 * gate becomes at most params.cards_per_day cards. A quiet day is stated, not
 * filled: the gate is never lowered to produce a card.
 *
 * The job row itself is completed by oe-worker, which invoked this function.
 */
import { checkSpendCap } from "../_shared/spendCap.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { logAIUsage } from "../_shared/logAIUsage.ts";
import { logEfError } from "../_shared/observe.ts";
import { loadVocab } from "../_shared/oeVocab.ts";
import { OE_REGISTER_FOR_PROMPT, registerFault } from "../_shared/oeRegister.ts";
import { laneFor, levelOf, screen, type Eligibility } from "../_shared/oeEligibility.ts";
import { loadLocationSensitivity, sensitivityOf } from "../_shared/oeKinds.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const FN = "oe-judge-member";
const MODEL = "google/gemini-3-flash-preview";
const EMBED_MODEL = "text-embedding-3-small";
const P3_VERSION = "p3-1.0";
const P4_VERSION = "p4-2.1";
const P5_VERSION = "p5-1.0";
const QUESTIONS = ["role_fit", "sector_fit", "seniority_fit", "timing", "strategic_value"] as const;
const RETRIEVAL_FACES = ["done", "wants", "reads", "stands"] as const;
const BANDS = { work: 0, table: 1, room: 2 } as const;
/**
 * One gateway call per item per pass. The worker aborts at 110 seconds, so the
 * judged set is capped; the shortlist is still built at params.shortlist_k and
 * the best of it is what gets judged.
 */
const DEFAULT_JUDGE_MAX = 12;

const P3_SYSTEM =
  `You judge whether one opportunity fits one senior professional. You receive the five faces (pseudonymised), ` +
  `up to 8 of his past judgements (title → that's right / not quite / not my area), and one opportunity record. ` +
  `Return strict JSON {role_fit:0-4, sector_fit:0-4, seniority_fit:0-4, timing:0-4, strategic_value:0-4, ` +
  `justification:{role_fit,sector_fit,seniority_fit,timing,strategic_value} (each <= 20 words), ` +
  `eligibility_met:true|false|null, gap:'one sentence naming the single most important thing he lacks for this, or empty', ` +
  `cites:[{kind:'face'|'requirement', id}]}. ` +
  `Anchors: 0 = not at all; 2 = half; 4 = fully. Timing: 0 if deadline under 3 days or signal vague; ` +
  `2 if under two weeks or signal within two quarters; 4 if workable window or signal within one quarter. ` +
  `Strategic value is measured against the wants face.`;

/**
 * The checklist, with a denominator. A requirement is met only when one of his
 * own items shows it, and the quote is verified in code before it is stored.
 */
const P5_SYSTEM =
  `You check one record's stated requirements against this professional's own material. ` +
  `Return strict JSON {checks:[{id, met:true|false, cite:{kind,id}|null, quote:string}]} — one entry per requirement id, ` +
  `in the order given. A requirement is met ONLY when one supplied item shows it. ` +
  `quote must be between 3 and 15 words copied verbatim from the cited item; when nothing shows it, ` +
  `met=false, cite=null, quote="". Write no other text and no label words.`;

function p4System(lang: string) {
  return `Write for this professional, in ${lang === "ar" ? "Arabic" : "English"}, in the second person, plain words, ` +
    `no percentages, no label words — you write sentences only. ${OE_REGISTER_FOR_PROMPT} ` +
    `Return strict JSON {why:[{text, cites:[{kind, id}]},{text, cites:[{kind, id}]}], clock:text}. ` +
    `Each text <= 45 words. HIS OWN MATERIAL is the only ground for a why line: every why line must cite one item ` +
    `from HIS OWN MATERIAL by its kind and id, and must quote at most 15 words copied verbatim from that item inside ` +
    `the line. A line that cites nothing, or quotes nothing from what it cites, is dropped. ` +
    `clock: 'closes in N days' / 'no date given' / 'early signal, likely within a quarter' in the member's language.`;
}

const P6_VERSION = "p6-1.0";

/**
 * The writing lane. Not a chair he can take — material he can write from.
 * No score, no clock, no band: four plain parts, the third of which must
 * stand on his own material.
 */
function p6System(lang: string) {
  return `Write for this professional, in ${lang === "ar" ? "Arabic" : "English"}, in the second person, plain words, ` +
    `no percentages, no label words, no score words. ${OE_REGISTER_FOR_PROMPT} ` +
    `Return strict JSON {what_happened, why_it_matters, what_you_know:{text, cites:[{kind,id}]}, open_with}. ` +
    `Each field <= 40 words. what_you_know must cite one item from HIS OWN MATERIAL by kind and id and quote ` +
    `between 3 and 15 words copied verbatim from that item. open_with is one question he could open a post with.`;
}



function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normaliseJson(text: string): any {
  let t = (text || "").trim();
  if (t.startsWith("```")) t = t.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  let parsed: any;
  try { parsed = JSON.parse(t); } catch {
    const s = t.indexOf("{"), e = t.lastIndexOf("}");
    if (s >= 0 && e > s) parsed = JSON.parse(t.slice(s, e + 1));
    else throw new Error("unparseable model output");
  }
  if (Array.isArray(parsed)) parsed = parsed[0];
  if (!parsed || typeof parsed !== "object") throw new Error("model output is not an object");
  return parsed;
}

const clamp04 = (v: unknown) => Math.max(0, Math.min(4, Number(v ?? 0) || 0));

function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length && i < b.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}

function asVector(v: unknown): number[] | null {
  if (Array.isArray(v)) return v as number[];
  if (typeof v === "string") { try { const p = JSON.parse(v); return Array.isArray(p) ? p : null; } catch { return null; } }
  return null;
}

function localToday(tz: string | null | undefined): string {
  const zone = tz && String(tz).trim() ? String(tz).trim() : "Asia/Riyadh";
  const fmt = (z: string) => new Intl.DateTimeFormat("en-CA", {
    timeZone: z, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
  try { return fmt(zone); } catch { return fmt("Asia/Riyadh"); }
}

async function gateway(key: string, system: string, user: string) {
  const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL, temperature: 0.1, response_format: { type: "json_object" },
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
    }),
    signal: AbortSignal.timeout(45_000),
  });
  if (!r.ok) throw new Error(`gateway ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const data = await r.json();
  return { content: data?.choices?.[0]?.message?.content || "", usage: data?.usage || {} };
}

async function embed(key: string, input: string): Promise<number[] | null> {
  const r = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: EMBED_MODEL, input }),
  });
  if (!r.ok) return null;
  const j = await r.json();
  return j?.data?.[0]?.embedding ?? null;
}

function shuffled<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

const BANNED = /\bthought leader|personal brand|trajectory|leverage\b/i;
const wordsOf = (s: string) => String(s ?? "").toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean);

/** Longest run of consecutive words the line copied out of the item. */
function quotedRun(line: string, item: string): number {
  const L = wordsOf(line), I = wordsOf(item).slice(0, 400);
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
const hasPercent = (s: string) => /%|\bper ?cent|في المائة|بالمئة/i.test(s);

/** His own eight closest items. The only ground a card is ever allowed to stand on. */
async function memberEvidence(admin: SupabaseClient, userId: string, oppVec: number[] | null) {
  if (!oppVec) return [] as any[];
  const { data, error } = await admin.rpc("oe_member_evidence", {
    p_user_id: userId, p_embedding: `[${oppVec.join(",")}]`, p_k: 8,
  });
  if (error) throw new Error(`oe_member_evidence: ${error.message}`);
  return (data ?? []).filter((r: any) => String(r.body ?? "").trim().length > 40);
}

/** Every name the issuer answers to, for the text side of warmth. */
async function issuerNames(admin: SupabaseClient, o: any): Promise<string[]> {
  const names = new Set<string>();
  if (o.issuer_raw) names.add(String(o.issuer_raw));
  if (o.issuer_id) {
    const { data } = await admin.from("oe_issuers")
      .select("canonical_name, name_en, name_ar, aliases").eq("id", o.issuer_id).maybeSingle();
    for (const n of [data?.canonical_name, data?.name_en, data?.name_ar, ...((data?.aliases ?? []) as string[])]) {
      if (n) names.add(String(n));
    }
  }
  return [...names].map((s) => s.trim()).filter((s) => s.length >= 4);
}

/**
 * WARMTH — whether anything of his already touches this chair. Read only from
 * what we hold: his published posts, his captures, his fragments, the issuer's
 * name in his own text. It never moves the score, the band or the gate; it is
 * shown beside them and breaks a tie in ordering, nothing more.
 */
async function computeWarmth(
  admin: SupabaseClient, userId: string, o: any, oppVec: number[] | null,
): Promise<{ total: number; kinds: string[] }> {
  if (!oppVec) return { total: 0, kinds: [] };
  const names = await issuerNames(admin, o);
  const vec = `[${oppVec.join(",")}]`;
  // Three reads, because each one ranks and caps on its own terms.
  const [posts, caps, issuerText] = await Promise.all([
    admin.rpc("oe_warmth_signals", { p_user_id: userId, p_embedding: vec, p_issuer_names: names }),
    admin.rpc("oe_warmth_signals_captures", { p_user_id: userId, p_embedding: vec }),
    admin.rpc("oe_warmth_issuer_text", { p_user_id: userId, p_issuer_names: names }),
  ]);
  for (const r of [posts, caps, issuerText]) {
    if (r.error) throw new Error(`warmth: ${r.error.message}`);
  }
  const rows = [
    ...((posts.data ?? []) as any[]),
    ...((caps.data ?? []) as any[]),
    ...((issuerText.data ?? []) as any[]),
  ];

  const byKind = new Map<string, any[]>();
  for (const r of rows) {
    const k = String(r.kind);
    if (!byKind.has(k)) byKind.set(k, []);
    byKind.get(k)!.push(r);
  }

  const written: Array<{ kind: string; detail: any; strength: number }> = [];
  const dates = (rs: any[]) => rs.map((r) => String(r.occurred_at ?? "").slice(0, 10)).filter(Boolean).sort();

  const wrote = byKind.get("wrote_about_it") ?? [];
  if (wrote.length) {
    const d = dates(wrote);
    written.push({
      kind: "wrote_about_it",
      detail: {
        post_ids: [...new Set(wrote.map((r) => r.id))], count: wrote.length,
        latest_date: d[d.length - 1] ?? null,
        top_engagement: Math.max(...wrote.map((r) => Number(r.engagement ?? 0))),
      },
      strength: +Math.max(...wrote.map((r) => Number(r.similarity ?? 0))).toFixed(4),
    });
  }

  const captured = byKind.get("captured_it") ?? [];
  if (captured.length) {
    const d = dates(captured);
    written.push({
      kind: "captured_it",
      detail: {
        ids: [...new Set(captured.map((r) => r.id))], count: captured.length,
        latest_date: d[d.length - 1] ?? null,
      },
      strength: +Math.max(...captured.map((r) => Number(r.similarity ?? 0))).toFixed(4),
    });
  }

  const worked = byKind.get("worked_with_issuer") ?? [];
  if (worked.length) {
    const d = dates(worked);
    written.push({
      kind: "worked_with_issuer",
      detail: {
        where: [...new Set(worked.map((r) => String(r.item_kind)))],
        ids: [...new Set(worked.map((r) => r.id))],
        first_seen: d[0] ?? null,
        names_matched: names,
      },
      strength: +Math.min(1, 0.5 + 0.1 * worked.length).toFixed(4),
    });
  }

  const nowIso = new Date().toISOString();
  if (!written.length) written.push({ kind: "none", detail: {}, strength: 0 });

  await admin.from("oe_warmth").upsert(
    written.map((w) => ({
      user_id: userId, opportunity_id: o.id, kind: w.kind,
      detail: w.detail, strength: w.strength, computed_at: nowIso,
    })),
    { onConflict: "user_id,opportunity_id,kind" },
  );
  // A kind that no longer holds must not linger as yesterday's claim.
  const keep = written.map((w) => w.kind);
  await admin.from("oe_warmth").delete()
    .eq("user_id", userId).eq("opportunity_id", o.id).not("kind", "in", `(${keep.join(",")})`);

  return {
    total: +written.reduce((s, w) => s + w.strength, 0).toFixed(4),
    kinds: written.filter((w) => w.kind !== "none").map((w) => w.kind),
  };
}

/**
 * THE CHECKLIST with a denominator. Every requirement the record states,
 * against his own material, with the quote verified in code — a quote the
 * model did not copy out of his item is not evidence, so the line is unmet.
 */
async function requirementCheck(
  admin: SupabaseClient, lovableKey: string, userId: string, fnName: string,
  o: any, mine: any[],
): Promise<{ list: any[]; met: number; total: number }> {
  const reqs = (Array.isArray(o.requirements) ? o.requirements : [])
    .map((r: any) => (typeof r === "string" ? r : String(r?.text ?? ""))).filter(Boolean);
  if (!reqs.length) return { list: [], met: 0, total: 0 };

  const base = reqs.map((text: string) => ({ requirement: text, met: false, cite: null as any, quote: "" }));
  if (!mine.length || !lovableKey) return { list: base, met: 0, total: reqs.length };

  const allowed = new Map<string, any>(mine.map((r: any) => [String(r.id), r]));
  const userMsg = [
    `HIS OWN MATERIAL:\n${mine.map((r: any, i: number) =>
      `${i + 1}. kind=${r.kind} id=${r.id} date=${String(r.occurred_at ?? "").slice(0, 10)}\n"${String(r.body ?? "").replace(/\s+/g, " ").slice(0, 1200)}"`,
    ).join("\n\n")}`,
    `REQUIREMENTS:\n${JSON.stringify(reqs.map((text: string, i: number) => ({ id: `req:${i}`, text })))}`,
    `ALLOWED CITE IDS: ${[...allowed.keys()].join(", ")}`,
  ].join("\n\n");

  let parsed: any;
  try {
    const out = await gateway(lovableKey, P5_SYSTEM, userMsg);
    await logAIUsage({
      user_id: userId, function_name: fnName, provider: "lovable", model: MODEL,
      input_tokens: out.usage?.prompt_tokens ?? 0, output_tokens: out.usage?.completion_tokens ?? 0,
      metadata: { prompt_version: P5_VERSION, opportunity_id: o.id },
    });
    parsed = normaliseJson(out.content);
  } catch (_e) {
    return { list: base, met: 0, total: reqs.length };
  }

  const checks = Array.isArray(parsed?.checks) ? parsed.checks : [];
  const list = base.map((row, i) => {
    const c = checks.find((x: any) => String(x?.id ?? "") === `req:${i}`) ?? checks[i];
    const citeId = String(c?.cite?.id ?? "");
    const item = allowed.get(citeId);
    const quote = String(c?.quote ?? "").trim();
    const words = wordsOf(quote).length;
    const verified = !!item && words >= 3 && words <= 15 &&
      quotedRun(quote, `${item?.title ?? ""} ${item?.body ?? ""}`) >= Math.min(3, words);
    return verified && c?.met === true
      ? { requirement: row.requirement, met: true, cite: { kind: String(item.kind), id: citeId }, quote }
      : row;
  });
  return { list, met: list.filter((r) => r.met).length, total: reqs.length };
}

/**
 * One card per member per local day. A day that already holds an unsent card is
 * rewritten in place; a card already sent is never overwritten.
 *
 * BOOK TWO. Every card written here also writes its serve row, carrying the
 * reason it appeared. A card with no `why` is a bug: the member must always be
 * able to ask why he saw it and get a true answer.
 */
async function writeCard(
  admin: SupabaseClient,
  userId: string,
  cardDate: string,
  fields: Record<string, unknown>,
  why: Record<string, unknown> = {},
): Promise<string | null> {
  let cardId: string | null = null;
  const { data: existing } = await admin
    .from("oe_cards").select("id")
    .eq("user_id", userId).eq("card_date", cardDate).is("sent_at", null)
    .maybeSingle();
  if (existing?.id) {
    const { data } = await admin.from("oe_cards")
      .update(fields).eq("id", existing.id).select("id").maybeSingle();
    cardId = data?.id ?? existing.id;
  } else {
    const { data } = await admin.from("oe_cards")
      .insert({ user_id: userId, card_date: cardDate, ...fields })
      .select("id").maybeSingle();
    cardId = data?.id ?? null;
  }
  if (cardId) {
    await admin.from("oe_serves").upsert({
      user_id: userId,
      card_id: cardId,
      opportunity_id: (fields.opportunity_id as string | null) ?? null,
      channel: "email",
      lane: (fields.lane as string | null) ?? null,
      why,
    }, { onConflict: "card_id" });
  }
  return cardId;
}



Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const CRON_SECRET = Deno.env.get("cron_secret") || Deno.env.get("CRON_SECRET") || "";
  const cronHeader = req.headers.get("x-cron-secret") || "";
  const bearer = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!((!!CRON_SECRET && cronHeader === CRON_SECRET) || bearer === SERVICE_ROLE)) {
    return json({ error: "Forbidden" }, 403);
  }

  const admin: SupabaseClient = createClient(SUPABASE_URL, SERVICE_ROLE);
  // THE CEILING. Cost is acceptable; an unbounded loop is not.
  const cap = await checkSpendCap(admin, "oe-judge-member");
  if (!cap.allowed) {
    return new Response(JSON.stringify({ ok: false, reason: "daily_call_cap", used: cap.used, cap: cap.cap }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const lovableKey = Deno.env.get("LOVABLE_API_KEY") || "";
  const openaiKey = Deno.env.get("OPENAI_API_KEY") || "";

  const body = await req.json().catch(() => ({} as any));
  const userId = (body.user_id ?? null) as string | null;
  const jobId = (body.job_id ?? null) as string | null;
  const requestedOpportunityIds = Array.isArray(body.opportunity_ids)
    ? body.opportunity_ids.map(String).filter(Boolean)
    : [];
  if (!userId) return json({ error: "user_id required" }, 400);

  const startedAt = new Date().toISOString();
  const counts = {
    alive: 0, retrieved: 0, outside_retrieval: 0, filtered: 0, shortlisted: 0, judged: 0, gate_passed: 0,
    unstable: 0, carded: 0, empty_day: 0, lane_forming: 0, unexamined: 0,
    no_evidence: 0, no_citation: 0, warmth_rows: 0, requirement_checked: 0,
    skipped_ineligible: 0, lane_act: 0, lane_write: 0, write_carded: 0, rescreened: 0,
  };

  let costUsd = 0;

  try {
    // ── policy ────────────────────────────────────────────────────────────
    const { data: policy } = await admin
      .from("oe_policy_versions").select("version, params, rubric").eq("active", true).maybeSingle();
    const params = (policy?.params ?? {}) as Record<string, any>;
    const rubric = (policy?.rubric ?? {}) as Record<string, any>;
    const rubricVersion = String(rubric.version ?? policy?.version ?? "1.0");
    const weights: Record<string, number> = rubric.weights ?? {
      role_fit: 0.3, sector_fit: 0.2, seniority_fit: 0.15, timing: 0.15, strategic_value: 0.2,
    };
    const shortlistK = Number(params.shortlist_k ?? 50);
    const judgePasses = Math.max(1, Number(params.judge_passes ?? 2));
    const judgeMax = Number(params.judge_max ?? DEFAULT_JUDGE_MAX);
    const gateMin = Number(params.gate_min_avg ?? 3);
    const gateNoZero = params.gate_no_zero !== false;
    const bands = params.bands ?? { strong: 3.4, worth_a_look: 3 };
    const cardsPerDay = Math.max(1, Number(params.cards_per_day ?? 1));
    const exploreShare = Number(params.explore_share ?? 0);
    const fewShotK = Number(params.few_shot_k ?? 8);
    const alarmRun = Number(params.empty_day_alarm_run ?? 3);

    // ── the member ────────────────────────────────────────────────────────
    const { data: faces } = await admin
      .from("oe_faces").select("id, face, summary, keywords, weight, embedding").eq("user_id", userId);
    const faceList = faces ?? [];
    if (faceList.length < 5) throw new Error("faces incomplete");
    const faceById = new Map(faceList.map((f: any) => [f.id, f]));
    const faceByName = new Map(faceList.map((f: any) => [f.face, f]));
    const avoidVec = asVector(faceByName.get("avoid")?.embedding);

    const { data: profile } = await admin
      .from("diagnostic_profiles")
      .select("seniority_band, sector_focus, country, content_language, timezone, years_experience, core_practice")
      .eq("user_id", userId).maybeSingle();
    const memberSector = profile?.sector_focus ?? null;
    const lang = (profile?.content_language === "ar" ? "ar" : "en") as "ar" | "en";
    const cardDate = localToday(profile?.timezone);

    // What he can actually hold. His own row, in his own words.
    const { data: eligRow } = await admin
      .from("oe_eligibility").select("*").eq("user_id", userId).maybeSingle();
    const eligibility = (eligRow ?? null) as Eligibility | null;

    // What he can SHOW. A stated requirement is tested against this, never
    // against a band he once mentioned in passing.
    const yearsText = String((profile as any)?.years_experience ?? "");
    const yearsMatch = /(\d{1,2})/.exec(yearsText);
    const evidence = {
      years_experience: yearsMatch ? Number(yearsMatch[1]) : null,
      practice: (profile as any)?.core_practice ?? null,
      sectors: eligibility?.sectors_core ?? null,
    };




    // Past judgements, in his words.
    const { data: labelled } = await admin
      .from("oe_taps")
      .select("tap, scope, tapped_at, oe_cards!inner(opportunity_id, oe_opportunities(title))")
      .eq("user_id", userId)
      .order("tapped_at", { ascending: false })
      .limit(fewShotK);
    const fewShots = (labelled ?? []).map((t: any) => ({
      title: t?.oe_cards?.oe_opportunities?.title ?? "",
      tap: t.tap, scope: t.scope ?? null,
    })).filter((t: any) => t.title);

    // ── 1+2. SHORTLIST, then the hard filters, before any model ───────────
    const merged = new Map<string, { score: number; retrieval: Record<string, any> }>();
    for (const faceName of RETRIEVAL_FACES) {
      const face = faceByName.get(faceName);
      if (!face) continue;
      if (!asVector(face.embedding) && openaiKey && face.summary) {
        const v = await embed(openaiKey, `${face.summary}\n${(face.keywords ?? []).join(", ")}`);
        if (v) {
          await admin.from("oe_faces").update({ embedding: `[${v.join(",")}]` }).eq("id", face.id);
          face.embedding = v;
        }
      }
      const { data: rows, error } = await admin.rpc("oe_candidates", {
        p_user_id: userId, p_face: faceName, p_k: shortlistK,
      });
      if (error) throw new Error(`oe_candidates(${faceName}): ${error.message}`);
      const w = Number(face.weight ?? params.face_weights_default?.[faceName] ?? 0.2);
      for (const r of rows ?? []) {
        const prev = merged.get(r.opportunity_id) ?? { score: 0, retrieval: {} };
        prev.score += w * Number(r.rrf_score ?? 0);
        prev.retrieval[faceName] = { rrf: Number(r.rrf_score ?? 0), fts_rank: r.fts_rank, vec_rank: r.vec_rank };
        merged.set(r.opportunity_id, prev);
      }
    }

    // Coverage and ranking are separate. Retrieval decides review order; it
    // must never decide whether a live record exists for this member. Every
    // live record is screened and receives a match row. Eligibility, route,
    // gate and taste then decide whether it can be served.
    const kindSensitivity = await loadLocationSensitivity(admin);
    const { data: opps, error: oppsError } = await admin
      .from("oe_opportunities")
      .select("id, kind, title, scope, sector, chair_type, time_kind, seniority_band, level_band, location, remote, requirements, deadline, signal_date, evidence_quote, quote_verified, source_url, route_url, route_kind, route_dead, issuer_id, issuer_raw, language, embedding, issuer:oe_issuers(domain)")
      .eq("alive", true);
    if (oppsError) throw new Error(`alive opportunities: ${oppsError.message}`);
    const requestedSet = new Set(requestedOpportunityIds);
    const pool = requestedSet.size
      ? (opps ?? []).filter((o: any) => requestedSet.has(String(o.id)))
      : (opps ?? []);
    const filtered = pool;
    counts.alive = pool.length;
    counts.retrieved = pool.filter((o: any) => merged.has(String(o.id))).length;
    counts.outside_retrieval = pool.length - counts.retrieved;
    counts.filtered = 0;

    // ── THE ELIGIBILITY GATE — free, deterministic, and before the model ──
    // Every live record receives an access outcome before review. Excluded
    // records remain visible in coverage but cannot enter the act lane.
    //
    // REACHABLE IS NOT THE ACT LANE. Reachable says only two things: he can
    // hold it, and there is a live door. The act lane is the INTERSECTION of
    // that with a passed gate, and the gate is not known until the judge has
    // run. So a record enters as 'write' and is promoted only when it earns
    // it. A database constraint refuses any other combination.
    const { data: priorMatches } = await admin.from("oe_matches")
      .select("opportunity_id, gate_passed, lane")
      .eq("user_id", userId);
    const priorGate = new Map(
      (priorMatches ?? []).map((m: any) =>
        [String(m.opportunity_id), m.gate_passed === true && m.lane === "lane_open"]),
    );

    const actPool: any[] = [];
    const writePool: any[] = [];
    for (const o of filtered) {
      const level = levelOf(o);
      const withLevel = {
        ...o, level_band: level,
        location_sensitivity: sensitivityOf(kindSensitivity, (o as any).kind),
      };
      const s = screen(withLevel, eligibility, evidence);
      const issuerDomain = (o as any).issuer?.domain ?? null;
      const reachable = laneFor(withLevel, s, issuerDomain) === "act";
      if (!s.pass) counts.skipped_ineligible++;
      (reachable ? actPool : writePool).push({ ...withLevel, _screen: s, _reachable: reachable });
      // level_band is a property of the record itself and stays on the shared row.
      await admin.from("oe_opportunities")
        .update({ level_band: level })
        .eq("id", o.id);
      // The lane verdict is PER MEMBER — it belongs on this member's match row.
      const laneFinal = reachable && priorGate.get(String(o.id)) === true ? "act" : "write";
      const { error: laneErr } = await admin.from("oe_matches").upsert({
        user_id: userId, opportunity_id: o.id, rubric_version: rubricVersion,
        lane_final: laneFinal, eligibility_fail: s.fails,
        eligibility_outcome: s.outcome, eligibility_unknowns: s.unknowns,
        eligibility_conditions: s.conditions,
      }, { onConflict: "user_id,opportunity_id,rubric_version" });

      if (laneErr) {
        await logEfError(admin, {
          function_name: FN, error: new Error(`lane upsert failed: ${laneErr.message}`),
          severity: "error", context: { opportunity_id: o.id, user_id: userId },
        });
      }
    }
    counts.lane_act = actPool.length;
    counts.lane_write = writePool.length;

    // ── THE STALE SWEEP ───────────────────────────────────────────────────
    // A judged match carrying no access verdict predates the profile-versus-
    // requirement test. Screening costs nothing, so no such row is left to
    // sit: it is re-screened here even when retrieval, a taste correction or
    // an existing card kept it out of today's pool. Every judged match must
    // land on excluded, unknown or eligible.
    const { data: unscreened } = await admin.from("oe_matches")
      .select("opportunity_id, rubric_version, gate_passed, lane")
      .eq("user_id", userId).is("eligibility_outcome", null);
    const inPool = new Set(filtered.map((o: any) => String(o.id)));
    const stale = (unscreened ?? []).filter((m: any) => !inPool.has(String(m.opportunity_id)));
    if (stale.length) {
      const { data: staleOpps } = await admin.from("oe_opportunities")
        .select("id, kind, title, scope, sector, chair_type, seniority_band, level_band, location, remote, requirements, route_url, route_kind, route_dead, issuer_id, issuer:oe_issuers(domain)")
        .in("id", stale.map((m: any) => m.opportunity_id));
      for (const row of stale) {
        const o = (staleOpps ?? []).find((x: any) => String(x.id) === String(row.opportunity_id));
        if (!o) continue;
        const withLevel = {
          ...o, level_band: levelOf(o),
          location_sensitivity: sensitivityOf(kindSensitivity, (o as any).kind),
        };
        const s = screen(withLevel, eligibility, evidence);
        const reachable = laneFor(withLevel, s, (o as any).issuer?.domain ?? null) === "act";
        await admin.from("oe_matches").update({
          eligibility_outcome: s.outcome, eligibility_fail: s.fails, eligibility_unknowns: s.unknowns,
          eligibility_conditions: s.conditions,
          lane_final: reachable && row.gate_passed === true && row.lane === "lane_open" ? "act" : "write",
        }).eq("user_id", userId).eq("opportunity_id", row.opportunity_id)
          .eq("rubric_version", row.rubric_version);
        counts.rescreened++;
      }
    }

    // Both lanes are read. A writing-lane record still needs citations before
    // it can be shown with a grounded reason, and it only gets them here.
    // A run that times out must resume, not restart: anything already judged
    // with citations in the last day is left alone.
    const { data: freshJudged } = await admin.from("oe_matches")
      .select("opportunity_id,scores,judged_at")
      .eq("user_id", userId)
      .gte("judged_at", new Date(Date.now() - 86_400_000).toISOString());
    const alreadyJudged = new Set(
      (freshJudged ?? [])
        .filter((m: any) => Array.isArray(m.scores?.cites) && m.scores.cites.length > 0)
        .map((m: any) => String(m.opportunity_id)),
    );

    // Retrieval orders review; it must never erase a live record from coverage.
    const scored = [...actPool, ...writePool]
      .filter((o) => !alreadyJudged.has(String(o.id)))
      .map((o) => {
        const m = merged.get(o.id) ?? { score: 0, retrieval: { coverage: "outside_retrieval_top_k" } };
        const vec = asVector(o.embedding);
        const penalty = avoidVec && vec ? cosine(vec, avoidVec) * 0.5 : 0;
        return { o, score: m.score - penalty, retrieval: { ...m.retrieval, avoid_penalty: +penalty.toFixed(4) } };
      }).sort((a, b) => b.score - a.score);
    // Retrieval runs BEFORE the model: the eligible pool is ordered, then cut
    // to the shortlist from params. The cut is a cost control, never a silent
    // one — a shortlist smaller than the eligible pool is logged and counted.
    const eligiblePool = scored.length;
    const modelCap = Math.min(shortlistK, judgeMax);
    const shortlist = scored.slice(0, modelCap);
    counts.eligible_pool = eligiblePool;
    counts.shortlisted = shortlist.length;
    counts.starved = Math.max(0, eligiblePool - shortlist.length);
    if (counts.starved > 0) {
      await admin.from("ef_error_log").insert({
        function_name: FN, user_id: userId, severity: "warn",
        error_message: "Retrieval shortlist is smaller than the eligible pool; the remainder was not reviewed by the model this cycle",
        context: { eligible_pool: eligiblePool, shortlist: shortlist.length, shortlist_k: shortlistK, judge_max: judgeMax },
      });
    }

    // ── 3. JUDGE ──────────────────────────────────────────────────────────
    if (!lovableKey && shortlist.length) throw new Error("LOVABLE_API_KEY not configured");
    const judged: Array<any> = [];

    for (const cand of shortlist) {
      const o = cand.o;
      const reqs = Array.isArray(o.requirements) ? o.requirements : [];
      const requirementIds = reqs.map((_: any, i: number) => `req:${i}`);
      const oppBlock = JSON.stringify({
        title: o.title, scope: o.scope, sector: o.sector, chair_type: o.chair_type,
        time_kind: o.time_kind, seniority_band: o.seniority_band, location: o.location,
        remote: o.remote, deadline: o.deadline, signal_date: o.signal_date,
        issuer: o.issuer_raw, evidence_quote: o.evidence_quote,
        requirements: reqs.map((r: any, i: number) => ({ id: `req:${i}`, text: r?.text ?? "" })),
      });

      const passes: any[] = [];
      for (let p = 0; p < judgePasses; p++) {
        const faceBlock = JSON.stringify(shuffled(faceList).map((f: any) => ({
          id: f.id, face: f.face, summary: f.summary, keywords: f.keywords,
        })));
        const user = [
          `FACES:\n${faceBlock}`,
          `PAST JUDGEMENTS:\n${JSON.stringify(fewShots)}`,
          `OPPORTUNITY:\n${oppBlock}`,
        ].join("\n\n");
        const out = await gateway(lovableKey, P3_SYSTEM, user);
        costUsd += 0.0006;
        await logAIUsage({
          user_id: userId, function_name: FN, provider: "lovable", model: MODEL,
          input_tokens: out.usage?.prompt_tokens ?? 0, output_tokens: out.usage?.completion_tokens ?? 0,
          metadata: { prompt_version: P3_VERSION, opportunity_id: o.id, pass: p + 1 },
        });
        passes.push(normaliseJson(out.content));
      }
      counts.judged++;

      const avg: Record<string, number> = {};
      let unstable = false;
      for (const q of QUESTIONS) {
        const vals = passes.map((p) => clamp04(p[q]));
        avg[q] = vals.reduce((a, b) => a + b, 0) / vals.length;
        if (Math.max(...vals) - Math.min(...vals) >= 2) unstable = true;
      }
      if (unstable) counts.unstable++;

      const scoreAvg = QUESTIONS.reduce((sum, q) => sum + avg[q] * Number(weights[q] ?? 0), 0);
      const noZero = !gateNoZero || QUESTIONS.every((q) => avg[q] > 0);
      const gatePassed = scoreAvg >= gateMin && noZero && !!o.quote_verified;
      if (gatePassed) counts.gate_passed++;

      const fitBand = scoreAvg >= Number(bands.strong ?? 3.4)
        ? "strong" : scoreAvg >= Number(bands.worth_a_look ?? 3) ? "worth_a_look" : "stretch";
      const last = passes[passes.length - 1];
      const eligibility = typeof last?.eligibility_met === "boolean" ? last.eligibility_met : null;
      const winBand = eligibility === true ? fitBand
        : eligibility === false ? "stretch"
        : fitBand === "strong" ? "worth_a_look" : fitBand === "worth_a_look" ? "stretch" : "stretch";

      let issuerHistory = 0;
      if (o.issuer_id) {
        const { count } = await admin.from("oe_opportunities")
          .select("id", { count: "exact", head: true }).eq("issuer_id", o.issuer_id);
        issuerHistory = count ?? 0;
      }

      // GATE 2 — a way in, or it is only forming.
      // 'not_checked' means the reader has never examined the page: never a card,
      // and never reported as "no way in".
      const examined = !!o.route_kind && o.route_kind !== "not_checked";
      const lane = examined && o.route_url && o.route_kind !== "none" ? "lane_open" : "lane_forming";
      if (!examined) counts.unexamined++;

      const gateReason = gatePassed ? null
        : !o.quote_verified ? "quote_not_verified"
        : !noZero ? "zero_question" : "below_gate";

      // WARMTH — computed for every judged record, kept out of the score.
      const oppVecJ = asVector(o.embedding);
      let warmth = { total: 0, kinds: [] as string[] };
      try {
        warmth = await computeWarmth(admin, userId, o, oppVecJ);
        if (warmth.kinds.length) counts.warmth_rows += warmth.kinds.length;
      } catch (e) {
        console.warn(`warmth failed for ${o.id}: ${(e as Error)?.message}`);
      }

      // THE CHECKLIST — his own material against what the record asks.
      const mineForReqs = await memberEvidence(admin, userId, oppVecJ);
      const check = await requirementCheck(admin, lovableKey, userId, FN, o, mineForReqs);
      if (check.total > 0) counts.requirement_checked++;
      costUsd += check.total > 0 ? 0.0004 : 0;

      const { data: match, error: matchError } = await admin.from("oe_matches").upsert({
        user_id: userId, opportunity_id: o.id, rubric_version: rubricVersion,
        retrieval: cand.retrieval,
        scores: { avg, passes, justification: last?.justification ?? null, cites: last?.cites ?? [], gap: last?.gap ?? "", prompt_version: P3_VERSION },
        score_avg: +scoreAvg.toFixed(4), unstable, fit_band: fitBand, win_band: winBand,
        win_basis: { eligibility_met: eligibility, issuer_history: issuerHistory, past_winner_similarity: null },
        lane,
        requirement_check: check.list, met_count: check.met, total_count: check.total,
        eligibility_outcome: o._screen.outcome,
        eligibility_fail: o._screen.fails,
        eligibility_unknowns: o._screen.unknowns,
        // THE INTERSECTION: he can hold it, the gate passed, the door is live.
        lane_final: o._reachable && gatePassed && lane === "lane_open" ? "act" : "write",
        gate_passed: gatePassed, gate_reason: gateReason, judged_at: new Date().toISOString(),
      }, { onConflict: "user_id,opportunity_id,rubric_version" }).select("id").maybeSingle();
      if (matchError) throw new Error(`judge match upsert failed for ${o.id}: ${matchError.message}`);

      judged.push({ o, scoreAvg, unstable, gatePassed, fitBand, winBand, lane, matchId: match?.id ?? null, requirementIds, warmth, check, mine: mineForReqs });
    }

    // ── 4. PICK — Lane A only. No way in, no card. ────────────────────────
    // Warmth never moves the score; it only breaks a tie in the ordering.
    const eligible = judged
      .filter((j) => j.o._reachable === true && j.gatePassed && !j.unstable && j.lane === "lane_open")
      .sort((a, b) => Math.abs(b.scoreAvg - a.scoreAvg) < 0.01
        ? (b.warmth?.total ?? 0) - (a.warmth?.total ?? 0)
        : b.scoreAvg - a.scoreAvg);
    counts.lane_forming = judged.filter((j) => j.lane === "lane_forming").length;
    let order = eligible.map((j) => ({ ...j, explore: false }));
    if (order.length > 1 && Math.random() < exploreShare) {
      const idx = order.findIndex((j) => j.o.sector && memberSector && j.o.sector !== memberSector);
      if (idx > 0) order = [{ ...order[idx], explore: true }, ...order.filter((_, i) => i !== idx)];
    }

    const cardsWritten: string[] = [];
    const vocab = await loadVocab(admin);

    // BOOK ONE ids, so every serve can name the rules that were in force.
    // A comment is never in force, and an unratified rule is not yet a rule.
    const { data: bookOne } = await admin.from("oe_notebook")
      .select("id").eq("user_id", userId).eq("active", true).eq("proposal_status", "signed")
      .eq("entry_kind", "rule").not("ratified_at", "is", null);
    const ruleIds = (bookOne ?? []).map((r: any) => r.id);


    // ── 5+6. HIS OWN EVIDENCE, the reasons, then the card ─────────────────
    for (const pick of order) {
      if (cardsWritten.length >= cardsPerDay) break;
      const o = pick.o;

      // GATE 1 — no card without his own material.
      const oppVec = asVector(o.embedding);
      const mine: any[] = pick.mine?.length ? pick.mine : await memberEvidence(admin, userId, oppVec);
      if (!mine.length) { counts.no_evidence++; continue; }

      const allowedIds = new Map<string, any>(mine.map((r: any) => [String(r.id), r]));
      const mineBlock = mine.map((r: any, i: number) => [
        `${i + 1}. kind=${r.kind} id=${r.id} date=${String(r.occurred_at ?? "").slice(0, 10)}`,
        `"${String(r.title ? `${r.title}. ` : "")}${String(r.body ?? "").replace(/\s+/g, " ").slice(0, 1200)}"`,
      ].join("\n")).join("\n\n");

      const oppBlock = JSON.stringify({
        title: o.title, scope: o.scope, issuer: o.issuer_raw, sector: o.sector,
        location: o.location, deadline: o.deadline, signal_date: o.signal_date,
        time_kind: o.time_kind, chair_type: o.chair_type,
        route_kind: o.route_kind,
        requirements: (Array.isArray(o.requirements) ? o.requirements : []).map((r: any, i: number) => ({ id: `req:${i}`, text: r?.text ?? "" })),
      });
      const userMsg = [
        `HIS OWN MATERIAL (cite these, quote from these):\n${mineBlock}`,
        `OPPORTUNITY:\n${oppBlock}`,
        `ALLOWED CITE IDS: ${[...allowedIds.keys()].join(", ")}`,
      ].join("\n\n");

      let why: Array<{ text: string; cites: Array<{ kind: string; id: string }> }> = [];
      let clockText = "";

      for (let attempt = 0; attempt < 2 && why.length < 1; attempt++) {
        const out = await gateway(lovableKey, p4System(lang), userMsg);
        costUsd += 0.0004;
        await logAIUsage({
          user_id: userId, function_name: FN, provider: "lovable", model: MODEL,
          input_tokens: out.usage?.prompt_tokens ?? 0, output_tokens: out.usage?.completion_tokens ?? 0,
          metadata: { prompt_version: P4_VERSION, opportunity_id: o.id },
        });
        const rec = normaliseJson(out.content);
        why = (Array.isArray(rec.why) ? rec.why : [])
          .map((w: any) => {
            const text = String(w?.text ?? "").trim();
            const cites = (Array.isArray(w?.cites) ? w.cites : [])
              .map((c: any) => ({ kind: String(c?.kind ?? ""), id: String(typeof c === "string" ? c : c?.id ?? "") }))
              .filter((c: any) => allowedIds.has(c.id));
            return { text, cites };
          })
          .filter((w: any) => {
            if (!w.text || !w.cites.length) return false;
            if (hasPercent(w.text) || BANNED.test(w.text)) return false;
            if (registerFault(w.text, lang)) return false;
            // The line must quote his own words, and no more than fifteen of them.
            return w.cites.some((c: any) => {
              const item = allowedIds.get(c.id);
              const run = quotedRun(w.text, `${item?.title ?? ""} ${item?.body ?? ""}`);
              return run >= 3 && run <= 15;
            });
          })
          .slice(0, 2);
        const clock = String(rec.clock ?? "").trim();
        clockText = clock && !registerFault(clock, lang) ? clock : "";
      }
      if (!why.length) { counts.no_citation++; continue; } // nothing of his own to stand on

      // THE DISTANCE is derived, never written freehand: it is the first thing
      // the record asks for that his own material does not show. When the
      // record asks for nothing, we say that instead of claiming completeness.
      const check = pick.check ?? { list: [], met: 0, total: 0 };
      const firstUnmet = (check.list ?? []).find((r: any) => !r.met) ?? null;
      const distanceLine = check.total === 0
        ? { text: vocab("no_requirements_published", lang), no_requirements: true }
        : firstUnmet
        ? { text: String(firstUnmet.requirement), derived_from: "requirement_check" }
        : null;

      const citedIds = [...new Set(why.flatMap((w) => w.cites.map((c) => c.id)))];
      const card = await writeCard(admin, userId, cardDate, {
        opportunity_id: o.id,
        match_id: pick.matchId,
        why_lines: why,
        gap_line: distanceLine,
        cited_ids: why.flatMap((w) => w.cites),
        lane: "act",
        quote: o.evidence_quote,
        clock_text: clockText,
        fit_band: pick.fitBand,
        win_band: pick.winBand,
        explore_slot: !!pick.explore,
        channel: "email",
      }, {
        rules: ruleIds,
        faces: (pick.faceIds ?? []),
        scores: { fit: pick.fitBand, win: pick.winBand, retrieval: merged.get(o.id)?.score ?? null },
        gate: "pass",
        lane: "act",
      });

      if (card) { cardsWritten.push(card); counts.carded++; }
      void citedIds;
    }

    // ── THE WRITING LANE ──────────────────────────────────────────────────
    // Nothing he can act on is not the same as nothing at all. If a real
    // finding sits in the writing lane, the day carries that instead — with
    // no score, no band and no clock, because none of those apply.
    if (!cardsWritten.length && writePool.length && lovableKey) {
      const ranked = writePool
        .map((o) => ({ o, score: merged.get(o.id)?.score ?? 0 }))
        .sort((a, b) => b.score - a.score);
      for (const { o } of ranked.slice(0, 3)) {
        const oppVec = asVector(o.embedding);
        const mine = await memberEvidence(admin, userId, oppVec);
        if (!mine.length) { counts.no_evidence++; continue; }
        const allowedIds = new Map<string, any>(mine.map((r: any) => [String(r.id), r]));
        const mineBlock = mine.map((r: any, i: number) =>
          `${i + 1}. kind=${r.kind} id=${r.id}\n"${String(r.title ? `${r.title}. ` : "")}${String(r.body ?? "").replace(/\s+/g, " ").slice(0, 1200)}"`
        ).join("\n\n");
        const userMsg = [
          `HIS OWN MATERIAL (cite these, quote from these):\n${mineBlock}`,
          `WHAT HAPPENED:\n${JSON.stringify({ title: o.title, scope: o.scope, issuer: o.issuer_raw, sector: o.sector, location: o.location, signal_date: o.signal_date, quote: o.evidence_quote })}`,
          `ALLOWED CITE IDS: ${[...allowedIds.keys()].join(", ")}`,
        ].join("\n\n");

        const out = await gateway(lovableKey, p6System(lang), userMsg);
        costUsd += 0.0004;
        await logAIUsage({
          user_id: userId, function_name: FN, provider: "lovable", model: MODEL,
          input_tokens: out.usage?.prompt_tokens ?? 0, output_tokens: out.usage?.completion_tokens ?? 0,
          metadata: { prompt_version: P6_VERSION, opportunity_id: o.id, lane: "write" },
        });
        const rec = normaliseJson(out.content);

        const clean = (t: unknown) => {
          const text = String(t ?? "").trim();
          if (!text || hasPercent(text) || BANNED.test(text) || registerFault(text, lang)) return "";
          return text;
        };
        const knowText = clean(rec?.what_you_know?.text);
        const knowCites = (Array.isArray(rec?.what_you_know?.cites) ? rec.what_you_know.cites : [])
          .map((c: any) => ({ kind: String(c?.kind ?? ""), id: String(typeof c === "string" ? c : c?.id ?? "") }))
          .filter((c: any) => allowedIds.has(c.id));
        const grounded = !!knowText && knowCites.some((c: any) => {
          const item = allowedIds.get(c.id);
          const run = quotedRun(knowText, `${item?.title ?? ""} ${item?.body ?? ""}`);
          return run >= 3 && run <= 15;
        });
        const happened = clean(rec?.what_happened);
        const matters = clean(rec?.why_it_matters);
        const opening = clean(rec?.open_with);
        if (!grounded || !happened) { counts.no_citation++; continue; }

        const lines = [
          { text: happened, label: vocab("what_happened", lang), cites: [] as any[] },
          ...(matters ? [{ text: matters, label: vocab("why_it_matters", lang), cites: [] as any[] }] : []),
          { text: knowText, label: vocab("what_you_know", lang), cites: knowCites },
          ...(opening ? [{ text: opening, label: vocab("open_with", lang), cites: [] as any[] }] : []),
        ];
        const card = await writeCard(admin, userId, cardDate, {
          opportunity_id: o.id, match_id: null,
          why_lines: lines, gap_line: null,
          cited_ids: knowCites,
          lane: "write",
          quote: o.evidence_quote,
          clock_text: vocab("nothing_to_act_on", lang),
          fit_band: null, win_band: null,
          channel: "email",
        }, {
          rules: ruleIds,
          faces: [],
          scores: { retrieval: merged.get(o.id)?.score ?? null },
          gate: (o as any)._screen?.pass === false ? "fail" : "pass",
          gate_fail: (o as any)._screen?.fails ?? [],
          lane: "write",
        });

        if (card) { cardsWritten.push(card); counts.write_carded++; }
        break;
      }
    }

    if (!cardsWritten.length) {
      const empty = await writeCard(admin, userId, cardDate, {
        opportunity_id: null, match_id: null, why_lines: [], gap_line: null,
        clock_text: vocab("nothing_today", lang), channel: "email",
      }, { rules: ruleIds, faces: [], scores: {}, gate: "no_candidate" });

      if (empty) cardsWritten.push(empty);
      counts.empty_day = 1;


      // Coverage alarm: several quiet days in a row is a supply problem, not a
      // reason to lower the gate.
      const { data: recent } = await admin.from("oe_cards")
        .select("opportunity_id").eq("user_id", userId)
        .order("created_at", { ascending: false }).limit(alarmRun);
      if ((recent?.length ?? 0) >= alarmRun && (recent ?? []).every((c: any) => c.opportunity_id === null)) {
        await logEfError(admin, {
          function_name: FN, severity: "high",
          error: `OE_COVERAGE user=${userId} empty_days=${alarmRun}`,
          context: { user_id: userId, empty_days: alarmRun },
        });
      }
    }

    // ── WHAT WE HELD BACK ─────────────────────────────────────────────────
    // The five best things the member did not see today, with the reason.
    // Without this we can tell whether the card was good, but never whether
    // the gate threw away the best thing in the room.
    {
      const carded = new Set(cardsWritten);
      void carded;
      const held = [...actPool, ...writePool]
        .filter((o: any) => !cardsWritten.length || o.id !== (order[0]?.o?.id ?? null))
        .map((o: any) => ({
          opportunity_id: o.id,
          score: merged.get(o.id)?.score ?? 0,
          reason: o._screen?.pass === false
            ? (o._screen?.fails ?? ["gate_fail"]).join(",")
            : "outranked",
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);
      if (held.length) {
        await admin.from("oe_suppressed").delete().eq("user_id", userId).eq("day", cardDate);
        await admin.from("oe_suppressed").insert(held.map((h, i) => ({
          user_id: userId, day: cardDate, opportunity_id: h.opportunity_id,
          reason: h.reason, rank: i + 1,
        })));
      }
    }

    // ── 7. LOG ────────────────────────────────────────────────────────────

    const { error: purposeError } = await admin.rpc("oe_refresh_purpose", { p_user: userId });
    if (purposeError) throw new Error(`purpose refresh failed: ${purposeError.message}`);

    const { data: run } = await admin.from("oe_runs").insert({
      run_kind: "judge_member", user_id: userId,
      started_at: startedAt, finished_at: new Date().toISOString(),
      outcome: "ok", counts, cost_usd: +costUsd.toFixed(6),
    }).select("id").maybeSingle();

    await logEfError(admin, {
      function_name: FN, severity: "info",
      error: `OE_JUDGE_OK user=${userId} alive=${counts.alive} retrieved=${counts.retrieved} outside_retrieval=${counts.outside_retrieval} shortlisted=${counts.shortlisted} judged=${counts.judged} gate=${counts.gate_passed} unstable=${counts.unstable} carded=${counts.carded} empty=${counts.empty_day}`,
      context: { user_id: userId, job_id: jobId, counts },
    });

    return json({ ok: true, counts, cards: cardsWritten, run_id: run?.id ?? null });
  } catch (e) {
    const msg = String((e as Error).message ?? e).slice(0, 500);
    await admin.from("oe_runs").insert({
      run_kind: "judge_member", user_id: userId, started_at: startedAt,
      finished_at: new Date().toISOString(), outcome: "error", counts,
      cost_usd: +costUsd.toFixed(6), error: msg,
    });
    await logEfError(admin, { function_name: FN, error: e, severity: "high", context: { user_id: userId, job_id: jobId } });
    return json({ ok: false, error: msg, counts }, 500);
  }
});
