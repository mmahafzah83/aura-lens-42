import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `You are a voice pattern analyst. Your job is to read a professional's real LinkedIn posts and extract their writing DNA — not describe it abstractly, but identify the specific patterns that make their writing distinctive.

Analyze all posts provided. Weight your analysis toward posts with higher engagement scores — they represent what this writer does best when at their peak.

Return a JSON object with exactly these fields:

{
  "tone": "A single sentence describing the writer's voice register. Be specific — not 'professional' but 'blunt insider who names what others avoid saying'.",

  "preferred_structures": [
    "3 to 5 structural patterns this writer uses, described as formulas. Example: 'Opens with a single provocative observation, never a question.' Example: 'Builds tension for 3-4 lines before revealing the insight.' Example: 'Ends with a specific uncomfortable question, not a generic CTA.'"
  ],

  "storytelling_patterns": [
    "3 to 5 patterns about HOW this writer tells stories or makes arguments. Example: 'Names the visible symptom first, then exposes the hidden cause.' Example: 'Uses a single number mid-post as the turning point.' Example: 'Never explains — trusts the reader to connect the dots.'"
  ],

  "vocabulary": {
    "signature_phrases": ["exact phrases or sentence openers this writer uses repeatedly"],
    "avoided_patterns": ["types of language this writer never uses — be specific"],
    "sentence_rhythm": "description of their line length and pacing pattern"
  },

  "top_themes": ["3 to 5 recurring topics or tensions this writer returns to"],

  "what_makes_them_distinct": "One paragraph. What would make a reader immediately recognize this as THIS person's writing, not anyone else's.",

  "best_performing_patterns": "What structural or linguistic patterns appear most in the highest-engagement posts specifically.",

  "distillation_version": "v1",
  "posts_analyzed": <number of posts analyzed>,
  "distilled_at": "<ISO timestamp>"
}

Return ONLY valid JSON. No markdown, no explanation, no wrapper text.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Resolve user_id: prefer body, otherwise derive from Authorization header.
    let user_id: string | null = null;
    try {
      const body = await req.json();
      if (body && typeof body.user_id === "string") user_id = body.user_id;
    } catch (_) { /* no body */ }

    if (!user_id) {
      const authHeader = req.headers.get("Authorization") ?? "";
      if (authHeader.startsWith("Bearer ")) {
        const userClient = createClient(SUPABASE_URL, ANON_KEY, {
          global: { headers: { Authorization: authHeader } },
        });
        const token = authHeader.replace("Bearer ", "");
        const { data: { user } } = await userClient.auth.getUser(token);
        if (user) user_id = user.id;
      }
    }

    if (!user_id) {
      return new Response(
        JSON.stringify({ error: "user_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      console.error("voice-distill: missing LOVABLE_API_KEY");
      return new Response(
        JSON.stringify({ error: "missing_api_key" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Step 1 — Fetch posts
    const { data: posts, error: postsErr } = await supabase
      .from("linkedin_posts")
      .select("post_text, engagement_score, like_count, comment_count, source_type")
      .eq("user_id", user_id)
      .not("post_text", "is", null)
      .order("engagement_score", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(200);

    if (postsErr) {
      console.error("voice-distill: fetch posts error", postsErr);
      return new Response(
        JSON.stringify({ error: "db_read_failed", details: postsErr.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const filtered = (posts || []).filter(
      (p: any) => p.post_text && String(p.post_text).trim().length > 0,
    ).slice(0, 40);

    if (filtered.length === 0) {
      console.error("voice-distill: no posts found for user", user_id);
      return new Response(
        JSON.stringify({ error: "no_posts_found" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Step 2 — Build prompt
    const formatted = filtered
      .map((p: any) => {
        const eng =
          p.engagement_score != null
            ? `${Number(p.engagement_score).toFixed(1)}%`
            : "—";
        return `[Engagement: ${eng}] ${String(p.post_text).trim()}`;
      })
      .join("\n\n---\n\n");

    const userMessage = `Here are the posts to analyze:\n\n${formatted}`;

    // Step 3 — Call Anthropic (Claude Sonnet)
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not configured");
    const aiResp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
        temperature: 0.3,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userMessage }],
      }),
    });

    if (!aiResp.ok) {
      const t = await aiResp.text();
      console.error("voice-distill: AI gateway error", aiResp.status, t);
      return new Response(
        JSON.stringify({ error: "ai_gateway_error", details: aiResp.status }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const aiJson = await aiResp.json();
    const raw = (aiJson?.content || []).map((c: any) => c.text || "").join("") || "";

    // Step 4 — Parse
    let distillation: any;
    try {
      const cleaned = String(raw)
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/```\s*$/i, "")
        .trim();
      distillation = JSON.parse(cleaned);
    } catch (e) {
      console.error("voice-distill: JSON parse failed", e, "raw:", raw);
      return new Response(
        JSON.stringify({ error: "distillation_failed" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Ensure required meta fields
    distillation.distillation_version = "v1";
    distillation.posts_analyzed = filtered.length;
    distillation.distilled_at = new Date().toISOString();

    const vocabulary_preferences = {
      use: distillation?.vocabulary?.signature_phrases ?? [],
      avoid: distillation?.vocabulary?.avoided_patterns ?? [],
      rhythm: distillation?.vocabulary?.sentence_rhythm ?? "",
    };

    // Step 5 — Upsert authority_voice_profiles
    const { data: existing, error: existErr } = await supabase
      .from("authority_voice_profiles")
      .select("id")
      .eq("user_id", user_id)
      .maybeSingle();

    if (existErr) {
      console.error("voice-distill: existence check failed", existErr);
      return new Response(
        JSON.stringify({ error: "db_write_failed", details: existErr.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const writePayload = {
      tone: distillation.tone ?? "",
      preferred_structures: distillation.preferred_structures ?? [],
      storytelling_patterns: distillation.storytelling_patterns ?? [],
      vocabulary_preferences,
      updated_at: new Date().toISOString(),
    };

    if (existing) {
      const { error: updErr } = await supabase
        .from("authority_voice_profiles")
        .update(writePayload)
        .eq("user_id", user_id);
      if (updErr) {
        console.error("voice-distill: update failed", updErr);
        return new Response(
          JSON.stringify({ error: "db_write_failed", details: updErr.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    } else {
      const { error: insErr } = await supabase
        .from("authority_voice_profiles")
        .insert({ user_id, ...writePayload });
      if (insErr) {
        console.error("voice-distill: insert failed", insErr);
        return new Response(
          JSON.stringify({ error: "db_write_failed", details: insErr.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    // Step 6 — Log to training_logs (best-effort)
    try {
      const { error: logErr } = await supabase.from("training_logs").insert({
        user_id,
        pillar: "voice_distill",
        topic: "voice_distill",
        duration_hours: 0,
      });
      if (logErr) {
        console.warn("voice-distill: training_logs insert skipped", logErr.message);
      }
    } catch (e) {
      console.warn("voice-distill: training_logs not available", e);
    }

    // Step 7 — Success
    return new Response(
      JSON.stringify({
        success: true,
        posts_analyzed: filtered.length,
        tone_extracted: distillation.tone,
        top_themes: distillation.top_themes ?? [],
        distilled_at: distillation.distilled_at,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("voice-distill: unhandled error", e);
    return new Response(
      JSON.stringify({
        error: "internal_error",
        details: e instanceof Error ? e.message : String(e),
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});