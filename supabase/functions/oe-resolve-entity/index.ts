/**
 * oe-resolve-entity — the factory floor.
 *
 * One organisation at a time: find its domain, find where it posts its roles,
 * and recognise which applicant-tracking system it runs. Recognition is the
 * whole point — an organisation we can name but not read is worth little,
 * while an organisation whose board we can call by its exact token becomes a
 * keyless feed for ever after.
 *
 * Second pass. Two rules now govern the whole file:
 *
 *   1. NEVER RECORD A FAILURE WITHOUT ITS REASON. Every non-resolution writes a
 *      named `resolve_error` and the full probe record into `resolve_detail`:
 *      each door tried, its HTTP status, the final URL, the byte length of the
 *      body, and whether robots permitted it.
 *   2. NEVER INVENT AN ENDPOINT. A fingerprint that matches gives us the
 *      platform and the token. The endpoint is written only when a candidate
 *      API shape was called in this run and answered with JSON carrying at
 *      least one posting. Otherwise the endpoint stays null, the surface is
 *      read as plain HTML, and the reason is `api_unverified`.
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
/**
 * How long we wait for a host. 9 seconds wrote off 200 Saudi sites as dead;
 * the run that settled this step showed the fetcher, not the hosts, was the
 * bottleneck. Callers may override per run, and the default is the value that
 * test settled on.
 */
let TIMEOUT = 20_000;


/** The usual doors, tried first because they answer most often. */
const CAREERS_PATHS = [
  "/careers", "/en/careers", "/jobs", "/career", "/ar/careers",
  "/about/careers", "/en/jobs", "/join-us", "/en/about-us/careers",
];
/**
 * The second wave: Arabic doors and the longer English ones. Only asked for
 * when the first wave found nothing, so an organisation that answers on
 * /careers never costs us these fetches.
 */
const CAREERS_PATHS_EXTENDED = [
  "/ar/الوظائف", "/ar/وظائف", "/ar/jobs", "/careers/jobs", "/en/careers/jobs",
  "/about/careers/jobs", "/work-with-us", "/recruitment", "/hr/careers",
];
/** The other usual door: a careers host beside the main site, not a guess at a domain. */
const CAREERS_HOSTS = ["careers", "jobs", "career"];
const CAREERS_TEXT = /careers?|jobs|vacanc|join us|opportunit|وظائف|التوظيف|الوظائف|انضم/i;
const CAREERS_PATH_RE = /\/(careers?|jobs|vacanc\w*|join-?us|recruitment|work-with-us|wazaif|%d8%a7%d9%84%d9%88%d8%b8%d8%a7%d8%a6%d9%81|وظائف|الوظائف)(\/|$|\?)/i;

/**
 * A domain that is a platform rather than an organisation. "women to drive
 * movement" on twitter.com resolved to Greenhouse with the token `xai`: the
 * fingerprint did its job and the seed was wrong. Nothing on these hosts is
 * ever an employer's own careers system.
 */
const PLATFORM_HOSTS = [
  "twitter.com", "x.com", "facebook.com", "linkedin.com", "instagram.com",
  "youtube.com", "wikipedia.org", "medium.com", "crunchbase.com", "bloomberg.com",
];
const INVALID_SEED_REASON = "domain is a platform, not an organisation";

function isPlatformHost(domain: string): boolean {
  const d = domain.replace(/^www\./, "").toLowerCase();
  return PLATFORM_HOSTS.some((h) => d === h || d.endsWith(`.${h}`));
}

/** Third-party job portals an employer's careers link can send an applicant to. */
const PORTAL_HOSTS: Array<{ host: RegExp; name: string }> = [
  { host: /(^|\.)jadarat\.sa/i, name: "jadarat.sa" },
  { host: /(^|\.)taqat\.sa/i, name: "taqat.sa" },
  { host: /(^|\.)bayt\.com/i, name: "bayt.com" },
  { host: /(^|\.)gulftalent\.com/i, name: "gulftalent.com" },
  { host: /(^|\.)naukrigulf\.com/i, name: "naukrigulf.com" },
  { host: /(^|\.)monstergulf\.com/i, name: "monstergulf.com" },
  { host: /(^|\.)tanqeeb\.com/i, name: "tanqeeb.com" },
  // LinkedIn only counts when the link is to its jobs board. Almost every site
  // in the Kingdom carries a LinkedIn company link in its footer, and reading
  // that as "the employer recruits through LinkedIn" is a fabrication.
  { host: /(^|\.)linkedin\.com\/jobs(\/|\?|$)/i, name: "linkedin.com" },
  { host: /(^|\.)indeed\.com/i, name: "indeed.com" },
];

const NEWSROOM_TEXT = /newsroom|news\s*room|media\s*cent|press\s*release|press\s*cent|\bnews\b|\bmedia\b|الأخبار|المركز الإعلامي|البيانات الصحفية/i;

/**
 * ONE SITE, MANY SURFACES.
 *
 * A website is not one door. A consulting firm's site carries roles on its
 * careers page, live topics in its insights, appointments in its news, rooms
 * on its events page and the people to know on its leadership page. Each is a
 * surface with its own reader, its own rhythm and its own yield.
 */
type SurfaceType =
  | "careers" | "news" | "press" | "insights" | "events"
  | "tenders" | "leadership" | "investor_relations" | "blog" | "podcast" | "directory";

