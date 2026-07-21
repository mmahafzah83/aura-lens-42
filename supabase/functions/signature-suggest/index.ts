// Signature Studio — suggestion brain.
// Auth: user JWT (never trust a client-passed userId).
// Reads (via service role): diagnostic_profiles, top strategic_signals,
// authority_voice_profiles, recent linkedin_posts.
// Calls Lovable AI Gateway with google/gemini-3-flash-preview.
// On any failure returns { suggestions: [] } with 200 so the client
// gracefully falls back to its existing defaults.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type Family = "cover" | "signature" | "frame" | "line";
type Lang = "en" | "ar";

interface Suggestion { lines: string[]; source: "profile" | "signal" | "voice" }

function ok(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function stripFences(s: string): string {
  return s.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
}

function parseJson<T = any>(text: string): T | null {
  try { return JSON.parse(text); } catch { /* fallthrough */ }
  const cleaned = stripFences(text);
  try { return JSON.parse(cleaned); } catch { /* fallthrough */ }
  const m = cleaned.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch { /* nope */ } }
  return null;
}

// Banned words / phrases (case-insensitive). "authority" only as a noun -
// crude but effective: block the bare word.
const BANNED = [
  "authority", "thought leader", "personal brand",
  "leverage", "elevate", "unlock", "empower",
  "seamless", "game-changer", "delve", "journey",
];

