/**
 * oe-fetch-feed — reads one feed, turns each page or message into at most one
 * opportunity record, proves every record with a quote copied from the page,
 * resolves who is issuing it, and writes it once. Nothing is guessed: a record
 * without a verbatim quote for an open chair is dropped.
 */
import { checkSpendCap } from "../_shared/spendCap.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { logAIUsage } from "../_shared/logAIUsage.ts";
import { logEfError } from "../_shared/observe.ts";
import { isAggregator, normaliseForQuote } from "../_shared/oeGuards.ts";
import { parseLevel, levelIndex } from "../_shared/oeEligibility.ts";
import { SCOPE_EVIDENCE_INSTRUCTION, verifyScopeEvidence } from "../_shared/scopeEvidence.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const FN = "oe-fetch-feed";
const READER_VERSION = "p2-3.0";
const MODEL = "google/gemini-3-flash-preview";
const EMBED_MODEL = "text-embedding-3-small";
const FIRECRAWL_BASE = "https://api.firecrawl.dev/v2";
const MIN_CLEAN_TEXT_CHARS = 800;
const MAX_NOISE_RATIO = 0.30;
const MAX_DETAIL_PAGES = 25;
const ROUTE_KINDS = ["application", "nomination", "tender", "call_for_speakers", "registration", "contact", "none"];
const DISCOVERY_KINDS = [
  "corporate_event_inference", "term_ending", "new_entity", "departure", "arabic_only_source", "posted_opening",
];
const MAX_PAGE_CHARS = 24_000; // ≈ 6,000 tokens; head and tail kept, middle cut

// World Bank procurement notices: we want chairs a person can sit in, in the
// region this instrument serves, not construction tenders on other continents.
const WB_CONSULTING =
  /request for expression of interest|expression of interest|individual consultant|consultant|consulting|advisory|technical assistance|qcbs|cqs|\bic\b/i;
const WB_REGION = [
  "saudi", "united arab emirates", "emirates", "qatar", "kuwait", "bahrain", "oman",
  "jordan", "egypt", "morocco", "tunisia", "iraq", "lebanon", "yemen", "djibouti", "pakistan",
];
const WB_THEMES =
  /digital|transformation|governance|utilit|water|energy|public[- ]private|\bppp\b/i;

function worldBankNoticeUrl(n: Record<string, any>): string | null {
  const direct = n.url || n.noticeurl || n.notice_url || n.bid_reference_no_url;
  if (typeof direct === "string" && /^https?:/i.test(direct)) return direct;
  const id = n.id || n.notice_id || n.noticeid;
  if (id) return `https://projects.worldbank.org/en/projects-operations/procurement-detail/${id}`;
  const project = n.project_id || n.proj_id;
  if (project) return `https://projects.worldbank.org/en/projects-operations/project-detail/${project}`;
  return null;
}


const P2_SYSTEM =
  `You turn one web page or message into at most one opportunity record for senior professionals, or null. ` +
  `Return strict JSON {is_opportunity:boolean, chair_type:'board'|'mandate'|'role'|'room'|'speaking'|'media'|'advisory'|'award'|'learning'|'consultation'|null, ` +
  `time_kind:'open_now'|'early_signal'|null, title, scope (<=60 words), issuer_raw, sector, seniority_band:'work'|'table'|'room'|null, ` +
  `location, remote:boolean|null, requirements:[{text, quote}], conditions:[{text, quote}], deadline:YYYY-MM-DD|null, signal_date:YYYY-MM-DD|null, ` +
  `evidence_quote (a verbatim sentence from the page that proves chair_type and, when present, the deadline), ` +
  `route_url (the page where a person actually applies, nominates, registers, submits or writes in — null when the page has none), ` +
  `route_kind:'application'|'nomination'|'tender'|'call_for_speakers'|'registration'|'contact'|'none', ` +
  `discovery_kind:'corporate_event_inference'|'term_ending'|'new_entity'|'departure'|'arabic_only_source'|'posted_opening', ` +
  `language:'ar'|'en', extraction_confidence:0-1}. ` +
  `requirements means ONLY what is asked of a candidate, nominee, bidder or speaker: qualifications, years of experience, licences, ` +
  `documents, membership, nationality or other eligibility a PERSON can hold or fail to hold. ` +
  `Anything attached to the transaction or the institution — regulatory approvals, competition clearance, shareholder or assembly votes, ` +
  `closing conditions, governance procedure — is NOT a requirement; put it in conditions. ` +
  `If the page states nothing asked of a person, requirements is an empty array. Never move a condition into requirements to fill it. ` +
  `chair_type consultation = a named, dated government invitation for the public or for experts to comment on a draft regulation, ` +
  `strategy or standard; the route is the comment form and the deadline is the closing date for comments. ` +
  `discovery_kind: corporate_event_inference = an acquisition, restructuring or contract award implying a mandate nobody has posted; ` +
  `term_ending = a board or committee term running out; new_entity = a new authority, company or programme being formed; ` +
  `departure = a named executive leaving; arabic_only_source = the page is Arabic and the fact is not carried in English; ` +
  `posted_opening = an ordinary published call anyone can read. ` +
  `Rules: null over guess; evidence_quote must be copied verbatim; early_signal is for facts that imply a chair will open ` +
  `(listing/IPO application, new strategy or entity, director term ending or resignation, large digital contract awarded, event dates announced, executive appointment); ` +
  `open_now needs a route or a deadline; seniority_band: work = senior professional, table = director/head, room = C-suite/board. ` +
  `A calendar, directory, aggregator, newsroom index, listing page, company-governance profile page or 'about us' page is NEVER an opportunity — ` +
  `only one specific event, vacancy, notice, mandate, tender or announcement is. If the page describes many events or many roles, return is_opportunity=false. ` +
  `If the page reports an event or a call that has already taken place or already closed, is_opportunity=false — a recap is not a chair. ` +
  `route_url must be a real link found on the page; never invent one, and never use the page's own address unless that page itself takes the submission. ` +
  SCOPE_EVIDENCE_INSTRUCTION;

/** A chair whose date has passed is not a chair. */
function pastEvent(rec: Record<string, any>): boolean {
  const today = new Date().toISOString().slice(0, 10);
  if (typeof rec.deadline === "string" && /^\d{4}-\d{2}-\d{2}$/.test(rec.deadline) && rec.deadline < today) return true;
  if (!["speaking", "room", "learning"].includes(String(rec.chair_type))) return false;
  const dates = String(rec.evidence_quote ?? "").match(/\b20\d{2}-\d{2}-\d{2}\b/g) ?? [];
  return dates.some((date) => date < today);
}

