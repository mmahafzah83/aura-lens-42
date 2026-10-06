/**
 * MIRROR — the public read engine.
 *
 * Serves strangers with no account: no Authorization header, no user row, no
 * snapshot write. It reads a public LinkedIn profile plus recent posts through
 * Apify, asks one model for a plain-English read, and caches it by handle.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";
import { logAIUsage } from "../_shared/logAIUsage.ts";
import { logError } from "../_shared/logError.ts";
import { OPERATION_STAGES } from "../_shared/stageKeys.ts";
import { startRun, runIdFrom, type RunHandle } from "../_shared/operationRun.ts";
import { fetchPostItems, fetchCommentItems, filterOwnPosts, filterOwnComments, applyBudget, ownWritingBlocks, twelveMonthsAgo, type OwnPost, type OwnComment } from "../_shared/linkedinOwnWriting.ts";
import { ARABIC_VOICE_BLOCK, arabicGateDetail, arabicCorrectionText, repairValues, arabicQualityNotes, arabicFixInstruction, logArabicQuality, englishJuniorLabel, type ArabicGateDetail } from "../_shared/arabicVoice.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PROFILE_ACTOR = "harvestapi~linkedin-profile-scraper";
/** Bumped whenever the read prompt changes; older cached rows regenerate. */
const READ_VERSION = 4;
/** The Arabic read's own version: bumped with the shared Arabic voice. English rows are untouched. */
const READ_VERSION_AR = 5;
const versionFor = (l: "ar" | "en") => (l === "ar" ? READ_VERSION_AR : READ_VERSION);
/** A read older than this is always regenerated. */
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Has anything new been learned about this person since the cached read?
 * A newer LinkedIn snapshot or a CV uploaded after generated_at both count.
 */
