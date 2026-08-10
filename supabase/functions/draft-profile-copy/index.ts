/**
 * Draft a headline or About section for a member FROM THEIR OWN WRITING.
 *
 * Auth, CORS and the json() helper mirror linkedin-fetch-profile exactly.
 * The function refuses — without calling the model — when the member has
 * fewer than three posts with text. We never claim to write in a voice we
 * have not read.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FOUNDER_USER_ID = "9e0c6ee1-6562-4fdc-89ba-d62b39f02bb3";
const MODEL = "google/gemini-3-flash-preview";
const MIN_POSTS = 3;
const MAX_POSTS = 15;
const POST_CHARS = 1200;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const BANNED = [
  "authority", "trajectory", "personal brand", "thought leader", "leverage",
  "utilize", "facilitate", "unlock", "elevate", "empower", "seamless",
  "game-changing", "passionate", "results-driven", "proven track record",
  "I'm excited to", "with over X years of experience",
];

/** Share of Arabic letters across the member's own writing. */
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

function systemPrompt(target: "headline" | "about", language: "ar" | "en" | "mixed"): string {
  const shape = target === "headline"
    ? [
        "You are writing LinkedIn HEADLINES.",
        "Each option is at most 200 characters.",
        "Each option says specifically what this person does and who they do it for.",
        "Never write a title-only line such as 'Chief Executive Officer at X'.",
      ].join("\n")
    : [
        "You are writing LinkedIn ABOUT sections.",
        "Each option is between 120 and 220 words.",
        "Open with a concrete claim, never a greeting.",
        "No bullet lists. No closing call to action.",
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
    "THREE DISTINCT OPTIONS. Three different angles on this person — never three rewordings of one sentence.",
    "",
    "TRUTH RULE, absolute: use only what appears in the supplied posts, profile and themes.",
    "Invent no employer, no job title, no metric, no client, no outcome and no date that is not in the source.",
    "If a number does not appear in the source, it may not appear in your output.",
    "",
    languageRule,
    "",
    `NEVER use these words or phrases: ${BANNED.join(", ")}.`,
    "",
    "Return STRICT JSON and nothing else. No markdown fence, no commentary:",
    '{"options":[{"text":"...","why":"..."}]}',
    "\"why\" is ONE short sentence naming which of this member's own themes or posts the option draws on.",
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

    // Founder may act for another user; everyone else is forced to self.
    const requested = typeof body?.user_id === "string" ? body.user_id.trim() : "";
    const targetUserId = user.id === FOUNDER_USER_ID && requested ? requested : user.id;

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const [snapRes, postsRes, signalsRes, voiceRes] = await Promise.all([
      admin.from("linkedin_profile_snapshots")
        .select("headline, about, experience, skills, full_name")
        .eq("user_id", targetUserId).maybeSingle(),
      admin.from("linkedin_posts")
        .select("post_text, published_at")
        .eq("user_id", targetUserId)
        .not("post_text", "is", null)
        .neq("post_text", "")
        .order("published_at", { ascending: false })
        .limit(MAX_POSTS),
      admin.from("strategic_signals").select("theme_tags").eq("user_id", targetUserId).limit(500),
      admin.from("authority_voice_profiles")
        .select("tone, preferred_structures, storytelling_patterns")
        .eq("user_id", targetUserId).maybeSingle(),
    ]);

    const posts = ((postsRes.data as { post_text: string | null }[] | null) || [])
      .map((p) => String(p.post_text || "").trim())
      .filter((t) => t.length > 0)
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

    const snap = (snapRes.data as Record<string, unknown> | null) || {};
    const voice = (voiceRes.data as Record<string, unknown> | null) || null;
    const language = languageOf(posts);

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

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.7,
        messages: [
          { role: "system", content: systemPrompt(target, language) },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (aiRes.status === 429) return json({ ok: false, reason: "busy", error: "Aura is busy right now. Try again in a minute." }, 429);
    if (aiRes.status === 402) return json({ ok: false, reason: "no_credits", error: "This workspace is out of AI credits." }, 402);
    if (!aiRes.ok) {
      const detail = (await aiRes.text()).slice(0, 400);
      return json({ ok: false, reason: "model_failed", error: "Aura couldn't write just now. Try again." , detail }, 502);
    }

    const payload = await aiRes.json();
    const raw = String(payload?.choices?.[0]?.message?.content ?? "");

    let options: { text: string; why: string }[] = [];
    try {
      const parsed = JSON.parse(stripFence(raw));
      const list = Array.isArray(parsed?.options) ? parsed.options : [];
      options = list
        .map((o: any) => ({ text: String(o?.text ?? "").trim(), why: String(o?.why ?? "").trim() }))
        .filter((o: { text: string }) => o.text.length > 0)
        .slice(0, 3);
    } catch {
      options = [];
    }
    if (options.length === 0) return json({ ok: false, reason: "unreadable_response" });

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
      target,
      options,
      posts_used: posts.length,
      themes_used: themes.length,
      language,
    });
  } catch (e) {
    return json({ ok: false, reason: "failed", error: e instanceof Error ? e.message : "Something went wrong." }, 500);
  }
});