/**
 * oe-seed-entities — bulk enumeration of organisations, not websites.
 *
 * No per-company research happens here and no model is called. Each seeder
 * pulls a public list, we normalise the name, keep the official domain where
 * the source carries one, and write the row. Everything expensive comes later,
 * in the resolver. A run costs nothing.
 *
 * Every row records which list it came from, so we can say honestly what each
 * source contributed and drop the ones that give us nothing.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { logEfError } from "../_shared/observe.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const FN = "oe-seed-entities";
const UA = "AuraOpportunityEngine/1.0 (+https://aura-intel.org; opportunity discovery for members)";
const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

type Ent = {
  name: string;
  name_ar?: string | null;
  domain?: string | null;
  industry?: string | null;
  entity_kind?: string | null;
  listed_symbol?: string | null;
  size_hint?: string | null;
  seed_source: string;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const squash = (s: string) => (s || "").replace(/\s+/g, " ").trim();

/** One normal form for a company name, so two lists cannot seed the same firm twice. */
function normName(raw: string): string {
  return squash(raw)
    .toLowerCase()
    .replace(/[\u0640]/g, "")
    .replace(/[\u064B-\u0652\u0670]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/[.,'"()\[\]«»\u2019\u2018\u201c\u201d]/g, " ")
    .replace(/\b(the|a|an)\b/g, " ")
    .replace(
      /\b(co|company|corp|corporation|inc|ltd|limited|llc|plc|group|holding|holdings|jsc|sa|saudi joint stock|cjsc)\b/g,
      " ",
    )
    .replace(/\b(شركة|مجموعة|القابضة|المحدودة|شركه)\b/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function domainOf(website: string | null | undefined): string | null {
  if (!website) return null;
  try {
    const h = new URL(website).hostname.replace(/^www\./i, "").toLowerCase();
    return h.includes(".") ? h : null;
  } catch {
    return null;
  }
}

async function getText(url: string, ua = BROWSER_UA, timeout = 30_000): Promise<{ ok: boolean; status: number; text: string }> {
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": ua, "Accept-Language": "en,ar;q=0.8" },
      redirect: "follow",
      signal: AbortSignal.timeout(timeout),
    });
    return { ok: r.ok, status: r.status, text: r.ok ? await r.text() : "" };
  } catch (e) {
    return { ok: false, status: 0, text: String((e as Error).message ?? e).slice(0, 160) };
  }
}

// ───────────────────────── 1. Wikidata ─────────────────────────
// The cheapest bulk list in existence, CC0, and it carries the official
// domain — the field we most need. The subclass walk times the endpoint out,
// so we ask one class at a time and union the answers ourselves.

const WD_CLASSES: Array<[string, string, string]> = [
  // [QID, label, our entity_kind]
  ["Q4830453", "business", "private"],
  ["Q783794", "company", "private"],
  ["Q891723", "public company", "listed"],
  ["Q22687", "bank", "private"],
  ["Q3918", "university", "university"],
  ["Q875538", "public university", "university"],
  ["Q189004", "college", "university"],
  ["Q327333", "government agency", "government"],
  ["Q192350", "ministry", "government"],
  ["Q270791", "state-owned enterprise", "government"],
  ["Q1155365", "sovereign wealth fund", "government"],
  ["Q16917", "hospital", "other"],
  ["Q46970", "airline", "private"],
  ["Q219577", "holding company", "private"],
  ["Q43229", "organization", "other"],
  ["Q163740", "nonprofit", "ngo"],
  ["Q79913", "NGO", "ngo"],
  ["Q15911314", "association", "ngo"],
  ["Q31855", "research institute", "university"],
  ["Q1664720", "institute", "university"],
  ["Q11032", "newspaper", "private"],
  ["Q1331793", "media company", "private"],
  ["Q18388277", "technology company", "private"],
  ["Q1058914", "software company", "private"],
  ["Q4287745", "medical organization", "other"],
  ["Q5341295", "educational organization", "university"],
  ["Q2085381", "publisher", "private"],
  ["Q3914", "school", "university"],
  ["Q178706", "institution", "other"],
  ["Q484652", "international organization", "ngo"],
  ["Q6881511", "enterprise", "private"],
  ["Q507619", "retail chain", "private"],
  ["Q7278", "political party", "other"],
];

async function seedWikidata(
  countryQid: string, offset = 0, limit = WD_CLASSES.length,
): Promise<{ ents: Ent[]; notes: string[] }> {
  const ents: Ent[] = [];
  const notes: string[] = [];
  const seen = new Set<string>();
  for (const [qid, label, kind] of WD_CLASSES.slice(offset, offset + limit)) {

    const sparql = `SELECT ?item ?en ?ar ?web ?tick WHERE {
  ?item wdt:P31 wd:${qid} ; wdt:P17 wd:${countryQid} .
  ?item rdfs:label ?en . FILTER(lang(?en)="en")
  OPTIONAL { ?item rdfs:label ?ar . FILTER(lang(?ar)="ar") }
  OPTIONAL { ?item wdt:P856 ?web }
  OPTIONAL { ?item wdt:P249 ?tick } }`;
    let rows: any[] | null = null;
    for (let attempt = 0; attempt < 3 && !rows; attempt++) {
      try {
        const r = await fetch(
          `https://query.wikidata.org/sparql?query=${encodeURIComponent(sparql)}`,
          {
            headers: { Accept: "application/sparql-results+json", "User-Agent": UA },
            signal: AbortSignal.timeout(90_000),
          },
        );
        if (!r.ok) throw new Error(`http_${r.status}`);
        rows = (await r.json())?.results?.bindings ?? [];
      } catch (_) {
        await sleep(4000);
      }
    }
    if (!rows) {
      notes.push(`${label}: query failed`);
      continue;
    }
    let added = 0;
    for (const row of rows) {
      const q = String(row.item?.value ?? "").split("/").pop() ?? "";
      if (!q || seen.has(q)) continue;
      seen.add(q);
      const name = squash(row.en?.value ?? "");
      if (name.length < 3) continue;
      ents.push({
        name,
        name_ar: row.ar?.value ? squash(row.ar.value) : null,
        domain: domainOf(row.web?.value),
        industry: label,
        entity_kind: kind,
        listed_symbol: row.tick?.value ? squash(row.tick.value) : null,
        seed_source: "wikidata",
      });
      added++;
    }
    notes.push(`${label}: ${rows.length} rows, ${added} distinct`);
    await sleep(300);
  }
  return { ents, notes };
}

// ───────────────────────── 2. Wikipedia ─────────────────────────
// CC BY-SA, read through the sanctioned API, then joined back to Wikidata by
// id so the row still carries an official domain where one is recorded.

async function wpApi(params: Record<string, string>): Promise<any> {
  const u = "https://en.wikipedia.org/w/api.php?" +
    new URLSearchParams({ format: "json", formatversion: "2", ...params }).toString();
  const r = await fetch(u, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(45_000) });
  if (!r.ok) throw new Error(`http_${r.status}`);
  return await r.json();
}

