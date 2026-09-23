/**
 * oe-harvest-ats — the adapters.
 *
 * Once an organisation has been fingerprinted, its roles are a keyless read
 * for ever after. Each adapter speaks one applicant-tracking system, returns
 * plain rows, and writes them into oe_candidates so they pass through exactly
 * the same triage as everything else. Nothing here bypasses the filter, and
 * nothing here calls a model.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { logEfError } from "../_shared/observe.ts";
import { countryOfPlace } from "../_shared/oeEligibility.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const FN = "oe-harvest-ats";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const TIMEOUT = 20_000;
const MAX_PER_ENTITY = 200;

type Job = { url: string; title: string; snippet?: string | null; published_at?: string | null };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const squash = (s: string) => (s || "").replace(/\s+/g, " ").trim();
const strip = (h: string) =>
  squash((h || "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&"));
const guessLang = (t: string) => (/[\u0600-\u06FF]/.test(t || "") ? "ar" : "en");
const iso = (v: unknown): string | null => {
  if (typeof v === "number") return new Date(v > 1e12 ? v : v * 1000).toISOString();
  if (typeof v === "string" && !isNaN(Date.parse(v))) return new Date(v).toISOString();
  return null;
};

function canonicalise(raw: string): string {
  try {
    const u = new URL(raw);
    u.hash = "";
    for (const p of [...u.searchParams.keys()]) {
      if (/^utm_|^fbclid$|^gclid$/i.test(p)) u.searchParams.delete(p);
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

async function req(url: string, init?: RequestInit): Promise<Response> {
  return await fetch(url, {
    ...init,
    headers: { "User-Agent": UA, Accept: "application/json, text/xml, */*", ...(init?.headers ?? {}) },
    signal: AbortSignal.timeout(TIMEOUT),
  });
}

// ───────────────────────── one adapter per system ─────────────────────────

const ADAPTERS: Record<
  string,
  (token: string, endpoint: string, entityName: string) => Promise<Job[]>
