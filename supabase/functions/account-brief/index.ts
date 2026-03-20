import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { account } = await req.json();
    if (!account) throw new Error("account is required");

    const authHeader = req.headers.get("Authorization");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get user from auth header
    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
    const token = authHeader?.replace("Bearer ", "");
    const { data: { user }, error: userError } = await anonClient.auth.getUser(token);
    if (userError || !user) throw new Error("Unauthorized");

    // Search vault for account-related content
    const { data: vaultResults, error: vaultError } = await supabase.rpc("search_vault", {
      p_user_id: user.id,
      p_query: account,
      p_limit: 15,
    });

    if (vaultError) {
      console.error("Vault search error:", vaultError);
    }

    const results = vaultResults || [];
    const entryResults = results.filter((r: any) => r.source === "entry");
    const docResults = results.filter((r: any) => r.source === "document");

    // Build context for AI synthesis
    const contextParts: string[] = [];

    if (entryResults.length > 0) {
      contextParts.push("=== ENTRIES (Your Captures) ===");
      entryResults.forEach((e: any, i: number) => {
        contextParts.push(`[Entry ${i + 1}] ${e.title || ""}\n${e.summary || e.content}\nPillar: ${e.skill_pillar || "N/A"}`);
      });
    }

    if (docResults.length > 0) {
      contextParts.push("\n=== DOCUMENTS (Uploaded Files) ===");
      docResults.forEach((d: any, i: number) => {
        contextParts.push(`[Doc Chunk ${i + 1}] Source: ${d.title || "Unknown"}\n${d.content}`);
      });
    }

    if (contextParts.length === 0) {
      return new Response(JSON.stringify({
        account,
        synthesis_en: `No intelligence found for "${account}". Capture some insights or upload documents related to this account.`,
        synthesis_ar: `لم يتم العثور على معلومات استخباراتية لـ "${account}". قم بالتقاط بعض الرؤى أو رفع مستندات متعلقة بهذا الحساب.`,
        entries_count: 0,
        docs_count: 0,
        key_themes_en: [],
        key_themes_ar: [],
        strategic_questions_en: [],
        strategic_questions_ar: [],
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const context = contextParts.join("\n\n");

    // Use AI to synthesize
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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
            content: `You are Aura, an executive intelligence advisor for a senior EY professional. You analyze account intelligence and produce bilingual (English + Arabic) strategic syntheses. Return JSON using the tool provided.`,
          },
          {
            role: "user",
            content: `Analyze all intelligence for the account "${account}". Here is the context:\n\n${context}\n\nSynthesize the intelligence into a meeting brief for a GM-level discussion.`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "account_synthesis",
              description: "Return structured account intelligence synthesis",
              parameters: {
                type: "object",
                properties: {
                  synthesis_en: { type: "string", description: "2-3 paragraph English executive synthesis of the account intelligence" },
                  synthesis_ar: { type: "string", description: "2-3 paragraph Arabic executive synthesis (not a translation, a native Arabic perspective)" },
                  key_themes_en: { type: "array", items: { type: "string" }, description: "3-5 key strategic themes in English" },
                  key_themes_ar: { type: "array", items: { type: "string" }, description: "3-5 key strategic themes in Arabic" },
                  strategic_questions_en: { type: "array", items: { type: "string" }, description: "3 strategic questions to raise in a GM meeting (English)" },
                  strategic_questions_ar: { type: "array", items: { type: "string" }, description: "3 strategic questions to raise in a GM meeting (Arabic)" },
                  risk_factors: { type: "array", items: { type: "string" }, description: "2-3 risk factors or blind spots" },
                  opportunity_areas: { type: "array", items: { type: "string" }, description: "2-3 opportunity areas" },
                },
                required: ["synthesis_en", "synthesis_ar", "key_themes_en", "key_themes_ar", "strategic_questions_en", "strategic_questions_ar", "risk_factors", "opportunity_areas"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "account_synthesis" } },
      }),
    });

    if (!aiResp.ok) {
      const status = aiResp.status;
      if (status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again shortly." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add funds." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errText = await aiResp.text();
      console.error("AI error:", status, errText);
      throw new Error("AI synthesis failed");
    }

    const aiData = await aiResp.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    let synthesis: any;

    if (toolCall?.function?.arguments) {
      synthesis = JSON.parse(toolCall.function.arguments);
    } else {
      throw new Error("No structured response from AI");
    }

    return new Response(JSON.stringify({
      account,
      ...synthesis,
      entries_count: entryResults.length,
      docs_count: docResults.length,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (e) {
    console.error("account-brief error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
