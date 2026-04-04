import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type SignalCandidate = {
  id: string;
  confidence: number | null;
  signal_title: string | null;
  theme_tags: string[] | null;
  fragment_count: number | null;
  supporting_evidence_ids: string[] | null;
  created_at?: string | null;
};

const STOP_WORDS = new Set([
  "the", "and", "for", "with", "from", "that", "this", "into", "about", "your", "their", "have", "been",
  "will", "what", "when", "where", "how", "why", "are", "was", "were", "is", "a", "an", "of", "in", "on",
  "to", "by", "or", "as", "at", "it", "its", "than", "through", "across", "over", "under", "between",
  "drive", "drives", "driven", "power", "powers", "cornerstone", "cornerstones", "success", "strategy",
  "strategic", "signal", "signals", "market", "opportunity", "opportunities",
]);

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stemWord(word: string): string {
  if (word.endsWith("ies") && word.length > 4) return `${word.slice(0, -3)}y`;
  if (word.endsWith("s") && !word.endsWith("ss") && word.length > 4) return word.slice(0, -1);
  return word;
}

function uniqueValues(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function normalizeTag(tag: string): string {
  return normalizeText(tag);
}

function normalizeThemeTags(tags: string[]): string[] {
  return uniqueValues(tags.map(normalizeTag).filter(Boolean));
}

function extractTopicKeywords(value: string): string[] {
  return uniqueValues(
    normalizeText(value)
      .split(" ")
      .map(stemWord)
      .filter((word) => word.length > 2 && !STOP_WORDS.has(word)),
  );
}

function buildTopicTerms(title: string, tags: string[]): Set<string> {
  const keywords = uniqueValues([
    ...extractTopicKeywords(title),
    ...tags.flatMap((tag) => extractTopicKeywords(tag)),
  ]);

  const terms = new Set<string>(keywords);

  for (let i = 0; i < keywords.length - 1; i += 1) {
    terms.add(`${keywords[i]} ${keywords[i + 1]}`);
  }

  for (const tag of tags) {
    const normalized = normalizeTag(tag);
    if (normalized) terms.add(normalized);
  }

  return terms;
}

function getTitleMatchDetails(newTitle: string, newTags: string[], existingTitle: string, existingTags: string[]) {
  const newTerms = buildTopicTerms(newTitle, newTags);
  const existingTerms = buildTopicTerms(existingTitle, existingTags);

  const phraseMatches = [...newTerms].filter((term) => term.includes(" ") && existingTerms.has(term));
  const keywordMatches = [...newTerms].filter((term) => !term.includes(" ") && existingTerms.has(term));

  return {
    phraseMatches,
    keywordMatches,
    isMatch: phraseMatches.length > 0 || keywordMatches.length >= 2,
  };
}

function findBestMatchingSignal(candidates: SignalCandidate[] | null, signalTitle: string, themeTags: string[]) {
  if (!candidates?.length) return null;

  const normalizedNewTags = normalizeThemeTags(themeTags);
  let bestMatch: { candidate: SignalCandidate; score: number } | null = null;

  for (const candidate of candidates) {
    const existingTags = normalizeThemeTags(candidate.theme_tags || []);
    const tagOverlap = normalizedNewTags.filter((tag) => existingTags.includes(tag)).length;
    const titleMatch = getTitleMatchDetails(signalTitle, normalizedNewTags, candidate.signal_title || "", existingTags);
    const isDuplicate = tagOverlap >= 2 || titleMatch.isMatch;

    if (!isDuplicate) continue;

    const score =
      (tagOverlap * 100) +
      (titleMatch.phraseMatches.length * 25) +
      (titleMatch.keywordMatches.length * 5) +
      (candidate.fragment_count || 0);

    if (!bestMatch || score > bestMatch.score) {
      bestMatch = { candidate, score };
    }
  }

  return bestMatch?.candidate || null;
}

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
    const themeTags: string[] = normalizeThemeTags(
      Array.isArray(signal.theme_tags) && signal.theme_tags.length > 0
        ? [signalType, ...signal.theme_tags]
        : [signalType],
    );
    const incomingEvidenceIds = [entry_id];

    // 4. Deduplication: find existing signals to reinforce
    const { data: candidates } = await admin
      .from("strategic_signals")
      .select("id, confidence, signal_title, theme_tags, fragment_count, supporting_evidence_ids, created_at")
      .eq("user_id", user_id)
      .eq("status", "active");

    const matchedSignal = findBestMatchingSignal((candidates as SignalCandidate[] | null) || null, signalTitle, themeTags);

    let signalId: string;
    let isNew: boolean;
    let reinforced = false;

    if (matchedSignal) {
      // Reinforce existing signal
      const existingEvidence: string[] = (matchedSignal.supporting_evidence_ids as string[]) || [];
      const mergedEvidence = uniqueValues([...existingEvidence, ...incomingEvidenceIds]);
      const addedEvidenceCount = mergedEvidence.length - existingEvidence.length;
      const newConfidence = Math.min(1, (matchedSignal.confidence || 0) + 0.02);
      const mergedTags = normalizeThemeTags([...(matchedSignal.theme_tags || []), ...themeTags]);
      const currentFragmentCount = Math.max(matchedSignal.fragment_count || 0, existingEvidence.length);
      const newFragmentCount = currentFragmentCount + Math.max(0, addedEvidenceCount);

      const { error: updErr } = await admin
        .from("strategic_signals")
        .update({
          confidence: newConfidence,
          fragment_count: newFragmentCount,
          supporting_evidence_ids: mergedEvidence,
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

    return new Response(JSON.stringify({ success: true, signal_id: signalId, is_new: isNew, reinforced }), {
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
