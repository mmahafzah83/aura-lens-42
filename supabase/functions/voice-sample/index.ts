/**
 * Generate ONE sample post in the member's configured voice.
 *
 * Called only when the member presses "Another sample" on the Voice & Writing
 * tab — every other interaction on that panel is composed client-side from a
 * template bank, so clicking around costs nothing.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";
import { callAI } from "../_shared/ai-router.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const token = authHeader.replace("Bearer ", "").trim();
    const anon = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: { user }, error: userErr } = await anon.auth.getUser(token);
    if (userErr || !user) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({} as any));
    const v = (body?.voice ?? {}) as Record<string, unknown>;
    const isAr = String(v.language ?? "en") === "ar";

    const spec = [
      `Tone: ${v.tone ?? "blunt practitioner"}`,
      `Rhythm: ${v.rhythm ?? "balanced"}`,
      `Emoji: ${v.emoji ?? "none"}`,
      `Opening style: ${v.opener ?? "a claim they will argue with"}`,
      `Closing style: ${v.closer ?? "uncomfortable question"}`,
      `Structure: ${v.structure ?? "tension then insight"}`,
      `Target length: about ${Number(v.length ?? 1400)} characters`,
      v.moves ? `Signature moves: ${String(v.moves)}` : "",
    ].filter(Boolean).join("\n");

    const systemPrompt = isAr
      ? "أنت تكتب منشور لينكدإن واحداً بصوت تنفيذي خليجي كبير. لا مقدمات ولا شرح — النص فقط. لا تستخدم لغة مدربي العلامة الشخصية."
      : "You write one LinkedIn post in the register of a senior GCC executive. Specific, commercial, no personal-branding-coach language. Return the post text only — no preamble, no explanation, no hashtags unless the style demands them.";

    const userMessage = `${isAr ? "اكتب منشوراً واحداً بهذه المواصفات:" : "Write one post to this specification:"}\n${spec}\n\n${
      isAr ? "الموضوع: أي موضوع أعمال واقعي (التحول الرقمي، الذكاء الاصطناعي، القيادة التشغيلية)." :
      "Topic: any realistic business subject (digital transformation, AI adoption, operational leadership)."
    }`;

    const { content } = await callAI({ task: "speed", systemPrompt, userMessage });
    return json({ sample: String(content ?? "").trim() });
  } catch (error) {
    console.error("voice-sample error:", error);
    return json({ error: (error as Error).message }, 500);
  }
});