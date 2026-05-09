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

    // Query entries directly (tagged with account or matching in content/title)
    const { data: entries, error: entriesErr } = await supabase
      .from("entries")
      .select("id, title, summary, content, skill_pillar, type")
      .eq("user_id", user.id)
      .or(`account_name.eq.${account},title.ilike.%${account}%,content.ilike.%${account}%`)
      .order("created_at", { ascending: false })
      .limit(15);

    if (entriesErr) console.error("Entries query error:", entriesErr);

    // Query document chunks directly
    const { data: docChunks, error: docsErr } = await supabase
      .from("document_chunks")
      .select("id, content, document_id, documents!inner(filename, summary)")
      .eq("user_id", user.id)
      .limit(50);

    if (docsErr) console.error("Doc chunks query error:", docsErr);

    // Filter doc chunks that mention the account
    const accountLower = account.toLowerCase();
    const relevantDocs = (docChunks || []).filter((dc: any) => 
      dc.content.toLowerCase().includes(accountLower) ||
      dc.documents?.filename?.toLowerCase().includes(accountLower) ||
      dc.documents?.summary?.toLowerCase().includes(accountLower)
    ).slice(0, 15);

    const entryResults = entries || [];

    // Build context for AI synthesis
    const contextParts: string[] = [];

    if (entryResults.length > 0) {
      contextParts.push("=== ENTRIES (Your Captures) ===");
      entryResults.forEach((e: any, i: number) => {
        contextParts.push(`[Entry ${i + 1}] ${e.title || ""}\n${e.summary || e.content?.slice(0, 300)}\nPillar: ${e.skill_pillar || "N/A"}`);
      });
    }

    if (relevantDocs.length > 0) {
      contextParts.push("\n=== DOCUMENTS (Uploaded Files) ===");
      relevantDocs.forEach((d: any, i: number) => {
        contextParts.push(`[Doc Chunk ${i + 1}] Source: ${d.documents?.filename || "Unknown"}\n${d.content?.slice(0, 400)}`);
      });
    }

    if (contextParts.length === 0) {
      return new Response(JSON.stringify({
        account,
        synthesis_en: `No intelligence found for "${account}". Capture some insights or upload documents related to this account.`,
        entries_count: 0,
        docs_count: 0,
        key_themes_en: [],
        strategic_questions_en: [],
        risk_factors: [],
        opportunity_areas: [],
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
            content: `You are Aura, an executive intelligence advisor for a senior EY professional. Analyze account intelligence and produce strategic syntheses in English. Return JSON using the tool provided.`,
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
                  synthesis_en: { type: "string", description: "2-3 paragraph English executive synthesis" },
                  key_themes_en: { type: "array", items: { type: "string" }, description: "3-5 key strategic themes" },
                  strategic_questions_en: { type: "array", items: { type: "string" }, description: "3 strategic questions for a GM meeting" },
                  risk_factors: { type: "array", items: { type: "string" }, description: "2-3 risk factors" },
                  opportunity_areas: { type: "array", items: { type: "string" }, description: "2-3 opportunity areas" },
                },
                required: ["synthesis_en", "key_themes_en", "strategic_questions_en", "risk_factors", "opportunity_areas"],
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
      const errText = await aiResp.text();
      console.error("AI error:", status, errText);
      if (status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again shortly." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
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
      docs_count: relevantDocs.length,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (e) {
    console.error("account-brief error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
