import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { entry_id, title, summary, content } = await req.json();
    if (!entry_id) throw new Error("entry_id is required");

    const authHeader = req.headers.get("Authorization");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabase = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Get user
    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
    const token = authHeader?.replace("Bearer ", "");
    const { data: { user }, error: userError } = await anonClient.auth.getUser(token);
    if (userError || !user) throw new Error("Unauthorized");

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const inputText = `Title: ${title || ""}\nSummary: ${summary || ""}\nContent: ${content || ""}`;

    // Use AI to extract framework steps
    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `You are an expert system analyst. Given content about an expert framework, methodology, or system (e.g., a branding framework, leadership model, strategy playbook), extract:
1. A clear title for the framework
2. The ordered steps/stages/principles as a structured list
3. A concise summary of the framework's purpose and application
4. Relevant tags

Return JSON using the tool provided. Be precise — extract the actual steps/rules, not vague descriptions.`,
          },
          {
            role: "user",
            content: `Extract the expert framework from this capture:\n\n${inputText}`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_framework",
              description: "Extract structured expert framework",
              parameters: {
                type: "object",
                properties: {
                  framework_title: { type: "string", description: "Clear title for the framework" },
                  framework_steps: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        step_number: { type: "number" },
                        step_title: { type: "string" },
                        step_description: { type: "string" },
                      },
                      required: ["step_number", "step_title", "step_description"],
                    },
                    description: "Ordered steps/stages/principles of the framework",
                  },
                  framework_summary: { type: "string", description: "1-2 sentence summary of the framework's purpose" },
                  tags: {
                    type: "array",
                    items: { type: "string" },
                    description: "Relevant tags like 'branding', 'leadership', 'strategy', etc.",
                  },
                },
                required: ["framework_title", "framework_steps", "framework_summary", "tags"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "extract_framework" } },
      }),
    });

    if (!aiResp.ok) {
      const errText = await aiResp.text();
      console.error("AI error:", aiResp.status, errText);
      throw new Error("AI extraction failed");
    }

    const aiData = await aiResp.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall?.function?.arguments) throw new Error("No structured response from AI");

    const extracted = JSON.parse(toolCall.function.arguments);

    // Save to master_frameworks
    const { data: framework, error: insertError } = await supabase
      .from("master_frameworks")
      .insert({
        user_id: user.id,
        entry_id,
        title: extracted.framework_title,
        framework_steps: extracted.framework_steps,
        summary: extracted.framework_summary,
        tags: ["ExpertFramework", ...(extracted.tags || [])],
        source_type: "capture",
      })
      .select("id, title")
      .single();

    if (insertError) {
      console.error("Insert error:", insertError);
      throw new Error("Failed to save framework");
    }

    // Tag the entry
    await supabase
      .from("entries")
      .update({ framework_tag: "#ExpertFramework" })
      .eq("id", entry_id);

    return new Response(JSON.stringify({
      success: true,
      framework_id: framework.id,
      framework_title: framework.title,
      steps_count: extracted.framework_steps.length,
      tags: extracted.tags,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (e) {
    console.error("extract-framework error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