> = {
  // Greenhouse publishes its job-board data without authentication.
  async greenhouse(token) {
    const r = await req(`https://boards-api.greenhouse.io/v1/boards/${token}/jobs?content=false`);
    if (!r.ok) throw new Error(`http_${r.status}`);
    const d = await r.json();
    return (d?.jobs ?? []).map((j: any) => ({
      url: j.absolute_url,
      title: squash(j.title ?? ""),
      snippet: squash([j.location?.name, (j.departments ?? []).map((x: any) => x.name).join(", ")]
        .filter(Boolean).join(" — ")),
      published_at: iso(j.updated_at ?? j.first_published),
    }));
  },

  async lever(token, endpoint) {
    const r = await req(endpoint || `https://api.lever.co/v0/postings/${token}?mode=json`);
    if (!r.ok) throw new Error(`http_${r.status}`);
    const d = await r.json();
    return (Array.isArray(d) ? d : []).map((j: any) => ({
      url: j.hostedUrl ?? j.applyUrl,
      title: squash(j.text ?? ""),
      snippet: squash([j.categories?.location, j.categories?.team, j.categories?.commitment]
        .filter(Boolean).join(" — ")) || strip(j.descriptionPlain ?? "").slice(0, 400),
      published_at: iso(j.createdAt),
    }));
  },

  async ashby(token) {
    const r = await req(`https://api.ashbyhq.com/posting-api/job-board/${token}`);
    if (!r.ok) throw new Error(`http_${r.status}`);
    const d = await r.json();
    return (d?.jobs ?? []).map((j: any) => ({
      url: j.jobUrl ?? j.applyUrl,
      title: squash(j.title ?? ""),
      snippet: squash([j.location, j.department, j.employmentType].filter(Boolean).join(" — ")),
      published_at: iso(j.publishedAt),
    }));
  },

  async smartrecruiters(token) {
    const out: Job[] = [];
    for (let offset = 0; offset < 400; offset += 100) {
      const r = await req(
        `https://api.smartrecruiters.com/v1/companies/${token}/postings?limit=100&offset=${offset}`,
      );
      if (!r.ok) throw new Error(`http_${r.status}`);
      const d = await r.json();
      const page = d?.content ?? [];
      for (const j of page) {
        out.push({
          url: j.ref ? `https://jobs.smartrecruiters.com/${token}/${j.id}` : j.applyUrl,
          title: squash(j.name ?? ""),
          snippet: squash([j.location?.city, j.location?.country, j.department?.label]
            .filter(Boolean).join(" — ")),
          published_at: iso(j.releasedDate),
        });
      }
      if (page.length < 100) break;
    }
    return out;
  },

  // Unauthenticated internal endpoint, not a sanctioned API. Recorded as such.
  async workday(token) {
    const [tenant, wd, site] = token.split("|");
    if (!tenant || !wd || !site) throw new Error("token_not_three_parts");
    const base = `https://${tenant}.${wd}.myworkdayjobs.com`;
    const out: Job[] = [];
    for (let offset = 0; offset < 200; offset += 20) {
      const r = await req(`${base}/wday/cxs/${tenant}/${site}/jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appliedFacets: {}, limit: 20, offset, searchText: "" }),
      });
      if (!r.ok) throw new Error(`http_${r.status}`);
      const d = await r.json();
      const page = d?.jobPostings ?? [];
      for (const j of page) {
        out.push({
          url: `${base}/${site}${j.externalPath}`,
          title: squash(j.title ?? ""),
          snippet: squash([j.locationsText, j.timeType, j.postedOn].filter(Boolean).join(" — ")),
          published_at: null,
        });
      }
      if (page.length < 20) break;
    }
    return out;
  },

  // v1/widget is the public one. v3 is POST and IP-restricted; we do not use it.
  async workable(token) {
    const r = await req(`https://apply.workable.com/api/v1/widget/accounts/${token}`);
    if (!r.ok) throw new Error(`http_${r.status}`);
    const text = await r.text();
    let d: any;
    try { d = JSON.parse(text); } catch { throw new Error("not_json"); }
    return (d?.jobs ?? []).map((j: any) => ({
      url: j.url ?? j.application_url,
      title: squash(j.title ?? ""),
      snippet: squash([j.location, j.department, j.type].filter(Boolean).join(" — ")),
      published_at: iso(j.published_on ?? j.created_at),
    }));
  },

  // A 404 here is the reliable negative: the tenant simply does not exist.
  async recruitee(token) {
    const r = await req(`https://${token}.recruitee.com/api/offers/`);
    if (!r.ok) throw new Error(r.status === 404 ? "tenant_does_not_exist" : `http_${r.status}`);
    const d = await r.json();
    return (d?.offers ?? []).map((j: any) => ({
      url: j.careers_url ?? j.careers_apply_url,
      title: squash(j.title ?? ""),
      snippet: squash([j.location, j.department, j.employment_type].filter(Boolean).join(" — ")),
      published_at: iso(j.published_at ?? j.created_at),
    }));
  },

  async personio(token) {
    const r = await req(`https://${token}.jobs.personio.de/xml?language=en`);
    if (!r.ok) throw new Error(`http_${r.status}`);
    const xml = await r.text();
    const out: Job[] = [];
    for (const m of xml.matchAll(/<position>[\s\S]*?<\/position>/gi)) {
      const b = m[0];
      const pick = (t: string) =>
        strip(b.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`, "i"))?.[1] ?? "");
      const id = pick("id");
      if (!id) continue;
      out.push({
        url: `https://${token}.jobs.personio.de/job/${id}`,
        title: pick("name"),
        snippet: squash([pick("office"), pick("department"), pick("employmentType")]
          .filter(Boolean).join(" — ")),
        published_at: iso(pick("createdAt")),
      });
    }
    return out;
  },

  async pinpoint(token) {
    const r = await req(`https://${token}.pinpointhq.com/postings.json`);
    if (!r.ok) throw new Error(`http_${r.status}`);
    const d = await r.json();
    return (d?.data ?? d?.postings ?? []).map((j: any) => ({
      url: j.url ?? j.apply_url,
      title: squash(j.title ?? ""),
      snippet: squash([j.location?.name ?? j.location, j.department?.name ?? j.department]
        .filter(Boolean).join(" — ")),
      published_at: iso(j.published_at ?? j.created_at),
    }));
  },

  // Unproven in research. Implemented, tried, and reported as it actually behaves.
  async oracle_orc(token, endpoint) {
    const [tenant, dc, site] = token.split("|");
    const url = endpoint ||
      `https://${tenant}.${dc}.oraclecloud.com/hcmRestApi/resources/latest/recruitingCEJobRequisitions` +
      `?onlyData=true&expand=requisitionList&finder=findReqs;siteNumber=CX_1,limit=100`;
    let r = await req(url, { headers: { "REST-Framework-Version": "4" } });
    // Some Oracle tenants refuse the versioned header outright. Ask once more,
    // plainly, in English, before calling it a locked door.
    if (r.status === 403) r = await req(url, { headers: { "Accept-Language": "en" } });
    if (r.status === 403) throw new Error("oracle_forbidden");
    if (!r.ok) throw new Error(`http_${r.status}`);
    const d = await r.json();
    const list = d?.items?.[0]?.requisitionList ?? d?.items ?? [];
    return (Array.isArray(list) ? list : []).map((j: any) => ({
      url: `https://${tenant}.${dc}.oraclecloud.com/hcmUI/CandidateExperience/en/sites/${site || "CX_1"}/job/${j.Id ?? j.RequisitionId}`,
      title: squash(j.Title ?? ""),
      snippet: squash([j.PrimaryLocation, j.JobFamily, j.WorkplaceTypeCode].filter(Boolean).join(" — ")),
      published_at: iso(j.PostedDate),
    }));
  },

  // SuccessFactors publishes no open JSON. We read its list page as HTML and
  // keep only the /go/…/id/ role links it already shows the public.
  async successfactors_rmk(token, endpoint) {
    const base = endpoint || token;
    const out: Job[] = [];
    const seen = new Set<string>();
    // The list page shows 25 roles at a time and pages with startrow.
    for (let startrow = 0; startrow < MAX_PER_ENTITY; startrow += 25) {
      const url = base + (base.includes("?") ? "&" : "?") + `startrow=${startrow}`;
      const r = await req(url, { headers: { Accept: "text/html" } });
      if (!r.ok) {
        if (startrow === 0) throw new Error(`http_${r.status}`);
        break;
      }
      const html = await r.text();
      let added = 0;
      for (const m of html.matchAll(/<a\b[^>]*href=["']([^"']*\/job\/[^"']+)["'][^>]*>([\s\S]{0,200}?)<\/a>/gi)) {
        const title = strip(m[2]);
        if (title.length < 6) continue;
        let href: string;
        try { href = new URL(m[1], url).toString(); } catch { continue; }
        if (seen.has(href)) continue;
        seen.add(href);
        out.push({ url: href, title, snippet: title, published_at: null });
        added++;
      }
      if (!added) break;
    }
    if (!out.length) throw new Error("no_listings_in_html");
    return out;
  },

  async taleo(token, endpoint) {
    const r = await req(endpoint, { headers: { Accept: "text/html,application/json" } });
    if (!r.ok) throw new Error(`http_${r.status}`);
    const text = await r.text();
    const out: Job[] = [];
    for (const m of text.matchAll(/<a\b[^>]*href=["']([^"']*jobdetail[^"']*)["'][^>]*>([\s\S]{0,200}?)<\/a>/gi)) {
      const title = strip(m[2]);
      if (title.length < 6) continue;
      try { out.push({ url: new URL(m[1], endpoint).toString(), title, snippet: title, published_at: null }); }
      catch { /* skip */ }
    }
    if (!out.length) throw new Error("no_listings_in_html");
    return out;
  },
};

/**
 * For a careers page with no applicant-tracking system behind it: many still
 * embed schema.org JobPosting, which hands us structured roles without
 * scraping the layout.
 */
async function jsonLdJobs(careersUrl: string): Promise<Job[]> {
  const r = await req(careersUrl, { headers: { Accept: "text/html" } });
  if (!r.ok) throw new Error(`http_${r.status}`);
  const html = (await r.text()).slice(0, 500_000);
  const out: Job[] = [];
  const walk = (node: any) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) { node.forEach(walk); return; }
    const type = node["@type"];
    const isPosting = type === "JobPosting" ||
      (Array.isArray(type) && type.includes("JobPosting"));
    if (isPosting) {
      const url = node.url ?? node.sameAs ?? node.mainEntityOfPage?.["@id"] ?? careersUrl;
      const loc = node.jobLocation?.address?.addressLocality ??
        node.jobLocation?.[0]?.address?.addressLocality ?? "";
      out.push({
        url: typeof url === "string" ? url : careersUrl,
        title: squash(String(node.title ?? node.name ?? "")),
        snippet: squash([loc, node.employmentType, strip(String(node.description ?? "")).slice(0, 300)]
          .filter(Boolean).join(" — ")),
        published_at: iso(node.datePosted),
      });
    }
    for (const v of Object.values(node)) walk(v);
  };
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try { walk(JSON.parse(m[1].trim())); } catch { /* malformed block, skip it */ }
  }
  return out.filter((j) => j.title.length >= 6);
}