const WP_NOISE =
  /^(list of|economy of|history of|geography of|politics of|military of|transport in|communications in|culture of|demographics of|outline of|index of|telecommunications in|tourism in|education in|energy in|mining in|agriculture in|health in|religion in)\b|^saudi arabia$|^(category|template|portal|wikipedia):/i;

/** Titles → Wikidata ids → labels, Arabic labels, official websites, tickers. */
async function wikidataForTitles(titles: string[]): Promise<Map<string, Partial<Ent>>> {
  const byTitle = new Map<string, Partial<Ent>>();
  const qidOfTitle = new Map<string, string>();
  for (let i = 0; i < titles.length; i += 50) {
    const chunk = titles.slice(i, i + 50);
    try {
      const d = await wpApi({ action: "query", prop: "pageprops", titles: chunk.join("|") });
      for (const p of d?.query?.pages ?? []) {
        const q = p?.pageprops?.wikibase_item;
        if (q) qidOfTitle.set(p.title, q);
      }
    } catch (_) { /* a missing join is a missing domain, not a failure */ }
    await sleep(200);
  }
  const qids = [...new Set(qidOfTitle.values())];
  const byQid = new Map<string, Partial<Ent>>();
  for (let i = 0; i < qids.length; i += 50) {
    const chunk = qids.slice(i, i + 50);
    try {
      const u = `https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&props=labels|claims&languages=en|ar&ids=${chunk.join("|")}`;
      const r = await fetch(u, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(60_000) });
      if (!r.ok) throw new Error(`http_${r.status}`);
      const d = await r.json();
      for (const [q, e] of Object.entries<any>(d?.entities ?? {})) {
        const web = e?.claims?.P856?.[0]?.mainsnak?.datavalue?.value;
        const tick = e?.claims?.P249?.[0]?.mainsnak?.datavalue?.value;
        byQid.set(q, {
          name_ar: e?.labels?.ar?.value ?? null,
          domain: domainOf(typeof web === "string" ? web : null),
          listed_symbol: typeof tick === "string" ? tick : null,
        });
      }
    } catch (_) { /* same */ }
    await sleep(200);
  }
  for (const [title, q] of qidOfTitle) {
    const v = byQid.get(q);
    if (v) byTitle.set(title, v);
  }
  return byTitle;
}

