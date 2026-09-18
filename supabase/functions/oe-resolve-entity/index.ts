/**
 * oe-resolve-entity — the factory floor.
 *
 * One organisation at a time: find its domain, find where it posts its roles,
 * and recognise which applicant-tracking system it runs. Recognition is the
 * whole point — an organisation we can name but not read is worth little,
 * while an organisation whose board we can call by its exact token becomes a
 * keyless feed for ever after.
 *
 * No model is called here. Every detection below is a pattern that either
 * matches the page or does not.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { logEfError } from "../_shared/observe.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const FN = "oe-resolve-entity";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const TIMEOUT = 9_000;

const CAREERS_PATHS = [
  "/careers", "/en/careers", "/jobs", "/career", "/ar/careers",
  "/about/careers", "/en/jobs", "/join-us", "/en/about-us/careers",
];
/** The other usual door: a careers host beside the main site, not a guess at a domain. */
const CAREERS_HOSTS = ["careers", "jobs", "career"];
const CAREERS_TEXT = /careers?|jobs|vacanc|join us|opportunit|وظائف|التوظيف|الوظائف|انضم/i;
const NEWSROOM_TEXT = /newsroom|news\s*room|media\s*cent|press\s*release|press\s*cent|\bnews\b|\bmedia\b|الأخبار|المركز الإعلامي|البيانات الصحفية/i;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const squash = (s: string) => (s || "").replace(/\s+/g, " ").trim();

type Fetched = { ok: boolean; status: number; finalUrl: string; body: string };

async function get(url: string, method: "GET" | "HEAD" = "GET"): Promise<Fetched> {
  try {
    const r = await fetch(url, {
      method,
      headers: { "User-Agent": UA, "Accept-Language": "en,ar;q=0.8" },
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT),
    });
    const body = method === "GET" && r.ok ? (await r.text()).slice(0, 400_000) : "";
    return { ok: r.ok, status: r.status, finalUrl: r.url || url, body };
  } catch {
    return { ok: false, status: 0, finalUrl: url, body: "" };
  }
}

/** robots.txt, read the plain way. An unreadable file is silence, not a refusal. */
async function robotsDisallows(origin: string): Promise<string[]> {
  const r = await get(`${origin}/robots.txt`);
  if (!r.ok) return [];
  const out: string[] = [];
  let listening = false;
  for (const line of r.body.slice(0, 100_000).split(/\r?\n/)) {
    const l = line.split("#")[0].trim();
    if (/^user-agent:/i.test(l)) {
      listening = (l.split(":")[1]?.trim() ?? "") === "*";
      continue;
    }
    if (listening && /^disallow:/i.test(l)) {
      const p = l.slice(l.indexOf(":") + 1).trim();
      if (p) out.push(p);
    }
  }
  return out;
}

function allowed(disallows: string[], url: string): boolean {
  try {
    const path = new URL(url).pathname;
    return !disallows.some((d) => d === "/" || path.startsWith(d.replace(/\*$/, "")));
  } catch {
    return true;
  }
}

// ───────────────────── the fingerprints ─────────────────────
// Each returns the platform, the exact token, and the keyless endpoint that
// token unlocks. Case is preserved wherever the platform is case-sensitive.

type Print = { platform: string; token: string; endpoint: string };

