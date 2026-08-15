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

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PROFILE_ACTOR = "harvestapi~linkedin-profile-scraper";
const POSTS_ACTOR = "harvestapi~linkedin-profile-posts";
const MAX_POSTS = 20;

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
  const handle = (m?.[1] ?? "").replace(/[.,;:)\]]+$/, "").replace(/\/+$/, "").trim();
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

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Apify profile scrape — same two input shapes, 45s per attempt. */
async function fetchProfile(canonical_url: string, token: string): Promise<Record<string, unknown> | null> {
  const inputShapes: Record<string, unknown>[] = [
    { queries: [canonical_url], profileScraperMode: "Full ($8 per 1k)" },
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
    } catch (_e) {
      continue;
    } finally {
      clearTimeout(timer);
    }
    if (res.status !== 200 && res.status !== 201) continue;
    const payload = await res.json().catch(() => null);
    const list: any[] = Array.isArray(payload) ? payload : [];
    const candidate = (list.find((r) => r && typeof r === "object" && !r.error) ?? null) as
      | Record<string, unknown>
      | null;
    if (candidate) return candidate;
  }
  return null;
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
  "You read a senior professional's public LinkedIn profile and recent posts, and tell them how their market currently sees them. You use only what is in the material. You never invent an achievement, a number, a date or an employer. Output plain text only — no markdown, no asterisks, no headers, no bracketed placeholders. The reader is a senior GCC executive: write plainly, in short sentences, as a trusted advisor would over coffee. Never use these words: authority, trajectory, personal brand, thought leader, leverage as a verb, delve, landscape, navigate, realm, synergy, utilize, robust, seamless, journey, unlock, empower, elevate. ARCHETYPE RULE: the name is 'The [Adjective] [Noun]'. 'Strategic' is banned as the adjective and 'Architect' is banned as the noun. Before naming it, ask yourself whether the name would fit half of all senior professionals; if so it is too generic, choose again from what THIS person's material actually shows.";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  try {
    let body: any = {};
    try { body = await req.json(); } catch { /* empty body */ }

    // --- a) Validate ---
    const email = typeof body?.email === "string" ? body.email.trim() : "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return json({ error: "invalid_email" }, 400);

    const handle = parseHandle(body?.profile_url);
    if (!handle) return json({ error: "invalid_url" }, 400);
    const canonical_url = `https://www.linkedin.com/in/${handle}`;

    // --- b) Rate limit ---
    const fwd = req.headers.get("x-forwarded-for") ?? "";
    const firstIp = fwd.split(",")[0].trim() || "unknown";
    const ip_hash = await sha256Hex(firstIp);
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count } = await admin
      .from("mirror_requests")
      .select("id", { count: "exact", head: true })
      .eq("ip_hash", ip_hash)
      .gte("created_at", since);
    if ((count ?? 0) >= 5) return json({ error: "rate_limited" }, 429);
    await admin.from("mirror_requests").insert({ ip_hash, handle, email });

    // --- c) Cache ---
    const { data: cached } = await admin
      .from("mirror_reads")
      .select("handle, read, sparse, generated_at, hit_count")
      .eq("handle", handle)
      .maybeSingle();
    if (cached && Date.now() - new Date(cached.generated_at).getTime() < 14 * 24 * 60 * 60 * 1000) {
      await admin
        .from("mirror_reads")
        .update({ hit_count: (cached.hit_count ?? 1) + 1 })
        .eq("handle", handle);
      return json({ ok: true, cached: true, sparse: cached.sparse, handle, read: cached.read });
    }

    const APIFY_TOKEN = Deno.env.get("APIFY_TOKEN");
    if (!APIFY_TOKEN) return json({ error: "not_configured" }, 400);

    // --- d) Fetch profile and posts in parallel ---
    const [item, postTexts] = await Promise.all([
      fetchProfile(canonical_url, APIFY_TOKEN),
      fetchPosts(canonical_url, handle, APIFY_TOKEN).catch(() => [] as string[]),
    ]);
    if (!item) return json({ error: "profile_unreadable" }, 502);

    const firstName = pickText(item, ["firstName", "first_name", "givenName"]);
    const lastName = pickText(item, ["lastName", "last_name", "familyName"]);
    const joined = [firstName, lastName].filter(Boolean).join(" ").trim();
    const full_name = joined || pickText(item, ["fullName", "name", "displayName", "title"]);
    const headline = pickText(item, ["headline", "occupation", "subtitle"]);
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
        ? "Their public material is thin. Say so directly in market_read and honest_gap — name what is missing and what would change it. Do not compensate by guessing."
        : "",
      "",
      "Return exactly this JSON and nothing else:",
      `{
  "archetype": "The [Adjective] [Noun]",
  "market_read": "two sentences on how their field currently sees them, from the evidence",
  "themes": ["three short career themes read from their trajectory"],
  "uncontested_space": "one sentence naming a space their material suggests they could own",
  "honest_gap": "one sentence naming something their public presence does not show, that their own material implies they have",
  "own_words_quote": "one verbatim sentence from one of their own posts, or null if no posts were supplied",
  "own_words_read": "one sentence on what that quote shows about how they think, or null"
}`,
    ].join("\n");

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) return json({ error: "not_configured" }, 400);

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
      return json({ error: "unreadable" }, 502);
    }

    // --- 4) Cache and return ---
    const { error: upErr } = await admin
      .from("mirror_reads")
      .upsert(
        {
          handle,
          canonical_url,
          read,
          sparse,
          generated_at: new Date().toISOString(),
          hit_count: (cached?.hit_count ?? 0) + 1,
        },
        { onConflict: "handle" },
      );
    if (upErr) console.error("[mirror-read] cache write failed:", upErr.message);

    return json({ ok: true, cached: false, sparse, handle, read });
  } catch (e) {
    await logError("mirror-read", e, { user_id: null, severity: "high" });
    return json({ error: "unreadable" }, 502);
  }
});
