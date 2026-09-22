/**
 * oe-harvest — the wide, cheap layer that sits in front of the reader.
 *
 * It takes one source, pulls every link it publishes, and keeps only what a
 * list page already tells us: link, title, snippet, date. No model is called
 * here and no scraping service is used, so a run costs nothing. Judgement
 * happens later, in oe-triage, and reading happens later still.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { logEfError } from "../_shared/observe.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const FN = "oe-harvest";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const MAX_PER_FEED = 400;
const FETCH_TIMEOUT = 20_000;

type Cand = {
  url: string;
  title?: string | null;
  snippet?: string | null;
  published_at?: string | null;
  lang?: string | null;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const squash = (s: string) => (s || "").replace(/\s+/g, " ").trim();

function stripTags(html: string): string {
  return squash(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#\d+;/g, " "),
  );
}

function canonicalise(raw: string): string {
  try {
    const u = new URL(raw);
    u.hash = "";
    for (const p of [...u.searchParams.keys()]) {
      if (/^utm_|^fbclid$|^gclid$|^ref$/i.test(p)) u.searchParams.delete(p);
    }
    let s = u.toString();
    if (s.endsWith("/") && u.pathname !== "/") s = s.slice(0, -1);
    return s;
  } catch {
    return raw;
  }
}

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function hostOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; }
}

function guessLang(text: string): string {
  return /[\u0600-\u06FF]/.test(text || "") ? "ar" : "en";
}

async function get(url: string, accept = "text/html,application/xhtml+xml,application/xml") {
  return await fetch(url, {
    headers: { "User-Agent": UA, "Accept": accept, "Accept-Language": "ar,en;q=0.8" },
    redirect: "follow",
    signal: AbortSignal.timeout(FETCH_TIMEOUT),
  });
}

/**
 * robots.txt, read the plain way: the rules addressed to everyone, plus any
 * addressed to us. A disallowed path is simply not fetched.
 */
async function robotsDisallows(origin: string): Promise<string[]> {
  try {
    const r = await get(`${origin}/robots.txt`, "text/plain");
    if (!r.ok) return [];
    const text = (await r.text()).slice(0, 100_000);
    const out: string[] = [];
    let listening = false;
    for (const line of text.split(/\r?\n/)) {
      const l = line.split("#")[0].trim();
      if (/^user-agent:/i.test(l)) {
        const agent = l.split(":")[1]?.trim().toLowerCase() ?? "";
        listening = agent === "*";
        continue;
      }
      if (listening && /^disallow:/i.test(l)) {
        const path = l.slice(l.indexOf(":") + 1).trim();
        if (path) out.push(path);
      }
    }
    return out;
  } catch {
    return [];
  }
}

function robotsAllows(disallows: string[], url: string): boolean {
  try {
    const path = new URL(url).pathname;
    return !disallows.some((d) => d === "/" || path.startsWith(d.replace(/\*$/, "")));
  } catch {
    return true;
  }
}

// ───────── parsers, one per source kind, all text-only ─────────

function tagText(block: string, tag: string): string {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  if (!m) return "";
  return squash(m[1].replace(/<!\[CDATA\[|\]\]>/g, "").replace(/<[^>]+>/g, " "));
}

function parseRss(xml: string): Cand[] {
  const out: Cand[] = [];
  for (const m of xml.matchAll(/<item[\s\S]*?<\/item>/gi)) {
    const block = m[0];
    const url = tagText(block, "link") || (block.match(/<guid[^>]*>([\s\S]*?)<\/guid>/i)?.[1] ?? "").trim();
    if (!/^https?:/i.test(url)) continue;
    const date = tagText(block, "pubDate") || tagText(block, "dc:date");
    out.push({
      url,
      title: tagText(block, "title"),
      snippet: stripTags(tagText(block, "description")).slice(0, 600),
      published_at: date ? new Date(date).toISOString() : null,
    });
  }
  return out;
}

function parseAtom(xml: string): Cand[] {
  const out: Cand[] = [];
  for (const m of xml.matchAll(/<entry[\s\S]*?<\/entry>/gi)) {
    const block = m[0];
    const href = block.match(/<link[^>]*href=["']([^"']+)["']/i)?.[1] ?? "";
    if (!/^https?:/i.test(href)) continue;
    const date = tagText(block, "updated") || tagText(block, "published");
    out.push({
      url: href,
      title: tagText(block, "title"),
      snippet: stripTags(tagText(block, "summary") || tagText(block, "content")).slice(0, 600),
      published_at: date ? new Date(date).toISOString() : null,
    });
  }
  return out;
}

