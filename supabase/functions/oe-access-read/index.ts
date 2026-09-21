/**
 * oe-access-read — the access reader, on demand.
 *
 * One job: read a host's robots.txt and one page from the edge, with the same
 * fetch path and user agent the resolver uses, and report exactly what was
 * found. It stores nothing. It decides nothing. It is the instrument the
 * access finding is written from, so that a finding is always a reading and
 * never a memory.
 *
 * Input:  { targets: [{ url, phrases?: string[] }], text?: boolean, max_chars?: number }
 * Output: per target — robots rules for "*", whether the path is disallowed,
 *         HTTP status, final URL, byte length, visible-text length, a
 *         JavaScript-rendered heuristic, and which phrases were found verbatim.
 */
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const TIMEOUT = 20_000;

const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const CRON_SECRET = Deno.env.get("cron_secret") || Deno.env.get("CRON_SECRET") || "";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function get(url: string): Promise<{
  ok: boolean; status: number | null; final_url: string | null; bytes: number;
  body: string; error: string | null;
}> {
  const control = new AbortController();
  const timer = setTimeout(() => control.abort(), TIMEOUT);
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: control.signal,
      headers: { "User-Agent": UA, "Accept": "text/html,application/xhtml+xml,text/plain,*/*" },
    });
    const body = await res.text();
    return {
      ok: res.ok, status: res.status, final_url: res.url,
      bytes: new TextEncoder().encode(body).length, body, error: null,
    };
  } catch (e) {
    return { ok: false, status: null, final_url: null, bytes: 0, body: "", error: String(e) };
  } finally {
    clearTimeout(timer);
  }
}

/** The rules that apply to everyone, in the order robots.txt states them. */
function robotsForAll(txt: string): { allow: string[]; disallow: string[] } {
  const allow: string[] = [], disallow: string[] = [];
  let inAll = false;
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) continue;
    const m = line.match(/^([a-z-]+)\s*:\s*(.*)$/i);
    if (!m) continue;
    const key = m[1].toLowerCase(), value = m[2].trim();
    if (key === "user-agent") { inAll = value === "*"; continue; }
    if (!inAll) continue;
    if (key === "allow") allow.push(value);
    if (key === "disallow") disallow.push(value);
  }
  return { allow, disallow };
}

function pathDisallowed(rules: { allow: string[]; disallow: string[] }, path: string): boolean {
  const match = (rule: string) => rule && path.toLowerCase().startsWith(rule.toLowerCase().replace(/\*$/, ""));
  const d = rules.disallow.filter((r) => r && match(r)).sort((a, b) => b.length - a.length)[0] ?? "";
  const a = rules.allow.filter((r) => r && match(r)).sort((a, b) => b.length - a.length)[0] ?? "";
  if (!d) return false;
  return a.length < d.length;
}

function visibleText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

const norm = (s: string) => s.toLowerCase().replace(/[\u2018\u2019\u201c\u201d]/g, "'").replace(/\s+/g, " ").trim();

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const bearer = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const cron = req.headers.get("x-cron-secret") ?? "";
  if (!((SERVICE_ROLE && bearer === SERVICE_ROLE) || (CRON_SECRET && cron === CRON_SECRET))) {
    return json({ error: "forbidden" }, 403);
  }

  let payload: any = {};
  try { payload = await req.json(); } catch { /* empty body is an empty run */ }
  const targets: Array<{ url: string; phrases?: string[] }> = Array.isArray(payload?.targets) ? payload.targets : [];
  const wantText = payload?.text === true;
  const maxChars = Math.min(Number(payload?.max_chars ?? 4000), 60_000);
  if (!targets.length) return json({ error: "no targets" }, 400);

  const robotsCache = new Map<string, { status: number | null; rules: { allow: string[]; disallow: string[] }; raw: string }>();
  const out: any[] = [];

  for (const t of targets.slice(0, 25)) {
    let u: URL;
    try { u = new URL(t.url); } catch { out.push({ url: t.url, error: "bad url" }); continue; }
    const origin = u.origin;

    if (!robotsCache.has(origin)) {
      const r = await get(`${origin}/robots.txt`);
      robotsCache.set(origin, {
        status: r.status,
        rules: robotsForAll(r.body),
        raw: r.body.slice(0, 2000),
      });
    }
    const robots = robotsCache.get(origin)!;
    const disallowed = robots.status === 200 ? pathDisallowed(robots.rules, u.pathname) : false;

    const page = await get(t.url);
    const text = visibleText(page.body);
    const scripts = (page.body.match(/<script\b/gi) ?? []).length;
    const phrases = (t.phrases ?? []).map((p) => ({ phrase: p, found: norm(text).includes(norm(p)) }));

    out.push({
      url: t.url,
      robots_status: robots.status,
      robots_disallow_all_agents: robots.rules.disallow,
      robots_allow_all_agents: robots.rules.allow,
      robots_raw: robots.raw,
      path_disallowed: disallowed,
      status: page.status,
      final_url: page.final_url,
      bytes: page.bytes,
      text_chars: text.length,
      script_tags: scripts,
      /** a page whose markup is large and whose visible text is thin is rendered by script */
      js_rendered: page.bytes > 20_000 && text.length < 1500,
      phrases,
      error: page.error,
      text: wantText ? text.slice(0, maxChars) : undefined,
    });
  }

  return json({ ok: true, read_at: new Date().toISOString(), results: out });
});
