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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { entry_id, user_id } = await req.json();
    if (!entry_id || !user_id) {
      return new Response(JSON.stringify({ error: "entry_id and user_id are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const admin = createClient(supabaseUrl, serviceRoleKey);

    // 1. Read the entry
    const { data: entry, error: entryErr } = await admin
      .from("entries")
      .select("id, title, content, type, skill_pillar, summary")
      .eq("id", entry_id)
      .eq("user_id", user_id)
      .maybeSingle();

    if (entryErr) throw new Error(`Entry fetch error: ${entryErr.message}`);
    if (!entry) {
      return new Response(JSON.stringify({ error: "Entry not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Read user identity context from diagnostic_profiles
    const { data: profile } = await admin
      .from("diagnostic_profiles")
      .select("sector_focus, core_practice, north_star_goal, level, firm")
      .eq("user_id", user_id)
      .maybeSingle();

    const identityContext = profile
      ? `User context: Level=${profile.level || "N/A"}, Firm=${profile.firm || "N/A"}, Sector=${profile.sector_focus || "N/A"}, Practice=${profile.core_practice || "N/A"}, Goal=${profile.north_star_goal || "N/A"}`
      : "No user profile available.";

    // 3. Call AI to classify
    const systemPrompt = `You are a Strategic Signal Detector for an executive intelligence platform.

Given an entry (note, link, insight, observation) and the user's professional context, classify it into exactly ONE signal type and extract a strategic signal.

Signal types:
- market_trend: emerging market shifts, industry changes, macro trends
- competitor_move: competitor actions, launches, strategies, talent moves
- content_gap: topics the user should write about but hasn't, audience demand signals
- capability_gap: skills or competencies the user needs to develop
- career_opportunity: roles, promotions, lateral moves, advisory opportunities

${identityContext}

Return valid JSON:
{
  "type": "market_trend|competitor_move|content_gap|capability_gap|career_opportunity",
  "title": "Bold 5-10 word signal title",
  "summary": "2-3 sentence explanation of the signal and why it matters",
  "confidence_score": 0-100,
  "rationale": "1-2 sentences explaining your classification reasoning",
  "theme_tags": ["tag1", "tag2", "tag3"]
}`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: `Analyze this entry:\nTitle: ${entry.title || "Untitled"}\nType: ${entry.type}\nContent: ${(entry.content || "").slice(0, 2000)}`,
          },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      if (aiRes.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again shortly." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiRes.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add funds in Settings > Workspace > Usage." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI error: ${aiRes.status} ${errText}`);
    }

    const aiData = await aiRes.json();
    const signal = parseAiJson(aiData.choices?.[0]?.message?.content || "{}");

    const signalType = signal.type || "market_trend";
    const signalTitle = signal.title || "Untitled Signal";
    const signalSummary = signal.summary || "";
    const confidenceNormalized = Math.min(1, Math.max(0, (signal.confidence_score || 50) / 100));
    const rationale = signal.rationale || "";
    const themeTags: string[] = Array.isArray(signal.theme_tags) && signal.theme_tags.length > 0
      ? [signalType, ...signal.theme_tags.filter((t: string) => t !== signalType)]
      : [signalType];

    // 4. Deduplication: find existing signals to reinforce
    // Strategy A: overlapping theme_tags (≥2 in common)
    // Strategy B: similar title keyword match
    const { data: candidates } = await admin
      .from("strategic_signals")
      .select("id, confidence, signal_title, theme_tags, fragment_count, supporting_evidence_ids")
      .eq("user_id", user_id)
      .eq("status", "active");

    let matchedSignal: typeof candidates extends (infer T)[] | null ? T : never = null as any;

    if (candidates && candidates.length > 0) {
      // Check theme_tags overlap (≥2 tags in common)
      for (const c of candidates) {
        const existingTags: string[] = (c.theme_tags as string[]) || [];
        const overlap = themeTags.filter(t => existingTags.includes(t)).length;
        if (overlap >= 2) {
          matchedSignal = c;
          break;
        }
      }

      // If no tag match, try title keyword similarity
      if (!matchedSignal) {
        const titleWords = signalTitle.toLowerCase().split(/\s+/).filter((w: string) => w.length > 3);
        for (const c of candidates) {
          const existingTitle = (c.signal_title || "").toLowerCase();
          const matchCount = titleWords.filter((w: string) => existingTitle.includes(w)).length;
          if (matchCount >= 2) {
            matchedSignal = c;
            break;
          }
        }
      }
    }

    let signalId: string;
    let isNew: boolean;
    let reinforced = false;

    if (matchedSignal) {
      // Reinforce existing signal
      const existingEvidence: string[] = (matchedSignal.supporting_evidence_ids as string[]) || [];
      const newEvidence = existingEvidence.includes(entry_id)
        ? existingEvidence
        : [...existingEvidence, entry_id];
      const newFragmentCount = newEvidence.length;
      const newConfidence = Math.min(1, (matchedSignal.confidence || 0) + 0.02);
      // Merge theme_tags (deduplicated)
      const existingTags: string[] = (matchedSignal.theme_tags as string[]) || [];
      const mergedTags = [...new Set([...existingTags, ...themeTags])];

      const { error: updErr } = await admin
        .from("strategic_signals")
        .update({
          confidence: newConfidence,
          fragment_count: newFragmentCount,
          supporting_evidence_ids: newEvidence,
          theme_tags: mergedTags,
          updated_at: new Date().toISOString(),
        })
        .eq("id", matchedSignal.id);

      if (updErr) throw new Error(`Update error: ${updErr.message}`);
      signalId = matchedSignal.id;
      isNew = false;
      reinforced = true;
    } else {
      // Insert new signal
      const { data: row, error: insErr } = await admin
        .from("strategic_signals")
        .insert({
          user_id,
          signal_title: signalTitle,
          explanation: signalSummary,
          strategic_implications: rationale,
          theme_tags: themeTags,
          confidence: confidenceNormalized,
          status: "active",
          supporting_evidence_ids: [entry_id],
          fragment_count: 1,
        })
        .select("id")
        .single();

      if (insErr) throw new Error(`Insert error: ${insErr.message}`);
      signalId = row.id;
      isNew = true;
    }

    return new Response(JSON.stringify({ success: true, signal_id: signalId, is_new: isNew }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("detect-signals error:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