function parseSitemap(xml: string): Cand[] {
  const out: Cand[] = [];
  for (const m of xml.matchAll(/<url>[\s\S]*?<\/url>/gi)) {
    const block = m[0];
    const loc = tagText(block, "loc");
    if (!/^https?:/i.test(loc)) continue;
    const date = tagText(block, "lastmod");
    const slug = decodeURIComponent(loc.split("/").filter(Boolean).pop() ?? "");
    out.push({
      url: loc,
      title: squash(slug.replace(/[-_]+/g, " ").replace(/\.\w+$/, "")),
      snippet: null,
      published_at: date ? new Date(date).toISOString() : null,
    });
  }
  return out;
}

/** Telegram's public preview page: message text and its date, nothing private. */
function parseTelegram(html: string, base: string): Cand[] {
  const out: Cand[] = [];
  for (const m of html.matchAll(/<div class="tgme_widget_message_bubble"[\s\S]*?<\/div>\s*<\/div>/gi)) {
    const block = m[0];
    const text = stripTags(block.match(/<div class="tgme_widget_message_text[\s\S]*?<\/div>/i)?.[0] ?? "");
    if (text.length < 40) continue;
    const link = block.match(/href="(https:\/\/t\.me\/[^"]+\/\d+)"/i)?.[1]
      ?? `${base}#${out.length}`;
    const date = block.match(/datetime="([^"]+)"/i)?.[1] ?? null;
    out.push({
      url: link,
      title: text.slice(0, 160),
      snippet: text.slice(0, 600),
      published_at: date ? new Date(date).toISOString() : null,
      lang: guessLang(text),
    });
  }
  return out;
}

/** A plain HTML list, read through the selector stored on the source. */
function parseHtmlList(html: string, pageUrl: string, selector: string | null): Cand[] {
  const out: Cand[] = [];
  const seen = new Set<string>();
  // Deno edge has no DOM. We read anchors, and where a selector names a class
  // or path fragment we keep only the anchors whose markup carries it.
  const hint = (selector ?? "").replace(/^[.#]/, "").trim().toLowerCase();
  for (const m of html.matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]{0,300}?)<\/a>/gi)) {
    let href = m[1];
    const text = squash(stripTags(m[2]));
    if (!text || text.length < 12) continue;
    try { href = new URL(href, pageUrl).toString(); } catch { continue; }
    if (!/^https?:/i.test(href)) continue;
    if (hint && !(m[0].toLowerCase().includes(hint) || href.toLowerCase().includes(hint))) continue;
    const key = canonicalise(href);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ url: href, title: text.slice(0, 200), snippet: text.slice(0, 600), lang: guessLang(text) });
  }
  return out;
}

/**
 * A page that renders client-side but ships its list inside the page's own
 * JSON payload (Next.js and friends). We read only what the page already
 * carries in public HTML — never a private API.
 *
 * `template` is the detail-page pattern held on the feed, e.g.
 * "https://www.spa.gov.sa/en/{id}".
 */
function parseEmbeddedJson(html: string, template: string | null): Cand[] {
  if (!template || !template.includes("{id}")) return [];
  const out: Cand[] = [];
  const seen = new Set<string>();
  const unescape = (s: string) =>
    s.replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
      .replace(/\\"/g, '"').replace(/\\\\/g, "\\").replace(/\\n/g, " ");
  const re =
    /"(?:uuid|id|slug)"\s*:\s*"([A-Za-z0-9][\w-]{3,64})"[\s\S]{0,400}?"title"\s*:\s*"((?:[^"\\]|\\.){8,300})"/g;
  for (const m of html.matchAll(re)) {
    const id = m[1];
    const title = squash(unescape(m[2]));
    if (!title || title.length < 12) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    const tail = html.slice(m.index ?? 0, (m.index ?? 0) + 1200);
    const epoch = tail.match(/"published_at"\s*:\s*(\d{9,13})/)?.[1];
    const iso = tail.match(/"(?:published_at|date|created_at)"\s*:\s*"([^"]{8,40})"/)?.[1];
    let published: string | null = null;
    if (epoch) published = new Date(Number(epoch) * (epoch.length > 10 ? 1 : 1000)).toISOString();
    else if (iso && !isNaN(Date.parse(iso))) published = new Date(iso).toISOString();
    out.push({
      url: template.replace("{id}", encodeURIComponent(id)),
      title: title.slice(0, 200),
      snippet: title.slice(0, 600),
      published_at: published,
      lang: guessLang(title),
    });
  }
  return out;
}

