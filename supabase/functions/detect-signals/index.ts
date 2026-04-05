import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/* ── helpers ── */

function normalizeText(v: string): string {
  return v.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function stemWord(w: string): string {
  if (w.endsWith("ies") && w.length > 4) return w.slice(0, -3) + "y";
  if (w.endsWith("s") && !w.endsWith("ss") && w.length > 4) return w.slice(0, -1);
  return w;
}

const STOP = new Set([
  "the","and","for","with","from","that","this","into","about","your","their",
  "have","been","will","what","when","where","how","why","are","was","were",
  "is","a","an","of","in","on","to","by","or","as","at","it","its","than",
  "through","across","over","under","between",
]);

function keywords(text: string): string[] {
  return [...new Set(
    normalizeText(text).split(" ").map(stemWord).filter(w => w.length > 2 && !STOP.has(w))
  )];
}

function tagOverlapCount(a: string[], b: string[]): number {
  const setB = new Set(b.map(t => normalizeText(t)));
  return a.map(t => normalizeText(t)).filter(t => setB.has(t)).length;
}

function titleSharesCoreTopic(newTitle: string, existingTitle: string): boolean {
  const newKw = keywords(newTitle);
  const exKw = new Set(keywords(existingTitle));
  return newKw.filter(k => exKw.has(k)).length >= 1;
}

function extractDomain(text: string): string | null {
  const m = text.match(/https?:\/\/([^\/\s]+)/);
  return m ? m[1].replace(/^www\./, "") : null;
}

function daysBetween(a: Date, b: Date): number {
  return Math.max(0, Math.floor(Math.abs(a.getTime() - b.getTime()) / 86400000));
}

function calcConfidence(aiBase: number, fragmentCount: number, uniqueOrgs: number, updatedAt: string): { confidence: number; explanation: string } {
  const sourceWeight = Math.min(fragmentCount / 5, 1.4);
  const diversityBonus = uniqueOrgs >= 3 ? 1.15 : uniqueOrgs === 2 ? 1.05 : 1.0;
  const daysSinceUpdate = daysBetween(new Date(), new Date(updatedAt));
  const recency = daysSinceUpdate <= 7 ? 1.0 : daysSinceUpdate <= 14 ? 0.9 : daysSinceUpdate <= 30 ? 0.8 : daysSinceUpdate <= 60 ? 0.65 : 0.5;
  const confidence = Math.min(aiBase * sourceWeight * diversityBonus * recency, 1.0);
  const explanation = `Based on ${fragmentCount} sources from ${uniqueOrgs} organisations, updated ${daysSinceUpdate === 0 ? "today" : daysSinceUpdate + " days ago"}.`;
  return { confidence, explanation };
}

function parseAiJson(raw: string): any {
  try { return JSON.parse(raw); } catch {
    const m = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    return JSON.parse((m ? m[1] : raw).replace(/[\u0000-\u001F\u007F]/g, " "));
  }
}

function unique<T>(arr: T[]): T[] { return [...new Set(arr)]; }

/* ── main ── */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { entry_id, user_id } = await req.json();
    if (!entry_id || !user_id) {
      return new Response(JSON.stringify({ error: "entry_id and user_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const admin = createClient(supabaseUrl, serviceKey);

    // Fetch entry
    const { data: entry, error: eErr } = await admin
      .from("entries").select("id, title, content, type, skill_pillar, summary")
      .eq("id", entry_id).eq("user_id", user_id).maybeSingle();
    if (eErr) throw new Error(`Entry fetch: ${eErr.message}`);
    if (!entry) return new Response(JSON.stringify({ error: "Entry not found" }), {
      status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

    // Fetch profile
    const { data: profile } = await admin
      .from("diagnostic_profiles")
      .select("sector_focus, core_practice, north_star_goal, level, firm, brand_pillars")
      .eq("user_id", user_id).maybeSingle();

    /* ── Step 1: Relevance filter ── */
    const profileTerms: string[] = [];
    if (profile) {
      [profile.sector_focus, profile.core_practice, profile.north_star_goal, profile.firm]
        .filter(Boolean).forEach(v => profileTerms.push(...keywords(v!)));
      if (Array.isArray(profile.brand_pillars)) {
        profile.brand_pillars.filter(Boolean).forEach((p: string) => profileTerms.push(...keywords(p)));
      }
    }

    if (profileTerms.length > 0) {
      const contentLower = normalizeText((entry.content || "") + " " + (entry.title || ""));
      const hasRelevance = profileTerms.some(term => contentLower.includes(term));
      if (!hasRelevance) {
        return new Response(JSON.stringify({ skipped: true, reason: "not relevant to profile" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const identityCtx = profile
      ? `User context: Level=${profile.level || "N/A"}, Firm=${profile.firm || "N/A"}, Sector=${profile.sector_focus || "N/A"}, Practice=${profile.core_practice || "N/A"}, Goal=${profile.north_star_goal || "N/A"}`
      : "No user profile available.";

    /* ── Step 2: AI classification ── */
    const systemPrompt = `You are a Strategic Signal Detector.
Given an entry and user context, classify it and return valid JSON with these exact fields:
{
  "title": "plain language statement of fact, max 10 words, no jargon",
  "summary": "2 sentences, plain language",
  "type": "market_trend|skill_gap|competitor_move|career_opportunity|content_gap",
  "theme_tags": ["3 to 5 short topic strings"],
  "ai_base_confidence": 0.0 to 1.0,
  "what_it_means_for_you": "one sentence connecting this signal to the user's career target and industry, personalised"
}

${identityCtx}`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Analyze:\nTitle: ${entry.title || "Untitled"}\nType: ${entry.type}\nContent: ${(entry.content || "").slice(0, 2000)}` },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      if (aiRes.status === 429) return new Response(JSON.stringify({ error: "Rate limit exceeded." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (aiRes.status === 402) return new Response(JSON.stringify({ error: "AI credits exhausted." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      throw new Error(`AI error: ${aiRes.status} ${errText}`);
    }

    const aiData = await aiRes.json();
    const signal = parseAiJson(aiData.choices?.[0]?.message?.content || "{}");

    const newTitle = signal.title || "Untitled Signal";
    const newSummary = signal.summary || "";
    const newType = signal.type || "market_trend";
    const newTags: string[] = Array.isArray(signal.theme_tags) ? signal.theme_tags.slice(0, 5) : [];
    if (!newTags.includes(newType)) newTags.unshift(newType);
    const aiBaseConfidence = Math.min(1, Math.max(0, signal.ai_base_confidence ?? 0.5));
    const whatItMeans = signal.what_it_means_for_you || "";
    const captureDomain = extractDomain(entry.content || "");

    /* ── Step 3: Dedup check — fetch all active signals ── */
    const { data: existingSignals } = await admin
      .from("strategic_signals")
      .select("id, signal_title, theme_tags, confidence, fragment_count, supporting_evidence_ids, unique_orgs, updated_at")
      .eq("user_id", user_id).eq("status", "active");

    const allSignals = existingSignals || [];

    function findMatches(tags: string[], title: string): typeof allSignals {
      return allSignals.filter(s => {
        const overlap = tagOverlapCount(tags, s.theme_tags || []);
        const titleMatch = titleSharesCoreTopic(title, s.signal_title || "");
        return overlap >= 2 || titleMatch;
      });
    }

    const matches = findMatches(newTags, newTitle);

    /* ── Step 4a / 4b ── */
    const touchedSignalIds = new Set<string>();

    async function reinforceSignal(signalRow: any): Promise<string> {
      const existingEvidence: string[] = signalRow.supporting_evidence_ids || [];
      if (existingEvidence.includes(entry_id)) return signalRow.id; // already linked

      const mergedEvidence = unique([...existingEvidence, entry_id]);
      const newFragCount = (signalRow.fragment_count || 0) + 1;

      // Check if domain is new
      let newUniqueOrgs = signalRow.unique_orgs || 1;
      if (captureDomain) {
        // We can't easily check all domains from evidence, so just increment if domain looks new
        // A simple heuristic: increment if unique_orgs < fragment_count
        if (newUniqueOrgs < newFragCount) newUniqueOrgs += 1;
      }

      const now = new Date().toISOString();
      const { confidence, explanation } = calcConfidence(aiBaseConfidence, newFragCount, newUniqueOrgs, now);

      await admin.from("strategic_signals").update({
        supporting_evidence_ids: mergedEvidence,
        fragment_count: newFragCount,
        unique_orgs: newUniqueOrgs,
        confidence,
        confidence_explanation: explanation,
        what_it_means_for_you: whatItMeans,
        updated_at: now,
      }).eq("id", signalRow.id);

      touchedSignalIds.add(signalRow.id);
      return signalRow.id;
    }

    let primarySignalId: string;
    let isNew: boolean;

    if (matches.length > 0) {
      // Step 4a — reinforce the best match (highest fragment_count)
      const best = matches.sort((a, b) => (b.fragment_count || 0) - (a.fragment_count || 0))[0];
      primarySignalId = await reinforceSignal(best);
      isNew = false;
    } else {
      // Step 4b — create new
      const now = new Date().toISOString();
      const { confidence, explanation } = calcConfidence(aiBaseConfidence, 1, 1, now);

      const { data: row, error: insErr } = await admin.from("strategic_signals").insert({
        user_id,
        signal_title: newTitle,
        explanation: newSummary,
        strategic_implications: whatItMeans,
        theme_tags: newTags,
        confidence,
        confidence_explanation: explanation,
        what_it_means_for_you: whatItMeans,
        status: "active",
        supporting_evidence_ids: [entry_id],
        fragment_count: 1,
        unique_orgs: 1,
      }).select("id").single();

      if (insErr) throw new Error(`Insert: ${insErr.message}`);
      primarySignalId = row.id;
      isNew = true;
      touchedSignalIds.add(primarySignalId);
    }

    /* ── Step 6: Cross-topic reinforcement ── */
    const otherMatches = allSignals.filter(s =>
      !touchedSignalIds.has(s.id) &&
      (tagOverlapCount(newTags, s.theme_tags || []) >= 2 || titleSharesCoreTopic(newTitle, s.signal_title || ""))
    );
    for (const otherSig of otherMatches) {
      await reinforceSignal(otherSig);
    }

    /* ── Step 7: Priority score for all touched signals ── */
    for (const sigId of touchedSignalIds) {
      const { data: sig } = await admin
        .from("strategic_signals")
        .select("confidence, updated_at, id")
        .eq("id", sigId).single();
      if (!sig) continue;

      const daysSinceNew = daysBetween(new Date(), new Date(sig.updated_at));
      const momentum = daysSinceNew <= 2 ? 0.8 : daysSinceNew <= 7 ? 0.5 : 0.2;
      const contentGap = 1.0; // no content_items table, default to gap
      const profileRelevance = (profile?.sector_focus && normalizeText(entry.content || "").includes(normalizeText(profile.sector_focus))) ? 1.0 : 0.7;
      const priorityScore = (profileRelevance * 0.35) + (sig.confidence * 0.30) + (momentum * 0.20) + (contentGap * 0.15);

      await admin.from("strategic_signals").update({ priority_score: priorityScore }).eq("id", sigId);
    }

    return new Response(JSON.stringify({
      success: true,
      signal_id: primarySignalId,
      is_new: isNew,
      reinforced: !isNew,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error) {
    console.error("detect-signals error:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
