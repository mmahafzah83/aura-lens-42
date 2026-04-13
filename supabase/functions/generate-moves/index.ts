import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.99.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { user_id } = await req.json();
    if (!user_id) {
      return new Response(JSON.stringify({ moves: [], error: "missing user_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Step 1 — Staleness check
    const { data: freshMoves } = await supabase
      .from("recommended_moves")
      .select("*")
      .eq("user_id", user_id)
      .eq("status", "active")
      .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .order("created_at", { ascending: false });

    if (freshMoves && freshMoves.length > 0) {
      return new Response(JSON.stringify({ moves: freshMoves, source: "cache" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Step 5 — Expire old moves (before generating new ones)
    await supabase
      .from("recommended_moves")
      .update({ status: "expired" })
      .eq("user_id", user_id)
      .eq("status", "active")
      .lt("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

    // Step 2 — Fetch context
    const [signalsRes, profileRes] = await Promise.all([
      supabase
        .from("strategic_signals")
        .select("id, signal_title, explanation, confidence")
        .eq("user_id", user_id)
        .eq("status", "active")
        .order("confidence", { ascending: false })
        .limit(5),
      supabase
        .from("diagnostic_profiles")
        .select("level, firm, sector_focus, core_practice")
        .eq("user_id", user_id)
        .maybeSingle(),
    ]);

    const signals = signalsRes.data || [];
    const profile = profileRes.data;

    if (signals.length === 0) {
      return new Response(JSON.stringify({ moves: [], error: "no_signals" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const signalBlock = signals
      .map((s: any) => `ID: ${s.id} | Title: ${s.signal_title} | ${s.explanation}`)
      .join("\n");

    const userPrompt = `User profile: ${profile?.level || "unknown role"}, ${profile?.firm || "unknown industry"}, ${profile?.sector_focus || "unknown sector"}, ${profile?.core_practice || "unknown practice"}.

Top signals (use these exact IDs in source_signal_ids):
${signalBlock}

Generate exactly 3 recommended content moves. Respond ONLY with valid JSON array:
[
  {
    "title": "short action-oriented title (max 10 words)",
    "rationale": "1-2 sentence explanation grounded in the signals",
    "output_type": "post" or "carousel" or "framework",
    "source_signal_ids": ["id1", "id2"]
  }
]
In your JSON response, source_signal_ids must contain the IDs of the 1-3 signals most relevant to each move. Do not leave source_signal_ids empty.
Do not include any text outside the JSON array.`;

    // Step 3 — AI call
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ moves: [], error: "api_key_missing" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content:
              "You are a strategic content advisor for senior professionals. Based on the user's signals and identity, generate 3 concrete recommended content moves. Each move must be actionable, specific, and directly grounded in the provided signals.",
          },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI gateway error:", aiResponse.status, errText);
      return new Response(JSON.stringify({ moves: [], error: "generation_failed" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResponse.json();
    const rawContent = aiData.choices?.[0]?.message?.content || "";

    // Step 4 — Parse and store
    let movesArray: any[];
    try {
      const jsonMatch = rawContent.match(/\[[\s\S]*\]/);
      if (!jsonMatch) throw new Error("No JSON array found");
      movesArray = JSON.parse(jsonMatch[0]);
      if (!Array.isArray(movesArray) || movesArray.length === 0) throw new Error("Empty array");
    } catch (e) {
      console.error("JSON parse failed:", e, "raw:", rawContent);
      return new Response(JSON.stringify({ moves: [], error: "generation_failed" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const validSignalIds = new Set(signals.map((s: any) => s.id));

    const rows = movesArray.slice(0, 3).map((m: any) => {
      const rawIds = Array.isArray(m.source_signal_ids) ? m.source_signal_ids : [];
      const filteredIds = rawIds.filter((id: string) => uuidRegex.test(id) && validSignalIds.has(id));
      return {
        user_id,
        title: String(m.title || "Untitled move").slice(0, 200),
        rationale: String(m.rationale || ""),
        output_type: ["post", "carousel", "framework"].includes(m.output_type) ? m.output_type : "post",
        source_signal_ids: filteredIds,
        status: "active",
        expires_at: expiresAt,
      };
    });

    const { data: inserted, error: insertErr } = await supabase
      .from("recommended_moves")
      .insert(rows)
      .select();

    if (insertErr) {
      console.error("Insert error:", insertErr);
      return new Response(JSON.stringify({ moves: [], error: "generation_failed" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ moves: inserted, source: "generated" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-moves error:", e);
    return new Response(JSON.stringify({ moves: [], error: "generation_failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