async function seedWikipediaLists(): Promise<{ ents: Ent[]; notes: string[] }> {
  const notes: string[] = [];
  const titles = new Set<string>();
  for (const page of ["List of companies of Saudi Arabia", "List of largest companies in Saudi Arabia"]) {
    try {
      const d = await wpApi({ action: "parse", prop: "links", page });
      const links = (d?.parse?.links ?? []).filter((l: any) => l.ns === 0 && l.exists);
      let kept = 0;
      for (const l of links) {
        if (WP_NOISE.test(l.title)) continue;
        titles.add(l.title);
        kept++;
      }
      notes.push(`${page}: ${links.length} links, ${kept} kept`);
    } catch (e) {
      notes.push(`${page}: failed (${String((e as Error).message).slice(0, 60)})`);
    }
    await sleep(300);
  }
  const extra = await wikidataForTitles([...titles]);
  const ents: Ent[] = [...titles].map((t) => ({
    name: t.replace(/\s*\([^)]*\)\s*$/, "").trim(),
    seed_source: "wikipedia_list",
    entity_kind: "private",
    ...extra.get(t),
  }));
  return { ents, notes };
}

async function seedWikipediaCategory(maxDepth = 2): Promise<{ ents: Ent[]; notes: string[] }> {
  const notes: string[] = [];
  const pages = new Set<string>();
  const seenCats = new Set<string>();
  const queue: Array<[string, number]> = [
    ["Category:Companies of Saudi Arabia", 0],
    ["Category:Government agencies of Saudi Arabia", 0],
    ["Category:Universities and colleges in Saudi Arabia", 0],
  ];
  let walked = 0;
  while (queue.length && walked < 220) {
    const [cat, depth] = queue.shift()!;
    if (seenCats.has(cat) || depth > maxDepth) continue;
    seenCats.add(cat);
    walked++;
    let cont: Record<string, string> = {};
    for (let page = 0; page < 6; page++) {
      try {
        const d = await wpApi({
          action: "query", list: "categorymembers", cmtitle: cat,
          cmlimit: "500", cmtype: "page|subcat", ...cont,
        });
        for (const m of d?.query?.categorymembers ?? []) {
          if (m.ns === 14) queue.push([m.title, depth + 1]);
          else if (m.ns === 0 && !WP_NOISE.test(m.title)) pages.add(m.title);
        }
        if (d?.continue) cont = d.continue;
        else break;
      } catch (_) {
        break;
      }
      await sleep(150);
    }
    await sleep(150);
  }
  notes.push(`walked ${walked} categories, ${pages.size} organisation pages`);
  const extra = await wikidataForTitles([...pages]);
  const ents: Ent[] = [...pages].map((t) => ({
    name: t.replace(/\s*\([^)]*\)\s*$/, "").trim(),
    seed_source: "wikipedia_category",
    entity_kind: "private",
    ...extra.get(t),
  }));
  return { ents, notes };
}

