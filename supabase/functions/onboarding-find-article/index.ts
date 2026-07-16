import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { withObserve } from "../_shared/observe.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { logAIUsage } from "../_shared/logAIUsage.ts";
import { logError } from "../_shared/logError.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// Curated evergreen fallbacks — build-time validated (HTTP 200).
// These MUST never be modified without re-validating.
const CURATED_FALLBACKS: Array<{ url: string; title: string; summary: string; source: string }> = [
  {
    url: "https://hbr.org/topic/subject/strategy",
    title: "Strategy — Harvard Business Review",
    summary: "HBR's ongoing collection of executive strategy thinking — pick the piece that reflects your current bet.",
    source: "Harvard Business Review",
  },
  {
    url: "https://hbr.org/topic/subject/leadership",
    title: "Leadership — Harvard Business Review",
    summary: "Executive leadership essays from HBR — a strong starting point for building your capture rhythm.",
    source: "Harvard Business Review",
  },
  {
    url: "https://hbr.org/topic/subject/innovation",
    title: "Innovation — Harvard Business Review",
    summary: "How incumbents are reshaping their businesses — evergreen strategic reading for senior operators.",
    source: "Harvard Business Review",
  },
];

async function callPerplexity(apiKey: string, prompt: string, userQuery: string, userId?: string | null) {
  const perpRes = await fetch("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "sonar",
      messages: [
        { role: "system", content: prompt },
        { role: "user", content: userQuery },
      ],
      search_recency_filter: "month",
    }),
  });
  if (!perpRes.ok) return null;
  const perpData = await perpRes.json();
  try {
    EdgeRuntime.waitUntil(logAIUsage({
      user_id: userId ?? null,
      function_name: "onboarding-find-article",
      provider: "perplexity",
      model: perpData.model,
      input_tokens: perpData.usage?.prompt_tokens,
      output_tokens: perpData.usage?.completion_tokens,
    }));
  } catch (_) { /* non-blocking */ }
  const content: string = perpData?.choices?.[0]?.message?.content || "";
  const citations: string[] = (perpData?.citations || []).filter(
    (u: unknown): u is string => typeof u === "string" && u.startsWith("http"),
  );
  return { content, citations };
}

function parseArticle(content: string, citations: string[]) {
  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      const url = parsed.url || citations[0] || "";
      if (url) {
        return {
          url,
          title: parsed.title || "",
          summary: parsed.summary || "",
          source: parsed.source || "Market Intelligence",
        };
      }
    }
  } catch { /* fall through */ }
  if (citations.length > 0) {
    let host = "Market Intelligence";
    try { host = new URL(citations[0]).hostname.replace(/^www\./, ""); } catch {}
    return {
      url: citations[0],
      title: content.slice(0, 100),
      summary: content.slice(0, 200),
      source: host,
    };
  }
  return null;
}

serve(withObserve("onboarding-find-article", async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Observability log — best-effort, must never block the response.
  let outcome: "perplexity" | "perplexity_retry" | "curated_fallback" | "error" = "error";
  let outcomeUrl: string | null = null;
  let logUserId: string | null = null;
  let logSector: string | null = null;
  let logPractice: string | null = null;
  const logRow = () => {
    try {
      const svc = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );
      // fire-and-forget
      svc.from("onboarding_article_log").insert({
        user_id: logUserId,
        sector_focus: logSector,
        core_practice: logPractice,
        outcome,
        url: outcomeUrl,
      }).then(() => {}, () => {});
    } catch { /* ignore */ }
  };

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Not authenticated" }, 401);
    }
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: authError } = await userClient.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authError || !user) {
      return json({ error: "Not authenticated" }, 401);
    }
    logUserId = user.id;

    const { sector_focus, core_practice, firm, level } = await req.json().catch(() => ({}));
    logSector = sector_focus ?? null;
    logPractice = core_practice ?? null;

    if (!sector_focus && !core_practice) {
      // Only success-path guard that may return found:false.
      return json({ found: false, error: "At least sector_focus or core_practice required" }, 400);
    }

    const PERPLEXITY_KEY = Deno.env.get("PERPLEXITY_API_KEY");

    // Attempt 1 — narrow, current query.
    if (PERPLEXITY_KEY) {
      try {
        const searchQuery = [core_practice, sector_focus].filter(Boolean).join(" ") + " strategic implications executive briefing";
        const prompt = `Find ONE recent high-quality article about ${sector_focus || core_practice} from a trusted source (McKinsey, HBR, BCG, Deloitte, EY, Gartner, industry publications). Return a JSON object: {"title": "article title", "url": "direct article URL", "summary": "2-sentence strategic summary", "source": "publisher name"}. Only 2025-2026 content.`;
        const r = await callPerplexity(PERPLEXITY_KEY, prompt, searchQuery, logUserId);
        if (r) {
          const article = parseArticle(r.content, r.citations);
          if (article) {
            outcome = "perplexity";
            outcomeUrl = article.url;
            logRow();
            return json({ found: true, article });
          }
        }
      } catch (e) {
        console.warn("Perplexity attempt 1 failed:", (e as Error).message);
      }

      // Attempt 2 — broader query.
      try {
        const anchor = sector_focus || core_practice;
        const broadQuery = `${anchor} executive strategy 2026`;
        const prompt = `Find ONE strategic executive-level article about "${anchor}". Trusted publishers only (McKinsey, HBR, BCG, Deloitte, EY, Gartner, Bain, WEF). Return a JSON object: {"title": "article title", "url": "direct article URL", "summary": "2-sentence strategic summary", "source": "publisher name"}. If unsure, still return the closest match.`;
        const r = await callPerplexity(PERPLEXITY_KEY, prompt, broadQuery, logUserId);
        if (r) {
          const article = parseArticle(r.content, r.citations);
          if (article) {
            outcome = "perplexity_retry";
            outcomeUrl = article.url;
            logRow();
            return json({ found: true, article });
          }
        }
      } catch (e) {
        console.warn("Perplexity attempt 2 failed:", (e as Error).message);
      }
    }

    // Curated evergreen fallback — success path never returns found:false.
    const pick = CURATED_FALLBACKS[Math.floor(Math.random() * CURATED_FALLBACKS.length)];
    outcome = "curated_fallback";
    outcomeUrl = pick.url;
    logRow();
    return json({ found: true, article: pick });
  } catch (e) {
    console.error("onboarding-find-article error:", e);
    EdgeRuntime.waitUntil(logError("onboarding-find-article", e, { user_id: null }));
    // Even on unexpected error, prefer a curated fallback over dumping the user.
    const pick = CURATED_FALLBACKS[0];
    outcome = "error";
    outcomeUrl = pick.url;
    logRow();
    return json({ found: true, article: pick });
  }
}));
