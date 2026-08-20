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

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PROFILE_ACTOR = "harvestapi~linkedin-profile-scraper";
const POSTS_ACTOR = "harvestapi~linkedin-profile-posts";
const MAX_POSTS = 20;
/** Bumped whenever the read prompt changes; older cached rows regenerate. */
const READ_VERSION = 2;
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

/** Apify posts scrape — never fatal. */
async function fetchPosts(canonical_url: string, handle: string, token: string): Promise<string[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45_000);
  let res: Response;
  try {
    res = await fetch(
      `https://api.apify.com/v2/acts/${POSTS_ACTOR}/run-sync-get-dataset-items?token=${token}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetUrls: [canonical_url],
          maxPosts: MAX_POSTS,
          scrapeReactions: false,
          scrapeComments: false,
        }),
        signal: controller.signal,
      },
    );
  } catch (_e) {
    return [];
  } finally {
    clearTimeout(timer);
  }
  if (res.status !== 200 && res.status !== 201) return [];
  const items = await res.json().catch(() => null);
  const list: any[] = Array.isArray(items) ? items : [];
  const wanted = handle.toLowerCase();
  const texts: string[] = [];
  for (const it of list) {
    const who = String(it?.author?.publicIdentifier ?? "").toLowerCase();
    if (who && who !== wanted) continue;
    const content = typeof it?.content === "string" ? it.content.trim() : "";
    if (!content) continue;
    texts.push(content.slice(0, 600));
    if (texts.length >= MAX_POSTS) break;
  }
  return texts;
}

/** Strip fences, take the outermost braces. */
function parseJsonLoose(raw: string): Record<string, unknown> | null {
  let t = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  t = t.slice(start, end + 1);
  try {
    const parsed = JSON.parse(t);
    return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
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
  "You read a senior professional's public LinkedIn profile and recent posts, and tell them how their market currently sees them. Address the reader directly as 'you' in every sentence. Never refer to them by name or in the third person — this is their mirror, not a report about them. You use only what is in the material. You never invent an achievement, a number, a date or an employer. Output plain text only — no markdown, no asterisks, no headers, no bracketed placeholders. The reader is a senior GCC executive: write plainly, in short sentences, as a trusted advisor would over coffee. Never use these words: authority, trajectory, personal brand, thought leader, leverage as a verb, delve, landscape, navigate, realm, synergy, utilize, robust, seamless, journey, unlock, empower, elevate. ARCHETYPE RULE: the name is 'The [Adjective] [Noun]'. 'Strategic' is banned as the adjective and 'Architect' is banned as the noun. Before naming it, ask yourself whether the name would fit half of all senior professionals; if so it is too generic, choose again from what THIS person's material actually shows.";

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

    const fwd = req.headers.get("x-forwarded-for") ?? "";
    const parts = fwd.split(",").map((s) => s.trim()).filter(Boolean);
    const clientIp = parts.length ? parts[parts.length - 1] : "";
    const ip_hash = await sha256Hex(clientIp);

    // --- b) Cache — served before metering. A cached read costs nothing to
    // produce, so it must not consume the visitor's hourly allowance.
    const { data: cached } = await admin
      .from("mirror_reads")
      .select("handle, read, sparse, generated_at, hit_count, name, headline, avatar_url, posts_read, read_version")
      .eq("handle", handle)
      .maybeSingle();
    const withinTtl =
      !!cached &&
      (cached.read_version ?? 1) >= READ_VERSION &&
      Date.now() - new Date(cached.generated_at).getTime() < CACHE_TTL_MS;
    const stale =
      withinTtl && (await hasFresherEvidence(admin, handle, cached!.generated_at));

    if (withinTtl && !stale && !force) {
      await admin
        .from("mirror_reads")
        .update({ hit_count: (cached.hit_count ?? 1) + 1 })
        .eq("handle", handle);
      return json({
        ok: true, cached: true, sparse: cached.sparse, handle, read: cached.read,
        name: cached.name ?? null, posts_read: cached.posts_read ?? 0,
        headline: cached.headline ?? null, avatar_url: cached.avatar_url ?? null,
        generated_at: cached.generated_at,
      });
    }

    /**
     * A failed regeneration must not break a page we can still fill. Serve the
     * stale row with a quiet note about its age.
     */
    function serveStale(): Response | null {
      if (!cached?.read) return null;
      return json({
        ok: true, cached: true, stale: true, sparse: cached.sparse, handle,
        read: cached.read, name: cached.name ?? null,
        posts_read: cached.posts_read ?? 0,
        headline: cached.headline ?? null, avatar_url: cached.avatar_url ?? null,
        generated_at: cached.generated_at,
        notice: `Last read on ${new Date(cached.generated_at).toLocaleDateString("en-GB", {
          day: "numeric", month: "long", year: "numeric",
        })}.`,
      });
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
      fingerprint_hash: ip_hash,
      meta: { handle, force, regenerating: !!cached },
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
    /* Stage one opens: everything until the provider answers. */
    run?.mark(OPERATION_STAGES.linkedin_read[0]);
    const [profile, postTexts] = await Promise.all([
      fetchProfile(canonical_url, APIFY_TOKEN),
      fetchPosts(canonical_url, handle, APIFY_TOKEN).catch(() => [] as string[]),
    ]);
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

    // --- e) Sparse mode ---
    const sparse = (!about && experience.length < 2) || postTexts.length === 0;

    const trunc = (v: unknown, n: number) => JSON.stringify(v ?? null).slice(0, n);
    const userPrompt = [
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
      postTexts.length
        ? `RECENT POSTS (${postTexts.length}):\n` + postTexts.map((t, i) => `POST ${i + 1}: ${t}`).join("\n\n")
        : "RECENT POSTS: none were available.",
      "",
      sparse
        ? "Your public material is thin. Say so directly, speaking to the reader as 'you' in market_read and honest_gap — name what is missing and what would change it. Do not compensate by guessing."
        : "",
      "",
      "Every sentence you write must address the reader as 'you'. Return exactly this JSON and nothing else:",
      `{
  "archetype": "The [Adjective] [Noun]",
  "market_read": "two sentences on how your field currently sees you, from the evidence",
  "themes": ["three short career themes read from your own material"],
  "uncontested_space": "one sentence naming a space your material suggests you could own",
  "honest_gap": "one sentence naming something your public presence does not show, that your own material implies you have",
  "own_words_quote": "one verbatim sentence from one of your own posts, or null if no posts were supplied",
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

    async function callModel(messages: { role: string; content: string }[]) {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": ANTHROPIC_API_KEY!,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-5-20250929",
          max_tokens: 1500,
          system: SYSTEM_PROMPT,
          messages,
        }),
      });
      const data = await res.json().catch(() => ({}));
      const text = (data?.content ?? [])
        .map((c: any) => (typeof c?.text === "string" ? c.text : ""))
        .join("")
        .trim();
      await logAIUsage({
        user_id: null,
        function_name: "mirror-read",
        provider: "anthropic",
        model: "claude-sonnet-4-5-20250929",
        input_tokens: data?.usage?.input_tokens ?? 0,
        output_tokens: data?.usage?.output_tokens ?? 0,
        success: !!text,
        metadata: { handle, sparse },
      });
      return text;
    }

    const messages = [{ role: "user", content: userPrompt }];
    /* Stage two opens: the model writing the read. */
    run?.mark(OPERATION_STAGES.linkedin_read[1]);
    let raw = await callModel(messages);
    let read = parseJsonLoose(raw);
    if (read && hasPlaceholderInValues(read)) read = null;

    if (!read) {
      // One correction pass: the shape was wrong or a placeholder survived.
      const correctionMessages = [...messages];
      if (raw) correctionMessages.push({ role: "assistant", content: raw });
      correctionMessages.push({
        role: "user",
        content:
          "That was not usable. Return ONLY the JSON object with those exact seven keys, filled with real sentences drawn from the material. No markdown fences, no commentary, and no bracketed placeholders anywhere.",
      });
      raw = await callModel(correctionMessages);
      read = parseJsonLoose(raw);
      if (read && hasPlaceholderInValues(read)) read = null;
    }


    if (!read) {
      await logError("mirror-read", new Error("unreadable model output"), {
        user_id: null,
        severity: "high",
        context: { handle, sparse },
      });
      await refund();
      await finish("failed", "unreadable");
      return serveStale() ?? json({ error: "unreadable" }, 502);
    }

    // --- 4) Cache and return ---
    const generated_at = new Date().toISOString();
    const { error: upErr } = await admin
      .from("mirror_reads")
      .upsert(
        {
          handle,
          canonical_url,
          read,
          sparse,
          name: full_name ?? null,
          headline: headline ?? null,
          avatar_url,
          posts_read: postTexts.length,
          read_version: READ_VERSION,
          generated_at,
          hit_count: (cached?.hit_count ?? 0) + 1,
        },
        { onConflict: "handle" },
      );
    if (upErr) console.error("[mirror-read] cache write failed:", upErr.message);

    await finish("ok");
    return json({
      ok: true, cached: false, sparse, handle, read,
      name: full_name ?? null, headline: headline ?? null, avatar_url,
      posts_read: postTexts.length, generated_at,
    });
  } catch (e) {
    await refund();
    await logError("mirror-read", e, { user_id: null, severity: "high" });
    await finish("failed", "exception");
    return json({ error: "unreadable" }, 502);
  }
});