// ───────── 3. The directories that are named in the brief ─────────
// Each is attempted honestly. A page that renders its list in the browser
// gives a plain reader nothing, and we record that rather than pretend.

function tableRowNames(html: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/<t[dh][^>]*>([\s\S]{2,200}?)<\/t[dh]>/gi)) {
    const t = squash(m[1].replace(/<[^>]+>/g, " "));
    if (t.length >= 4 && t.length <= 120 && /[A-Za-z\u0600-\u06FF]/.test(t)) out.push(t);
  }
  return out;
}

async function seedHtmlDirectory(
  label: string, url: string, seed_source: string, kind: string,
): Promise<{ ents: Ent[]; notes: string[] }> {
  const r = await getText(url);
  if (!r.ok) return { ents: [], notes: [`${label}: HTTP ${r.status || "no response"} — nothing to read`] };
  const rows = tableRowNames(r.text);
  const names = [...new Set(rows)].filter((n) => /\s/.test(n) && !/^\d+$/.test(n));
  if (!names.length) {
    return {
      ents: [],
      notes: [`${label}: HTTP 200, ${r.text.length} bytes, but no list in the HTML — the page builds its table in the browser`],
    };
  }
  return {
    ents: names.map((n) => ({ name: n, seed_source, entity_kind: kind })),
    notes: [`${label}: ${names.length} names`],
  };
}

