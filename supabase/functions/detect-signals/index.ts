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

/* ── NEW additive confidence formula ── */
function calcConfidence(
  aiBaseScore: number,
  uniqueOrgs: number,
  newestFragmentDate: string,
): { confidence: number; confidence_explanation: string } {
  // 50% AI score
  const aiComponent = Math.min(Math.max(aiBaseScore, 0), 1) * 0.5;

  // 30% source diversity: min(unique_orgs / 5, 1.0)
  const sourceDiversityWeight = Math.min(uniqueOrgs / 5, 1.0);
  const diversityComponent = sourceDiversityWeight * 0.3;

  // 20% recency of newest evidence
  const daysSince = daysBetween(new Date(), new Date(newestFragmentDate));
  const recencyWeight = daysSince < 7 ? 1.0 : daysSince <= 30 ? 0.7 : daysSince <= 90 ? 0.4 : 0.2;
  const recencyComponent = recencyWeight * 0.2;

  const confidence = Math.min(aiComponent + diversityComponent + recencyComponent, 1.0);

  const srcLabel = uniqueOrgs === 1 ? "organisation" : "organisations";
  const ageLabel = daysSince === 0 ? "today" : `${daysSince} days ago`;
  const confidence_explanation =
    `AI confidence ${(aiBaseScore * 100).toFixed(0)}%, ${uniqueOrgs} ${srcLabel}, newest evidence ${ageLabel}. ` +
    `Formula: (${(aiComponent).toFixed(2)} AI) + (${(diversityComponent).toFixed(2)} diversity) + (${(recencyComponent).toFixed(2)} recency) = ${confidence.toFixed(2)}.`;

  return { confidence, confidence_explanation };
}

/* ── Count unique orgs from evidence entries ── */
async function countUniqueOrgs(
  admin: any,
  evidenceEntryIds: string[],
  extraDomain?: string | null,
): Promise<number> {
  if (evidenceEntryIds.length === 0 && !extraDomain) return 1;

  const domains = new Set<string>();
  if (extraDomain) domains.add(extraDomain);

  if (evidenceEntryIds.length > 0) {
    const { data: entries } = await admin
      .from("entries")
      .select("content")
      .in("id", evidenceEntryIds);

    (entries || []).forEach((e: any) => {
      const d = extractDomain(e.content || "");
      if (d) domains.add(d);
    });
  }

  return Math.max(domains.size, 1);
}

async function calcPriorityScore(
  confidence: number,
  updatedAt: string,
  profileRelevance: number,
  fragmentCount: number,
  admin: any,
  userId: string,
  themeTags: string[],
): Promise<number> {
  const daysSinceUpdate = Math.floor((Date.now() - new Date(updatedAt).getTime()) / 86400000);
  const momentum = daysSinceUpdate <= 2 ? 0.8 : daysSinceUpdate <= 7 ? 0.5 : 0.2;
  const contentGap = 1.0;
  let base = (profileRelevance * 0.35) + (confidence * 0.30) + (momentum * 0.20) + (contentGap * 0.15) + (fragmentCount / 1000);

  if (themeTags.length > 0) {
    const { data: prefs } = await admin
      .from("signal_topic_preferences")
      .select("preference_score")
      .eq("user_id", userId)
      .in("theme_tag", themeTags);
    if (prefs && prefs.length > 0) {
      const avgPref = prefs.reduce((sum: number, p: any) => sum + (p.preference_score || 0), 0) / prefs.length;
      base = Math.min(Math.max(base + (avgPref * 0.10), 0.0), 1.0);
    }
  }

  return base;
}

function parseAiJson(raw: string): any {
  try { return JSON.parse(raw); } catch {
    const m = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    return JSON.parse((m ? m[1] : raw).replace(/[\u0000-\u001F\u007F]/g, " "));
  }
}

function unique<T>(arr: T[]): T[] { return [...new Set(arr)]; }

