import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function parseAiJson(raw: string): any {
  try {
    return JSON.parse(raw);
  } catch {
    const match = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    const cleaned = (match ? match[1] : raw).replace(/[\u0000-\u001F\u007F]/g, " ");
    return JSON.parse(cleaned);
  }
}

async function fetchSourceContent(
  supabase: any,
  sourceType: string,
  sourceId: string,
): Promise<{ title: string; content: string }> {
  switch (sourceType) {
    case "entry": {
      const { data } = await supabase
        .from("entries")
        .select("title, content, summary, type, skill_pillar, account_name, framework_tag")
        .eq("id", sourceId)
        .single();
      if (!data) throw new Error("Entry not found");
      return {
        title: data.title || "Untitled Entry",
        content: `Title: ${data.title || "N/A"}\nType: ${data.type}\nPillar: ${data.skill_pillar || "N/A"}\nAccount: ${data.account_name || "N/A"}\nFramework: ${data.framework_tag || "N/A"}\n\n${data.content}\n\nSummary: ${data.summary || ""}`,
      };
    }
    case "document": {
      const { data: doc } = await supabase
        .from("documents")
        .select("filename, summary, file_type")
        .eq("id", sourceId)
        .single();
      const { data: chunks } = await supabase
        .from("document_chunks")
        .select("content")
        .eq("document_id", sourceId)
        .order("chunk_index", { ascending: true })
        .limit(25);
      return {
        title: doc?.filename || "Unknown Document",
        content: `Document: ${doc?.filename}\nType: ${doc?.file_type}\nSummary: ${doc?.summary || ""}\n\n${(chunks || []).map((c: any) => c.content).join("\n\n")}`,
      };
    }
    case "framework": {
      const { data } = await supabase
        .from("master_frameworks")
        .select("title, summary, tags, framework_steps, source_type")
        .eq("id", sourceId)
        .single();
      if (!data) throw new Error("Framework not found");
      return {
        title: data.title,
        content: `Framework: ${data.title}\nSource: ${data.source_type}\nTags: ${(data.tags || []).join(", ")}\nSummary: ${data.summary || ""}\n\nSteps:\n${JSON.stringify(data.framework_steps, null, 2)}`,
      };
    }
    case "intelligence": {
      const { data } = await supabase
        .from("learned_intelligence")
        .select("title, content, intelligence_type, skill_pillars, tags")
        .eq("id", sourceId)
        .single();
      if (!data) throw new Error("Intelligence not found");
      return {
        title: data.title,
        content: `Intelligence: ${data.title}\nType: ${data.intelligence_type}\nPillars: ${(data.skill_pillars || []).join(", ")}\nTags: ${(data.tags || []).join(", ")}\n\n${data.content}`,
      };
    }
    default:
      throw new Error(`Unknown source type: ${sourceType}`);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { source_registry_id, source_type, source_id, user_id } = await req.json();

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // If no source_registry_id, register first
    let registryId = source_registry_id;
    if (!registryId && source_type && source_id && user_id) {
      const { content, title } = await fetchSourceContent(adminClient, source_type, source_id);
      const { data: existing } = await adminClient
        .from("source_registry")
        .select("id")
        .eq("user_id", user_id)
        .eq("source_type", source_type)
        .eq("source_id", source_id)
        .maybeSingle();

      if (existing) {
        registryId = existing.id;
      } else {
        const { data: inserted, error: insErr } = await adminClient
          .from("source_registry")
          .insert({
            user_id,
            source_type,
            source_id,
            title,
            content_preview: content.slice(0, 500),
          })
          .select("id")
          .single();
        if (insErr) throw new Error(`Registry insert error: ${insErr.message}`);
        registryId = inserted.id;
      }
    }

    if (!registryId) {
      return new Response(JSON.stringify({ error: "source_registry_id or (source_type, source_id, user_id) required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch registry entry
    const { data: registry } = await adminClient
      .from("source_registry")
      .select("*")
      .eq("id", registryId)
      .single();
    if (!registry) throw new Error("Registry entry not found");

    // Fetch source content
    const { content, title } = await fetchSourceContent(adminClient, registry.source_type, registry.source_id);

    // Get user's skill context
    const { data: profile } = await adminClient
      .from("diagnostic_profiles")
      .select("generated_skills, skill_ratings")
      .eq("user_id", registry.user_id)
      .maybeSingle();

    const skillContext = profile
      ? `\nUser's skills: ${JSON.stringify((profile as any).generated_skills?.slice(0, 5)?.map((s: any) => s.name))}`
      : "";

    const systemPrompt = `You are an Evidence Extraction Engine for an executive coaching platform.

Analyze the content and extract ALL structured evidence fragments. Each fragment must be one of:
- "claim": A specific assertion or argument made
- "signal": A market/industry signal or trend indicator
- "framework_step": A step in a methodology or process
- "market_fact": A verified data point, statistic, or market fact
- "skill_evidence": Evidence of skill application or development
- "insight": A strategic insight or observation
- "pattern": A recurring pattern across data
- "recommendation": An actionable recommendation

For each fragment extract:
- title: concise name (5-10 words)
- content: detailed description (2-4 sentences)
- fragment_type: one of the types above
- confidence: 0.0-1.0 (how certain this extraction is)
- skill_pillars: relevant skills from ["Strategic Client Advisory","Revenue Growth Leadership","Executive Presence","Team Development","Industry Thought Leadership","Complex Program Delivery","Stakeholder Management","Market Positioning","Digital Fluency","Resilience Under Pressure"]
- tags: 2-5 keyword tags
- entities: array of {name, type} where type is "company"|"person"|"metric"|"technology"|"regulation"
${skillContext}

Output valid JSON: { "fragments": [...] }
Extract 3-8 fragments. Focus on ACTIONABLE, STRATEGIC content.`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Extract evidence from:\n\n${content.slice(0, 12000)}` },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      throw new Error(`AI error: ${aiRes.status} ${errText}`);
    }

    const aiData = await aiRes.json();
    const parsed = parseAiJson(aiData.choices?.[0]?.message?.content || "{}");
    const fragments = parsed.fragments || [];

    // Delete old fragments for this source (re-processing)
    await adminClient
      .from("evidence_fragments")
      .delete()
      .eq("source_registry_id", registryId);

    // Insert new fragments
    const inserted = [];
    for (const frag of fragments) {
      const { data: row, error: fragErr } = await adminClient
        .from("evidence_fragments")
        .insert({
          user_id: registry.user_id,
          source_registry_id: registryId,
          fragment_type: frag.fragment_type || "insight",
          title: frag.title,
          content: frag.content,
          confidence: frag.confidence || 0.7,
          skill_pillars: frag.skill_pillars || [],
          tags: frag.tags || [],
          entities: frag.entities || [],
          metadata: { source_title: title },
        })
        .select()
        .single();
      if (!fragErr && row) inserted.push(row);
    }

    // Update registry
    await adminClient
      .from("source_registry")
      .update({
        processed: true,
        processed_at: new Date().toISOString(),
        fragment_count: inserted.length,
        title,
        content_preview: content.slice(0, 500),
      })
      .eq("id", registryId);

    // Chain: trigger signal detection on the newly created fragments
    if (inserted.length > 0) {
      const fragmentIds = inserted.map((f: any) => f.id);
      adminClient.functions.invoke("detect-signals-v2", {
        body: {
          fragment_ids: fragmentIds,
          source_registry_id: registryId,
          user_id: registry.user_id,
        },
      }).catch((e: any) =>
        console.warn("[extract-evidence] detect-signals-v2 chain failed:", e?.message)
      );
      console.log("[extract-evidence] chained detect-signals-v2 with", fragmentIds.length, "fragments");
    }

    return new Response(JSON.stringify({
      success: true,
      source_registry_id: registryId,
      fragments_extracted: inserted.length,
      fragments: inserted,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("extract-evidence error:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