// ───────────────────────── writer ─────────────────────────

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
  const body = await req.json().catch(() => ({}));
  const only: string[] | null = Array.isArray(body.sources) ? body.sources : null;
  const dryRun = body.dry_run === true;
  const country = String(body.country ?? "SA");
  const countryQid = String(body.country_qid ?? "Q851");
  const startedAt = new Date().toISOString();

  const want = (s: string) => !only || only.includes(s);
  const collected: Ent[] = [];
  const notes: Record<string, string[]> = {};
  const errors: string[] = [];

  try {
    if (want("wikidata")) {
      const r = await seedWikidata(
        countryQid,
        Number(body.class_offset ?? 0),
        Number(body.class_limit ?? WD_CLASSES.length),
      );
      collected.push(...r.ents);
      notes.wikidata = r.notes;
    }

    if (want("wikipedia_list")) {
      const r = await seedWikipediaLists();
      collected.push(...r.ents);
      notes.wikipedia_list = r.notes;
    }
    if (want("wikipedia_category")) {
      const r = await seedWikipediaCategory();
      collected.push(...r.ents);
      notes.wikipedia_category = r.notes;
    }
    if (want("argaam")) {
      const a = await seedHtmlDirectory(
        "Argaam issuer list", "https://www.argaam.com/en/company/companies-prices/3", "argaam", "listed",
      );
      const b = await seedHtmlDirectory(
        "Argaam 100 ranking", "https://top100.argaam.com/en/ranking", "argaam", "listed",
      );
      collected.push(...a.ents, ...b.ents);
      notes.argaam = [...a.notes, ...b.notes];
    }
    if (want("sama")) {
      const r = await seedHtmlDirectory(
        "SAMA supervised entities", "https://www.sama.gov.sa/en-US/Supervision/Pages/default.aspx", "sama", "private",
      );
      collected.push(...r.ents);
      notes.sama = r.notes;
    }
    if (want("cst")) {
      const r = await seedHtmlDirectory(
        "CST licences directory",
        "https://www.cst.gov.sa/en/regulations-and-licenses/directories/licenses-directory", "cst", "private",
      );
      collected.push(...r.ents);
      notes.cst = r.notes;
    }
    if (want("forbes")) {
      const r = await seedHtmlDirectory(
        "Forbes Middle East lists", "https://www.forbesmiddleeast.com/lists", "forbes_me", "private",
      );
      collected.push(...r.ents);
      notes.forbes_me = r.notes;
    }

    // ── deduplicate hard: once on the normalised name, once on the domain ──
    const byName = new Map<string, Ent>();
    const byDomain = new Map<string, string>();
    let mergedName = 0, mergedDomain = 0;
    for (const e of collected) {
      const key = normName(e.name);
      if (!key || key.length < 3) continue;
      const dom = e.domain ?? null;
      if (dom && byDomain.has(dom) && byDomain.get(dom) !== key) {
        // the same site under two names is one organisation
        mergedDomain++;
        const prior = byName.get(byDomain.get(dom)!);
        if (prior) {
          prior.name_ar ??= e.name_ar ?? null;
          prior.listed_symbol ??= e.listed_symbol ?? null;
        }
        continue;
      }
      const existing = byName.get(key);
      if (existing) {
        mergedName++;
        existing.domain ??= dom;
        existing.name_ar ??= e.name_ar ?? null;
        existing.listed_symbol ??= e.listed_symbol ?? null;
        existing.industry ??= e.industry ?? null;
        if (dom && !byDomain.has(dom)) byDomain.set(dom, key);
        continue;
      }
      byName.set(key, { ...e, domain: dom });
      if (dom) byDomain.set(dom, key);
    }

    const rows = [...byName.values()].map((e) => ({
      name: e.name.slice(0, 200),
      name_ar: e.name_ar ?? null,
      domain: e.domain ?? null,
      country,
      industry: e.industry ?? null,
      entity_kind: e.entity_kind ?? "other",
      listed_symbol: e.listed_symbol ?? null,
      size_hint: e.size_hint ?? null,
      seed_source: e.seed_source,
    }));

    const perSource: Record<string, number> = {};
    for (const r of rows) perSource[r.seed_source] = (perSource[r.seed_source] ?? 0) + 1;

    let inserted = 0, conflicts = 0;
    if (!dryRun) {
      // The unique keys are expressions, so a chunk cannot ask the database to
      // ignore duplicates. A clean chunk goes in whole; a chunk that meets a
      // row we already hold is retried one row at a time.
      for (let i = 0; i < rows.length; i += 100) {
        const chunk = rows.slice(i, i + 100);
        const { data, error } = await admin.from("oe_entities").insert(chunk).select("id");
        if (!error) {
          inserted += data?.length ?? 0;
          continue;
        }
        for (const row of chunk) {
          const { error: e1 } = await admin.from("oe_entities").insert(row);
          if (!e1) inserted++;
          else if ((e1 as any).code === "23505") conflicts++;
          else errors.push(`${row.name}: ${e1.message}`.slice(0, 160));
        }
      }

    }

    const counts = {
      collected: collected.length,
      distinct: rows.length,
      merged_on_name: mergedName,
      merged_on_domain: mergedDomain,
      with_domain: rows.filter((r) => r.domain).length,
      inserted,
      already_held: conflicts,
      per_source: perSource,
    };

    const { data: run } = await admin.from("oe_runs").insert({
      run_kind: "seed_entities", started_at: startedAt, finished_at: new Date().toISOString(),
      outcome: "ok", counts, cost_usd: 0,
    }).select("id").maybeSingle();

    return json({ ok: true, dry_run: dryRun, counts, notes, errors: errors.slice(0, 20), run_id: run?.id ?? null });
  } catch (e) {
    const msg = String((e as Error).message ?? e).slice(0, 500);
    await admin.from("oe_runs").insert({
      run_kind: "seed_entities", started_at: startedAt, finished_at: new Date().toISOString(),
      outcome: "error", counts: { collected: collected.length }, cost_usd: 0, error: msg,
    });
    await logEfError(admin, { function_name: FN, error: e, severity: "high" });
    return json({ ok: false, error: msg, notes }, 500);
  }
});