function pastOpenEvent(rec: Record<string, any>): boolean {
  if (!['speaking', 'room', 'learning'].includes(String(rec.chair_type)) || rec.time_kind !== 'open_now') return false;
  const today = new Date().toISOString().slice(0, 10);
  if (typeof rec.deadline === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(rec.deadline) && rec.deadline < today) return true;
  const quote = String(rec.evidence_quote ?? '');
  const dates = quote.match(/\b20\d{2}-\d{2}-\d{2}\b/g) ?? [];
  return dates.some((date) => date < today);
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ───────── small helpers ─────────

function normaliseJson(text: string): any {
  let t = (text || "").trim();
  if (t.startsWith("```")) t = t.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  let parsed: any;
  try {
    parsed = JSON.parse(t);
  } catch {
    const s = t.indexOf("{");
    const e = t.lastIndexOf("}");
    if (s >= 0 && e > s) parsed = JSON.parse(t.slice(s, e + 1));
    else throw new Error("unparseable model output");
  }
  if (Array.isArray(parsed)) parsed = parsed[0];
  if (!parsed || typeof parsed !== "object") throw new Error("model output is not an object");
  return parsed;
}

const squash = (s: string) => (s || "").replace(/\s+/g, " ").trim();

function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

/** The text we keep is the text the quote is judged against. When the quote
 *  sits past the first slice, the window around it is kept instead. */
function keptPageText(text: string, quote: string, size = 12_000): string {
  if (text.length <= size) return text;
  const idx = quote.length > 10 ? text.indexOf(quote) : -1;
  if (idx < 0) return text.slice(0, size);
  const start = Math.max(0, idx - Math.floor(size / 2));
  return text.slice(start, start + size);
}

function canonicalise(raw: string): string {

  try {
    const u = new URL(raw);
    u.hash = "";
    const drop: string[] = [];
    u.searchParams.forEach((_v, k) => {
      if (/^utm_/i.test(k) || /^(fbclid|ref|ref_src|gclid|mc_cid|mc_eid)$/i.test(k)) drop.push(k);
    });
    for (const k of drop) u.searchParams.delete(k);
    return u.toString().replace(/\/$/, "");
  } catch {
    return raw;
  }
}

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function hostOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; }
}

function truncateMiddle(text: string, max = MAX_PAGE_CHARS): string {
  if (text.length <= max) return text;
  const head = text.slice(0, Math.floor(max * 0.6));
  const tail = text.slice(-Math.floor(max * 0.4));
  return `${head}\n\n[…middle of the page removed…]\n\n${tail}`;
}

function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length && i < b.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}

// ───────── a careers page's links, judged for free ─────────

/** The registrable part of a host: "jobs.acme.co.uk" → "acme.co.uk". */
function registrable(host: string): string {
  const parts = host.replace(/^www\./, "").split(".");
  if (parts.length <= 2) return parts.join(".");
  const twoLevel = /^(co|com|org|net|gov|edu|ac|sch|mil)\.[a-z]{2}$/i;
  const last3 = parts.slice(-3).join(".");
  if (twoLevel.test(parts.slice(-2).join("."))) return last3;
  return parts.slice(-2).join(".");
}

/** Hosts that carry a real posting for someone else's careers page. */
const ATS_HOSTS = [
  "myworkdayjobs.com", "workday.com", "greenhouse.io", "lever.co", "smartrecruiters.com",
  "successfactors.com", "sap.com", "taleo.net", "oraclecloud.com", "icims.com", "jobvite.com",
  "ashbyhq.com", "workable.com", "bamboohr.com", "recruitee.com", "teamtailor.com",
  "personio.de", "avature.net", "eightfold.ai", "phenompeople.com", "brassring.com",
];

/** A path or query that reads like one posting. */
const JOB_PATH_RE =
  /(job|jobs|career|careers|vacanc|position|opening|requisition|\breq\b|jobid|posting|وظيف|شاغر)/i;

/** Navigation, legal and social links, which are never a posting. */
const NAV_RE =
  /(about|contact|privacy|terms|cookie|login|sign-?in|register-account|faq|news|blog|linkedin\.com|twitter\.com|x\.com|facebook\.com|instagram\.com|youtube\.com)/i;

/** A link on a careers page that looks like a single job posting. */
function looksLikeJobPosting(link: string, feedHost: string): boolean {
  let u: URL;
  try { u = new URL(link); } catch { return false; }
  const host = u.hostname.replace(/^www\./, "");
  const onSite = registrable(host) === registrable(feedHost);
  const onAts = ATS_HOSTS.some((a) => host === a || host.endsWith(`.${a}`));
  if (!onSite && !onAts) return false;
  const tail = decodeURIComponent(`${u.pathname}${u.search}`);
  if (!JOB_PATH_RE.test(tail)) return false;
  if (NAV_RE.test(decodeURIComponent(link))) return false;
  return true;
}

/** The words in a link's last path segment, read as a title. */
function titleFromLink(link: string): string {
  try {
    const u = new URL(link);
    const seg = u.pathname.split("/").filter(Boolean).pop() ?? "";
    return decodeURIComponent(seg).replace(/\.(html?|aspx|php)$/i, "").replace(/[-_+]+/g, " ").trim();
  } catch { return ""; }
}

// ───────── outside calls ─────────

async function firecrawlScrape(apiKey: string, url: string, withLinks = false) {
  const res = await fetch(`${FIRECRAWL_BASE}/scrape`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      url,
      formats: withLinks ? ["markdown", "links"] : ["markdown"],
      onlyMainContent: true,
    }),
    signal: AbortSignal.timeout(30_000),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) return { ok: false as const, status: res.status, error: data?.error || "scrape failed" };
  const d = data?.data ?? data ?? {};
  return {
    ok: true as const,
    markdown: (d.markdown ?? "") as string,
    links: (d.links ?? []) as string[],
    title: (d.metadata?.title ?? "") as string,
    sourceURL: (d.metadata?.sourceURL ?? d.metadata?.url ?? url) as string,
  };
}

/**
 * Plain fetch with a browser user agent, for pages that refuse every Firecrawl
 * engine. Tags and scripts are stripped; whatever text is left is what we read.
 */
