import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader! } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { mode } = await req.json(); // "scan" or "apply"

    // Fetch all user entries (active ones)
    const { data: entries, error: fetchError } = await supabase
      .from("entries")
      .select("id, title, content, summary, created_at, type, skill_pillar, pinned, account_name")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (fetchError) throw fetchError;
    if (!entries || entries.length < 2) {
      return new Response(JSON.stringify({ groups: [], message: "Not enough entries to deduplicate." }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Send to AI to find duplicate groups
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const entrySummaries = entries.slice(0, 100).map((e, i) => 
      `[${i}] id=${e.id} | ${(e.title || "").slice(0, 60)} | ${(e.content || "").slice(0, 150)}`
    ).join("\n");

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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
            content: `You are a deduplication engine. Given a list of entries, find groups where entries have 90%+ similar content (same topic, rephrased, or near-duplicate). Return ONLY groups with 2+ entries. For each group, identify the "keep" entry (the most detailed/longest one) and the "archive" entries (the rest).`,
          },
          {
            role: "user",
            content: `Find duplicate groups in these entries:\n\n${entrySummaries}`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "report_duplicates",
              description: "Report groups of duplicate entries",
              parameters: {
                type: "object",
                properties: {
                  groups: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        reason: { type: "string", description: "Why these are duplicates" },
                        keep_index: { type: "integer", description: "Index of the entry to keep" },
                        archive_indices: {
                          type: "array",
                          items: { type: "integer" },
                          description: "Indices of entries to archive/delete",
                        },
                      },
                      required: ["reason", "keep_index", "archive_indices"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["groups"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "report_duplicates" } },
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI error:", aiResponse.status, errText);
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited. Please try again shortly." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error("AI analysis failed");
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      return new Response(JSON.stringify({ groups: [], message: "No duplicates found." }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { groups } = JSON.parse(toolCall.function.arguments);

    // Map indices back to real entries
    const slicedEntries = entries.slice(0, 100);
    const enrichedGroups = (groups || [])
      .filter((g: any) => g.archive_indices && g.archive_indices.length > 0)
      .map((g: any) => ({
        reason: g.reason,
        keep: slicedEntries[g.keep_index]
          ? { id: slicedEntries[g.keep_index].id, title: slicedEntries[g.keep_index].title || slicedEntries[g.keep_index].content?.slice(0, 60) }
          : null,
        archive: g.archive_indices
          .map((i: number) => slicedEntries[i])
          .filter(Boolean)
          .map((e: any) => ({ id: e.id, title: e.title || e.content?.slice(0, 60) })),
      }))
      .filter((g: any) => g.keep && g.archive.length > 0);

    if (mode === "apply" && enrichedGroups.length > 0) {
      // Delete the archived duplicates
      const idsToDelete = enrichedGroups.flatMap((g: any) => g.archive.map((a: any) => a.id));
      if (idsToDelete.length > 0) {
        const { error: deleteError } = await supabase
          .from("entries")
          .delete()
          .in("id", idsToDelete);
        if (deleteError) throw deleteError;
      }

      return new Response(JSON.stringify({
        groups: enrichedGroups,
        applied: true,
        deletedCount: idsToDelete.length,
        message: `Removed ${idsToDelete.length} duplicate entries.`,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      groups: enrichedGroups,
      applied: false,
      message: enrichedGroups.length === 0
        ? "No duplicates found — your vault is clean!"
        : `Found ${enrichedGroups.length} group(s) of duplicates.`,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("deduplicate error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