async function hasFresherEvidence(
  admin: ReturnType<typeof createClient>,
  handle: string,
  generated_at: string,
): Promise<boolean> {
  const { data: owners } = await admin
    .from("diagnostic_profiles")
    .select("user_id, linkedin_handle, linkedin_url")
    .or(`linkedin_handle.eq.${handle.toLowerCase()},linkedin_url.ilike.%/${handle.toLowerCase()}%`)
    .limit(5);
  const ids = (owners ?? []).map((o: any) => o.user_id).filter(Boolean);
  if (!ids.length) return false;

  const [{ count: snapCount }, { count: cvCount }] = await Promise.all([
    admin
      .from("linkedin_profile_snapshots")
      .select("id", { count: "exact", head: true })
      .in("user_id", ids)
      .gt("fetched_at", generated_at),
    admin
      .from("documents")
      .select("id", { count: "exact", head: true })
      .in("user_id", ids)
      .eq("document_type", "cv")
      .gt("created_at", generated_at),
  ]);
  return (snapCount ?? 0) > 0 || (cvCount ?? 0) > 0;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

/** Pull the handle out of any linkedin.com/in/<handle> shape. */
function parseHandle(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const cleaned = raw.trim().split("?")[0].split("#")[0];
  const m = cleaned.match(/linkedin\.com\/in\/([^/?#\s]+)/i) ?? cleaned.match(/^\/?in\/([^/?#\s]+)/i);
  const handle = (m?.[1] ?? "").replace(/[.,;:)\]]+$/, "").replace(/\/+$/, "").trim().toLowerCase();
  return handle ? handle : null;
}

function pickText(item: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = item[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

function pickInt(item: Record<string, unknown>, keys: string[]): number | null {
  for (const k of keys) {
    const v = item[k];
    const n = typeof v === "string" ? Number(v.replace(/[^\d]/g, "")) : Number(v);
    if (Number.isFinite(n) && n >= 0 && v !== null && v !== undefined && v !== "") return Math.floor(n);
  }
  return null;
}

function pickArray(item: Record<string, unknown>, keys: string[]): unknown[] | null {
  for (const k of keys) {
    const v = item[k];
    if (Array.isArray(v) && v.length) return v;
  }
  return null;
}

function pickLocation(item: Record<string, unknown>): string | null {
  const direct = pickText(item, ["location", "locationName", "geoLocationName", "addressWithCountry"]);
  if (direct) return direct;
  const raw = item.location ?? item.geo ?? item.locationParsed;
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    const parts = ["linkedinText", "full", "city", "state", "region", "country", "countryCode"]
      .map((k) => (typeof o[k] === "string" ? (o[k] as string).trim() : ""))
      .filter(Boolean);
    const seen = new Set<string>();
    const line = parts.filter((p) => (seen.has(p) ? false : (seen.add(p), true))).join(", ");
    if (line) return line;
  }
  return null;
}

/** The profile picture, wherever this actor decided to put it. */
function pickPicture(item: Record<string, unknown>): string | null {
  const direct = pickText(item, [
    "profilePicture", "profilePictureUrl", "profilePicHighQuality", "profilePic",
    "pictureUrl", "photoUrl", "avatar", "avatarUrl", "imageUrl", "image",
  ]);
  if (direct && /^https?:\/\//i.test(direct)) return direct.slice(0, 1000);
  const raw = item.profilePicture ?? item.picture ?? item.photo ?? item.image;
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    const nested = pickText(o, ["url", "large", "medium", "original", "displayImage"]);
    if (nested && /^https?:\/\//i.test(nested)) return nested.slice(0, 1000);
  }
  return null;
}

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Apify profile scrape — three input shapes, 45s per attempt.
 * Returns the record, or a reason: "unreadable" (the profile) or
 * "provider_limit" (our scraping plan is capped — not the visitor's fault).
 */
async function fetchProfile(
  canonical_url: string,
  token: string,
): Promise<{ item: Record<string, unknown> | null; reason?: "provider_limit" }> {
  const inputShapes: Record<string, unknown>[] = [
    { urls: [canonical_url], profileScraperMode: "Profile details no email ($4 per 1k)" },
    { urls: [canonical_url] },
    { queries: [canonical_url] },
  ];
  for (const input of inputShapes) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 45_000);
    let res: Response;
    try {
      res = await fetch(
        `https://api.apify.com/v2/acts/${PROFILE_ACTOR}/run-sync-get-dataset-items?token=${token}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
          signal: controller.signal,
        },
      );
    } catch (e) {
      console.error("mirror-read profile fetch failed:", e instanceof Error ? e.message : String(e));
      continue;
    } finally {
      clearTimeout(timer);
    }
    if (res.status !== 200 && res.status !== 201) {
      console.error(`mirror-read profile scrape status ${res.status}:`, (await res.text()).slice(0, 300));
      continue;
    }
    const raw = await res.text();
    const payload = (() => { try { return JSON.parse(raw); } catch { return null; } })();
    const list: any[] = Array.isArray(payload) ? payload : [];
    const candidate = (list.find((r) => r && typeof r === "object" && !r.error) ?? null) as
      | Record<string, unknown>
      | null;
    if (candidate) return { item: candidate };
    const firstError = String((list[0] as { error?: unknown })?.error ?? "");
    console.error("mirror-read profile scrape returned no rows:", Object.keys(input).join(", "), firstError.slice(0, 200));
    // The scraping plan itself is capped — retrying other shapes cannot help.
    if (/limited to \d+ runs|upgrade to a paid plan|usage hard limit/i.test(firstError)) {
      return { item: null, reason: "provider_limit" };
    }
  }
  return { item: null };
}

/** Strip fences, take the outermost braces. */
/**
 * The model sometimes stops mid-sentence. Walk the text tracking string and
 * escape state, cut back to the last position outside a string, then close
 * whatever brackets are still open. A truncated read used to read as garbage.
 */
function repairTruncatedJson(input: string): string {
  let inStr = false, esc = false, lastSafe = -1;
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (esc) { esc = false; continue; }
    if (c === "\\") { esc = true; continue; }
    if (c === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (c === "}" || c === "]" || c === ",") lastSafe = i;
  }
  let s = inStr && lastSafe > 0 ? input.slice(0, lastSafe + 1) : input;
  const stk: string[] = [];
  let inS = false, es = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (es) { es = false; continue; }
    if (c === "\\") { es = true; continue; }
    if (c === '"') { inS = !inS; continue; }
    if (inS) continue;
    if (c === "{") stk.push("}");
    else if (c === "[") stk.push("]");
    else if (c === "}" || c === "]") stk.pop();
  }
  s = s.replace(/[,\s]+$/, "");
  while (stk.length) s += stk.pop();
  return s;
}

function parseJsonLoose(raw: string): Record<string, unknown> | null {
  let t = (raw ?? "").trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const start = t.indexOf("{");
  if (start === -1) return null;
  t = t.slice(start);
  const end = t.lastIndexOf("}");
  const candidates = end > 0 ? [t.slice(0, end + 1), t] : [t];
  for (const c of candidates) {
    for (const attempt of [c, repairTruncatedJson(c)]) {
      try {
        const parsed = JSON.parse(attempt);
        if (parsed && typeof parsed === "object") return parsed as Record<string, unknown>;
      } catch { /* try the next shape */ }
    }
  }
  return null;
}

/**
 * LinkedIn text sometimes carries half an emoji: a high surrogate with no
 * partner. That single character makes the request body invalid JSON and the
 * whole read fails. Drop unpaired surrogates before anything is sent.
 */
function stripLoneSurrogates(s: string): string {
  return (s ?? "").replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g, "")
    .replace(/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "");
}

/** Placeholders are only meaningful inside the model's own sentences. */
function hasPlaceholderInValues(v: unknown): boolean {
  const re = /\[[^\]]{2,40}\]/;
  if (typeof v === "string") return re.test(v);
  if (Array.isArray(v)) return v.some(hasPlaceholderInValues);
  if (v && typeof v === "object") return Object.values(v as Record<string, unknown>).some(hasPlaceholderInValues);
  return false;
}


const SYSTEM_PROMPT =
  "You read a senior professional's public LinkedIn profile and recent posts, and tell them how their market currently sees them. Address the reader directly as 'you' in every sentence. Never refer to them by name or in the third person — this is their mirror, not a report about them. You use only what is in the material. You never invent an achievement, a number, a date or an employer. Output plain text only — no markdown, no asterisks, no headers, no bracketed placeholders. The reader is a senior GCC executive: write plainly, in short sentences, as a trusted advisor would over coffee. Never use these words: authority, trajectory, personal brand, thought leader, leverage as a verb, delve, landscape, navigate, realm, synergy, utilize, robust, seamless, journey, unlock, empower, elevate. ARCHETYPE RULE: the name is 'The [Adjective] [Noun]'. 'Strategic' is banned as the adjective and 'Architect' is banned as the noun. The noun names what the member actually is or does at his real level, read from his current role and record (for example founder, professor, director, builder of something specific, adviser to a named kind of client); the adjective names the one thing his evidence shows that distinguishes him. Never a passive or junior noun for a senior person: not Observer, Watcher, Follower, Listener, Learner, Student or Teacher. Before naming it, ask yourself whether the name would fit half of all senior professionals; if so it is too generic, choose again from what THIS person's material actually shows.";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  let refund: () => Promise<void> = async () => {};
  /* One run row per fresh read. Cached reads cost nothing and are not runs. */
  let run: RunHandle | null = null;
  const finish = async (outcome: "ok" | "refused" | "failed", reason_code?: string) => {
    try { await run?.finish({ outcome, reason_code: reason_code ?? null }); }
    catch (e) { console.error("[mirror-read] run finish failed:", (e as Error)?.message); }
  };

  try {
    let body: any = {};
    try { body = await req.json(); } catch { /* empty body */ }

    // --- a) Validate ---
    // Email is optional: the read is a cold read. If given, it is recorded as-is.
    const rawEmail = typeof body?.email === "string" ? body.email.trim() : "";
    const email = rawEmail || null;

    // Optional referral tag — narrow charset, capped length.
    const refClean = (typeof body?.ref === "string" ? body.ref : "")
      .replace(/[^A-Za-z0-9_-]/g, "")
      .slice(0, 60);
    const ref = refClean || null;

    const handle = parseHandle(body?.profile_url);
    if (!handle) return json({ error: "invalid_url" }, 400);
    const canonical_url = `https://www.linkedin.com/in/${handle}`;

    /**
     * An explicit "read again" from the visitor. It only disqualifies the
     * cached row — metering, rate limiting and the stale fallbacks below are
     * untouched, so a forced read costs exactly what any fresh read costs.
     */
    const force = body?.force === true;
    /** The language the visitor was using. Anything but "ar" is English. */
    const lang: "ar" | "en" = body?.ui_lang === "ar" ? "ar" : "en";

    const fwd = req.headers.get("x-forwarded-for") ?? "";
    const parts = fwd.split(",").map((s) => s.trim()).filter(Boolean);
    const clientIp = parts.length ? parts[parts.length - 1] : "";
    const ip_hash = await sha256Hex(clientIp);

    // --- b) Cache — served before metering. A cached read costs nothing to
    // produce, so it must not consume the visitor's hourly allowance.
    const { data: cached } = await admin
      .from("mirror_reads")
      .select("handle, read, sparse, generated_at, hit_count, name, headline, avatar_url, posts_read, comments_read, read_version, read_ar, sparse_ar, generated_at_ar, read_version_ar")
      .eq("handle", handle)
      .maybeSingle();

    /** One language's read out of the shared row. A null read is no read. */
    type View = { read: any; sparse: boolean; generated_at: string; read_version: number };
    const viewOf = (l: "ar" | "en"): View | null => {
      if (!cached) return null;
      const c = cached as any;
      const v = l === "ar"
        ? { read: c.read_ar, sparse: !!c.sparse_ar, generated_at: c.generated_at_ar, read_version: c.read_version_ar ?? 1 }
        : { read: c.read, sparse: !!c.sparse, generated_at: c.generated_at, read_version: c.read_version ?? 1 };
      return v.read && v.generated_at ? v : null;
    };
    const mine = viewOf(lang);
    const withinTtl =
      !!mine &&
      mine.read_version >= versionFor(lang) &&
      Date.now() - new Date(mine.generated_at).getTime() < CACHE_TTL_MS;
    const stale =
      withinTtl && (await hasFresherEvidence(admin, handle, mine!.generated_at));

    if (withinTtl && !stale && !force) {
      await admin
        .from("mirror_reads")
        .update({ hit_count: (cached!.hit_count ?? 1) + 1 })
        .eq("handle", handle);
      return json({
        ok: true, cached: true, sparse: mine!.sparse, handle, read: mine!.read,
        name: cached!.name ?? null, posts_read: cached!.posts_read ?? 0,
        comments_read: (cached as any)!.comments_read ?? 0,
        headline: cached!.headline ?? null, avatar_url: cached!.avatar_url ?? null,
        generated_at: mine!.generated_at, lang, lang_fallback: false,
      });
    }

    const noticeFor = (l: "ar" | "en", iso: string) => l === "ar"
      ? `آخر قراءة بتاريخ ${new Date(iso).toLocaleDateString("ar-SA-u-nu-latn-ca-gregory", {
          day: "numeric", month: "long", year: "numeric",
        })}.`
      : `Last read on ${new Date(iso).toLocaleDateString("en-GB", {
          day: "numeric", month: "long", year: "numeric",
        })}.`;

    /** Serve one language's saved read, quietly dated. */
    function serveView(v: View, l: "ar" | "en", withNotice: boolean): Response {
      return json({
        ok: true, cached: true, ...(withNotice ? { stale: true } : {}), sparse: v.sparse, handle,
        read: v.read, name: cached?.name ?? null,
        posts_read: cached?.posts_read ?? 0,
        comments_read: (cached as any)?.comments_read ?? 0,
        headline: cached?.headline ?? null, avatar_url: cached?.avatar_url ?? null,
        generated_at: v.generated_at,
        ...(withNotice ? { notice: noticeFor(l, v.generated_at) } : {}),
        lang: l, lang_fallback: l !== lang,
      });
    }

    /**
     * A failed regeneration must not break a page we can still fill. Serve the
     * stale row with a quiet note about its age. An Arabic visitor with no
     * Arabic read yet gets the English one, marked as such.
     */
    function serveStale(): Response | null {
      if (mine) return serveView(mine, lang, true);
      if (lang === "ar") {
        const en = viewOf("en");
        if (en) return serveView(en, "en", true);
      }
      return null;
    }

    if (!clientIp) return serveStale() ?? json({ error: "unreadable" }, 503);

    // --- c) Rate limit — only fresh reads are metered ---
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count } = await admin
      .from("mirror_requests")
      .select("id", { count: "exact", head: true })
      .eq("ip_hash", ip_hash)
      .gte("created_at", since);
    if ((count ?? 0) >= 5) return serveStale() ?? json({ error: "rate_limited" }, 429);

    run = await startRun(admin, {
      id: runIdFrom(body),
      operation: "linkedin_read",
      /* The tab watching this run needs a claim on it: a signed-in member has
         none here (this is the public engine), so the anonymous session token
         is what the tick channel reads by. */
      anon_token: typeof body?.anon_token === "string" ? body.anon_token : null,
      fingerprint_hash: ip_hash,
      meta: { handle, force, regenerating: !!mine, lang },
    });

    const { data: metered } = await admin
      .from("mirror_requests")
      .insert({ ip_hash, handle, email, ref })
      .select("id")
      .maybeSingle();
    /**
     * A failure on our side must not cost the visitor an attempt. The row is
     * marked, never deleted: it is the only record the attempt happened.
     */
    refund = async () => {
      if (metered?.id) {
        await admin.from("mirror_requests")
          .update({ status: "refunded_failure" })
          .eq("id", metered.id);
      }
    };

    const APIFY_TOKEN = Deno.env.get("APIFY_TOKEN");
    if (!APIFY_TOKEN) {
      await refund();
      await logError("mirror-read", new Error("APIFY_TOKEN is not configured"), {
        user_id: null, severity: "high", context: { handle, path: "not_configured" },
      });
      await finish("failed", "not_configured");
      return serveStale() ?? json({ error: "not_configured" }, 400);
    }

    // --- d) Fetch profile and posts in parallel ---
    /* Stage one opens: the profile request, until the provider answers. */
    run?.mark(OPERATION_STAGES.linkedin_read[0]);
    const profilePromise = fetchProfile(canonical_url, APIFY_TOKEN);
    const postsPromise = fetchPostItems(canonical_url, APIFY_TOKEN).catch(() => [] as unknown[]);
    const commentsPromise = fetchCommentItems(canonical_url, APIFY_TOKEN).catch(() => [] as unknown[]);
    /* Real boundary: the profile is back. Stage two is the posts read. */
    const profile = await profilePromise;
    run?.mark(OPERATION_STAGES.linkedin_read[1]);
    const [postItems, commentItems] = await Promise.all([postsPromise, commentsPromise]);
    const writingSince = twelveMonthsAgo();
    const budgeted = applyBudget(
      filterOwnPosts(postItems, handle, writingSince),
      filterOwnComments(commentItems, handle, writingSince),
    );
    const ownPosts: OwnPost[] = budgeted.posts;
    const ownComments: OwnComment[] = budgeted.comments;
    const postTexts = ownPosts.map((p) => p.text);
    const fetch_stats = {
      post_items: postItems.length, comment_items: commentItems.length,
      posts_kept: ownPosts.length, quote_posts_kept: ownPosts.filter((p) => p.quote).length,
      comments_kept: ownComments.length, chars_sent: budgeted.chars,
    };
    console.log("[mirror-read] own writing:", JSON.stringify(fetch_stats));
    /* Real boundary: the posts are back. Stage three is the evidence we keep. */
    run?.mark(OPERATION_STAGES.linkedin_read[2]);
    const item = profile.item;
    if (!item) {
      // The provider cap is ours, not theirs — give the attempt back.
      if (profile.reason === "provider_limit") {
        await refund();
        await logError("mirror-read", new Error("Apify scraping plan is capped — reads cannot be produced"), {
          user_id: null, severity: "high", context: { handle, path: "provider_limit" },
        });
      }
      const fallback = serveStale();
      if (fallback) {
        await finish("failed", profile.reason === "provider_limit" ? "provider_limit" : "profile_unreadable");
        return fallback;
      }
      if (profile.reason === "provider_limit") {
        await finish("failed", "provider_limit");
        return json({ error: "provider_limit" }, 503);
      }
      await refund();
      await finish("failed", "profile_unreadable");
      return json({ error: "profile_unreadable" }, 502);
    }

    const firstName = pickText(item, ["firstName", "first_name", "givenName"]);
    const lastName = pickText(item, ["lastName", "last_name", "familyName"]);
    const joined = [firstName, lastName].filter(Boolean).join(" ").trim();
    const full_name = joined || pickText(item, ["fullName", "name", "displayName", "title"]);
    const headline = pickText(item, ["headline", "occupation", "subtitle"]);
    const avatar_url = pickPicture(item);
    const about = pickText(item, ["about", "summary", "bio", "description"]);
    const location = pickLocation(item);
    const followers = pickInt(item, ["followerCount", "followersCount", "followers"]);
    const experience = pickArray(item, ["experience", "experiences", "positions", "workExperience"]) ?? [];
    const education = pickArray(item, ["education", "educations", "schools"]) ?? [];
    const skills = pickArray(item, ["skills", "topSkills"]) ?? [];
    const certifications = pickArray(item, ["certifications", "certificates", "licenses"]) ?? [];
    const projects = pickArray(item, ["projects"]) ?? [];
    const recommendations = pickArray(item, ["receivedRecommendations", "recommendations"]) ?? [];
    const registeredAt = pickText(item, ["registeredAt", "registered_at", "joinedAt"]);

    /**
     * THE RECORD, NOT ONLY THE READ.
     *
     * The model returns seven sentences; the profile behind them is fetched
     * here and thrown away everywhere else, which left the anonymous member's
     * "What Aura found in your record" card empty. These are the same fields
     * the signed-in path reads out of `linkedin_profile_snapshots.raw`, cut to
     * what screen 1 actually renders. Stored inside `read` so the cache path
     * serves them too.
     */
    const skillNames = skills
      .map((s: any) => (typeof s === "string" ? s : String(s?.name ?? "")).trim())
      .filter(Boolean);
    const recQuote = (() => {
      for (const r of recommendations as any[]) {
        const body = String(r?.description ?? r?.text ?? "").replace(/\s+/g, " ").trim();
        const title = String(r?.givenByHeadline ?? r?.headline ?? "").split("|")[0].trim().slice(0, 90);
        const parts = (body.match(/[^.!?]+[.!?]/g) || []).map((x: string) => x.trim());
        for (let i = 0; i < parts.length; i++) {
          const two = parts[i + 1] ? `${parts[i]} ${parts[i + 1]}` : null;
          const pick = two && two.length >= 80 && two.length <= 300
            ? two
            : (parts[i].length >= 60 && parts[i].length <= 300 ? parts[i] : null);
          if (pick && title) return { text: pick, title };
        }
      }
      return null;
    })();
    const rawFacts = {
      about: about ?? null,
      location: location ?? null,
      followers: followers ?? null,
      registeredAt: registeredAt ?? null,
      experience: experience.slice(0, 12).map((e: any) => ({
        position: String(e?.position ?? e?.title ?? "").trim() || null,
        companyName: String(e?.companyName ?? e?.company ?? "").trim() || null,
      })),
      roles_count: experience.length,
      skills_count: skillNames.length,
      topSkills: skillNames.slice(0, 5),
      certifications_count: certifications.length,
      projects_count: projects.length,
      recommendations_count: recommendations.length,
      recommendation_quote: recQuote,
      /* Their own writing, counted — the same figure the signed-in card shows. */
      own_words: [...postTexts, ...ownComments.map((c) => c.text)].reduce((a, t) => a + t.split(/\s+/).filter(Boolean).length, 0),
    };

    // --- e) Sparse mode ---
    const sparse = (!about && experience.length < 2) || (postTexts.length === 0 && ownComments.length === 0);

    const trunc = (v: unknown, n: number) => JSON.stringify(v ?? null).slice(0, n);
    const userPromptFor = (l: "ar" | "en") => [
      `NAME: ${full_name ?? "unknown"}`,
      `HEADLINE: ${(headline ?? "").slice(0, 400)}`,
      `LOCATION: ${(location ?? "").slice(0, 200)}`,
      `FOLLOWERS: ${followers ?? "unknown"}`,
      `ABOUT: ${(about ?? "").slice(0, 4000)}`,
      `EXPERIENCE: ${trunc(experience.slice(0, 12), 6000)}`,
      `EDUCATION: ${trunc(education.slice(0, 8), 2000)}`,
      `SKILLS: ${trunc(skills.slice(0, 40), 1500)}`,
      `CERTIFICATIONS: ${trunc(certifications.slice(0, 15), 1500)}`,
      "",
      ownWritingBlocks(ownPosts, ownComments),
      "",
      sparse
        ? "Your public material is thin. Say so directly, speaking to the reader as 'you' in market_read and honest_gap — name what is missing and what would change it. Do not compensate by guessing."
        : "",
      "",
      "Every sentence you write must address the reader as 'you'. Return exactly this JSON and nothing else:",
      `{
  "archetype": "${l === "ar" ? "اسم معرّف + صفة معرّفة" : "The [Adjective] [Noun]"}",
  "market_read": "two sentences on how your field currently sees you, from the evidence",
  "themes": ["three short career themes read from your own material"],
  "uncontested_space": "one sentence naming a space your material suggests you could own",
  "honest_gap": "one sentence naming something your public presence does not show, that your own material implies you have",
  "own_words_quote": "one verbatim sentence from YOUR POSTS or YOUR COMMENTS — your own words only, never from the context of a post you replied to — or null if neither was supplied",
  "own_words_read": "one sentence on what that quote shows about how you think, or null"
}`,
    ].join("\n");

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) {
      await refund();
      await logError("mirror-read", new Error("ANTHROPIC_API_KEY is not configured"), {
        user_id: null, severity: "high", context: { handle, path: "not_configured" },
      });
      await finish("failed", "not_configured");
      return serveStale() ?? json({ error: "not_configured" }, 400);
    }

    async function callModel(messages: { role: string; content: string }[], l: "ar" | "en") {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": ANTHROPIC_API_KEY!,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-5-20250929",
          /* The seven-key read runs long; 1500 cut it mid-sentence. */
          max_tokens: 4000,
          temperature: 0.3,
          system: l === "ar" ? SYSTEM_PROMPT + "\n\n" + ARABIC_VOICE_BLOCK : SYSTEM_PROMPT,
          messages,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.error("[mirror-read] model call failed:", res.status, JSON.stringify(data?.error ?? {}).slice(0, 300));
      }
      const text = (data?.content ?? [])
        .map((c: any) => (typeof c?.text === "string" ? c.text : ""))
        .join("")
        .trim();
      if (data?.stop_reason === "max_tokens") {
        console.warn("[mirror-read] model output hit the token ceiling; repairing.");
      }
      await logAIUsage({
        user_id: null,
        function_name: "mirror-read",
        provider: "anthropic",
        model: "claude-sonnet-4-5-20250929",
        input_tokens: data?.usage?.input_tokens ?? 0,
        output_tokens: data?.usage?.output_tokens ?? 0,
        success: !!text,
        metadata: { handle, sparse, lang: l },
      });
      return text;
    }

    /**
     * One language attempt: a draft, and at most ONE correction pass, shared
     * between the shape check and (for Arabic) the Arabic gate.
     */
    async function generate(l: "ar" | "en"): Promise<
      { read: Record<string, unknown> | null; raw: string; gateFail: ArabicGateDetail | null }
    > {
      const messages = [{ role: "user", content: stripLoneSurrogates(userPromptFor(l)) }];
      let raw = await callModel(messages, l);
      let read = parseJsonLoose(raw);
      if (read && hasPlaceholderInValues(read)) read = null;
      if (l === "ar" && read) read = repairValues(read, ["own_words_quote", "raw"]);
      let gateFail = l === "ar" && read ? arabicGateDetail(read, { skipKeys: ["own_words_quote", "raw"] }) : null;
      const qOpts = { skipKeys: ["own_words_quote", "raw"], allowLatin: [full_name, headline] };
      const quality0 = l === "ar" && read ? arabicQualityNotes(read, qOpts) : [];
      const firstRead = read;
      const enJunior = l === "en" && read ? englishJuniorLabel(read) : null;

      if (!read || gateFail || quality0.length || enJunior) {
        // One correction pass: the shape was wrong, a placeholder survived, or the Arabic failed.
        const correctionMessages = [...messages];
        if (raw) correctionMessages.push({ role: "assistant", content: raw });
        correctionMessages.push({
          role: "user",
          content: gateFail || (read && quality0.length)
            ? (gateFail ? arabicCorrectionText(gateFail) + " " : "") + (quality0.length ? arabicFixInstruction(quality0) : "") + " Return ONLY the JSON object with the same seven keys (keys in English, values in Arabic, own_words_quote verbatim), no markdown fences, no commentary."
            : enJunior && read
            ? `The archetype uses "${enJunior.word}", a passive or junior noun for a senior person. Rename it: the noun is what this person actually is or does at his real level, the adjective the one thing his evidence shows. Keep every other value exactly. Return ONLY the JSON object with the same seven keys, no markdown fences, no commentary.`
            : "That was not usable. Return ONLY the JSON object with those exact seven keys, filled with real sentences drawn from the material. No markdown fences, no commentary, and no bracketed placeholders anywhere.",
        });
        raw = await callModel(correctionMessages, l);
        read = parseJsonLoose(raw);
        if (read && hasPlaceholderInValues(read)) read = null;
        if (l === "ar" && read) read = repairValues(read, ["own_words_quote", "raw"]);
        gateFail = l === "ar" && read ? arabicGateDetail(read, { skipKeys: ["own_words_quote", "raw"] }) : null;
        /* A first draft that only had quality findings stays if the correction is unusable. */
        if ((!read || gateFail) && firstRead && (quality0.length || enJunior) && !arabicGateDetail(firstRead, { skipKeys: ["own_words_quote", "raw"] })) {
          read = firstRead; gateFail = null;
        }
      }
      if (quality0.length) {
        const after = read ? arabicQualityNotes(read, qOpts) : quality0;
        await logArabicQuality(admin, "mirror-read", quality0, after);
      }
      return { read: gateFail ? null : read, raw, gateFail };
    }

    /* Stage four opens: the model writing the read. */
    run?.mark(OPERATION_STAGES.linkedin_read[3]);
    let outLang: "ar" | "en" = lang;
    let attempt = await generate(lang);

    if (lang === "ar" && !attempt.read) {
      await logError("mirror-read", new Error("Arabic read unusable after one correction"), {
        user_id: null, severity: "high",
        context: { handle, path: "arabic_gate", failed_check: attempt.gateFail?.check ?? "unreadable", field: attempt.gateFail?.field ?? null },
      });
      /* Ruling 3: serve the English read instead, and say so. */
      const en = viewOf("en");
      if (en && en.read_version >= READ_VERSION) {
        await finish("ok", "arabic_fallback_cached");
        return serveView(en, "en", Date.now() - new Date(en.generated_at).getTime() >= CACHE_TTL_MS);
      }
      outLang = "en";
      attempt = await generate("en");
    }

    let read = attempt.read;
    const raw = attempt.raw;

    if (!read) {
      await logError("mirror-read", new Error("unreadable model output"), {
        user_id: null,
        severity: "high",
        context: { handle, sparse, lang: outLang, raw_head: (raw ?? "").slice(0, 500), raw_length: (raw ?? "").length },
      });
      await refund();
      await finish("failed", "unreadable");
      return serveStale() ?? json({ error: "unreadable" }, 502);
    }

    // --- 4) Cache and return ---
    /* The read the client receives carries the record it was drawn from. */
    read = { ...read, raw: rawFacts };
    const generated_at = new Date().toISOString();
    const shared = {
      handle,
      canonical_url,
      name: full_name ?? null,
      headline: headline ?? null,
      avatar_url,
      posts_read: postTexts.length,
      comments_read: ownComments.length,
      hit_count: (cached?.hit_count ?? 0) + 1,
    };
    /* Each language writes only its own columns. */
    const langCols = outLang === "ar"
      ? { read_ar: read, sparse_ar: sparse, read_version_ar: READ_VERSION_AR, generated_at_ar: generated_at }
      : { read, sparse, read_version: READ_VERSION, generated_at };
    const { error: upErr } = await admin
      .from("mirror_reads")
      .upsert({ ...shared, ...langCols } as any, { onConflict: "handle" });
    if (upErr) console.error("[mirror-read] cache write failed:", upErr.message);

    await finish("ok");
    return json({
      ok: true, cached: false, sparse, handle, read,
      name: full_name ?? null, headline: headline ?? null, avatar_url,
      posts_read: postTexts.length, comments_read: ownComments.length, generated_at, fetch_stats,
      lang: outLang, lang_fallback: outLang !== lang,
    });
  } catch (e) {
    await refund();
    await logError("mirror-read", e, { user_id: null, severity: "high" });
    await finish("failed", "exception");
    return json({ error: "unreadable" }, 502);
  }
});