const SURFACE_RULES: Array<{
  type: SurfaceType;
  text: RegExp;
  path: RegExp;
  yields: string[];
  cadence: "daily" | "weekly";
}> = [
  { type: "careers", text: CAREERS_TEXT, path: /\/(careers?|jobs|vacanc\w*|join-?us|wazaif|وظائف|التوظيف)(\/|$|\?)/i,
    yields: ["role"], cadence: "daily" },
  { type: "tenders", text: /tender|procurement|supplier|bid\b|rfp|المشتريات|الموردين|المنافسات|كراسة/i,
    path: /\/(tenders?|procurement|suppliers?|bids?|rfps?|المشتريات|الموردين)(\/|$|\?)/i,
    yields: ["mandate"], cadence: "daily" },
  { type: "news", text: /\bnews\b|newsroom|news\s*room|media\s*cent|الأخبار|المركز الإعلامي/i,
    path: /\/(news|newsroom|media-?cent\w*|الأخبار)(\/|$|\?)/i,
    yields: ["board", "role", "mandate", "advisory"], cadence: "weekly" },
  { type: "press", text: /press\s*release|press\s*cent|press\s*room|البيانات الصحفية/i,
    path: /\/(press|press-?releases?|press-?room)(\/|$|\?)/i,
    yields: ["board", "role", "mandate", "advisory"], cadence: "weekly" },
  { type: "insights", text: /insight|publication|research|perspective|our thinking|report\b|رؤى|تقارير|منشورات|أبحاث/i,
    path: /\/(insights?|publications?|research|perspectives?|our-thinking|reports?|رؤى|تقارير)(\/|$|\?)/i,
    yields: ["speaking", "media"], cadence: "weekly" },
  { type: "events", text: /\bevents?\b|conference|webinar|summit|forum|الفعاليات|المؤتمرات|ندوة/i,
    path: /\/(events?|conferences?|webinars?|summits?|forums?|الفعاليات)(\/|$|\?)/i,
    yields: ["room", "speaking", "learning"], cadence: "weekly" },
  { type: "leadership", text: /leadership|our people|management team|executive team|board of|القيادة|مجلس الإدارة|فريق الإدارة/i,
    path: /\/(leadership|our-people|people|management|executives?|board|القيادة)(\/|$|\?)/i,
    yields: [], cadence: "weekly" },
  { type: "investor_relations", text: /investor relation|investors?\b|shareholder|علاقات المستثمرين|المساهمين/i,
    path: /\/(investor-?relations?|investors?|ir)(\/|$|\?)/i,
    yields: ["board"], cadence: "weekly" },
  { type: "blog", text: /\bblog\b|مدونة/i, path: /\/(blog|مدونة)(\/|$|\?)/i,
    yields: ["speaking", "media"], cadence: "weekly" },
  { type: "podcast", text: /podcast|بودكاست/i, path: /\/(podcasts?|بودكاست)(\/|$|\?)/i,
    yields: ["speaking", "media"], cadence: "weekly" },
  { type: "directory", text: /member directory|our members|licensee|licensed (firms|entities)|firm index|company directory|دليل الأعضاء|المرخص/i,
    path: /\/(directory|directories|members?|licensees?|licen[cs]es?-directory|firms?-index)(\/|$|\?)/i,
    yields: [], cadence: "weekly" },
];


function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const squash = (s: string) => (s || "").replace(/\s+/g, " ").trim();

type Fetched = { ok: boolean; status: number; finalUrl: string; body: string; bytes: number };

