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

function buildSystemPrompt(family: Family, lang: Lang, prefer?: string[], nonce?: number): string {
  const target = (family === "frame" || family === "line")
    ? "ONE sharp insight sentence drawn from the user's signals, placed in lines[0] only"
    : "two descriptor lines about the person — specific, commercial, dignified";

  const wordCap = lang === "ar" ? "12 Arabic words" : "16 English words";
  const langRule = lang === "ar"
    ? "Language: Arabic ONLY. Contemporary professional GCC register. No dialect. NO English words inside Arabic lines. No transliteration."
    : "Language: English ONLY.";

  const preferLine = (Array.isArray(prefer) && prefer.length)
    ? `Source bias: emphasise suggestions drawn from these sources — ${prefer.join(", ")}. Try to include at least one from each requested source; skip other sources unless nothing else fits.`
    : "";
  const nonceLine = nonce
    ? `Variation seed: ${nonce}. Produce a genuinely different set from previous calls with this seed differing — different angles, different phrasings, not paraphrases.`
    : "";

  return [
    "You write signature card copy for a senior professional's own visual card.",
    `Family: ${family}. Target: ${target}.`,
    langRule,
    preferLine,
    nonceLine,
    `Hard limits: max 2 lines per suggestion (frame/line: 1 line). Max ${wordCap} per line.`,
    "Never use these words in any language: authority (as a noun), thought leader, personal brand, leverage, elevate, unlock, empower, seamless, game-changer, delve, journey.",
    "No emojis. No hashtags. No exclamation marks. No quotation marks around the whole line.",
    "Return STRICT JSON only, no prose, no code fences:",
    `{"suggestions":[{"lines":["..."],"source":"profile|signal|voice"}, ...]}`,
    "Exactly 3 suggestions, ranked best-first.",
  ].filter(Boolean).join("\n");
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
      const body = String(pp.post_text || "").slice(0, 200);
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
    if (!token) return ok({ suggestions: [], caption: "" });

    const anon = createClient(SUPABASE_URL, ANON_KEY);
    const { data: userData, error: userErr } = await anon.auth.getUser(token);
    if (userErr || !userData?.user) return ok({ suggestions: [], caption: "" });
    const userId = userData.user.id;

    const body = await req.json().catch(() => ({}));
    const mode = (body?.mode === "caption") ? "caption" : "suggest";
    const isDesign = body?.mode === "design";
    const family = (["cover", "signature", "frame", "line"].includes(body?.family) ? body.family : "cover") as Family;
    const lang = (body?.lang === "ar" ? "ar" : "en") as Lang;
    const prefer: string[] = Array.isArray(body?.prefer)
      ? body.prefer.filter((s: any) => ["profile","signal","voice"].includes(s)).slice(0, 3)
      : [];
    const nonce: number | undefined = typeof body?.nonce === "number" ? body.nonce : undefined;
    const cardLines: string[] = Array.isArray(body?.cardLines)
      ? body.cardLines.map((s: any) => String(s || "").slice(0, 240)).filter(Boolean).slice(0, 4)
      : [];
    const pickedSource: string = typeof body?.pickedSource === "string" ? body.pickedSource : "";

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
        .select("post_text, engagement_score, created_at")
        .eq("user_id", userId)
        .not("post_text", "is", null)
        .order("created_at", { ascending: false })
        .limit(3),
    ]);

    if (!LOVABLE_API_KEY) return ok({ suggestions: [], caption: "" });

    // ── DESIGN MODE (multimodal, art-director) ──────────────────────────
    if (isDesign) {
      const safeDefault = {
        faceZone: "none",
        textZone: lang === "ar" ? "upper-right" : "upper-left",
        scrim: "strong",
        cropFocusY: 0.35,
        mood: null as null | string,
        emphasis: [] as { phrase: string; style: string }[],
        reason: "",
      };
      const imageBase64 = typeof body?.imageBase64 === "string" ? body.imageBase64 : "";
      const line1 = String(body?.line1 || "").slice(0, 400);
      const line2 = String(body?.line2 || "").slice(0, 400);
      if (!imageBase64 || !line1) return ok({ decision: safeDefault });

      const dataUrl = imageBase64.startsWith("data:")
        ? imageBase64
        : `data:image/jpeg;base64,${imageBase64}`;

      const designSystem = [
        "You are an art director placing a headline over a photo for a 1080x1350 portrait card.",
        "Return STRICT JSON only, no prose, no code fences.",
        "Rules:",
        "- textZone must be the CALMEST/lowest-detail zone of the image and MUST NOT overlap any faceZone.",
        "- If a face is present, textZone must be far from it.",
        "- scrim = 'none' only if the chosen zone is truly quiet (flat sky, plain wall); 'soft' if moderately calm; 'strong' if any doubt.",
        "- cropFocusY biases the vertical crop (0=top, 1=bottom). Bias toward the subject; away from busy edges.",
        "- emphasis: MAX ONE phrase, a verbatim substring of the line, only meaningful words (a contrast pair, payoff, or number). Never articles or filler. Return [] if unsure.",
        "- mood: pick 'oxblood' (warm red), 'teal' (cool green) or 'amber' (warm gold) based on the photo's overall temperature. If unsure return null.",
        "- reason: ONE short plain-English sentence explaining the placement.",
        "Schema: {\"faceZone\":\"top-left|top-center|top-right|middle-left|middle-center|middle-right|bottom-left|bottom-center|bottom-right|none\",\"textZone\":\"upper-left|upper-right|lower-left|lower-right\",\"scrim\":\"none|soft|strong\",\"cropFocusY\":0.0,\"mood\":\"oxblood|teal|amber|null\",\"emphasis\":[{\"phrase\":\"...\",\"style\":\"color|bold\"}],\"reason\":\"...\"}",
      ].join("\n");

      const designUser = [
        `Language: ${lang}.`,
        `Line 1: ${line1}`,
        line2 ? `Line 2: ${line2}` : "",
      ].filter(Boolean).join("\n");

      try {
        const dResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "google/gemini-3-flash-preview",
            messages: [
              { role: "system", content: designSystem },
              {
                role: "user",
                content: [
                  { type: "text", text: designUser },
                  { type: "image_url", image_url: { url: dataUrl } },
                ],
              },
            ],
            response_format: { type: "json_object" },
            temperature: 0.4,
          }),
        });
        if (!dResp.ok) {
          console.warn("signature-suggest design gateway error", dResp.status);
          return ok({ decision: safeDefault });
        }
        const dJson = await dResp.json();
        const dText = dJson?.choices?.[0]?.message?.content || "";
        const parsed = parseJson<any>(dText) || {};
        // Sanitize + guardrails.
        const validZone = ["upper-left","upper-right","lower-left","lower-right"];
        const validScrim = ["none","soft","strong"];
        const validMood = ["oxblood","teal","amber"];
        const emphasisIn = Array.isArray(parsed.emphasis) ? parsed.emphasis.slice(0, 1) : [];
        const emphasis = emphasisIn
          .filter((e: any) => e && typeof e.phrase === "string" && e.phrase.trim() && line1.includes(e.phrase))
          .map((e: any) => ({
            phrase: String(e.phrase),
            style: e.style === "bold" ? "bold" : "color",
          }));
        const decision = {
          faceZone: typeof parsed.faceZone === "string" ? parsed.faceZone : "none",
          textZone: validZone.includes(parsed.textZone) ? parsed.textZone : safeDefault.textZone,
          scrim: validScrim.includes(parsed.scrim) ? parsed.scrim : "strong",
          cropFocusY: typeof parsed.cropFocusY === "number"
            ? Math.max(0, Math.min(1, parsed.cropFocusY))
            : 0.5,
          mood: validMood.includes(parsed.mood) ? parsed.mood : null,
          emphasis,
          reason: typeof parsed.reason === "string" ? parsed.reason.slice(0, 240) : "",
        };
        return ok({ decision });
      } catch (e) {
        console.warn("signature-suggest design failed", e);
        return ok({ decision: safeDefault });
      }
    }
    // ── /DESIGN MODE ────────────────────────────────────────────────────

    // ── CAPTION MODE ─────────────────────────────────────────────────────
    if (mode === "caption") {
      const wordCap = lang === "ar" ? "60 Arabic words" : "70 English words";
      const langRule = lang === "ar"
        ? "Language: Arabic ONLY. Contemporary professional GCC register. No dialect. NO English words. No transliteration."
        : "Language: English ONLY.";
      const capSystem = [
        "You write a LinkedIn caption to accompany a signature card image the user just made.",
        "Voice: the user's — calm, specific, first-person, no fanfare.",
        langRule,
        `Length: 2 to 3 short sentences. Max ${wordCap} total.`,
        "Ground the caption in the card's own lines. Do NOT restate the card verbatim. Add one sentence of context, one sentence of point of view.",
        pickedSource === "signal"
          ? "The card's line came from one of the user's tracked signals — you may reference the underlying observation briefly, without naming it as a 'signal'."
          : "",
        "Never use these words in any language: authority (as a noun), thought leader, personal brand, leverage, elevate, unlock, empower, seamless, game-changer, delve, journey.",
        "No emojis. No hashtags. No exclamation marks. No quote marks around the whole caption.",
        "Return STRICT JSON only, no prose, no code fences: {\"caption\":\"...\"}",
      ].filter(Boolean).join("\n");

      const capUser = [
        "PROFILE:",
        `- first_name: ${profileRes.data?.first_name || ""}`,
        `- level: ${profileRes.data?.level || ""}`,
        `- firm: ${profileRes.data?.firm || ""}`,
        `- core_practice: ${profileRes.data?.core_practice || ""}`,
        `- sector_focus: ${profileRes.data?.sector_focus || ""}`,
        "",
        "CARD LINES:",
        ...cardLines.map((l, i) => `${i + 1}. ${l}`),
        (signalsRes.data && signalsRes.data.length && pickedSource === "signal")
          ? `\nSOURCE SIGNAL (context, do not name):\n- ${signalsRes.data[0]?.signal_title || ""}\n- implications: ${String(signalsRes.data[0]?.strategic_implications || "").slice(0, 300)}`
          : "",
        (voiceRes.data?.tone) ? `\nVOICE tone: ${voiceRes.data.tone}` : "",
        (postsRes.data && postsRes.data.length)
          ? `\nRECENT POSTS (style hints only, do not copy):\n${postsRes.data.map((p: any, i: number) => `${i + 1}. ${String(p.post_text || "").slice(0, 220)}`).join("\n")}`
          : "",
      ].filter(Boolean).join("\n");

      const capResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [{ role: "system", content: capSystem }, { role: "user", content: capUser }],
          response_format: { type: "json_object" },
        }),
      });
      if (!capResp.ok) {
        console.warn("signature-suggest caption gateway error", capResp.status, await capResp.text().catch(() => ""));
        return ok({ caption: "" });
      }
      const capJson = await capResp.json();
      const capText = capJson?.choices?.[0]?.message?.content || "";
      const capParsed = parseJson<{ caption?: string }>(capText);
      let caption = String(capParsed?.caption || "").trim();
      if (!caption) return ok({ caption: "" });
      // Enforce banlist + basic cleanliness on the whole caption
      if (violatesBanlist(caption)) return ok({ caption: "" });
      // Hard length cap (character safety net)
      const maxChars = lang === "ar" ? 500 : 550;
      if (caption.length > maxChars) caption = caption.slice(0, maxChars).replace(/\s+\S*$/, "").trim();
      return ok({ caption });
    }
    // ── /CAPTION MODE ────────────────────────────────────────────────────

    const system = buildSystemPrompt(family, lang, prefer, nonce);
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
        temperature: nonce ? 1.0 : 0.7,
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