/**
 * Fetch a member's FULL LinkedIn profile via Apify and snapshot it.
 *
 * Companion to linkedin-fetch-posts: same auth shape, same URL rules, same
 * Apify call style. Writes exactly one snapshot row per member and fills in
 * profile fields the member has not set themselves — never over one they have.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FOUNDER_USER_ID = "9e0c6ee1-6562-4fdc-89ba-d62b39f02bb3";
const ACTOR = "harvestapi~linkedin-profile-scraper";

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

/** First non-empty string among the given keys. */
function pickText(item: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = item[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

/** First finite integer among the given keys. */
function pickInt(item: Record<string, unknown>, keys: string[]): number | null {
  for (const k of keys) {
    const v = item[k];
    const n = typeof v === "string" ? Number(v.replace(/[^\d]/g, "")) : Number(v);
    if (Number.isFinite(n) && n >= 0 && v !== null && v !== undefined && v !== "") return Math.floor(n);
  }
  return null;
}

/** Arrays only — a scalar in an array-shaped field is not a list. */
function pickArray(item: Record<string, unknown>, keys: string[]): unknown[] | null {
  for (const k of keys) {
    const v = item[k];
    if (Array.isArray(v) && v.length) return v;
  }
  return null;
}

/** Location may arrive as a string or as a parsed object; render one line. */
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

const photoOf = (item: Record<string, unknown>): string | null => {
  const direct = pickText(item, [
    "photo", "photoUrl", "avatar", "avatarUrl", "profilePicture", "profilePic",
    "profilePictureUrl", "pictureUrl", "profileImage", "imageUrl",
  ]);
  if (direct) return direct;
  for (const key of ["photo", "avatar", "profilePicture", "profileImage"]) {
    const v = item[key];
    if (v && typeof v === "object") {
      const url = pickText(v as Record<string, unknown>, ["url", "large", "original", "high", "displayImage"]);
      if (url) return url;
    }
    if (Array.isArray(v) && v.length) {
      const last = v[v.length - 1];
      if (typeof last === "string" && last.trim()) return last.trim();
      if (last && typeof last === "object") {
        const url = pickText(last as Record<string, unknown>, ["url", "src"]);
        if (url) return url;
      }
    }
  }
  return null;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // --- Auth first, before any service-role work ---
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const token = authHeader.replace("Bearer ", "").trim();
    const anon = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: { user }, error: userErr } = await anon.auth.getUser(token);
    if (userErr || !user) return json({ error: "Unauthorized" }, 401);

    let body: any = {};
    try { body = await req.json(); } catch { /* empty body */ }

    // Founder may act for another user; everyone else is forced to self.
    const requested = typeof body?.user_id === "string" ? body.user_id.trim() : "";
    const targetUserId = user.id === FOUNDER_USER_ID && requested ? requested : user.id;

    const handle = parseHandle(body?.profile_url);
    if (!handle) {
      return json({ error: "Enter a valid LinkedIn profile URL like linkedin.com/in/yourname" }, 400);
    }
    const canonical_url = `https://www.linkedin.com/in/${handle}`;

    const APIFY_TOKEN = Deno.env.get("APIFY_TOKEN");
    if (!APIFY_TOKEN) {
      return json({ error: "APIFY_TOKEN not set — add it in Lovable Cloud secrets." }, 400);
    }

    // --- Apify (sync run) ---
    // The actor's input key has changed over time, so try the documented shape
    // first and fall back to the older one before giving up.
    const inputShapes: Record<string, unknown>[] = [
      { queries: [canonical_url], profileScraperMode: "Full ($8 per 1k)" },
      { queries: [canonical_url] },
      { urls: [canonical_url] },
      { profiles: [canonical_url], mode: "details" },
    ];

    let item: Record<string, unknown> | null = null;
    let lastFailure = "";
    for (const input of inputShapes) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 120_000);
      let res: Response;
      try {
        res = await fetch(
          `https://api.apify.com/v2/acts/${ACTOR}/run-sync-get-dataset-items?token=${APIFY_TOKEN}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(input),
            signal: controller.signal,
          },
        );
      } catch (e) {
        lastFailure = `request failed: ${e instanceof Error ? e.message : String(e)}`;
        continue;
      } finally {
        clearTimeout(timer);
      }

      if (res.status !== 200 && res.status !== 201) {
        lastFailure = `status ${res.status}: ${(await res.text()).slice(0, 300)}`;
        continue;
      }

      const payload = await res.json();
      const list: any[] = Array.isArray(payload) ? payload : [];
      const candidate = (list.find((r) => r && typeof r === "object" && !r.error) ?? null) as
        | Record<string, unknown>
        | null;
      if (candidate) { item = candidate; break; }
      lastFailure = `no rows returned for input keys ${Object.keys(input).join(", ")}`;
    }

    if (!item) {
      return json({
        error: "Aura could not read that profile. Check the address is public and try again.",
        canonical_url,
        detail: lastFailure,
      }, 502);
    }

    // --- Defensive mapping: every field may be absent or differently named ---
    const firstName = pickText(item, ["firstName", "first_name", "givenName"]);
    const lastName = pickText(item, ["lastName", "last_name", "familyName"]);
    const joined = [firstName, lastName].filter(Boolean).join(" ").trim();
    const full_name = joined || pickText(item, ["fullName", "name", "displayName", "title"]);
    const headline = pickText(item, ["headline", "occupation", "subtitle"]);
    const about = pickText(item, ["about", "summary", "bio", "description"]);
    const photo_url = photoOf(item);
    const location = pickLocation(item);
    const followers = pickInt(item, ["followerCount", "followersCount", "followers"]);
    const connections = pickInt(item, ["connectionsCount", "connectionCount", "connections"]);
    const experience = pickArray(item, ["experience", "experiences", "positions", "workExperience"]);
    const education = pickArray(item, ["education", "educations", "schools"]);
    const skills = pickArray(item, ["skills", "topSkills"]);
    const languages = pickArray(item, ["languages", "languageList"]);
    const certifications = pickArray(item, ["certifications", "certificates", "licenses"]);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { error: upErr } = await admin
      .from("linkedin_profile_snapshots")
      .upsert({
        user_id: targetUserId,
        fetched_at: new Date().toISOString(),
        full_name,
        headline,
        about,
        photo_url,
        location,
        followers,
        connections,
        experience,
        education,
        skills,
        languages,
        certifications,
        raw: item,
      }, { onConflict: "user_id" });
    if (upErr) throw new Error(`snapshot upsert failed: ${upErr.message}`);

    // --- Gentle auto-fill: only ever fills a blank, never replaces the member's own value ---
    const profilePatch: Record<string, string> = {};
    if (photo_url) profilePatch.avatar_url = photo_url;
    if (firstName) profilePatch.first_name = firstName;
    if (Object.keys(profilePatch).length) {
      const { data: existing } = await admin
        .from("diagnostic_profiles")
        .select("avatar_url, first_name")
        .eq("user_id", targetUserId)
        .maybeSingle();
      if (existing) {
        const blank = (v: unknown) => v === null || v === undefined || String(v).trim() === "";
        const patch: Record<string, string> = {};
        if (profilePatch.avatar_url && blank(existing.avatar_url)) patch.avatar_url = profilePatch.avatar_url;
        if (profilePatch.first_name && blank(existing.first_name)) patch.first_name = profilePatch.first_name;
        if (Object.keys(patch).length) {
          const { error } = await admin
            .from("diagnostic_profiles")
            .update(patch)
            .eq("user_id", targetUserId);
          if (error) console.error("[linkedin-fetch-profile] profile auto-fill failed:", error.message);
        }
      }
    }

    // The connection row is Aura's own bookkeeping, so these are refreshed outright.
    const { data: connection } = await admin
      .from("linkedin_connections")
      .select("id")
      .eq("user_id", targetUserId)
      .maybeSingle();
    if (connection) {
      const connPatch: Record<string, unknown> = { handle, profile_url: canonical_url };
      if (followers !== null) connPatch.followers_total = followers;
      if (full_name) connPatch.profile_name = full_name;
      const { error } = await admin
        .from("linkedin_connections")
        .update(connPatch)
        .eq("id", connection.id);
      if (error) console.error("[linkedin-fetch-profile] connection update failed:", error.message);
    }

    return json({
      handle,
      canonical_url,
      full_name,
      headline,
      about_len: about?.length ?? 0,
      photo_url,
      followers,
      connections,
      experience_count: experience?.length ?? 0,
      education_count: education?.length ?? 0,
      skills_count: skills?.length ?? 0,
    });
  } catch (error) {
    const message = (error as Error)?.name === "AbortError"
      ? "LinkedIn fetch timed out after 120 seconds. Try again."
      : (error as Error).message;
    console.error("linkedin-fetch-profile error:", error);
    return json({ error: message }, 500);
  }
});