function fingerprint(url: string, html: string): Print | null {
  const hay = `${url}\n${html.slice(0, 250_000)}`;

  let m = hay.match(/(?:job-boards|boards)\.greenhouse\.io\/(?:embed\/job_board\?for=)?([a-zA-Z0-9_-]{2,60})/);
  if (!m) m = hay.match(/boards\.greenhouse\.io\/embed\/job_board\/js\?for=([a-zA-Z0-9_-]{2,60})/);
  if (!m && /<div[^>]+id=["']grnhse_app["']/i.test(hay)) {
    const t = hay.match(/grnhse[^]{0,400}?for=([a-zA-Z0-9_-]{2,60})/)?.[1];
    if (t) m = [t, t] as unknown as RegExpMatchArray;
  }
  if (m && !/^(embed|job_board|js)$/i.test(m[1])) {
    return {
      platform: "greenhouse", token: m[1],
      endpoint: `https://boards-api.greenhouse.io/v1/boards/${m[1]}/jobs`,
    };
  }

  m = hay.match(/jobs\.(eu\.)?lever\.co\/([a-zA-Z0-9_.-]{2,60})/);
  if (m) {
    const eu = !!m[1];
    return {
      platform: "lever", token: m[2],
      endpoint: `https://api.${eu ? "eu." : ""}lever.co/v0/postings/${m[2]}?mode=json`,
    };
  }

  m = hay.match(/jobs\.ashbyhq\.com\/([A-Za-z0-9_.-]{2,60})/);
  if (m) {
    return {
      platform: "ashby", token: m[1], // case-sensitive, taken verbatim
      endpoint: `https://api.ashbyhq.com/posting-api/job-board/${m[1]}`,
    };
  }

  m = hay.match(/(?:jobs|careers)\.smartrecruiters\.com\/([A-Za-z0-9_.-]{2,60})/);
  if (m) {
    return {
      platform: "smartrecruiters", token: m[1],
      endpoint: `https://api.smartrecruiters.com/v1/companies/${m[1]}/postings`,
    };
  }

  m = hay.match(/https?:\/\/([a-zA-Z0-9-]{2,60})\.(wd\d{1,2})\.myworkdayjobs\.com\/(?:wday\/cxs\/[^/]+\/)?(?:([a-z]{2}-[A-Z]{2})\/)?([A-Za-z0-9_-]{2,80})/);
  if (m) {
    const [, tenant, wd, , site] = m;
    return {
      platform: "workday", token: `${tenant}|${wd}|${site}`,
      endpoint: `https://${tenant}.${wd}.myworkdayjobs.com/wday/cxs/${tenant}/${site}/jobs`,
    };
  }

  m = hay.match(/apply\.workable\.com\/([a-zA-Z0-9_-]{2,60})/);
  if (m && !/^api$/i.test(m[1])) {
    return {
      platform: "workable", token: m[1],
      endpoint: `https://apply.workable.com/api/v1/widget/accounts/${m[1]}`,
    };
  }

  m = hay.match(/https?:\/\/([a-zA-Z0-9-]{2,60})\.recruitee\.com/);
  if (m) {
    return {
      platform: "recruitee", token: m[1],
      endpoint: `https://${m[1]}.recruitee.com/api/offers/`,
    };
  }

  m = hay.match(/https?:\/\/([a-zA-Z0-9-]{2,60})\.jobs\.personio\.(?:de|com)/);
  if (m) {
    return {
      platform: "personio", token: m[1],
      endpoint: `https://${m[1]}.jobs.personio.de/xml?language=en`,
    };
  }

  m = hay.match(/https?:\/\/([a-zA-Z0-9-]{2,60})\.pinpointhq\.com/);
  if (m) {
    return {
      platform: "pinpoint", token: m[1],
      endpoint: `https://${m[1]}.pinpointhq.com/postings.json`,
    };
  }

  // SuccessFactors recruiting marketing: by far the most common system in the
  // Kingdom. Three tells, any one of which is conclusive: the /go/{Slug}/{id}/
  // category links, a relative /job/{slug}/{id}/ role link, or the sapsf host
  // the page loads its own machinery from. The list itself lives at /search.
  const sfHost = (() => {
    try { return new URL(url).origin; } catch { return null; }
  })();
  const sfGo = /\/go\/[A-Za-z0-9%_-]{2,80}\/\d{3,12}\//.test(hay);
  const sfJob = /href=["'][^"']*\/job\/[A-Za-z0-9%_&;.,-]{2,120}\/\d{4,12}\//.test(hay);
  const sfMachinery = /career\d?\.sapsf\.com|successfactors|rmkcdn\.successfactors|sfmc-|jobDetailsShareButtons/i.test(hay);
  if (sfHost && (sfGo || sfJob || sfMachinery)) {
    return {
      platform: "successfactors_rmk", token: sfHost,
      endpoint: `${sfHost}/search/?q=`,
    };
  }
  m = hay.match(/career\d?\.sapsf\.com\/careers\?company=([A-Za-z0-9_-]{2,40})/);
  if (m) {
    return {
      platform: "successfactors_rmk", token: m[1],
      endpoint: `https://career4.sapsf.com/careers?company=${m[1]}`,
    };
  }

  // Oracle Recruiting Cloud. The candidate-experience path is the reliable tell.
  m = hay.match(/https?:\/\/([a-zA-Z0-9-]+)\.([a-z0-9-]+)\.oraclecloud\.com\/hcmUI\/CandidateExperience\/([a-z]{2}\/sites\/([A-Za-z0-9_-]+))?/);
  if (m) {
    const site = m[4] ?? "";
    return {
      platform: "oracle_orc", token: `${m[1]}|${m[2]}|${site}`,
      endpoint:
        `https://${m[1]}.${m[2]}.oraclecloud.com/hcmRestApi/resources/latest/recruitingCEJobRequisitions` +
        `?onlyData=true&expand=requisitionList&finder=findReqs;siteNumber=CX_1,limit=100`,
    };
  }

  m = hay.match(/https?:\/\/([a-zA-Z0-9-]{2,60})\.taleo\.net\/careersection/);
  if (m) {
    return {
      platform: "taleo", token: m[1],
      endpoint: `https://${m[1]}.taleo.net/careersection/`,
    };
  }
  m = hay.match(/tbe\.taleo\.net\/(CH\w{2})\/ats\/careers\/[^"'\s]*org=([A-Za-z0-9_-]+)/i);
  if (m) {
    return {
      platform: "taleo", token: `${m[1]}|${m[2]}`,
      endpoint: `https://tbe.taleo.net/${m[1]}/ats/careers/v2/searchResults?org=${m[2]}`,
    };
  }

  return null;
}

/** Links on a page whose visible text names the thing we are looking for. */
function linkByText(html: string, base: string, re: RegExp): string | null {
  for (const m of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]{0,200}?)<\/a>/gi)) {
    const text = squash(m[2].replace(/<[^>]+>/g, " "));
    if (!text || !re.test(text)) continue;
    try {
      const u = new URL(m[1], base);
      if (!/^https?:$/.test(u.protocol)) continue;
      return u.toString();
    } catch { /* keep looking */ }
  }
  return null;
}

/** One search, and only when the list gave us no website at all. */
async function searchDomain(key: string, name: string): Promise<string | null> {
  try {
    const r = await fetch("https://api.firecrawl.dev/v2/search", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: `${name} Saudi Arabia official website`, limit: 3 }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!r.ok) return null;
    const d = await r.json();
    const list = d?.data?.web ?? d?.data ?? [];
    for (const item of Array.isArray(list) ? list : []) {
      const u = item?.url;
      if (typeof u !== "string") continue;
      const host = new URL(u).hostname.replace(/^www\./, "").toLowerCase();
      if (/wikipedia|linkedin|facebook|youtube|twitter|x\.com|bloomberg|crunchbase|zawya|argaam/.test(host)) continue;
      return host;
    }
  } catch { /* a failed search is simply no answer */ }
  return null;
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
  const jobId = body.job_id as string | undefined;
  const startedAt = new Date().toISOString();
  const deadline = Date.now() + 100_000;

  const { data: policy } = await admin
    .from("oe_policy_versions").select("params").eq("active", true).maybeSingle();
  const params = (policy?.params ?? {}) as Record<string, any>;
  const neverRead: string[] = params.never_read ?? [];
  const batch = Math.min(Number(body.batch ?? params.resolve_batch ?? 60), 200);
  const concurrency = Math.min(Number(body.concurrency ?? params.resolve_concurrency ?? 8), 16);
  let searchBudget = Number(body.search_budget ?? params.resolve_search_budget ?? 8);
  const firecrawlKey = Deno.env.get("FIRECRAWL_API_KEY") || "";

  const counts: Record<string, any> = {
    seen: 0, resolved: 0, no_ats: 0, no_careers: 0, failed: 0,
    searched: 0, by_platform: {} as Record<string, number>,
  };
  const detail: Array<Record<string, unknown>> = [];

  try {
    // An organisation whose list already carried its official website costs
    // nothing to resolve, so those go first. The ones needing a paid search
    // wait for the search budget to come round.
    let q = admin.from("oe_entities")
      .select("id, name, domain, careers_url")
      .in("resolve_status", Array.isArray(body.recheck) ? body.recheck : ["new"])
      .order("last_resolved_at", { ascending: true, nullsFirst: true })
      .order("domain", { ascending: true, nullsFirst: false })
      .limit(batch);
    if (body.with_domain_only === true) q = q.not("domain", "is", null);
    if (body.entity_id) q = admin.from("oe_entities")
      .select("id, name, domain, careers_url").eq("id", body.entity_id);

    const { data: ents, error } = await q;
    if (error) throw new Error(error.message);
    if (!ents?.length) {
      if (jobId) await admin.rpc("complete_job", { p_id: jobId, p_success: true, p_error: null });
      return json({ ok: true, counts, note: "nothing new to resolve" });
    }

    /** One organisation, start to finish. */
    async function resolveOne(e: any) {
      const update: Record<string, unknown> = { last_resolved_at: new Date().toISOString() };
      try {
        // 1. the domain. Never guessed.
        let domain: string | null = e.domain ?? null;
        if (!domain && firecrawlKey && searchBudget > 0) {
          searchBudget--;
          counts.searched++;
          domain = await searchDomain(firecrawlKey, e.name);
          if (domain) update.domain = domain;
        }
        if (!domain) {
          counts.failed++;
          await admin.from("oe_entities").update({
            ...update, resolve_status: "failed",
            resolve_error: firecrawlKey ? "no website on the list and no search result" : "no website on the list",
          }).eq("id", e.id);
          detail.push({ name: e.name, result: "failed", why: "no domain" });
          return;
        }
        if (neverRead.some((b: string) => domain === b || domain!.endsWith(`.${b}`))) {
          counts.failed++;
          await admin.from("oe_entities").update({
            ...update, resolve_status: "failed", resolve_error: "domain is on the never-read list",
          }).eq("id", e.id);
          return;
        }

        const origin = `https://${domain}`;
        // robots and the homepage are wanted whatever happens next, so they
        // are asked for at the same time as the usual careers doors.
        const doors = [
          ...CAREERS_HOSTS.map((h) => `https://${h}.${domain}`),
          ...CAREERS_PATHS.map((p) => origin + p),
        ];
        const [disallows, homeFirst, ...probes] = await Promise.all([
          robotsDisallows(origin),
          get(origin),
          ...doors.map((d) => get(d)),
        ]);

        // 2. the careers page: the first usual door that answers, in priority
        // order, and only where robots permits it.
        let careers: Fetched | null = null;
        for (let i = 0; i < doors.length; i++) {
          const r = probes[i];
          if (doors[i].startsWith(origin) && !allowed(disallows, doors[i])) continue;
          if (r.ok && r.body.length > 500) { careers = r; break; }
        }
        const home: Fetched = homeFirst;
        if (!careers && home.ok) {
          const link = linkByText(home.body, home.finalUrl, CAREERS_TEXT);
          if (link && allowed(disallows, link)) {
            const r = await get(link);
            if (r.ok) careers = r;
          }
        }

        // 4. the newsroom, by the same link-text method.
        const newsroom = home.ok ? linkByText(home.body, home.finalUrl, NEWSROOM_TEXT) : null;
        if (newsroom) update.newsroom_url = newsroom;

        if (!careers) {
          counts.no_careers++;
          await admin.from("oe_entities").update({
            ...update, resolve_status: "no_careers", resolve_error: null,
          }).eq("id", e.id);
          detail.push({ name: e.name, domain, result: "no_careers" });
          return;
        }
        update.careers_url = careers.finalUrl;

        // 3. the fingerprint — read off the final URL and the page source.
        const print = fingerprint(careers.finalUrl, careers.body);
        if (!print) {
          counts.no_ats++;
          await admin.from("oe_entities").update({
            ...update, resolve_status: "no_ats", resolve_error: null,
          }).eq("id", e.id);
          detail.push({ name: e.name, domain, result: "no_ats", careers: careers.finalUrl });
          return;
        }
        counts.resolved++;
        counts.by_platform[print.platform] = (counts.by_platform[print.platform] ?? 0) + 1;
        await admin.from("oe_entities").update({
          ...update, resolve_status: "resolved", resolve_error: null,
          ats_platform: print.platform, ats_token: print.token, ats_endpoint: print.endpoint,
        }).eq("id", e.id);
        detail.push({ name: e.name, domain, result: print.platform, token: print.token });
      } catch (err) {
        counts.failed++;
        await admin.from("oe_entities").update({
          resolve_status: "failed",
          resolve_error: String((err as Error).message ?? err).slice(0, 300),
          last_resolved_at: new Date().toISOString(),
        }).eq("id", e.id);
      }
    }

    // A pool, because the wall clock, not the network, is what limits a run.
    const queue = [...ents];
    const lanes = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
      while (queue.length && Date.now() < deadline) {
        const e = queue.shift()!;
        counts.seen++;
        await resolveOne(e);
      }
    });
    await Promise.all(lanes);


    const { count: remaining } = await admin.from("oe_entities")
      .select("id", { count: "exact", head: true }).eq("resolve_status", "new");

    await admin.from("oe_runs").insert({
      run_kind: "resolve_entity", started_at: startedAt, finished_at: new Date().toISOString(),
      outcome: "ok", counts: { ...counts, remaining_new: remaining ?? 0 }, cost_usd: 0,
    });
    if (jobId) await admin.rpc("complete_job", { p_id: jobId, p_success: true, p_error: null });

    return json({ ok: true, counts, remaining_new: remaining ?? 0, detail: detail.slice(0, 40) });
  } catch (e) {
    const msg = String((e as Error).message ?? e).slice(0, 500);
    await admin.from("oe_runs").insert({
      run_kind: "resolve_entity", started_at: startedAt, finished_at: new Date().toISOString(),
      outcome: "error", counts, cost_usd: 0, error: msg,
    });
    await logEfError(admin, { function_name: FN, error: e, severity: "medium" });
    if (jobId) await admin.rpc("complete_job", { p_id: jobId, p_success: false, p_error: msg });
    return json({ ok: false, error: msg, counts }, 500);
  }
});