/* ── Relevance terms (hardened filter) ── */
const RELEVANCE_TERMS = [
  "digital transformation", "water utility", "utilities", "infrastructure",
  "cybersecurity", "ai", "workforce", "change management",
  "saudi arabia", "gcc", "cdo", "chief digital",
];

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
      .from("entries").select("id, title, content, type, skill_pillar, summary, created_at")
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
    const contentLower = normalizeText((entry.content || "") + " " + (entry.title || ""));
    const hasRelevance = RELEVANCE_TERMS.some(term => contentLower.includes(term));

    if (!hasRelevance) {
      const profileTerms: string[] = [];
      if (profile) {
        [profile.sector_focus, profile.core_practice, profile.north_star_goal, profile.firm]
          .filter(Boolean).forEach(v => profileTerms.push(...keywords(v!)));
        if (Array.isArray(profile.brand_pillars)) {
          profile.brand_pillars.filter(Boolean).forEach((p: string) => profileTerms.push(...keywords(p)));
        }
      }
      const hasProfileRelevance = profileTerms.length > 0 && profileTerms.some(term => contentLower.includes(term));
      if (!hasProfileRelevance) {
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

    /* ── Step 3: Dedup check ── */
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

    /* ── Reinforce an existing signal ── */
    const touchedSignalIds = new Set<string>();

    async function reinforceSignal(signalRow: any): Promise<string> {
      const existingEvidence: string[] = signalRow.supporting_evidence_ids || [];
      if (existingEvidence.includes(entry_id)) return signalRow.id;

      const mergedEvidence = unique([...existingEvidence, entry_id]);
      const newFragCount = mergedEvidence.length;

      // Count unique orgs from ALL evidence entries (existing + new)
      const newUniqueOrgs = await countUniqueOrgs(admin, mergedEvidence, captureDomain);

      // Use the newest evidence date (now, since we just added one)
      const now = new Date().toISOString();
      const { confidence, confidence_explanation } = calcConfidence(aiBaseConfidence, newUniqueOrgs, now);
      const priorityScore = await calcPriorityScore(confidence, now, 1.0, newFragCount, admin, user_id, signalRow.theme_tags || []);

      await admin.from("strategic_signals").update({
        supporting_evidence_ids: mergedEvidence,
        fragment_count: newFragCount,
        unique_orgs: newUniqueOrgs,
        confidence,
        confidence_explanation,
        what_it_means_for_you: whatItMeans,
        priority_score: priorityScore,
        updated_at: now,
      }).eq("id", signalRow.id);

      touchedSignalIds.add(signalRow.id);
      return signalRow.id;
    }

    let primarySignalId: string;
    let isNew: boolean;

    if (matches.length > 0) {
      const best = matches.sort((a, b) => (b.fragment_count || 0) - (a.fragment_count || 0))[0];
      primarySignalId = await reinforceSignal(best);
      isNew = false;
    } else {
      const now = new Date().toISOString();
      const initialUniqueOrgs = captureDomain ? 1 : 1;
      const { confidence, confidence_explanation } = calcConfidence(aiBaseConfidence, initialUniqueOrgs, now);
      const priorityScore = await calcPriorityScore(confidence, now, 1.0, 1, admin, user_id, newTags);

      const { data: row, error: insErr } = await admin.from("strategic_signals").insert({
        user_id,
        signal_title: newTitle,
        explanation: newSummary,
        strategic_implications: whatItMeans,
        theme_tags: newTags,
        confidence,
        confidence_explanation,
        what_it_means_for_you: whatItMeans,
        priority_score: priorityScore,
        status: "active",
        supporting_evidence_ids: [entry_id],
        fragment_count: 1,
        unique_orgs: initialUniqueOrgs,
      }).select("id").single();

      if (insErr) throw new Error(`Insert: ${insErr.message}`);
      primarySignalId = row.id;
      isNew = true;
      touchedSignalIds.add(primarySignalId);
    }

    /* ── Cross-topic reinforcement ── */
    const otherMatches = allSignals.filter(s =>
      !touchedSignalIds.has(s.id) &&
      (tagOverlapCount(newTags, s.theme_tags || []) >= 2 || titleSharesCoreTopic(newTitle, s.signal_title || ""))
    );
    for (const otherSig of otherMatches) {
      await reinforceSignal(otherSig);
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