async function get(url: string, method: "GET" | "HEAD" = "GET"): Promise<Fetched> {
  try {
    const r = await fetch(url, {
      method,
      headers: { "User-Agent": UA, "Accept-Language": "en,ar;q=0.8" },
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT),
    });
    const body = method === "GET" && r.ok ? (await r.text()).slice(0, 400_000) : "";
    return { ok: r.ok, status: r.status, finalUrl: r.url || url, body, bytes: body.length };
  } catch {
    // Status 0 is our word for "the host never answered".
    return { ok: false, status: 0, finalUrl: url, body: "", bytes: 0 };
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

/** A page that answered 200 but is really a challenge, not a careers page. */
function looksBotDefended(f: Fetched): boolean {
  if (f.status === 403 || f.status === 429 || f.status === 503) return true;
  if (!f.ok) return false;
  return /just a moment|cf-browser-verification|cf_chl_|checking your browser|attention required|captcha|incapsula|access denied|radware/i
    .test(f.body.slice(0, 20_000));
}

/** Roughly how much readable text a page carries, script bundles removed. */
function textLength(html: string): number {
  return squash(
    html.replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  ).length;
}

// ───────────────────── the fingerprints ─────────────────────
// Each returns the platform, the exact token, and the candidate API shapes that
// token might unlock. Candidates are called, never assumed. Case is preserved
// wherever the platform is case-sensitive.

/**
 * THE TOKEN LAW.
 *
 * A platform token may only be read off a hostname that belongs to that
 * platform's own domain. "careers", "career", "app", "www" are not tenants —
 * they are the first label of the employer's own careers host, captured
 * because the old rules were allowed to match any hostname on the page. Where
 * the guard rejects a capture we keep the recognition, write no token, and say
 * `token_not_found`. We never fall back to a guess.
 */
const RESERVED_TOKENS = new Set([
  "www", "app", "apps", "api", "careers", "career", "jobs", "job", "static",
  "cdn", "assets", "media", "images", "en", "ar", "secure", "portal", "login",
  "web", "webs", "main", "home",
]);

function cleanToken(raw: string | null | undefined): string | null {
  const t = (raw ?? "").trim();
  if (!t || RESERVED_TOKENS.has(t.toLowerCase())) return null;
  return t;
}

/** The tenant label, but only when the host really belongs to the platform. */
function tenantOf(host: string | null | undefined, domains: string[]): string | null {
  const h = (host ?? "").toLowerCase().replace(/^https?:\/\//, "").split("/")[0];
  if (!h) return null;
  const domain = domains.find((d) => h === d || h.endsWith(`.${d}`));
  if (!domain) return null;
  const labels = h.slice(0, h.length - domain.length).replace(/\.$/, "").split(".").filter(Boolean);
  if (!labels.length) return null;
  return cleanToken(labels[labels.length - 1]);
}

type Print = {
  platform: string;
  /** Null where the guard refused the capture: recognition without a tenant. */
  token: string | null;
  /** Shapes to try, in order. Empty means the platform has no public JSON we know. */
  candidates: string[];
  /**
   * A reading URL that is a page rather than an API, kept where the harvester
   * already reads it that way. Never presented as a verified endpoint.
   */
  pageUrl?: string;
  /** Endpoint proven before this pass and still trusted (SuccessFactors search). */
  provenEndpoint?: string;
};


function fingerprint(url: string, html: string): Print | null {
  const hay = `${url}\n${html.slice(0, 250_000)}`;
  const hostOf = (u: string) => { try { return new URL(u).hostname; } catch { return ""; } };

  let m = hay.match(/(?:job-boards|boards)\.greenhouse\.io\/(?:embed\/job_board\?for=)?([a-zA-Z0-9_-]{2,60})/);
  if (!m) m = hay.match(/boards\.greenhouse\.io\/embed\/job_board\/js\?for=([a-zA-Z0-9_-]{2,60})/);
  if (!m && /<div[^>]+id=["']grnhse_app["']/i.test(hay)) {
    const t = hay.match(/grnhse[^]{0,400}?for=([a-zA-Z0-9_-]{2,60})/)?.[1];
    if (t) m = [t, t] as unknown as RegExpMatchArray;
  }
  if (m && !/^(embed|job_board|js)$/i.test(m[1])) {
    return {
      platform: "greenhouse", token: m[1],
      candidates: [`https://boards-api.greenhouse.io/v1/boards/${m[1]}/jobs`],
    };
  }

  m = hay.match(/jobs\.(eu\.)?lever\.co\/([a-zA-Z0-9_.-]{2,60})/);
  if (m) {
    const eu = !!m[1];
    return {
      platform: "lever", token: m[2],
      candidates: [`https://api.${eu ? "eu." : ""}lever.co/v0/postings/${m[2]}?mode=json`],
    };
  }

  m = hay.match(/jobs\.ashbyhq\.com\/([A-Za-z0-9_.-]{2,60})/);
  if (m) {
    return {
      platform: "ashby", token: m[1], // case-sensitive, taken verbatim
      candidates: [`https://api.ashbyhq.com/posting-api/job-board/${m[1]}`],
    };
  }

  m = hay.match(/(?:jobs|careers)\.smartrecruiters\.com\/([A-Za-z0-9_.-]{2,60})/);
  if (m) {
    return {
      platform: "smartrecruiters", token: m[1],
      candidates: [`https://api.smartrecruiters.com/v1/companies/${m[1]}/postings`],
    };
  }

  m = hay.match(/https?:\/\/([a-zA-Z0-9-]{2,60})\.(wd\d{1,2})\.myworkdayjobs\.com\/(?:wday\/cxs\/[^/]+\/)?(?:([a-z]{2}-[A-Z]{2})\/)?([A-Za-z0-9_-]{2,80})/);
  if (m) {
    const [, tenant, wd, , site] = m;
    return {
      platform: "workday", token: `${tenant}|${wd}|${site}`,
      candidates: [`https://${tenant}.${wd}.myworkdayjobs.com/wday/cxs/${tenant}/${site}/jobs`],
    };
  }

  m = hay.match(/apply\.workable\.com\/([a-zA-Z0-9_-]{2,60})/);
  if (m && !/^api$/i.test(m[1])) {
    return {
      platform: "workable", token: m[1],
      candidates: [`https://apply.workable.com/api/v1/widget/accounts/${m[1]}`],
    };
  }

  m = hay.match(/https?:\/\/([a-zA-Z0-9-]{2,60})\.recruitee\.com/);
  if (m) {
    return {
      platform: "recruitee", token: m[1],
      candidates: [`https://${m[1]}.recruitee.com/api/offers/`],
    };
  }

  m = hay.match(/https?:\/\/([a-zA-Z0-9-]{2,60})\.jobs\.personio\.(?:de|com)/);
  if (m) {
    return {
      platform: "personio", token: m[1],
      candidates: [`https://${m[1]}.jobs.personio.de/xml?language=en`],
    };
  }

  m = hay.match(/https?:\/\/([a-zA-Z0-9-]{2,60})\.pinpointhq\.com/);
  if (m) {
    return {
      platform: "pinpoint", token: m[1],
      candidates: [`https://${m[1]}.pinpointhq.com/postings.json`],
    };
  }

  // ── Elevatus. The tenant is a label on elevatus.io, or the first path
  // segment under webs.elevatus.io. Never the employer's own subdomain.
  const elevatusHost = hay.match(/https?:\/\/([a-z0-9.-]+\.elevatus\.io)/i)?.[1] ?? null;
  const elevatusPath = cleanToken(hay.match(/webs\.elevatus\.io\/([a-z0-9-]{2,60})/i)?.[1]);
  if (elevatusHost || /\bElevatusApp\b|\belevatus\b/i.test(hay)) {
    const t = elevatusPath ?? tenantOf(elevatusHost, ["elevatus.io"]);
    return {
      platform: "elevatus", token: t,
      candidates: t
        ? [
          `https://${t}.elevatus.io/api/v1/jobs`,
          `https://webs.elevatus.io/api/v1/companies/${t}/jobs`,
        ]
        : [],
      pageUrl: t ? `https://${t}.elevatus.io/` : url,
    };
  }

  m = hay.match(/https?:\/\/(careers-[a-z0-9-]{2,60}\.icims\.com|[a-z0-9-]{2,60}\.icims\.com)\/jobs/i)
    ?? hay.match(/https?:\/\/(careers-[a-z0-9-]{2,60}\.icims\.com)/i);
  if (m) {
    const t = tenantOf(m[1], ["icims.com"])?.replace(/^careers-/, "") ?? null;
    return { platform: "icims", token: t, candidates: [], pageUrl: t ? `https://careers-${t}.icims.com/jobs/search` : url };
  }

  // Phenom is the exception to the tenant guard: a Phenom career site runs on
  // the employer's own host, so careers.bcg.com is the correct token. What was
  // wrong before was the probe shape, not the token — so try every known shape
  // on that host and record which one answered.
  if (/phenompeople|ph-widget|phApp\.ddo/i.test(hay)) {
    const host = hostOf(url);
    return {
      platform: "phenom", token: host || null,
      candidates: host
        ? [
          `https://${host}/api/apply/v2/jobs`,
          `https://${host}/widgets?feature=joblist&isSliderEnable=false&pageName=search-results&size=10`,
          `https://${host}/api/jobs`,
          `https://${host}/search-jobs/results?ActiveFacetID=0`,
        ]
        : [],
      pageUrl: url,
    };
  }

  m = hay.match(/https?:\/\/([a-z0-9.-]+\.avature\.net)/i);
  if (m) {
    const t = tenantOf(m[1], ["avature.net"]);
    return { platform: "avature", token: t, candidates: [], pageUrl: t ? `https://${t}.avature.net/careers` : url };
  }

  m = hay.match(/https?:\/\/([a-z0-9.-]+\.darwinbox\.(?:in|com))/i);
  if (m) {
    const t = tenantOf(m[1], ["darwinbox.in", "darwinbox.com"]);
    const tld = /darwinbox\.in/i.test(m[1]) ? "in" : "com";
    return { platform: "darwinbox", token: t, candidates: [], pageUrl: t ? `https://${t}.darwinbox.${tld}/ms/candidate/careers` : url };
  }

  m = hay.match(/https?:\/\/([a-z0-9.-]+\.teamtailor\.com)/i);
  if (m) {
    const t = tenantOf(m[1], ["teamtailor.com"]);
    return { platform: "teamtailor", token: t, candidates: [], pageUrl: t ? `https://${t}.teamtailor.com/jobs` : url };
  }

  m = hay.match(/https?:\/\/([a-z0-9.-]+\.bamboohr\.com)\/(?:careers|jobs)/i);
  if (m) {
    const t = tenantOf(m[1], ["bamboohr.com"]);
    return {
      platform: "bamboohr", token: t,
      candidates: t ? [`https://${t}.bamboohr.com/careers/list`] : [],
      pageUrl: t ? `https://${t}.bamboohr.com/careers` : url,
    };
  }

  m = hay.match(/https?:\/\/([a-z0-9.-]+\.zohorecruit\.(?:com|eu))/i);
  if (m) {
    const t = tenantOf(m[1], ["zohorecruit.com", "zohorecruit.eu"]);
    const tld = /zohorecruit\.eu/i.test(m[1]) ? "eu" : "com";
    return { platform: "zohorecruit", token: t, candidates: [], pageUrl: t ? `https://${t}.zohorecruit.${tld}/jobs/Careers` : url };
  }

  m = hay.match(/jobs\.jobvite\.com\/([a-z0-9-]{2,60})/i);
  if (m) {
    const t = cleanToken(m[1]);
    return { platform: "jobvite", token: t, candidates: [], pageUrl: t ? `https://jobs.jobvite.com/${t}` : url };
  }

  m = hay.match(/https?:\/\/([a-z0-9.-]+\.eightfold\.ai)/i);
  if (m) {
    const t = tenantOf(m[1], ["eightfold.ai"]);
    return {
      platform: "eightfold", token: t,
      candidates: t ? [`https://${t}.eightfold.ai/api/apply/v2/jobs?domain=${t}.com&start=0&num=10`] : [],
      pageUrl: t ? `https://${t}.eightfold.ai/careers` : url,
    };
  }

  m = hay.match(/https?:\/\/([a-z0-9.-]+\.zenhr\.com)/i);
  if (m) {
    const t = tenantOf(m[1], ["zenhr.com"]);
    return { platform: "zenhr", token: t, candidates: [], pageUrl: t ? `https://${t}.zenhr.com/jobs` : url };
  }


  // The national platform. Not an employer system — but knowing an employer
  // publishes there, in one readable place, is a finding and not a failure.
  for (const p of [/(^|\/\/|\.)jadarat\.sa/i, /(^|\/\/|\.)taqat\.sa/i]) {
    if (p.test(url) || p.test(hay.slice(0, 60_000))) {
      const portal = /taqat/i.test(url) || (!/jadarat/i.test(url) && /taqat\.sa/i.test(hay)) ? "taqat.sa" : "jadarat.sa";
      return { platform: "jadarat_portal", token: portal, candidates: [], pageUrl: url };
    }
  }

  // SuccessFactors recruiting marketing: by far the most common system in the
  // Kingdom. Three tells, any one of which is conclusive: the /go/{Slug}/{id}/
  // category links, a relative /job/{slug}/{id}/ role link, or the sapsf host
  // the page loads its own machinery from. The list itself lives at /search —
  // a page, read as HTML, and proven in harvest before this pass.
  const sfHost = (() => {
    try { return new URL(url).origin; } catch { return null; }
  })();
  const sfGo = /\/go\/[A-Za-z0-9%_-]{2,80}\/\d{3,12}\//.test(hay);
  const sfJob = /href=["'][^"']*\/job\/[A-Za-z0-9%_&;.,-]{2,120}\/\d{4,12}\//.test(hay);
  const sfMachinery = /career\d?\.sapsf\.com|successfactors|rmkcdn\.successfactors|sfmc-|jobDetailsShareButtons/i.test(hay);
  if (sfHost && (sfGo || sfJob || sfMachinery)) {
    return {
      platform: "successfactors_rmk", token: sfHost,
      candidates: [], provenEndpoint: `${sfHost}/search/?q=`,
    };
  }
  m = hay.match(/career\d?\.sapsf\.com\/careers\?company=([A-Za-z0-9_-]{2,40})/);
  if (m) {
    return {
      platform: "successfactors_rmk", token: m[1],
      candidates: [], provenEndpoint: `https://career4.sapsf.com/careers?company=${m[1]}`,
    };
  }

  // Oracle Recruiting Cloud. The candidate-experience path is the reliable
  // tell — and the site name it carries is the thing the old rule captured and
  // then threw away. Use it; fall back to CX_1 only where none was captured,
  // and let the probe say which one answered.
  m = hay.match(/https?:\/\/([a-zA-Z0-9-]+)\.([a-z0-9-]+)\.oraclecloud\.com\/hcmUI\/CandidateExperience\/(?:[a-z]{2}\/sites\/([A-Za-z0-9_-]+))?/);
  if (m) {
    const [, pod, region, site] = m;
    const base = `https://${pod}.${region}.oraclecloud.com/hcmRestApi/resources/latest/recruitingCEJobRequisitions` +
      `?onlyData=true&expand=requisitionList&finder=findReqs;siteNumber=`;
    const sites = site ? [site, "CX_1"] : ["CX_1"];
    return {
      platform: "oracle_orc", token: `${pod}|${region}|${site ?? ""}`,
      candidates: [...new Set(sites)].map((s) => `${base}${s},limit=100`),
      pageUrl: `https://${pod}.${region}.oraclecloud.com/hcmUI/CandidateExperience/en/sites/${site ?? "CX_1"}`,
    };
  }

  m = hay.match(/https?:\/\/([a-zA-Z0-9-]{2,60})\.taleo\.net\/careersection/);
  if (m) {
    return { platform: "taleo", token: m[1], candidates: [], pageUrl: `https://${m[1]}.taleo.net/careersection/` };
  }
  m = hay.match(/tbe\.taleo\.net\/(CH\w{2})\/ats\/careers\/[^"'\s]*org=([A-Za-z0-9_-]+)/i);
  if (m) {
    return {
      platform: "taleo", token: `${m[1]}|${m[2]}`,
      candidates: [`https://tbe.taleo.net/${m[1]}/ats/careers/v2/searchResults?org=${m[2]}`],
    };
  }

  return null;
}

/**
 * Call each candidate shape once. The endpoint is written only where the answer
 * is JSON (or Personio's XML feed) carrying at least one posting.
 */
async function probeApi(
  print: Print,
): Promise<{ endpoint: string | null; probe: Array<Record<string, unknown>> }> {
  const probe: Array<Record<string, unknown>> = [];
  for (const candidate of print.candidates) {
    const r = await get(candidate);
    const rec: Record<string, unknown> = { url: candidate, status: r.status, bytes: r.bytes };
    if (!r.ok || !r.bytes) { rec.result = "no_answer"; probe.push(rec); continue; }
    // Personio publishes XML, everything else JSON.
    if (/\/xml\?/.test(candidate)) {
      const n = (r.body.match(/<position>/gi) ?? []).length;
      rec.result = n > 0 ? "verified" : "empty";
      rec.postings = n;
      probe.push(rec);
      if (n > 0) return { endpoint: candidate, probe };
      continue;
    }
    let parsed: unknown;
    try { parsed = JSON.parse(r.body); } catch { rec.result = "not_json"; probe.push(rec); continue; }
    const n = countPostings(parsed);
    rec.result = n > 0 ? "verified" : "empty";
    rec.postings = n;
    probe.push(rec);
    if (n > 0) return { endpoint: candidate, probe };
  }
  return { endpoint: null, probe };
}

/** How many postings a JSON answer carries, whatever the platform calls them. */
function countPostings(v: unknown): number {
  if (Array.isArray(v)) return v.length;
  if (!v || typeof v !== "object") return 0;
  const o = v as Record<string, unknown>;
  for (const key of [
    "jobs", "positions", "postings", "data", "results", "content", "items",
    "requisitionList", "jobPostings", "offers",
  ]) {
    const inner = o[key];
    if (Array.isArray(inner)) {
      if (inner.length === 0) continue;
      // Workday and Oracle wrap the list one level deeper.
      const first = inner[0];
      if (first && typeof first === "object" && !Array.isArray(first)) {
        const deeper = countPostings(first);
        if (deeper > 0 && !("title" in (first as object)) && !("name" in (first as object))) return deeper;
      }
      return inner.length;
    }
    if (inner && typeof inner === "object") {
      const deeper = countPostings(inner);
      if (deeper > 0) return deeper;
    }
  }
  return 0;
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

/** Every link on a page, with its visible text. The raw material of discovery. */
function allLinks(html: string, base: string): Array<{ url: string; text: string }> {
  const out: Array<{ url: string; text: string }> = [];
  const seen = new Set<string>();
  for (const m of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]{0,200}?)<\/a>/gi)) {
    let u: URL;
    try { u = new URL(m[1], base); } catch { continue; }
    if (!/^https?:$/.test(u.protocol)) continue;
    u.hash = "";
    const url = u.toString();
    if (seen.has(url)) continue;
    seen.add(url);
    out.push({ url, text: squash(m[2].replace(/<[^>]+>/g, " ")).slice(0, 160) });
    if (out.length > 600) break;
  }
  return out;
}

/** The sitemap as a last door: a site that lists its own careers page. */
async function sitemapCareers(origin: string): Promise<string | null> {
  for (const name of ["/sitemap.xml", "/sitemap_index.xml"]) {
    const r = await get(origin + name);
    if (!r.ok || !r.bytes) continue;
    const locs = [...r.body.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1]);
    for (const loc of locs) {
      try {
        if (CAREERS_PATH_RE.test(new URL(loc).pathname)) return loc;
      } catch { /* next */ }
    }
    // One level of index: the first child sitemap whose name hints at careers.
    const child = locs.find((l) => /career|job|وظائف/i.test(l) && /\.xml($|\?)/i.test(l));
    if (child) {
      const c = await get(child);
      if (c.ok) {
        for (const m of c.body.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)) {
          try {
            if (CAREERS_PATH_RE.test(new URL(m[1]).pathname)) return m[1];
          } catch { /* next */ }
        }
      }
    }
  }
  return null;
}

/** How a surface can actually be read: a feed first, then structure, then plain HTML. */
function readerFor(url: string, html: string): { kind: string; feed: string | null } {
  const feed = (() => {
    for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
      const tag = m[0];
      if (!/rel=["']?alternate/i.test(tag)) continue;
      const type = tag.match(/type=["']([^"']+)["']/i)?.[1] ?? "";
      const href = tag.match(/href=["']([^"']+)["']/i)?.[1];
      if (!href) continue;
      if (/rss\+xml/i.test(type) || /atom\+xml/i.test(type)) {
        try { return { url: new URL(href, url).toString(), atom: /atom/i.test(type) }; } catch { /* next */ }
      }
    }
    return null;
  })();
  if (feed) return { kind: feed.atom ? "atom" : "rss", feed: feed.url };
  if (/<script[^>]+type=["']application\/ld\+json["']/i.test(html)) return { kind: "json_ld", feed: null };
  return { kind: "html_list", feed: null };
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
  const concurrency = Math.min(Number(body.concurrency ?? params.resolve_concurrency ?? 4), 16);
  TIMEOUT = Math.min(Math.max(Number(body.timeout_ms ?? params.resolve_timeout_ms ?? 20_000), 3_000), 30_000);

  let searchBudget = Number(body.search_budget ?? params.resolve_search_budget ?? 8);
  const firecrawlKey = Deno.env.get("FIRECRAWL_API_KEY") || "";

  const counts: Record<string, any> = {
    seen: 0, resolved: 0, no_ats: 0, no_careers: 0, failed: 0, invalid_seed: 0,
    searched: 0, surfaces: 0, by_platform: {} as Record<string, number>,
    by_surface: {} as Record<string, number>,
    by_reason: {} as Record<string, number>,
    found_by: {} as Record<string, number>,
    endpoint_verified: {} as Record<string, number>,
    recognition_only: {} as Record<string, number>,
  };
  const detail: Array<Record<string, unknown>> = [];
  /** Directory surfaces produce organisations, not opportunities: they go back to the seeder. */
  const directories: Array<{ entity_id: string; url: string }> = [];

  const bump = (bucket: Record<string, number>, key: string) => {
    bucket[key] = (bucket[key] ?? 0) + 1;
  };

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
    // Re-run one named failure only — the way a finding is tested rather than
    // a whole status swept.
    if (Array.isArray(body.recheck_error) && body.recheck_error.length) {
      q = q.in("resolve_error", body.recheck_error);
    }
    if (body.with_domain_only === true) q = q.not("domain", "is", null);

    if (typeof body.seed_source === "string") q = q.eq("seed_source", body.seed_source);

    if (body.entity_id) q = admin.from("oe_entities")
      .select("id, name, domain, careers_url").eq("id", body.entity_id);

    const { data: ents, error } = await q;
    if (error) throw new Error(error.message);
    if (!ents?.length) {
      if (jobId) await admin.rpc("complete_job", { p_id: jobId, p_success: true, p_error: null });
      return json({ ok: true, counts, note: "nothing new to resolve" });
    }

    /**
     * Every surface on one site. A careers page and a newsroom were the old
     * answer; a firm's insights page tells us what the market is thinking, its
     * events page names the rooms, its leadership page names the people, and a
     * directory page hands us more organisations.
     */
    async function discoverSurfaces(
      entityId: string,
      domain: string,
      home: Fetched,
      disallows: string[],
      careers: Fetched | null,
      print: Print | null,
      verifiedEndpoint: string | null,
    ): Promise<Map<string, string>> {
      const chosen = new Map<string, string>();
      const rows: Array<Record<string, unknown>> = [];
      const root = domain.split(".").slice(-2).join(".");

      // candidates from the homepage, one per surface type, same site only
      const candidates = new Map<SurfaceType, string>();
      if (home.ok) {
        for (const { url, text } of allLinks(home.body, home.finalUrl)) {
          let u: URL;
          try { u = new URL(url); } catch { continue; }
          if (!u.hostname.endsWith(root)) continue;
          for (const rule of SURFACE_RULES) {
            if (!(rule.text.test(text) || rule.path.test(u.pathname))) continue;
            // The section, not an article inside it: the shallowest path wins.
            const held = candidates.get(rule.type);
            const depth = (x: string) => new URL(x).pathname.replace(/\/+$/, "").split("/").length;
            if (!held || depth(url) < depth(held)) candidates.set(rule.type, url);
          }
        }
      }
      if (careers) candidates.set("careers", careers.finalUrl);

      for (const rule of SURFACE_RULES) {
        const url = candidates.get(rule.type);
        if (!url) continue;
        if (Date.now() > deadline) break;

        const ok = allowed(disallows, url);
        let kind = "html_list";
        let readUrl = url;
        let health = "unknown";
        let access: string | null = ok ? null : "robots_disallows";

        if (rule.type === "careers" && careers && print) {
          // An API reader only where an endpoint actually answered. Recognition
          // without a verified endpoint is still read as a page.
          if (verifiedEndpoint) {
            kind = "ats_api";
            readUrl = verifiedEndpoint;
          } else {
            kind = "html_list";
            readUrl = print.provenEndpoint ?? print.pageUrl ?? careers.finalUrl;
          }
          health = "ok";
        } else if (ok) {
          const page = rule.type === "careers" && careers ? careers : await get(url);
          if (page.ok && page.body.length > 300) {
            const reader = readerFor(page.finalUrl, page.body);
            kind = reader.kind;
            readUrl = reader.feed ?? page.finalUrl;
            health = "ok";
          } else {
            health = "unreadable";
            access = access ?? (page.status === 403 ? "bot_defended" : "no_response");
            counts.surface_unreadable = (counts.surface_unreadable ?? 0) + 1;
          }
        }

        chosen.set(rule.type, readUrl);
        rows.push({
          entity_id: entityId,
          surface_type: rule.type,
          url: readUrl,
          harvest_kind: kind,
          ats_platform: rule.type === "careers" ? print?.platform ?? null : null,
          ats_token: rule.type === "careers" ? print?.token ?? null : null,
          yields: rule.yields,
          cadence: rule.cadence,
          terms_ok: ok,
          access_finding: access,
          health,
          updated_at: new Date().toISOString(),
        });
        counts.by_surface[rule.type] = (counts.by_surface[rule.type] ?? 0) + 1;
        if (rule.type === "directory") directories.push({ entity_id: entityId, url: readUrl });
      }

      if (rows.length) {
        const { error } = await admin.from("oe_surfaces")
          .upsert(rows, { onConflict: "entity_id,surface_type,url" });
        if (!error) counts.surfaces += rows.length;
      }
      return chosen;
    }

    /** One organisation, start to finish. */

    async function resolveOne(e: any) {
      const update: Record<string, unknown> = { last_resolved_at: new Date().toISOString() };
      /** The probe record. Written whatever the outcome. */
      const doorLog: Array<Record<string, unknown>> = [];
      const note = (url: string, r: Fetched, robotsOk: boolean, wave: string) => {
        doorLog.push({
          url, wave, status: r.status, final_url: r.finalUrl, bytes: r.bytes, robots_ok: robotsOk,
        });
      };
      try {
        // 0. the seed guard. A social or encyclopaedic host is never an employer.
        if (e.domain && isPlatformHost(e.domain)) {
          counts.invalid_seed++;
          bump(counts.by_reason, INVALID_SEED_REASON);
          await admin.from("oe_entities").update({
            ...update, resolve_status: "invalid_seed", resolve_error: INVALID_SEED_REASON,
            ats_platform: null, ats_token: null, ats_endpoint: null,
            resolve_detail: { guard: "platform_host", domain: e.domain, at: new Date().toISOString() },
          }).eq("id", e.id);
          return;
        }

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
          bump(counts.by_reason, "no_domain");
          await admin.from("oe_entities").update({
            ...update, resolve_status: "failed",
            resolve_error: firecrawlKey ? "no website on the list and no search result" : "no website on the list",
            resolve_detail: { doors: [], reason: "no_domain", at: new Date().toISOString() },
          }).eq("id", e.id);
          detail.push({ name: e.name, result: "failed", why: "no domain" });
          return;
        }
        if (isPlatformHost(domain)) {
          counts.invalid_seed++;
          bump(counts.by_reason, INVALID_SEED_REASON);
          await admin.from("oe_entities").update({
            ...update, resolve_status: "invalid_seed", resolve_error: INVALID_SEED_REASON,
            resolve_detail: { guard: "platform_host", domain, at: new Date().toISOString() },
          }).eq("id", e.id);
          return;
        }
        if (neverRead.some((b: string) => domain === b || domain!.endsWith(`.${b}`))) {
          counts.failed++;
          bump(counts.by_reason, "never_read_list");
          await admin.from("oe_entities").update({
            ...update, resolve_status: "failed", resolve_error: "domain is on the never-read list",
            resolve_detail: { guard: "never_read", domain, at: new Date().toISOString() },
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
        const home: Fetched = homeFirst;
        note(origin, home, true, "homepage");

        // 2. the careers page. A page we already hold is tried first, then the
        // usual doors, then the Arabic and longer doors, then the homepage
        // link, then the sitemap.
        let careers: Fetched | null = null;
        let foundBy = "";
        let robotsBlockedAll = true;

        if (e.careers_url && body.use_careers_url !== false) {
          const r = await get(e.careers_url);
          note(e.careers_url, r, true, "known_careers_url");
          if (r.ok && r.bytes > 500) { careers = r; foundBy = "known_careers_url"; }
        }

        if (!careers) {
          for (let i = 0; i < doors.length; i++) {
            const r = probes[i];
            const robotsOk = !doors[i].startsWith(origin) || allowed(disallows, doors[i]);
            note(doors[i], r, robotsOk, "usual");
            if (robotsOk) robotsBlockedAll = false;
            if (!robotsOk) continue;
            if (!careers && r.ok && r.body.length > 500) { careers = r; foundBy = "usual_door"; }
          }
        } else {
          robotsBlockedAll = false;
        }

        // second wave: Arabic and longer doors
        if (!careers && Date.now() < deadline) {
          const extended = CAREERS_PATHS_EXTENDED.map((p) => origin + encodeURI(p).replace(/^https%3A/, "https:"));
          const results = await Promise.all(extended.map((d) => get(d)));
          for (let i = 0; i < extended.length; i++) {
            const robotsOk = allowed(disallows, extended[i]);
            note(extended[i], results[i], robotsOk, "arabic_or_extended");
            if (robotsOk) robotsBlockedAll = false;
            if (!robotsOk) continue;
            if (!careers && results[i].ok && results[i].body.length > 500) {
              careers = results[i];
              foundBy = /\/ar\/|%d8/i.test(extended[i]) ? "arabic_path" : "extended_path";
            }
          }
        }

        let homepageLinkTried = false;
        if (!careers && home.ok) {
          const link = linkByText(home.body, home.finalUrl, CAREERS_TEXT);
          if (link) {
            homepageLinkTried = true;
            const robotsOk = allowed(disallows, link);
            if (robotsOk) {
              const r = await get(link);
              note(link, r, true, "homepage_link");
              if (r.ok && r.bytes > 500) { careers = r; foundBy = "homepage_link"; }
              robotsBlockedAll = false;
            } else {
              note(link, { ok: false, status: -1, finalUrl: link, body: "", bytes: 0 }, false, "homepage_link");
            }
          }
        }

        if (!careers && Date.now() < deadline) {
          const smap = await sitemapCareers(origin);
          if (smap) {
            const robotsOk = allowed(disallows, smap);
            const r = robotsOk ? await get(smap) : { ok: false, status: -1, finalUrl: smap, body: "", bytes: 0 };
            note(smap, r, robotsOk, "sitemap");
            if (r.ok && r.bytes > 500) { careers = r; foundBy = "sitemap"; robotsBlockedAll = false; }
          }
        }

        // 3. the fingerprint — read off the final URL and the page source.
        const print = careers ? fingerprint(careers.finalUrl, careers.body) : null;

        // 4. the probe. An endpoint is written only where a shape answered.
        let verifiedEndpoint: string | null = null;
        let apiProbe: Array<Record<string, unknown>> = [];
        if (print) {
          const res = await probeApi(print);
          verifiedEndpoint = res.endpoint;
          apiProbe = res.probe;
          if (!verifiedEndpoint && print.provenEndpoint) verifiedEndpoint = print.provenEndpoint;
        }

        // 5. every surface on the site, not two.
        const found = await discoverSurfaces(e.id, domain, home, disallows, careers, print, verifiedEndpoint);
        const newsroom = found.get("news") ?? found.get("press") ?? null;
        if (newsroom) update.newsroom_url = newsroom;
        if (careers) update.careers_url = careers.finalUrl;

        const detailBlob = {
          at: new Date().toISOString(),
          domain,
          robots_disallow_count: disallows.length,
          found_by: foundBy || null,
          doors: doorLog.slice(0, 40),
          api_probe: apiProbe,
        };

        if (!careers) {
          // ── name the failure. One of six, decided by what the doors said.
          const tried = doorLog.filter((d) => d.wave !== "homepage");
          const anyDefended = [home, ...probes].some(looksBotDefended);
          const allSilent = tried.length > 0 && tried.every((d) => d.status === 0) && home.status === 0;
          let reason: string;
          if (tried.length > 0 && tried.every((d) => d.robots_ok === false)) {
            reason = "careers_robots_blocked";
          } else if (allSilent) {
            reason = "careers_timeout";
          } else if (anyDefended) {
            reason = "careers_bot_defended";
          } else if (!home.ok) {
            reason = "careers_homepage_dead";
          } else if (!homepageLinkTried) {
            reason = "careers_no_link_found";
          } else {
            reason = "careers_all_404";
          }
          counts.no_careers++;
          bump(counts.by_reason, reason);
          await admin.from("oe_entities").update({
            ...update, resolve_status: "no_careers", resolve_error: reason,
            resolve_detail: { ...detailBlob, reason },
          }).eq("id", e.id);
          detail.push({ name: e.name, domain, result: "no_careers", reason, surfaces: found.size });
          return;
        }

        if (!print) {
          // ── name the failure. The careers page is in hand; why did nothing match?
          const html = careers.body;
          const iframe = html.match(/<iframe\b[^>]*src=["']([^"']+)["']/i)?.[1] ?? null;
          const portal = (() => {
            for (const p of PORTAL_HOSTS) {
              if (p.host.test(careers!.finalUrl)) return p.name;
              const link = [...html.matchAll(/href=["']([^"']+)["']/gi)].map((m) => m[1])
                .find((h) => p.host.test(h));
              if (link) return p.name;
            }
            return null;
          })();
          const text = textLength(html);
          let reason: string;
          const extra: Record<string, unknown> = { text_length: text };
          if (portal) {
            reason = "ats_portal_redirect";
            extra.portal = portal;
          } else if (iframe && /career|job|recruit|apply|vacan/i.test(iframe)) {
            reason = "ats_iframe";
            extra.frame_src = (() => { try { return new URL(iframe, careers!.finalUrl).toString(); } catch { return iframe; } })();
          } else if (text < 2_000) {
            reason = "ats_js_rendered";
          } else {
            reason = "ats_no_signature";
          }
          counts.no_ats++;
          bump(counts.by_reason, reason);
          await admin.from("oe_entities").update({
            ...update, resolve_status: "no_ats", resolve_error: reason,
            resolve_detail: { ...detailBlob, reason, ...extra },
          }).eq("id", e.id);
          detail.push({ name: e.name, domain, result: "no_ats", reason, careers: careers.finalUrl, surfaces: found.size });
          return;
        }

        counts.resolved++;
        bump(counts.by_platform, print.platform);
        if (foundBy) bump(counts.found_by, foundBy);
        if (verifiedEndpoint) bump(counts.endpoint_verified, print.platform);
        else bump(counts.recognition_only, print.platform);

        await admin.from("oe_entities").update({
          ...update, resolve_status: "resolved",
          // Recognition without a verified endpoint is worth having, and is
          // said out loud rather than dressed up as a working feed.
          resolve_error: verifiedEndpoint
            ? null
            : (print.token === null ? "token_not_found" : "api_unverified"),
          ats_platform: print.platform, ats_token: print.token,

          ats_endpoint: verifiedEndpoint,
          resolve_detail: { ...detailBlob, platform: print.platform, endpoint_verified: !!verifiedEndpoint },
        }).eq("id", e.id);
        detail.push({
          name: e.name, domain, result: print.platform, token: print.token,
          endpoint_verified: !!verifiedEndpoint, found_by: foundBy, surfaces: found.size,
        });

      } catch (err) {
        counts.failed++;
        const msg = String((err as Error).message ?? err).slice(0, 300);
        bump(counts.by_reason, "exception");
        await admin.from("oe_entities").update({
          resolve_status: "failed",
          resolve_error: msg,
          resolve_detail: { at: new Date().toISOString(), reason: "exception", message: msg, doors: doorLog.slice(0, 40) },
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

    // A directory page is not an opportunity; it is more organisations.
    if (directories.length && body.seed_directories !== false) {
      try {
        await fetch(`${SUPABASE_URL}/functions/v1/oe-seed-entities`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${SERVICE_ROLE}`,
            "x-cron-secret": CRON_SECRET,
          },
          body: JSON.stringify({ sources: [], directory_urls: directories.slice(0, 20).map((d) => d.url) }),
          signal: AbortSignal.timeout(60_000),
        });
        counts.directories_sent = Math.min(directories.length, 20);
      } catch { counts.directories_sent = 0; }
    }

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