function violatesBanlist(line: string): boolean {
  const lo = line.toLowerCase();
  if (/[!]|#\w|[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(line)) return true;
  return BANNED.some((w) => lo.includes(w));
}

function wordCount(s: string, lang: Lang): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

function sanitizeSuggestions(raw: unknown, family: Family, lang: Lang): Suggestion[] {
  if (!raw || typeof raw !== "object") return [];
  const arr = (raw as any).suggestions;
  if (!Array.isArray(arr)) return [];
  const wordCap = lang === "ar" ? 12 : 16;
  const clean: Suggestion[] = [];
  for (const s of arr) {
    if (!s || typeof s !== "object") continue;
    const lines = Array.isArray(s.lines) ? s.lines.map(String) : [];
    const src = ["profile", "signal", "voice"].includes(s.source) ? s.source : "profile";
    // family constraints
    const maxLines = (family === "frame" || family === "line") ? 1 : 2;
    const kept = lines.slice(0, maxLines).map((l: string) => l.trim()).filter(Boolean);
    if (!kept.length) continue;
    if (kept.some((l) => wordCount(l, lang) > wordCap)) continue;
    if (kept.some((l) => violatesBanlist(l))) continue;
    clean.push({ lines: kept, source: src as any });
    if (clean.length >= 3) break;
  }
  return clean;
}

function buildSystemPrompt(family: Family, lang: Lang): string {
  const target = (family === "frame" || family === "line")
    ? "ONE sharp insight sentence drawn from the user's signals, placed in lines[0] only"
    : "two descriptor lines about the person — specific, commercial, dignified";

  const wordCap = lang === "ar" ? "12 Arabic words" : "16 English words";
  const langRule = lang === "ar"
    ? "Language: Arabic ONLY. Contemporary professional GCC register. No dialect. NO English words inside Arabic lines. No transliteration."
    : "Language: English ONLY.";

  return [
    "You write signature card copy for a senior professional's own visual card.",
    `Family: ${family}. Target: ${target}.`,
    langRule,
    `Hard limits: max 2 lines per suggestion (frame/line: 1 line). Max ${wordCap} per line.`,
    "Never use these words in any language: authority (as a noun), thought leader, personal brand, leverage, elevate, unlock, empower, seamless, game-changer, delve, journey.",
    "No emojis. No hashtags. No exclamation marks. No quotation marks around the whole line.",
    "Return STRICT JSON only, no prose, no code fences:",
    `{"suggestions":[{"lines":["..."],"source":"profile|signal|voice"}, ...]}`,
    "Exactly 3 suggestions, ranked best-first.",
  ].join("\n");
}

function buildUserPrompt(ctx: {
  family: Family; lang: Lang;
  profile: any; signals: any[]; voice: any; posts: any[];
}): string {
  const p = ctx.profile || {};
  const parts: string[] = [];
  parts.push("PROFILE:");
  parts.push(`- first_name: ${p.first_name || ""}`);
  parts.push(`- level: ${p.level || ""}`);
  parts.push(`- firm: ${p.firm || ""}`);
  parts.push(`- core_practice: ${p.core_practice || ""}`);
  parts.push(`- sector_focus: ${p.sector_focus || ""}`);
  if (ctx.signals?.length) {
    parts.push("\nTOP SIGNALS (best first):");
    ctx.signals.forEach((s, i) => {
      parts.push(`${i + 1}. ${s.signal_title || ""}`);
      if (s.strategic_implications) parts.push(`   implications: ${String(s.strategic_implications).slice(0, 300)}`);
      if (Array.isArray(s.theme_tags) && s.theme_tags.length) parts.push(`   themes: ${s.theme_tags.slice(0, 5).join(", ")}`);
    });
  }
  if (ctx.voice) {
    parts.push("\nVOICE:");
    if (ctx.voice.tone) parts.push(`- tone: ${ctx.voice.tone}`);
    if (ctx.voice.preferred_structures) parts.push(`- preferred_structures: ${JSON.stringify(ctx.voice.preferred_structures).slice(0, 200)}`);
  }
  if (ctx.posts?.length) {
    parts.push("\nRECENT POSTS (style hints only, do not copy):");
    ctx.posts.forEach((pp, i) => {
      const body = String(pp.body || "").slice(0, 200);
      parts.push(`${i + 1}. ${body}`);
    });
  }
  parts.push(`\nProduce 3 suggestions for family=${ctx.family}, lang=${ctx.lang}.`);
  return parts.join("\n");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "").trim();
    if (!token) return ok({ suggestions: [] });

    const anon = createClient(SUPABASE_URL, ANON_KEY);
    const { data: userData, error: userErr } = await anon.auth.getUser(token);
    if (userErr || !userData?.user) return ok({ suggestions: [] });
    const userId = userData.user.id;

    const body = await req.json().catch(() => ({}));
    const family = (["cover", "signature", "frame", "line"].includes(body?.family) ? body.family : "cover") as Family;
    const lang = (body?.lang === "ar" ? "ar" : "en") as Lang;

    // Service-role reads: bypass RLS to load the user's own data server-side.
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const [profileRes, signalsRes, voiceRes, postsRes] = await Promise.all([
      admin.from("diagnostic_profiles")
        .select("first_name, level, firm, core_practice, sector_focus")
        .eq("user_id", userId).maybeSingle(),
      admin.from("strategic_signals")
        .select("signal_title, strategic_implications, theme_tags, priority_score")
        .eq("user_id", userId)
        .order("priority_score", { ascending: false, nullsFirst: false })
        .limit(5),
      admin.from("authority_voice_profiles")
        .select("tone, preferred_structures")
        .eq("user_id", userId).maybeSingle(),
      admin.from("linkedin_posts")
        .select("body, likes, comments, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(3),
    ]);

    if (!LOVABLE_API_KEY) return ok({ suggestions: [] });

    const system = buildSystemPrompt(family, lang);
    const user = buildUserPrompt({
      family, lang,
      profile: profileRes.data,
      signals: signalsRes.data || [],
      voice: voiceRes.data,
      posts: postsRes.data || [],
    });

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!aiResp.ok) {
      console.warn("signature-suggest gateway error", aiResp.status, await aiResp.text().catch(() => ""));
      return ok({ suggestions: [] });
    }

    const aiJson = await aiResp.json();
    const text = aiJson?.choices?.[0]?.message?.content || "";
    const parsed = parseJson(text);
    const cleaned = sanitizeSuggestions(parsed, family, lang);
    return ok({ suggestions: cleaned });
  } catch (e) {
    console.error("signature-suggest fatal", e);
    return ok({ suggestions: [] });
  }
});