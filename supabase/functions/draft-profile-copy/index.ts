/**
 * Draft a headline or About section for a member FROM THEIR OWN WRITING.
 *
 * Auth, CORS and the json() helper mirror linkedin-fetch-profile exactly.
 * The function refuses — without calling the model — when the member has
 * fewer than three posts with text. We never claim to write in a voice we
 * have not read.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";
import { hasBanned, loadBannedWords } from "../_shared/bannedWords.ts";
import { isAdmin } from "../_shared/adminRole.ts";
import { CORPUS_COLUMNS, isOwnWriting } from "../_shared/voiceCorpus.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEFAULT_MODEL = "google/gemini-3-flash-preview";
const MIN_POSTS = 3;
const MAX_POSTS = 15;
const POST_CHARS = 1200;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

/** Share of Arabic letters across the member's own writing. Picks the DEFAULT only. */
function languageOf(texts: string[]): "ar" | "en" | "mixed" {
  const joined = texts.join(" ");
  const arabic = (joined.match(/[\u0600-\u06FF]/g) || []).length;
  const latin = (joined.match(/[A-Za-z]/g) || []).length;
  const total = arabic + latin;
  if (total === 0) return "en";
  const share = arabic / total;
  if (share >= 0.6) return "ar";
  if (share <= 0.2) return "en";
  return "mixed";
}

/** Models sometimes wrap JSON in a fence no matter what the prompt says. */
function stripFence(raw: string): string {
  const t = raw.trim();
  if (!t.startsWith("```")) return t;
  return t.replace(/^```[a-zA-Z]*\s*/, "").replace(/```\s*$/, "").trim();
}

const ANGLES = ["Positioning", "Proof", "Point of view"] as const;
type Angle = typeof ANGLES[number];

function normaliseAngle(raw: unknown, index: number): Angle {
  const s = String(raw ?? "").trim().toLowerCase();
  const hit = ANGLES.find((a) => a.toLowerCase() === s);
  if (hit) return hit;
  if (s.startsWith("position")) return "Positioning";
  if (s.startsWith("proof")) return "Proof";
  if (s.startsWith("point")) return "Point of view";
  return ANGLES[Math.min(index, 2)];
}

const wordsIn = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

/** The model is data. Falls back to the literal when the setting is missing or malformed. */
async function loadModel(admin: any): Promise<string> {
  try {
    const { data } = await admin.from("admin_settings").select("value").eq("key", "ai_model").maybeSingle();
    const value = (data as any)?.value;
    const name = typeof value === "string" ? value : typeof value?.model === "string" ? value.model : "";
    if (name && name.trim().length > 0) return name.trim();
  } catch (e) {
    console.info("[draft-profile-copy] could not read admin_settings.ai_model:", (e as Error)?.message);
  }
  return DEFAULT_MODEL;
}