async function plainFetchText(url: string) {
  try {
    const r = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "en,ar;q=0.9",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(25_000),
    });
    if (!r.ok) return { ok: false as const, status: r.status, error: `plain fetch ${r.status}` };
    const html = await r.text();
    const title = squash(stripTags(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || ""));
    const links = [...html.matchAll(/href="([^"#]+)"/gi)]
      .map((m) => { try { return new URL(m[1], url).toString(); } catch { return ""; } })
      .filter(Boolean);
    return { ok: true as const, markdown: squash(stripTags(html)), links, title, sourceURL: url };
  } catch (e) {
    return { ok: false as const, status: 0, error: String((e as Error).message ?? e) };
  }
}

/** Firecrawl first. If every engine fails, read the page plainly. */
async function scrapePage(apiKey: string, url: string, withLinks = false) {
  if (apiKey) {
    const fc = await firecrawlScrape(apiKey, url, withLinks);
    if (fc.ok && squash(stripTags(fc.markdown || "")).length >= 200) return fc;
  }
  return await plainFetchText(url);
}


async function perplexity(apiKey: string, query: string) {
  const r = await fetch("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "sonar",
      messages: [
        { role: "system", content: "Find real, current opportunities. Cite the page that proves each one." },
        { role: "user", content: query },
      ],
      search_recency_filter: "week",
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!r.ok) return { ok: false as const, citations: [] as string[], usage: {} };
  const j = await r.json();
  const citations: string[] = j?.citations ?? j?.search_results?.map((s: any) => s.url) ?? [];
  return { ok: true as const, citations: citations.filter(Boolean), usage: j?.usage ?? {} };
}

async function embed(key: string, input: string): Promise<number[] | null> {
  const r = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: EMBED_MODEL, input }),
  });
  if (!r.ok) {
    console.error(`[${FN}] embed failed`, r.status);
    return null;
  }
  const j = await r.json();
  return j?.data?.[0]?.embedding ?? null;
}