Deno.serve(async (req0) => {
  if (req0.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const CRON_SECRET = Deno.env.get("cron_secret") || Deno.env.get("CRON_SECRET") || "";
  const cronHeader = req0.headers.get("x-cron-secret") || "";
  const bearer = (req0.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!((!!CRON_SECRET && cronHeader === CRON_SECRET) || bearer === SERVICE_ROLE)) {
    return json({ error: "Forbidden" }, 403);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const body = await req0.json().catch(() => ({}));
  const jobId = body.job_id as string | undefined;
  const startedAt = new Date().toISOString();
  const deadline = Date.now() + 100_000;

  const { data: policy } = await admin
    .from("oe_policy_versions").select("params").eq("active", true).maybeSingle();
  const params = (policy?.params ?? {}) as Record<string, any>;
  const batch = Math.min(Number(body.batch ?? params.ats_batch ?? 25), 80);
  const includeJsonLd = body.jsonld !== false;

  const counts: Record<string, any> = {
    entities: 0, jobs: 0, new: 0, duplicate: 0, errors: 0,
    platform_unsupported: 0, oracle_forbidden: 0,
    unsupported_by_platform: {} as Record<string, number>,
    by_platform: {} as Record<string, number>,
    failures: {} as Record<string, string>,
  };

  /** The feed row that stands for one applicant-tracking system. */
  const feedCache = new Map<string, string | null>();
  async function feedFor(platform: string): Promise<string | null> {
    if (feedCache.has(platform)) return feedCache.get(platform)!;
    const name = `Employer boards — ${platform}`;
    const { data: found } = await admin.from("oe_feeds").select("id").eq("name", name).maybeSingle();
    let id = found?.id ?? null;
    if (!id) {
      const note = platform === "workday"
        ? "Unauthenticated internal endpoint used by the employer's own careers page, not a sanctioned public API. Risk recorded deliberately."
        : platform === "jsonld"
        ? "schema.org JobPosting data the employer publishes in its own page markup."
        : "Keyless public job-board API the platform documents as open for GET.";
      const { data: made } = await admin.from("oe_feeds").insert({
        name, kind: platform === "jsonld" ? "jsonld" : "ats",
        lane: "open", url: null, country: "SA", language: "en",
        cadence: "weekly", terms_ok: true, access_finding: "verified_permissive",
        terms_note: note, active: true, chair_types: ["role"],
      }).select("id").maybeSingle();
      id = made?.id ?? null;
    }
    feedCache.set(platform, id);
    return id;
  }

  try {
    let ents: any[] = [];
    if (body.entity_id) {
      const { data } = await admin.from("oe_entities")
        .select("id,name,ats_platform,ats_token,ats_endpoint,careers_url,harvest_cadence,last_harvested_at,harvest_runs,changed_runs,last_job_count")
        .eq("id", body.entity_id);
      ents = data ?? [];
    } else {
      const { data: withAts } = await admin.from("oe_entities")
        .select("id,name,ats_platform,ats_token,ats_endpoint,careers_url,harvest_cadence,last_harvested_at,harvest_runs,changed_runs,last_job_count")
        .eq("resolve_status", "resolved").not("ats_platform", "is", null)
        .order("last_harvested_at", { ascending: true, nullsFirst: true }).limit(batch);
      ents = withAts ?? [];
      if (includeJsonLd && ents.length < batch) {
        const { data: noAts } = await admin.from("oe_entities")
          .select("id,name,ats_platform,ats_token,ats_endpoint,careers_url,harvest_cadence,last_harvested_at,harvest_runs,changed_runs,last_job_count")
          .eq("resolve_status", "no_ats").not("careers_url", "is", null)
          .order("last_harvested_at", { ascending: true, nullsFirst: true })
          .limit(batch - ents.length);
        ents = ents.concat(noAts ?? []);
      }
    }

    // Cadence is measured, not decreed: a source that never changes is asked
    // less often, a source that changes every time is asked daily.
    const CADENCE_HOURS: Record<string, number> = { daily: 20, weekly: 24 * 6, monthly: 24 * 27 };
    const due = ents.filter((e) => {
      if (body.force === true || body.entity_id) return true;
      const last = e.last_harvested_at ? new Date(e.last_harvested_at).getTime() : 0;
      const hours = CADENCE_HOURS[e.harvest_cadence as string] ?? CADENCE_HOURS.weekly;
      return !last || Date.now() - last >= hours * 3600_000;
    });

    for (const e of due) {
      if (Date.now() > deadline) break;
      counts.entities++;
      const platform = (e.ats_platform as string | null) ?? "jsonld";
      const adapter = ADAPTERS[platform];
      // A system we have no adapter for is not a failure. It is simply read the
      // plain way, through whatever the careers page itself publishes.
      const unsupported = Boolean(e.ats_platform) && platform !== "jsonld" && !adapter;
      if (unsupported) {
        counts.platform_unsupported = (counts.platform_unsupported ?? 0) + 1;
        counts.unsupported_by_platform[platform] = (counts.unsupported_by_platform[platform] ?? 0) + 1;
      }
      const readPlainly = platform === "jsonld" || !e.ats_platform || unsupported;
      let jobs: Job[] = [];
      try {
        if (readPlainly) {
          if (!e.careers_url) throw new Error("no_careers_url");
          jobs = await jsonLdJobs(e.careers_url);
        } else {
          jobs = await adapter(e.ats_token ?? "", e.ats_endpoint ?? "", e.name);
        }
      } catch (err) {
        const msg = String((err as Error).message ?? err).slice(0, 120);
        // A locked Oracle door still leaves the employer's own careers page open.
        let recovered = false;
        if (!readPlainly && msg === "oracle_forbidden" && e.careers_url) {
          try { jobs = await jsonLdJobs(e.careers_url); recovered = true; } catch { /* stays a failure */ }
          counts.oracle_forbidden = (counts.oracle_forbidden ?? 0) + 1;
          await admin.from("oe_entities").update({ resolve_error: "oracle_forbidden" }).eq("id", e.id);
        }
        if (!recovered) {
          counts.errors++;
          counts.failures[platform] = counts.failures[platform]
            ? `${counts.failures[platform]}; ${e.name}: ${msg}`.slice(0, 400)
            : `${e.name}: ${msg}`;
          await admin.from("oe_entities").update({
            last_harvested_at: new Date().toISOString(),
            harvest_runs: (e.harvest_runs ?? 0) + 1,
            resolve_error: msg,
          }).eq("id", e.id);
          continue;
        }
      }

      jobs = jobs.filter((j) => j?.url && /^https?:/i.test(j.url) && (j.title ?? "").length >= 4)
        .slice(0, MAX_PER_ENTITY);
      counts.jobs += jobs.length;
      counts.by_platform[platform] = (counts.by_platform[platform] ?? 0) + jobs.length;

      const feedId = await feedFor(platform);
      const rows: Record<string, unknown>[] = [];
      const here = new Set<string>();
      for (const j of jobs) {
        const canonical = canonicalise(j.url);
        if (here.has(canonical)) continue;
        here.add(canonical);
        rows.push({
          feed_id: feedId,
          entity_id: e.id,
          url: j.url,
          canonical_url: canonical,
          title: `${j.title} — ${e.name}`.slice(0, 300),
          snippet: (j.snippet ?? j.title ?? "").slice(0, 600),
          published_at: j.published_at ?? null,
          // Global tenants return worldwide jobs: the posting's own location
          // decides its country, read in code. Unknown stays null, never dropped.
          country: countryOfPlace(j.snippet ?? null),
          lang: guessLang(`${j.title} ${j.snippet ?? ""}`),
          content_hash: await sha256(`${canonical}|${squash(j.title).toLowerCase()}`),
          raw: { source_kind: "ats", platform, entity: e.name },
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
      counts.duplicate += rows.length - fresh.length;

      let added = 0;
      for (let i = 0; i < fresh.length; i += 100) {
        const chunk = fresh.slice(i, i + 100);
        const { error, count } = await admin.from("oe_candidates")
          .upsert(chunk, { onConflict: "canonical_url", ignoreDuplicates: true, count: "exact" });
        if (!error) added += count ?? chunk.length;
      }
      counts.new += added;

      const runsNow = (e.harvest_runs ?? 0) + 1;
      const changedNow = (e.changed_runs ?? 0) + (added > 0 ? 1 : 0);
      // three runs in, let the measured change rate choose the next cadence
      let cadence = e.harvest_cadence ?? "weekly";
      if (runsNow >= 3) {
        const rate = changedNow / runsNow;
        cadence = rate >= 0.8 ? "daily" : rate >= 0.2 ? "weekly" : "monthly";
      }
      await admin.from("oe_entities").update({
        last_harvested_at: new Date().toISOString(),
        last_job_count: jobs.length,
        harvest_runs: runsNow,
        changed_runs: changedNow,
        harvest_cadence: cadence,
        resolve_error: null,
      }).eq("id", e.id);
    }

    await admin.from("oe_runs").insert({
      run_kind: "harvest_ats", started_at: startedAt, finished_at: new Date().toISOString(),
      outcome: counts.errors && !counts.new ? "error" : "ok", counts, cost_usd: 0,
    });
    if (jobId) await admin.rpc("complete_job", { p_id: jobId, p_success: true, p_error: null });

    return json({ ok: true, counts });
  } catch (e) {
    const msg = String((e as Error).message ?? e).slice(0, 500);
    await admin.from("oe_runs").insert({
      run_kind: "harvest_ats", started_at: startedAt, finished_at: new Date().toISOString(),
      outcome: "error", counts, cost_usd: 0, error: msg,
    });
    await logEfError(admin, { function_name: FN, error: e, severity: "medium" });
    if (jobId) await admin.rpc("complete_job", { p_id: jobId, p_success: false, p_error: msg });
    return json({ ok: false, error: msg, counts }, 500);
  }
});
