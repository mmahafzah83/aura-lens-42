/**
 * Fetch a member's FULL LinkedIn profile via Apify and snapshot it.
 *
 * Companion to linkedin-fetch-posts: same auth shape, same URL rules, same
 * Apify call style. Appends ONE NEW dated snapshot row per read — the history
 * is append-only, and a short scrape can never shrink a member's record because
 * every list field is merged with the previous snapshot. Fills in profile fields
 * the member has not set themselves — never over one they have.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";
import { isAdmin } from "../_shared/adminRole.ts";
import { logEfError, withObserve } from "../_shared/observe.ts";
import { mergeSnapshot } from "../_shared/mergeSnapshot.ts";
import { similarityRatio } from "../_shared/editDistance.ts";

/** Lowercase, strip punctuation, collapse whitespace — both sides, always. */
const normaliseForCompare = (t: string) =>
  String(t ?? "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").replace(/\s+/g, " ").trim();


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

Deno.serve(withObserve("linkedin-fetch-profile", async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    // Single writer for this function's traces. A read that fails must never
    // leave zero evidence in the database.
    const obs = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

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
    const targetUserId = requested && (await isAdmin(anon, user.id)) ? requested : user.id;

    // An admin acting for someone else must name a real member: a typo would
    // otherwise write a snapshot for an id that belongs to nobody.
    if (targetUserId !== user.id) {
      const check = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
      const { data: found, error: lookupErr } = await check.auth.admin.getUserById(targetUserId);
      if (lookupErr || !found?.user) return json({ error: "unknown user" }, 400);
    }

    let handle = parseHandle(body?.profile_url);
    if (!handle) {
      // No explicit address from the caller — fall back to what is stored, but
      // a guessed handle was never an address, and Apify cannot resolve it.
      const lookup = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
      const { data: conn } = await lookup
        .from("linkedin_connections")
        .select("handle, profile_url, source_status")
        .eq("user_id", targetUserId)
        .maybeSingle();
      // Only an address established by a read, or by the member's own OAuth
      // identity, may be handed to Apify. Anything else was never an address.
      const trusted = ["verified_by_read", "confirmed_by_identity", "member_entered"];
      if (conn && !trusted.includes(conn.source_status ?? "")) {
        await logEfError(obs as any, {
          function_name: "linkedin-fetch-profile",
          error: "address_not_confirmed",
          severity: "info",
          user_id: targetUserId,
          context: { source_status: conn.source_status ?? null, stored_handle: conn.handle ?? null },
        });
        return json({ error: "address_not_confirmed" }, 400);
      }
      handle = parseHandle(conn?.profile_url) ??
        (conn?.handle ? parseHandle(`linkedin.com/in/${conn.handle}`) : null);
    }
    if (!handle) {
      return json({ error: "Enter a valid LinkedIn profile URL like linkedin.com/in/yourname" }, 400);
    }
    const canonical_url = `https://www.linkedin.com/in/${handle}`;

    const APIFY_TOKEN = Deno.env.get("APIFY_TOKEN");
    if (!APIFY_TOKEN) {
      return json({ error: "APIFY_TOKEN not set — add it in Lovable Cloud secrets." }, 400);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // --- A handle belongs to exactly one member ---
    // Checked BEFORE the Apify call so a claimed handle never burns a paid
    // scrape. Three accounts once shared one handle and a member ended up
    // holding the founder's profile. An admin acting deliberately may override.
    const callerIsAdmin = targetUserId !== user.id || (await isAdmin(anon, user.id));
    if (!callerIsAdmin) {
      const { data: claimants } = await admin
        .from("linkedin_connections")
        .select("user_id")
        .eq("handle", handle)
        .neq("user_id", targetUserId)
        .limit(1);
      if (claimants && claimants.length) {
        await logEfError(admin as any, {
          function_name: "linkedin-fetch-profile",
          error: "handle_claimed",
          severity: "high",
          user_id: targetUserId,
          context: { handle, claimed_by: claimants[0].user_id },
        });
        return json({
          error: "handle_claimed",
          message: "That LinkedIn address is already connected to another Aura account.",
          handle,
        }, 409);
      }
    }


    // --- Apify (sync run) ---
    // One shape that we know returns the full record, and one bare fallback.
    // Nothing else: every extra attempt was a whole timeout the member waited
    // through. Two attempts at 45s each — a hard ceiling of 90 seconds.
    const inputShapes: Record<string, unknown>[] = [
      { urls: [canonical_url], profileScraperMode: "Profile details no email ($4 per 1k)" },
      { urls: [canonical_url] },
      { queries: [canonical_url] },
    ];

    let item: Record<string, unknown> | null = null;
    let lastFailure = "";
    for (const input of inputShapes) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 45_000);
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
      await logEfError(obs as any, {
        function_name: "linkedin-fetch-profile",
        error: `apify returned no rows: ${lastFailure}`,
        severity: "high",
        user_id: targetUserId,
        context: { canonical_url, handle, stage: "apify_no_rows" },
      });
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




    // --- Append a new dated snapshot, merged with the previous one ---
    const { data: prevRows, error: prevErr } = await admin
      .from("linkedin_profile_snapshots")
      .select("full_name, headline, about, photo_url, location, followers, connections, experience, education, skills, languages, certifications, raw")
      .eq("user_id", targetUserId)
      .order("fetched_at", { ascending: false })
      .limit(1);
    if (prevErr) console.error("[linkedin-fetch-profile] previous snapshot read failed:", prevErr.message);
    const previous = prevRows?.[0] ?? null;

    const merged = mergeSnapshot({
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
    }, previous as Record<string, unknown> | null);

    const now = new Date().toISOString();
    const { error: upErr } = await admin
      .from("linkedin_profile_snapshots")
      .insert({
        user_id: targetUserId,
        fetched_at: now,
        created_at: now,
        ...merged,
      });
    if (upErr) throw new Error(`snapshot insert failed: ${upErr.message}`);

    // --- Retention: keep the newest 20 reads plus the member's original
    // baseline. Every row carries a full ~120KB payload. A retention failure
    // must never fail a read that already succeeded.
    try {
      const { data: allRows } = await admin
        .from("linkedin_profile_snapshots")
        .select("id, fetched_at")
        .eq("user_id", targetUserId)
        .order("fetched_at", { ascending: false });
      const rows = (allRows ?? []) as { id: string; fetched_at: string }[];
      if (rows.length > 21) {
        const keep = new Set<string>(rows.slice(0, 20).map((r) => r.id));
        keep.add(rows[rows.length - 1].id); // oldest — the original baseline
        const drop = rows.filter((r) => !keep.has(r.id)).map((r) => r.id);
        if (drop.length) {
          await admin.from("linkedin_profile_snapshots").delete().in("id", drop);
        }
      }
    } catch (e) {
      console.error("[linkedin-fetch-profile] retention skipped:", e instanceof Error ? e.message : String(e));
    }

    /* --- Did the member actually put a copied suggestion on LinkedIn? ---
       We never claim they applied it because they pressed Copy. We notice it
       here, on the next read, by comparing the live field to what they copied.
       A failure here must never fail a read that already succeeded. */
    try {
      const { data: draftRows } = await admin
        .from("profile_copy_drafts")
        .select("id, target, copied_text")
        .eq("user_id", targetUserId)
        .is("applied_at", null)
        .not("copied_text", "is", null);
      /* THIS scrape only. merged carries the previous value forward when a
         scrape returns null for a field — matching against that would mark a
         draft applied on a stale value the member never touched. If this read
         returned nothing for the field, we skip it. We never infer. */
      const scraped: Record<string, string> = {
        headline: String(headline ?? ""),
        about: String(about ?? ""),
      };
      for (const row of (draftRows ?? []) as { id: string; target: string; copied_text: string }[]) {
        const current = scraped[row.target] ?? "";
        if (!current.trim() || !row.copied_text) continue;
        const a = normaliseForCompare(current);
        const b = normaliseForCompare(row.copied_text);
        if (!a || !b) continue;
        /* 0.9, not 0.8: on a 200-character headline 0.8 tolerates ~40
           characters of divergence. A missed detection is recoverable next
           read; a false claim is not. */
        if (a === b || similarityRatio(a, b) >= 0.9) {
          await admin.from("profile_copy_drafts").update({ applied_at: now }).eq("id", row.id);
        }
      }
    } catch (e) {
      console.error("[linkedin-fetch-profile] applied check skipped:", e instanceof Error ? e.message : String(e));
    }





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
      // The read itself is what confirms the address.
      const connPatch: Record<string, unknown> = {
        handle, profile_url: canonical_url, source_status: "verified_by_read",
      };
      if (followers !== null) connPatch.followers_total = followers;
      if (full_name) connPatch.profile_name = full_name;
      const { error } = await admin
        .from("linkedin_connections")
        .update(connPatch)
        .eq("id", connection.id);
      if (error) console.error("[linkedin-fetch-profile] connection update failed:", error.message);
    } else {
      const connInsert: Record<string, unknown> = {
        user_id: targetUserId,
        access_token: "",
        handle,
        profile_url: canonical_url,
        source_status: "verified_by_read",
      };
      if (followers !== null) connInsert.followers_total = followers;
      if (full_name) connInsert.profile_name = full_name;
      const { error } = await admin.from("linkedin_connections").insert(connInsert);
      if (error) console.error("[linkedin-fetch-profile] connection insert failed:", error.message);
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
      ? "LinkedIn fetch timed out after 45 seconds. Try again."
      : (error as Error).message;
    console.error("linkedin-fetch-profile error:", error);
    try {
      const obsAdmin = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );
      await logEfError(obsAdmin as any, {
        function_name: "linkedin-fetch-profile",
        error,
        severity: "critical",
        context: { stage: "outer_catch" },
      });
    } catch (_) { /* logging must never mask the original failure */ }
    return json({ error: message }, 500);
  }
}));