async function readPage(apiKey: string, header: string, pageText: string) {
  const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: P2_SYSTEM },
        { role: "user", content: `${header}\n\nPAGE TEXT:\n${truncateMiddle(pageText)}` },
      ],
    }),
  });
  if (!r.ok) throw new Error(`gateway ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const data = await r.json();
  return { content: data?.choices?.[0]?.message?.content || "", usage: data?.usage || {} };
}

// ───────── candidate gathering ─────────

interface Candidate { url: string | null; title: string; text: string; extra?: Record<string, unknown> }

function parseRss(xml: string): Candidate[] {
  const out: Candidate[] = [];
  const items = xml.match(/<(item|entry)[\s\S]*?<\/\1>/gi) ?? [];
  for (const it of items.slice(0, 40)) {
    const link = it.match(/<link[^>]*href="([^"]+)"/i)?.[1] || it.match(/<link>([\s\S]*?)<\/link>/i)?.[1] || "";
    const title = squash(stripTags(it.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || ""));
    const desc = squash(stripTags(it.match(/<(description|summary|content[^>]*)>([\s\S]*?)<\/\1>/i)?.[2] || ""));
    if (!link && !title) continue;
    out.push({ url: squash(link) || null, title, text: `${title}\n\n${desc}` });
  }
  return out;
}

function parseSitemap(xml: string): Candidate[] {
  const locs = [...xml.matchAll(/<loc>([\s\S]*?)<\/loc>/gi)].map((m) => squash(m[1]));
  return locs.slice(0, 40).map((u) => ({ url: u, title: "", text: "" }));
}

function parseTelegram(html: string): Candidate[] {
  const blocks = [...html.matchAll(
    /<div class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/gi,
  )].map((m) => squash(stripTags(m[1])));
  return blocks.filter((t) => t.length > 80).slice(0, 25).map((t) => ({
    url: null,
    title: t.slice(0, 80),
    text: t,
  }));
}

function parseIcs(text: string): Candidate[] {
  const events = text.split(/BEGIN:VEVENT/i).slice(1);
  return events.slice(0, 40).map((e) => {
    const get = (k: string) => squash(e.match(new RegExp(`${k}[^:]*:(.*)`, "i"))?.[1] || "");
    const title = get("SUMMARY");
    return {
      url: get("URL") || null,
      title,
      text: [title, get("DTSTART"), get("LOCATION"), get("DESCRIPTION")].filter(Boolean).join("\n"),
    };
  });
}

// ───────── issuer resolution ─────────

function guessIssuerKind(name: string): string {
  const n = name.toLowerCase();
  if (/وزارة|ministry/.test(n)) return "ministry";
  if (/هيئة|authority|commission|regulator/.test(n)) return "authority";
  if (/جامعة|universit|college/.test(n)) return "university";
  if (/صندوق|fund|pif/.test(n)) return "fund";
  if (/بنك|bank|شركة|company|holding|plc|listed/.test(n)) return "listed_company";
  if (/consult|advisory|firm/.test(n)) return "firm";
  if (/event|conference|summit|forum/.test(n)) return "event_host";
  return "other";
}

/**
 * Exact name match, then domain. The similarity tier is skipped: pg_trgm is not
 * installed on this database, so there is no trigram operator to match on.
 */
async function resolveIssuer(
  admin: SupabaseClient,
  issuerRaw: string,
  sourceUrl: string | null,
  sector: string | null,
): Promise<string | null> {
  const name = squash(issuerRaw || "");
  if (!name) return null;

  const { data: byName } = await admin
    .from("oe_issuers")
    .select("id, canonical_name, name_ar, name_en, aliases")
    .or(`canonical_name.ilike.${name},name_ar.ilike.${name},name_en.ilike.${name}`)
    .limit(1);
  if (byName?.length) return byName[0].id;

  const { data: byAlias } = await admin
    .from("oe_issuers")
    .select("id")
    .contains("aliases", [name])
    .limit(1);
  if (byAlias?.length) return byAlias[0].id;

  const domain = sourceUrl ? hostOf(sourceUrl) : "";
  if (domain) {
    const { data: byDomain } = await admin.from("oe_issuers").select("id").eq("domain", domain).limit(1);
    if (byDomain?.length) return byDomain[0].id;
  }

  const { data: inserted } = await admin
    .from("oe_issuers")
    .insert({
      canonical_name: name,
      name_en: /[A-Za-z]/.test(name) ? name : null,
      name_ar: /[\u0600-\u06FF]/.test(name) ? name : null,
      domain: domain || null,
      kind: guessIssuerKind(name),
      sector: sector || null,
    })
    .select("id")
    .maybeSingle();
  return inserted?.id ?? null;
}

// ───────── the function ─────────

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

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const cap = await checkSpendCap(admin, "oe-fetch-feed");
  if (!cap.allowed) {
    return new Response(JSON.stringify({ ok: false, reason: "daily_call_cap", used: cap.used, cap: cap.cap }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const lovableKey = Deno.env.get("LOVABLE_API_KEY") || "";
  const firecrawlKey = Deno.env.get("FIRECRAWL_API_KEY") || "";
  const perplexityKey = Deno.env.get("PERPLEXITY_API_KEY") || "";
  const openaiKey = Deno.env.get("OPENAI_API_KEY") || "";

  const body = await req.json().catch(() => ({}));
  const memberId = (body.user_id ?? null) as string | null;

  // Two doors into the same reader: a whole feed, or one candidate the triage
  // layer has already judged worth the money.
  const candidateId = (body.candidate_id ?? null) as string | null;
  let candidateRow: Record<string, any> | null = null;
  let feedId = (body.feed_id ?? null) as string | null;
  if (candidateId) {
    const { data: c } = await admin.from("oe_candidates").select("*").eq("id", candidateId).maybeSingle();
    if (!c) return json({ error: "candidate not found" }, 404);
    candidateRow = c;
    feedId = (c.feed_id ?? null) as string | null;
  }
  if (!feedId && !candidateRow) return json({ error: "feed_id or candidate_id required" }, 400);

  const startedAt = new Date().toISOString();
  const counts = {
    pages: 0, candidates: 0, inserted: 0, updated: 0,
    dropped_no_quote: 0, dropped_not_opportunity: 0, dropped_aggregator: 0, dropped_past: 0,
    dedup_hits: 0, leadtime_pairs: 0, errors: 0,
  };
  let costUsd = 0;

  let feed: Record<string, any> | null = null;
  if (feedId) {
    const { data } = await admin.from("oe_feeds").select("*").eq("id", feedId).maybeSingle();
    feed = data as Record<string, any> | null;
  }
  if (!feed) {
    if (!candidateRow) return json({ error: "feed not found" }, 404);
    feed = { id: null, name: "triaged candidate", lane: "open", kind: "candidate", issuer_hint: null, url: null };
  }

  const { data: policy } = await admin
    .from("oe_policy_versions").select("params").eq("active", true).maybeSingle();
  const params = (policy?.params ?? {}) as Record<string, any>;
  const neverRead: string[] = params.never_read ?? [];
  const dedupCosine: number = params.dedup_cosine ?? 0.92;
  const discoveryBudget: number = params.discovery_queries_per_night ?? 30;
  const skipHosts: string[] = params.discovery_skip_hosts ?? [];

  const blocked = (url: string | null) => {
    if (!url) return false;
    const h = hostOf(url);
    return [...neverRead, ...skipHosts].some((b) => h === b || h.endsWith(`.${b}`));
  };

  // The lowest level worth opening. A product rule, identical for every member.
  const readMinLevel: string = params.read_min_level ?? "senior_manager";

  /** Every link this run judged, so the same link is never read twice. */
  const judged = new Map<string, string>();
  const recordSeen = (link: string | null, verdict: string) => {
    if (link) judged.set(canonicalise(link), verdict);
  };
  async function flushSeen() {
    if (!judged.size) return;
    const now = new Date().toISOString();
    await admin.from("oe_seen_links").upsert(
      [...judged].map(([canonical_url, verdict]) => ({
        canonical_url, feed_id: feedId, verdict, last_seen_at: now,
      })),
      { onConflict: "canonical_url" },
    );
    judged.clear();
  }

  try {
    // ── 1. FETCH ───────────────────────────────────────────────────────────
    const kind = candidateRow ? "candidate" : ((body.kind ?? feed.kind) as string);
    const url = (candidateRow?.url ?? body.url ?? feed.url) as string | null;
    const lane = (body.lane ?? feed.lane) as string;
    let candidates: Candidate[] = [];

    if (url && blocked(url)) {
      await logEfError(admin, {
        function_name: FN, error: `never_read host skipped: ${url}`, severity: "low",
        context: { feed_id: feedId },
      });
    } else if (candidateRow) {
      // One page, already chosen. Read it the same way as any other page.
      const d = await scrapePage(firecrawlKey, candidateRow.url, true);
      counts.pages++;
      const clean = d.ok ? squash(stripTags(d.markdown ?? "")) : "";
      if (clean.length >= 400) {
        candidates = [{
          url: candidateRow.url,
          title: candidateRow.title ?? (d.ok ? d.title : "") ?? "",
          text: clean,
          extra: { candidate_id: candidateRow.id },
        }];
      }
    } else if (kind === "rss" || kind === "sitemap") {
      const r = await fetch(url!, { signal: AbortSignal.timeout(20_000) });
      const xml = await r.text();
      counts.pages++;
      candidates = kind === "rss" ? parseRss(xml) : parseSitemap(xml);
      // A sitemap gives links only; fetch each one plainly.
      if (kind === "sitemap") {
        const picked = candidates.slice(0, MAX_DETAIL_PAGES);
        candidates = [];
        for (const c of picked) {
          if (blocked(c.url)) continue;
          try {
            const p = await fetch(c.url!, { signal: AbortSignal.timeout(20_000) });
            const text = squash(stripTags(await p.text()));
            counts.pages++;
            if (text.length >= 400) candidates.push({ url: c.url, title: "", text });
          } catch { counts.errors++; }
        }
      }
    } else if (kind === "telegram") {
      if (url) {
        const r = await fetch(url.replace("t.me/", "t.me/s/").replace("/s/s/", "/s/"), {
          signal: AbortSignal.timeout(20_000),
        });
        counts.pages++;
        candidates = parseTelegram(await r.text());
      }
    } else if (kind === "calendar") {
      if (url) {
        const r = await fetch(url, { signal: AbortSignal.timeout(20_000) });
        const ct = r.headers.get("content-type") || "";
        const text = await r.text();
        counts.pages++;
        if (/calendar|\.ics/.test(ct) || text.startsWith("BEGIN:VCALENDAR")) {
          candidates = parseIcs(text);
        } else {
          const fc = await scrapePage(firecrawlKey, url, true);
          // A calendar page lists many events. Only its item pages can be records.
          if (fc.ok) {
            const items = (fc.links ?? [])
              .map((l) => canonicalise(l))
              .filter((l) => l.startsWith("http") && !blocked(l))
              .filter((l) => canonicalise(url) !== l)
              .filter((l) => !isAggregator(l))
              .filter((l, i, arr) => arr.indexOf(l) === i)
              .slice(0, MAX_DETAIL_PAGES);
            for (const link of items) {
              const d = await scrapePage(firecrawlKey, link);
              counts.pages++;
              if (!d.ok) { counts.errors++; continue; }
              const clean = squash(stripTags(d.markdown || ""));
              if (clean.length < MIN_CLEAN_TEXT_CHARS) continue;
              candidates.push({ url: link, title: d.title, text: clean });
            }
          }
        }
      }
    } else if (kind === "listing") {
      // A listing page is cheap to read plainly. Firecrawl is billed per page,
      // so it is the fallback, not the first move.
      const isCareers = String(feed.source_type ?? "") === "careers_page";
      const feedHost = hostOf(url!);
      const sift = (raw: string[]) => {
        const base = raw
          .map((l) => canonicalise(l))
          .filter((l) => l.startsWith("http") && !blocked(l))
          .filter((l) => canonicalise(url!) !== l)
          .filter((l, i, arr) => arr.indexOf(l) === i);
        if (isCareers) return base.filter((l) => looksLikeJobPosting(l, feedHost));
        const chairWords = (feed.chair_types ?? []) as string[];
        const wanted = /ترشح|nomination|board|مجلس إدارة|vacanc|شاغر|tender|منافسة|call for|دعوة/i;
        return base.filter((l) => wanted.test(decodeURIComponent(l)) || chairWords.length === 0);
      };

      let page = await plainFetchText(url!);
      counts.pages++;
      let links = page.ok ? sift(page.links ?? []) : [];
      if (!page.ok || squash(stripTags(page.markdown ?? "")).length < MIN_CLEAN_TEXT_CHARS || !links.length) {
        const fc = await firecrawlScrape(firecrawlKey, url!, true);
        counts.pages++;
        if (fc.ok) { page = fc as any; links = sift(fc.links ?? []); }
        else if (!page.ok) throw new Error(`read failed ${fc.status}: ${fc.error}`);
      }

      // An unchanged listing page costs nothing: no detail page, no model call.
      const fingerprint = await sha256([...links].sort().join("\n"));
      if (fingerprint && fingerprint === String(feed.links_fingerprint ?? "")) {
        links = [];
      } else if (feedId) {
        await admin.from("oe_feeds").update({ links_fingerprint: fingerprint }).eq("id", feedId);
      }

      // Too junior to open, decided from the link's own words, for free.
      let kept: string[] = [];
      for (const l of links.slice(0, 400)) {
        if (!isCareers) { kept.push(l); continue; }
        const lvl = parseLevel(titleFromLink(l), null);
        if (lvl && levelIndex(lvl) < levelIndex(readMinLevel)) {
          recordSeen(l, "junior_title");
          continue;
        }
        kept.push(l);
      }

      // Every link this engine has already judged is dropped before it is opened.
      const weekAgo = new Date(Date.now() - 7 * 24 * 3600_000).toISOString();
      const seenSet = new Set<string>();
      for (let i = 0; i < kept.length; i += 200) {
        const { data: seen } = await admin
          .from("oe_seen_links")
          .select("canonical_url, verdict, last_seen_at")
          .in("canonical_url", kept.slice(i, i + 200));
        for (const s of seen ?? []) {
          // One retry for a link that errored, and only after seven days.
          if (s.verdict === "error" && String(s.last_seen_at) < weekAgo) continue;
          seenSet.add(s.canonical_url as string);
        }
      }
      const fresh = kept.filter((l) => !seenSet.has(l)).slice(0, MAX_DETAIL_PAGES);
      await flushSeen();

      for (const link of fresh) {
        const d = await scrapePage(firecrawlKey, link);
        counts.pages++;
        if (!d.ok) { counts.errors++; recordSeen(link, "error"); continue; }
        const raw = d.markdown || "";
        const clean = squash(stripTags(raw));
        if (clean.length < MIN_CLEAN_TEXT_CHARS) { recordSeen(link, "too_short"); continue; }
        const noise = raw.length ? 1 - clean.length / raw.length : 1;
        if (noise > MAX_NOISE_RATIO) { recordSeen(link, "too_short"); continue; }
        candidates.push({ url: link, title: d.title, text: clean });
      }
      await flushSeen();
      // A listing page is a page, not a chair. If no detail page was reachable,
      // this feed produces nothing today. We never turn the index into a record.
    } else if (kind === "api") {
      const isWorldBank = /worldbank\.org/i.test(url || "");
      if (isWorldBank && url) {
        const r = await fetch(`${url}?format=json&rows=100`, { signal: AbortSignal.timeout(20_000) });
        counts.pages++;
        const j = await r.json().catch(() => null);
        const rows: any[] = j?.procnotices ?? j?.notices ?? [];
        const kept = rows.filter((n) => {
          const kindText = `${n.notice_type ?? ""} ${n.procurement_method_name ?? ""} ${n.procurement_method ?? ""} ${n.noticetype ?? ""}`;
          const consulting = WB_CONSULTING.test(kindText);
          if (!consulting) return false;
          const country = squash(String(n.country_name ?? n.countryname ?? ""));
          const inRegion = WB_REGION.some((c) => country.toLowerCase().includes(c));
          const title = `${n.project_name ?? ""} ${n.bid_description ?? ""}`;
          return inRegion || WB_THEMES.test(title);
        });
        candidates = kept.slice(0, MAX_DETAIL_PAGES).map((n) => ({
          url: worldBankNoticeUrl(n),
          title: n.project_name || n.notice_type || "",
          text: [n.project_name, n.notice_type, n.procurement_method_name, n.country_name, n.noticedate, n.submission_deadline_date, n.notice_lang_name, n.bid_description]
            .filter(Boolean).join("\n"),
        }));
      } else if (perplexityKey && firecrawlKey) {

        // Discovery is built from what each member can actually hold, first,
        // and from his faces second. Anything closed to him never enters the
        // query text at all — which is why the set used to fill with seats he
        // could never take.
        const { data: eligRows } = await admin
          .from("oe_eligibility")
          .select("user_id, countries_allowed, level_floor, chair_types_blocked, sectors_core");
        const { data: faces } = await admin
          .from("oe_faces").select("user_id, face, queries")
          .in("face", ["done", "wants", "stands"]);

        const COUNTRY_WORDS: Record<string, [string, string]> = {
          SA: ["Saudi Arabia", "السعودية"], AE: ["United Arab Emirates", "الإمارات"],
          QA: ["Qatar", "قطر"], KW: ["Kuwait", "الكويت"], BH: ["Bahrain", "البحرين"],
          OM: ["Oman", "سلطنة عمان"], JO: ["Jordan", "الأردن"], EG: ["Egypt", "مصر"],
        };
        const LEVEL_WORDS: Record<string, [string, string]> = {
          ic: ["specialist", "أخصائي"], manager: ["manager", "مدير"],
          senior_manager: ["senior manager", "مدير أول"], director: ["director", "مدير تنفيذي"],
          senior_director: ["head of", "رئيس قسم"], vp: ["vice president", "نائب رئيس"],
          c_suite: ["chief executive", "الرئيس التنفيذي"], board: ["board member", "عضو مجلس إدارة"],
        };
        const LEVEL_ORDER = ["ic", "manager", "senior_manager", "director", "senior_director", "vp", "c_suite", "board"];
        // An Arabic question written half in English finds nothing.
        const SECTOR_WORDS: Record<string, string> = {
          government: "القطاع الحكومي", public_sector: "القطاع العام",
          utilities_water: "قطاع المياه", water: "المياه", utilities: "المرافق",
          energy: "الطاقة", logistics: "الخدمات اللوجستية", transport: "النقل",
          digital_transformation: "التحول الرقمي", technology: "التقنية",
          healthcare: "الرعاية الصحية", education: "التعليم", finance: "التمويل",
          banking: "القطاع المصرفي", construction: "الإنشاءات", mining: "التعدين",
          tourism: "السياحة", telecom: "الاتصالات", manufacturing: "الصناعة",
        };

        const CHAIR_WORDS: Record<string, [string, string]> = {
          role: ["role", "وظيفة"], mandate: ["advisory mandate", "تكليف استشاري"],
          advisory: ["advisory seat", "مقعد استشاري"], speaking: ["speaker call", "دعوة متحدثين"],
          room: ["committee", "لجنة"], media: ["expert comment", "رأي خبير"],
          board: ["board seat", "مقعد مجلس إدارة"], consultation: ["public consultation", "استطلاع عام"],
          learning: ["executive programme", "برنامج تنفيذي"],
        };
        const excludeTerms: string[] = params.discovery_exclude_terms
          ?? ["board of directors", "مجلس إدارة", "nomination for board", "World Bank pipeline"];

        const facesByUser = new Map<string, string[]>();
        for (const f of faces ?? []) {
          const list = facesByUser.get(f.user_id) ?? [];
          list.push(...((f.queries ?? []) as string[]));
          facesByUser.set(f.user_id, list);
        }

        const byUser = new Map<string, string[]>();
        for (const e of eligRows ?? []) {
          const blockedChairs = (e.chair_types_blocked ?? []).map((c: string) => String(c).toLowerCase());
          // No ceiling. A level above where he sits now is a stretch, not a
          // closed door, so the questions run up the ladder, not into a wall.
          const floor = LEVEL_ORDER.indexOf(String(e.level_floor ?? ""));
          const levels = LEVEL_ORDER
            .filter((_, i) => (floor < 0 || i >= floor))
            .filter((l) => !blockedChairs.includes(l));
          const countries = (e.countries_allowed ?? []).map((c: string) => String(c).toUpperCase());
          const chairs = Object.keys(CHAIR_WORDS).filter((c) => !blockedChairs.includes(c));
          const sectorKeys = (e.sectors_core ?? []).map((s: string) => String(s).toLowerCase());


          const built: string[] = [];
          for (const lang of [0, 1] as const) {
            const places = countries.map((c) => COUNTRY_WORDS[c]?.[lang]).filter(Boolean);
            if (!places.length) continue;
            const place = places.join(lang ? " أو " : " or ");
            for (const key of sectorKeys.slice(0, 4)) {
              const sector = lang ? (SECTOR_WORDS[key] ?? key.replace(/_/g, " ")) : key.replace(/_/g, " ");
              for (const lvl of levels.slice(0, 3)) {
                built.push(`${LEVEL_WORDS[lvl]?.[lang] ?? lvl} ${sector} ${place}`);
              }
              for (const ch of chairs.slice(0, 4)) {
                built.push(`${CHAIR_WORDS[ch][lang]} ${sector} ${place}`);
              }
            }
          }

          // Faces come second, and are anchored to the same places.
          for (const q of (facesByUser.get(e.user_id) ?? []).slice(0, 6)) {
            const isAr = /[\u0600-\u06FF]/.test(q);
            const places = countries.map((c) => COUNTRY_WORDS[c]?.[isAr ? 1 : 0]).filter(Boolean);
            built.push(places.length ? `${q} (${places.join(isAr ? " أو " : " or ")})` : q);
          }
          const clean = built.filter((q) =>
            !excludeTerms.some((t) => q.toLowerCase().includes(String(t).toLowerCase())) &&
            !blockedChairs.some((c) => {
              const w = CHAIR_WORDS[c];
              return w ? q.toLowerCase().includes(w[0].toLowerCase()) || q.includes(w[1]) : false;
            }));
          byUser.set(e.user_id, [...new Set(clean)]);
        }
        // A member with no eligibility row keeps the old face-only behaviour.
        for (const [uid, list] of facesByUser) {
          if (!byUser.has(uid)) byUser.set(uid, list);
        }

        const rota: string[] = [];
        let i = 0;
        while (rota.length < discoveryBudget) {
          let added = false;
          for (const list of byUser.values()) {
            if (list[i]) { rota.push(list[i]); added = true; }
            if (rota.length >= discoveryBudget) break;
          }
          if (!added) break;
          i++;
        }
        const urls = new Set<string>();
        for (const q of rota) {
          const p = await perplexity(perplexityKey, q);
          if (!p.ok) { counts.errors++; continue; }
          costUsd += 0.001;
          await logAIUsage({
            function_name: FN, provider: "perplexity", model: "sonar",
            input_tokens: p.usage?.prompt_tokens ?? 0, output_tokens: p.usage?.completion_tokens ?? 0,
            metadata: { feed_id: feedId },
          });
          for (const c of p.citations) {
            const cu = canonicalise(c);
            if (!blocked(cu)) urls.add(cu);
          }
          if (urls.size >= MAX_DETAIL_PAGES) break;
        }

        for (const u of [...urls].slice(0, MAX_DETAIL_PAGES)) {
          const d = await firecrawlScrape(firecrawlKey, u);
          counts.pages++;
          if (!d.ok) { counts.errors++; continue; }
          const clean = squash(stripTags(d.markdown || ""));
          if (clean.length < MIN_CLEAN_TEXT_CHARS) continue;
          candidates.push({ url: u, title: d.title, text: clean });
        }
      }
    } else if (kind === "member_forward") {
      if (!memberId) throw new Error("member_forward job without user_id");
      const since = new Date(Date.now() - 7 * 24 * 3600_000).toISOString();
      const { data: entries } = await admin
        .from("entries")
        .select("id, title, content, summary, created_at")
        .eq("user_id", memberId)
        .eq("source_type", "member_forward")
        .gte("created_at", since)
        .limit(20);
      for (const e of entries ?? []) {
        const text = squash(`${e.title ?? ""}\n${e.content ?? e.summary ?? ""}`);
        if (text.length < 40) continue;
        candidates.push({ url: null, title: e.title ?? "", text, extra: { entry_id: e.id } });
        // Look for the public twin of what he forwarded.
        if (perplexityKey && firecrawlKey) {
          const p = await perplexity(perplexityKey, `Find the original public page for this: ${text.slice(0, 200)}`);
          const twin = p.citations.map(canonicalise).find((u) => !blocked(u));
          if (twin) {
            const d = await firecrawlScrape(firecrawlKey, twin);
            counts.pages++;
            if (d.ok) {
              const clean = squash(stripTags(d.markdown || ""));
              if (clean.length >= 400) {
                candidates.push({ url: twin, title: d.title, text: clean, extra: { twin_of: e.id } });
              }
            }
          }
        }
      }
    }

    counts.candidates = candidates.length;

    // ── 2–6. READ, VERIFY, RESOLVE, DEDUP, WRITE ──────────────────────────
    if (!lovableKey && candidates.length) throw new Error("LOVABLE_API_KEY not configured");
    let insertedAnything = false;

    for (const cand of candidates) {
      try {
        const header = [
          `FEED: ${feed.name}`, `LANE: ${lane}`,
          `ISSUER HINT: ${feed.issuer_hint ?? "unknown"}`,
          `URL: ${cand.url ?? "(forwarded message, no url)"}`,
        ].join("\n");
        const out = await readPage(lovableKey, header, cand.text);
        costUsd += 0.0005;
        await logAIUsage({
          user_id: memberId, function_name: FN, provider: "lovable", model: MODEL,
          input_tokens: out.usage?.prompt_tokens ?? 0, output_tokens: out.usage?.completion_tokens ?? 0,
          metadata: { feed_id: feedId, prompt_version: READER_VERSION },
        });
        const rec = normaliseJson(out.content);
        if (!rec?.is_opportunity || !rec.chair_type || !rec.time_kind) {
          counts.dropped_not_opportunity++;
          recordSeen(cand.url, "not_opportunity");
          continue;
        }

        // A directory is not a chair, whatever the model said.
        if (isAggregator(cand.url, rec.title, rec.scope)) {
          counts.dropped_aggregator++;
          recordSeen(cand.url, "aggregator");
          continue;
        }

        if (pastEvent(rec)) {
          counts.dropped_past++;
          recordSeen(cand.url, "past");
          continue;
        }

        // 3. VERIFY the quote against the page text WE KEEP. Verifying against
        // text we then throw away is how a "verified" quote ends up absent from
        // the record: the verdict and the stored copy must be the same text.
        const storedText = keptPageText(String(cand.text ?? ""), String(rec.evidence_quote ?? ""));
        const quote = normaliseForQuote(rec.evidence_quote);
        const pageNorm = normaliseForQuote(storedText);
        const quoteVerified = quote.length > 10 && pageNorm.includes(quote);
        let confidence = Number(rec.extraction_confidence ?? 0.5);
        if (!quoteVerified) {
          if (rec.time_kind === "open_now") { counts.dropped_no_quote++; recordSeen(cand.url, "no_quote"); continue; }
          confidence = Math.min(confidence, 0.5);
        }


        // 4. ISSUER
        const issuerId = await resolveIssuer(admin, rec.issuer_raw || feed.issuer_hint || "", cand.url, rec.sector ?? null);

        // 5. DEDUP
        // A forwarded message or an API record has no page of its own. It still
        // needs a source that says where it came from, so we name it honestly.
        const sourceUrl = cand.url
          ?? (cand.extra?.entry_id ? `urn:aura:entry:${cand.extra.entry_id}` : (url ?? `urn:aura:feed:${feedId}`));
        const canonicalUrl = cand.url ? canonicalise(cand.url) : null;
        const contentHash = await sha256(
          `${(rec.title || "").toLowerCase()}|${(rec.issuer_raw || "").toLowerCase()}|${rec.deadline ?? ""}`,
        );

        let existing: any = null;
        if (canonicalUrl) {
          const { data } = await admin.from("oe_opportunities").select("id").eq("canonical_url", canonicalUrl).maybeSingle();
          existing = data;
        }
        if (!existing) {
          const { data } = await admin.from("oe_opportunities").select("id").eq("content_hash", contentHash).maybeSingle();
          existing = data;
        }
        if (existing) {
          await admin.from("oe_opportunities")
            .update({ last_seen_at: new Date().toISOString(), alive: true })
            .eq("id", existing.id);
          counts.updated++;
          continue;
        }

        const reqText = Array.isArray(rec.requirements)
          ? rec.requirements.map((r: any) => r?.text).filter(Boolean).join(" ")
          : "";
        const vector = openaiKey ? await embed(openaiKey, `${rec.title}\n${rec.scope}\n${reqText}`) : null;
        if (vector) {
          costUsd += 0.00002;
          await logAIUsage({
            function_name: FN, provider: "openai", model: EMBED_MODEL,
            input_tokens: Math.ceil((rec.title + rec.scope + reqText).length / 4),
            metadata: { feed_id: feedId },
          });
          // Nearest neighbour among live records of the same chair type.
          const { data: near } = await admin
            .from("oe_opportunities")
            .select("id, embedding, raw")
            .eq("chair_type", rec.chair_type)
            .eq("alive", true)
            .not("embedding", "is", null)
            .order("last_seen_at", { ascending: false })
            .limit(200);
          for (const n of near ?? []) {
            const emb = typeof n.embedding === "string" ? JSON.parse(n.embedding) : n.embedding;
            if (!Array.isArray(emb)) continue;
            if (cosine(vector, emb) >= dedupCosine) {
              const alsoSeen = [...((n.raw?.also_seen ?? []) as string[])];
              if (sourceUrl && !alsoSeen.includes(sourceUrl)) alsoSeen.push(sourceUrl);
              await admin.from("oe_opportunities")
                .update({
                  last_seen_at: new Date().toISOString(),
                  alive: true,
                  raw: { ...(n.raw ?? {}), also_seen: alsoSeen },
                })
                .eq("id", n.id);
              counts.dedup_hits++;
              existing = n;
              break;
            }
          }
          if (existing) continue;
        }

        const row: Record<string, unknown> = {
          feed_id: feedId,
          issuer_id: issuerId,
          issuer_raw: rec.issuer_raw ?? null,
          chair_type: rec.chair_type,
          time_kind: rec.time_kind,
          title: (rec.title || "").slice(0, 500),
          scope: rec.scope ?? null,
          sector: rec.sector ?? null,
          seniority_band: rec.seniority_band ?? null,
          // The ladder level, read in code from the record's own words. Never
          // from seniority_band, which is a different (work/table/room) vocabulary.
          level_band: parseLevel(rec.title, rec.scope),
          location: rec.location ?? null,
          remote: typeof rec.remote === "boolean" ? rec.remote : null,
          requirements: Array.isArray(rec.requirements) ? rec.requirements : [],
          conditions: Array.isArray(rec.conditions) ? rec.conditions : [],
          discovery_kind: DISCOVERY_KINDS.includes(String(rec.discovery_kind))
            ? String(rec.discovery_kind)
            : "posted_opening",
          deadline: rec.deadline || null,
          signal_date: rec.signal_date || null,
          posting_date: new Date().toISOString().slice(0, 10),
          evidence_quote: rec.evidence_quote ?? null,
          route_url: typeof rec.route_url === "string" && /^https?:/i.test(rec.route_url) ? rec.route_url : null,
          route_kind: ROUTE_KINDS.includes(String(rec.route_kind)) ? String(rec.route_kind) : "none",
          quote_verified: quoteVerified,
          source_url: sourceUrl,
          canonical_url: canonicalUrl,
          content_hash: contentHash,
          language: rec.language === "ar" ? "ar" : "en",
          extraction_confidence: confidence,
          alive: true,
          // What the page STATES about accountability, each fact carrying the
          // sentence it came from; a quote not found in the page is dropped.
          scope_evidence: verifyScopeEvidence(rec.scope_evidence, String(cand.text ?? "")),
          raw: {
            prompt_version: READER_VERSION,
            model: MODEL,
            lane,
            page_text: storedText,
            ...(cand.extra ?? {}),
          },
        };
        if (vector) row.embedding = `[${vector.join(",")}]`;

        const { data: ins, error: insErr } = await admin
          .from("oe_opportunities").insert(row).select("id, issuer_id, chair_type, posting_date, first_seen_at").maybeSingle();
        if (insErr) {
          if ((insErr as any).code === "23505") { counts.updated++; continue; }
          throw new Error(insErr.message);
        }
        counts.inserted++;
        insertedAnything = true;

        // 6. LEAD-TIME PAIRS
        if (rec.time_kind === "open_now" && ins?.issuer_id) {
          const since = new Date(Date.now() - 180 * 24 * 3600_000).toISOString();
          const { data: early } = await admin
            .from("oe_opportunities")
            .select("id, signal_date, first_seen_at")
            .eq("issuer_id", ins.issuer_id)
            .eq("chair_type", ins.chair_type)
            .eq("time_kind", "early_signal")
            .gte("first_seen_at", since)
            .order("first_seen_at", { ascending: true })
            .limit(1);
          const e = early?.[0];
          if (e) {
            const { error: pairErr } = await admin.from("oe_leadtime_pairs").insert({
              opportunity_id: e.id,
              posted_opportunity_id: ins.id,
              chair_type: ins.chair_type,
              signal_date: e.signal_date ?? String(e.first_seen_at).slice(0, 10),
              posting_date: ins.posting_date ?? String(ins.first_seen_at).slice(0, 10),
            });
            if (!pairErr) counts.leadtime_pairs++;
          }
        }
      } catch (e) {
        counts.errors++;
        await logEfError(admin, {
          function_name: FN, error: e, severity: "low",
          context: { feed_id: feedId, url: cand.url },
        });
      }
    }

    // ── 7. ALIVE sweep for listing feeds ───────────────────────────────────
    if (kind === "listing") {
      const cutoff = new Date(Date.now() - 7 * 24 * 3600_000).toISOString();
      const today = new Date().toISOString().slice(0, 10);
      await admin.from("oe_opportunities")
        .update({ alive: false })
        .eq("feed_id", feedId).eq("alive", true)
        .lt("last_seen_at", cutoff)
        .or(`deadline.is.null,deadline.lt.${today}`);
    }

    // ── 8. FEED STATE ──────────────────────────────────────────────────────
    // Only a whole-feed read moves the cadence clock. Reading ONE backlog
    // candidate borrows the feed for context; stamping last_fetched_at here
    // made a weekly feed look as though it fetched every minute.
    if (feedId && !candidateRow) {
      await admin.from("oe_feeds").update({
        last_fetched_at: new Date().toISOString(),
        ...(insertedAnything ? { last_changed_at: new Date().toISOString() } : {}),
        last_error: null,
      }).eq("id", feedId);
    }

    if (candidateRow) {
      await admin.from("oe_candidates").update({ triage_state: "read" }).eq("id", candidateRow.id);
    }

    // ── 9. LOG ─────────────────────────────────────────────────────────────
    const { data: run } = await admin.from("oe_runs").insert({
      run_kind: "fetch_feed", feed_id: feedId, user_id: memberId,
      started_at: startedAt, finished_at: new Date().toISOString(),
      outcome: "ok", counts, cost_usd: +costUsd.toFixed(6),
    }).select("id").maybeSingle();

    await logEfError(admin, {
      function_name: FN,
      error: `OE_FETCH_OK feed=${feed.name} inserted=${counts.inserted}`,
      severity: "info",
      context: { feed_id: feedId, counts },
    });

    return json({ ok: true, feed: feed.name, counts, run_id: run?.id ?? null });
  } catch (e) {
    const msg = String((e as Error).message ?? e).slice(0, 500);
    if (feedId && !candidateRow) {
      await admin.from("oe_feeds").update({
        last_fetched_at: new Date().toISOString(), last_error: msg,
      }).eq("id", feedId);
    }

    if (candidateRow) {
      await admin.from("oe_candidates").update({ triage_state: "error", rejected_reason: msg.slice(0, 200) })
        .eq("id", candidateRow.id);
    }
    await admin.from("oe_runs").insert({
      run_kind: "fetch_feed", feed_id: feedId, user_id: memberId,
      started_at: startedAt, finished_at: new Date().toISOString(),
      outcome: "error", counts, cost_usd: +costUsd.toFixed(6), error: msg,
    });
    await logEfError(admin, { function_name: FN, error: e, severity: "high", context: { feed_id: feedId } });
    return json({ ok: false, error: msg, counts }, 500);
  }
});