/**
 * A JSON list: the first array of objects, or an object whose values are
 * objects (the World Bank shape). Where the records carry no link of their
 * own, the feed may hold a detail-page template in list_selector.
 */
function parseJsonApi(body: any, pageUrl: string, template?: string | null): Cand[] {
  const pick = (o: any, keys: string[]) => {
    for (const k of keys) {
      const v = o?.[k];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
    return "";
  };
  let arr: any[] | null = Array.isArray(body) ? body : null;
  if (!arr && body && typeof body === "object") {
    for (const v of Object.values(body)) {
      if (Array.isArray(v) && v.length && typeof v[0] === "object") { arr = v as any[]; break; }
      if (v && typeof v === "object" && !Array.isArray(v)) {
        const vals = Object.values(v as Record<string, unknown>);
        if (vals.length && vals.every((x) => x && typeof x === "object")) { arr = vals as any[]; break; }
      }
    }
  }
  if (!arr) return [];
  const idTemplate = template && template.includes("{id}") ? template : null;
  const out: Cand[] = [];
  for (const o of arr) {
    let url = pick(o, ["url", "link", "href", "permalink", "notice_url", "detail_url"]);
    if (!url && idTemplate) {
      const id = pick(o, ["id", "proj_id", "project_id", "code"]);
      if (id) url = idTemplate.replace("{id}", encodeURIComponent(id));
    }
    if (!url) continue;
    try { url = new URL(url, pageUrl).toString(); } catch { continue; }
    const title = pick(o, ["title", "name", "subject", "headline", "notice_title", "project_name"]);
    const snippet = pick(o, [
      "description", "summary", "snippet", "body", "details",
      "pdo", "impagency", "borrower", "sector1",
    ]);
    const date = pick(o, [
      "published_at", "date", "created_at", "publication_date", "noticedate", "boardapprovaldate",
    ]);
    out.push({
      url,
      title: title.slice(0, 200),
      snippet: stripTags(snippet).slice(0, 600),
      published_at: date ? (isNaN(Date.parse(date)) ? null : new Date(date).toISOString()) : null,
      lang: guessLang(`${title} ${snippet}`),
    });
  }
  return out;
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

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const body = await req.json().catch(() => ({}));
  const feedId = body.feed_id as string | undefined;
  const limitFeeds = Math.min(Number(body.max_feeds ?? 12), 40);

  const { data: policy } = await admin
    .from("oe_policy_versions").select("params").eq("active", true).maybeSingle();
  // One skip list, read by every door: what robots refuse AND what policy skips.
  const neverRead: string[] = [
    ...(((policy?.params as any)?.never_read ?? []) as string[]),
    ...(((policy?.params as any)?.discovery_skip_hosts ?? []) as string[]),
  ];

  const HARVEST_KINDS = [
    "rss", "atom", "sitemap", "json_api", "html_list", "embedded_json", "telegram",
  ];
  let q = admin.from("oe_feeds")
    .select("id,name,kind,url,list_selector,terms_ok,active,language")
    .eq("active", true).eq("terms_ok", true).in("kind", HARVEST_KINDS).not("url", "is", null);
  if (feedId) q = q.eq("id", feedId);
  const { data: feeds, error: feedErr } = await q
    .order("last_fetched_at", { ascending: true, nullsFirst: true }).limit(limitFeeds);
  if (feedErr) return json({ error: feedErr.message }, 500);

  const startedAt = new Date().toISOString();
  const counts = { feeds: 0, fetched: 0, new: 0, duplicate: 0, errors: 0, skipped_robots: 0 };
  const perFeed: Array<Record<string, unknown>> = [];

  for (const feed of feeds ?? []) {
    const url = feed.url as string;
    const host = hostOf(url);
    if (neverRead.some((b) => host === b || host.endsWith(`.${b}`))) {
      counts.skipped_robots++;
      continue;
    }
    counts.feeds++;
    let fetched = 0, added = 0, dupes = 0;
    try {
      const origin = new URL(url).origin;
      const disallows = await robotsDisallows(origin);
      if (!robotsAllows(disallows, url)) {
        counts.skipped_robots++;
        perFeed.push({ feed: feed.name, skipped: "robots_disallow" });
        await admin.from("oe_feeds").update({
          last_fetched_at: new Date().toISOString(),
          last_error: "robots.txt disallows this path",
        }).eq("id", feed.id);
        continue;
      }

      const r = await get(url, feed.kind === "json_api" ? "application/json" : undefined);
      if (!r.ok) throw new Error(`http_${r.status}`);
      let cands: Cand[] = [];
      if (feed.kind === "json_api") {
        cands = parseJsonApi(await r.json().catch(() => null), url, feed.list_selector ?? null);
      } else {
        const text = await r.text();
        cands = feed.kind === "rss"
          ? parseRss(text)
          : feed.kind === "atom"
          ? parseAtom(text)
          : feed.kind === "sitemap"
          ? parseSitemap(text)
          : feed.kind === "telegram"
          ? parseTelegram(text, url)
          : feed.kind === "embedded_json"
          ? parseEmbeddedJson(text, feed.list_selector ?? null)
          : parseHtmlList(text, url, feed.list_selector ?? null);
        // A selector that matches nothing is worse than no selector at all.
        if (!cands.length && feed.kind === "html_list") cands = parseHtmlList(text, url, null);
        // Some sources call themselves RSS and serve Atom, or the other way round.
        if (!cands.length && /<entry[\s>]/i.test(text)) cands = parseAtom(text);
        if (!cands.length && /<item[\s>]/i.test(text)) cands = parseRss(text);
      }

      cands = cands.filter((c) => robotsAllows(disallows, c.url)).slice(0, MAX_PER_FEED);
      fetched = cands.length;
      counts.fetched += fetched;

      // Deduplicate against what we already hold before writing anything.
      const rows: Record<string, unknown>[] = [];
      const seenHere = new Set<string>();
      for (const c of cands) {
        const canonical = canonicalise(c.url);
        if (seenHere.has(canonical)) { dupes++; continue; }
        seenHere.add(canonical);
        const hash = await sha256(
          `${squash(c.title ?? "").toLowerCase()}|${squash(c.snippet ?? "").slice(0, 200).toLowerCase()}`,
        );
        rows.push({
          feed_id: feed.id,
          url: c.url,
          canonical_url: canonical,
          title: c.title ?? null,
          snippet: c.snippet ?? null,
          published_at: c.published_at ?? null,
          lang: c.lang ?? (feed.language === "ar" ? "ar" : guessLang(`${c.title} ${c.snippet}`)),
          content_hash: hash,
          raw: { source_kind: feed.kind, feed_name: feed.name },
        });
      }

      const hashes = rows.map((r) => r.content_hash as string);
      const known = new Set<string>();
      for (let i = 0; i < hashes.length; i += 200) {
        const { data: seen } = await admin.from("oe_candidates")
          .select("content_hash").in("content_hash", hashes.slice(i, i + 200));
        for (const s of seen ?? []) known.add(s.content_hash as string);
      }
      const fresh = rows.filter((r) => !known.has(r.content_hash as string));
      dupes += rows.length - fresh.length;

      for (let i = 0; i < fresh.length; i += 100) {
        const chunk = fresh.slice(i, i + 100);
        const { error, count } = await admin.from("oe_candidates")
          .upsert(chunk, { onConflict: "canonical_url", ignoreDuplicates: true, count: "exact" });
        if (error) throw new Error(error.message);
        added += count ?? chunk.length;
      }
      counts.new += added;
      counts.duplicate += dupes;

      // Source health: candidates per run, averaged gently over past runs.
      const prior = Number((feed as any).harvest_yield ?? NaN);
      const yieldNow = Number.isFinite(prior) ? prior * 0.8 + fetched * 0.2 : fetched;
      await admin.from("oe_feeds").update({
        last_fetched_at: new Date().toISOString(),
        last_error: null,
        harvest_yield: +yieldNow.toFixed(2),
        ...(added ? { last_changed_at: new Date().toISOString() } : {}),
      }).eq("id", feed.id);
      perFeed.push({ feed: feed.name, kind: feed.kind, fetched, added, duplicate: dupes });
    } catch (e) {
      counts.errors++;
      const msg = String((e as Error).message ?? e).slice(0, 300);
      perFeed.push({ feed: feed.name, kind: feed.kind, error: msg });
      await admin.from("oe_feeds").update({
        last_fetched_at: new Date().toISOString(), last_error: msg,
      }).eq("id", feed.id);
      // A caught exception is an error, not background noise.
      await logEfError(admin, { function_name: FN, error: e, severity: "error", context: { feed_id: feed.id } });
    }
  }

  const { data: run } = await admin.from("oe_runs").insert({
    run_kind: "harvest", feed_id: feedId ?? null,
    started_at: startedAt, finished_at: new Date().toISOString(),
    outcome: counts.errors && !counts.new ? "error" : "ok",
    counts, cost_usd: 0,
  }).select("id").maybeSingle();

  return json({ ok: true, counts, feeds: perFeed, run_id: run?.id ?? null });
});