function systemPrompt(target: "headline" | "about", language: "ar" | "en" | "mixed", banned: string[]): string {
  const shape = target === "headline"
    ? [
        "You are writing LinkedIn HEADLINES.",
        "HEADLINE CRAFT:",
        "- The first 60 characters are what appears beside their name in search results, comments and invitations. Put the most specific, most searchable words there. Never open with a company name.",
        "- A headline states what they do and for whom, then what changes because of it. A job title alone is a wasted line.",
        "- Use · or | to separate AT MOST three clauses. Never more than three.",
        "- Include the concrete nouns a person would actually search for — sector, discipline, geography — because search is how a headline earns its keep.",
        "- Specific beats impressive. 'Cuts utility capex by rebuilding the tender model' beats 'Transformation leader driving excellence.'",
        "- Never use the construction 'Helping X to Y'. Never stack adjectives.",
        "- Maximum 200 characters. Count them.",
      ].join("\n")
    : [
        "You are writing LinkedIn ABOUT sections.",
        "ABOUT CRAFT:",
        "- LinkedIn folds the About section at roughly 265 characters behind '…see more'. Everything that makes a reader open it must live before that fold. Treat the first two sentences as the whole job.",
        "- Open on a concrete claim, a tension, or a specific situation this person is known for. Never a greeting, never 'I am a…', never a summary of the CV that follows.",
        "- First person. Contractions allowed. It should read the way this person writes in their posts — take the rhythm and sentence length from the supplied posts, not from a template.",
        "- Short paragraphs, one idea each, blank line between. No bullet lists. No headings.",
        "- Concrete nouns over abstract ones. Name the sector, the kind of problem, the kind of organisation.",
        "- Include evidence only where it exists in the source.",
        "- End on a position, not an invitation. No call to action, no 'feel free to reach out', no email address.",
        "- 120–220 words. Count them.",
      ].join("\n");

  const languageRule = language === "ar"
    ? "This member writes in Arabic. Write every option in contemporary professional Arabic. Keep English technical terms in English."
    : language === "mixed"
      ? "This member writes in a mix of Arabic and English. Write every option in English, and set \"language\" reasoning aside — the caller already knows."
      : "This member writes in English. Write every option in English.";

  return [
    "You write profile copy for a working professional using ONLY their own published writing.",
    "",
    shape,
    "",
    "THREE NAMED ANGLES. Three different strategic positions on the same person — never three rewordings of one sentence.",
    "Return them in exactly this order, each carrying its \"angle\" field:",
    "1. \"Positioning\" — what this person does that others in their field do not. Built from the distinctive pattern across their posts.",
    "2. \"Proof\" — what they have actually delivered. Built only from concrete outcomes, roles, sectors or scale that appear in the source. If the source contains no concrete proof, lead instead with the specific domain they demonstrably operate in — never invented numbers.",
    "3. \"Point of view\" — what they argue for or against. Built from the recurring stance in their writing. This is the one that sounds like a person with a spine.",
    "",
    "REGISTER: this member is a senior professional, frequently in the Gulf and wider Arab world. Write the way a serious operator talks to a peer — plain, specific, commercially literate. Never coach language, never motivational language, never 'journey', 'passion' or 'excellence'.",
    "ARABIC: when writing Arabic, use contemporary professional Arabic — not dialect, not bureaucratic MSA. Keep English technical terms in English. Short lines. No emoji.",
    "",
    "TRUTH RULE, absolute: use only what appears in the supplied posts, profile and themes.",
    "Invent no employer, no job title, no metric, no client, no outcome and no date that is not in the source.",
    "If a number does not appear in the source, it may not appear in your output.",
    "",
    languageRule,
    "",
    `NEVER use these words or phrases: ${banned.join(", ")}.`,
    "",
    "Return STRICT JSON and nothing else. No markdown fence, no commentary:",
    '{"options":[{"angle":"Positioning","text":"...","why":"..."}]}',
    "\"why\" is ONE short sentence naming the specific thing in THIS member's own writing the option is built from — a theme, a recurring argument, a stated outcome. Never generic such as 'draws on your expertise'. Name the actual thing.",
  ].join("\n");
}

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

    const target = body?.target;
    if (target !== "headline" && target !== "about") {
      return json({ error: "Ask for either a headline or an about section." }, 400);
    }
    const mode: "cached" | "fresh" = body?.mode === "fresh" ? "fresh" : "cached";
    const askedLanguage: "ar" | "en" | null =
      body?.language === "ar" || body?.language === "en" ? body.language : null;

    // An admin may act for another member; everyone else is forced to self.
    const requested = typeof body?.user_id === "string" ? body.user_id.trim() : "";
    const targetUserId = requested && (await isAdmin(anon, user.id)) ? requested : user.id;

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // --- CACHED: hand back what we already wrote. No model call, no credits. ---
    if (mode === "cached") {
      const { data: cached } = await admin
        .from("profile_copy_drafts")
        .select("options, language, posts_used, updated_at, applied_at, source_headline, source_about")
        .eq("user_id", targetUserId)
        .eq("target", target)
        .maybeSingle();
      const cachedRow = cached as
        | {
            options: unknown; language: string | null; posts_used: number | null; updated_at: string;
            applied_at: string | null; source_headline: string | null; source_about: string | null;
          }
        | null;
      if (cachedRow && Array.isArray(cachedRow.options) && cachedRow.options.length > 0) {
        /* Is the cached draft still written against the profile the member has
           now? We compare, we never spend credits to refresh on their behalf. */
        const { data: liveRows } = await admin
          .from("linkedin_profile_snapshots")
          .select("headline, about")
          .eq("user_id", targetUserId)
          .order("fetched_at", { ascending: false })
          .limit(1);
        const liveSnap = (liveRows?.[0] ?? null) as { headline: string | null; about: string | null } | null;
        const liveField = String((target === "headline" ? liveSnap?.headline : liveSnap?.about) ?? "").trim();
        const storedField = String((target === "headline" ? cachedRow.source_headline : cachedRow.source_about) ?? "").trim();
        const stale = Boolean(storedField) && Boolean(liveField) && storedField !== liveField;
        return json({
          stale,
          applied_at: cachedRow.applied_at ?? null,
          ok: true,
          from_cache: true,
          target,
          options: cachedRow.options,
          dropped: 0,
          posts_used: cachedRow.posts_used ?? null,
          language: cachedRow.language ?? "en",
          detected_language: cachedRow.language ?? "en",
          written_at: cachedRow.updated_at,
        });
      }
    }

    const [snapRes, postsRes, signalsRes, voiceRes] = await Promise.all([
      admin.from("linkedin_profile_snapshots")
        .select("headline, about, experience, skills, full_name")
        .eq("user_id", targetUserId)
        .order("fetched_at", { ascending: false })
        .limit(1),
      admin.from("linkedin_posts")
        .select(`${CORPUS_COLUMNS}, published_at`)
        .eq("user_id", targetUserId)
        .not("post_text", "is", null)
        .neq("post_text", "")
        .order("published_at", { ascending: false, nullsFirst: false })
        .limit(MAX_POSTS * 4),
      admin.from("strategic_signals").select("theme_tags").eq("user_id", targetUserId).limit(500),
      admin.from("authority_voice_profiles")
        .select("tone, preferred_structures, storytelling_patterns")
        .eq("user_id", targetUserId).eq("mode_key", "default")
        .order("is_primary", { ascending: false }).limit(1).maybeSingle(),
    ]);

    // ONE predicate for "the member wrote this", imported, never copied.
    const posts = ((postsRes.data as Record<string, unknown>[] | null) || [])
      .filter((p) => isOwnWriting(p as never))
      .map((p) => String(p.post_text || "").trim())
      .filter((t) => t.length > 0)
      .slice(0, MAX_POSTS)

      .map((t) => t.slice(0, POST_CHARS));

    // HARD REFUSAL — no model call on a corpus we do not have.
    if (posts.length < MIN_POSTS) {
      return json({ ok: false, reason: "not_enough_writing", posts_found: posts.length });
    }

    const counts = new Map<string, number>();
    for (const row of (signalsRes.data as { theme_tags: string[] | null }[] | null) || []) {
      for (const raw of row.theme_tags || []) {
        const t = String(raw || "").trim().toLowerCase();
        if (t.length < 3) continue;
        counts.set(t, (counts.get(t) || 0) + 1);
      }
    }
    const themes = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([t]) => t);

    const snap = ((snapRes.data as Record<string, unknown>[] | null)?.[0]) || {};
    const voice = (voiceRes.data as Record<string, unknown> | null) || null;
    const detected = languageOf(posts);
    const language = askedLanguage ?? detected;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return json({ error: "LOVABLE_API_KEY not set — add it in Lovable Cloud secrets." }, 400);
    }

    const userPrompt = [
      `NAME: ${snap.full_name ?? "(not on file)"}`,
      `CURRENT HEADLINE: ${snap.headline ?? "(none)"}`,
      `CURRENT ABOUT: ${snap.about ?? "(none)"}`,
      `ROLES ON FILE: ${JSON.stringify(snap.experience ?? []).slice(0, 2000)}`,
      `SKILLS ON FILE: ${JSON.stringify(snap.skills ?? []).slice(0, 1000)}`,
      `RECURRING SUBJECTS IN THEIR WRITING: ${themes.length ? themes.join(", ") : "(none recorded)"}`,
      voice ? `HOW THEY SOUND: ${JSON.stringify(voice).slice(0, 1200)}` : "",
      "",
      "THEIR OWN POSTS, newest first:",
      ...posts.map((p, i) => `--- POST ${i + 1} ---\n${p}`),
    ].filter(Boolean).join("\n");

    // The banned vocabulary is data, read once per invocation.
    const bannedWords = await loadBannedWords(admin);

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: await loadModel(admin),
        temperature: 0.7,
        messages: [
          { role: "system", content: systemPrompt(target, language, bannedWords) },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (aiRes.status === 429) return json({ ok: false, reason: "busy", error: "Aura is busy right now. Try again in a minute." });
    if (aiRes.status === 402) return json({ ok: false, reason: "no_credits", error: "This workspace is out of AI credits." });
    if (!aiRes.ok) {
      const detail = (await aiRes.text()).slice(0, 400);
      return json({ ok: false, reason: "model_failed", error: "Aura couldn't write just now. Try again.", detail });
    }

    const payload = await aiRes.json();
    const raw = String(payload?.choices?.[0]?.message?.content ?? "");

    let options: { angle: Angle; text: string; why: string }[] = [];
    let dropped = 0;
    try {
      const parsed = JSON.parse(stripFence(raw));
      const list = Array.isArray(parsed?.options) ? parsed.options : [];
      const mapped = list.slice(0, 3).map((o: any, i: number) => ({
        angle: normaliseAngle(o?.angle, i),
        text: String(o?.text ?? "").trim(),
        why: String(o?.why ?? "").trim(),
      })).map((o: { angle: Angle; text: string; why: string }) =>
        // A bad footnote never costs us a good option — clear the why, keep the text.
        hasBanned(o.why, bannedWords) ? { ...o, why: "" } : o,
      );
      options = mapped.filter((o) => {
        if (!o.text) return false;
        if (hasBanned(o.text, bannedWords)) return false;
        if (target === "headline") return o.text.length <= 200;
        const w = wordsIn(o.text);
        return w >= 100 && w <= 260;
      });
      dropped = mapped.length - options.length;
    } catch {
      options = [];
    }
    if (options.length === 0) return json({ ok: false, reason: "unreadable_response" });

    try {
      await (admin.from("profile_copy_drafts") as any).upsert({
        user_id: targetUserId,
        target,
        options,
        language,
        posts_used: posts.length,
        /* The profile this was written against — so the next open can say
           plainly when the member has moved on from it. */
        source_headline: String(snap.headline ?? ""),
        source_about: String(snap.about ?? ""),
        copied_at: null,
        copied_text: null,
        copied_angle: null,
        applied_at: null,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id,target" });
    } catch { /* a failed save must never swallow the answer */ }

    try {
      await (admin.from("ef_error_log") as any).insert({
        function_name: "draft-profile-copy",
        severity: "low",
        error_message: `INFO wrote ${options.length} ${target} options from ${posts.length} posts (${language})`,
        user_id: targetUserId,
        context: { target, posts_used: posts.length, themes_used: themes.length, language },
      });
    } catch { /* logging must never break the answer */ }

    return json({
      ok: true,
      from_cache: false,
      target,
      options,
      dropped,
      posts_used: posts.length,
      themes_used: themes.length,
      language,
      detected_language: detected,
      written_at: new Date().toISOString(),
    });
  } catch (e) {
    return json({ ok: false, reason: "failed", error: e instanceof Error ? e.message : "Something went wrong." }, 500);
  }
});