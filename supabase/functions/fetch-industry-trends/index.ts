import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.99.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FIRECRAWL_BASE = "https://api.firecrawl.dev/v2";
const PERPLEXITY_URL = "https://api.perplexity.ai/chat/completions";
const MIN_CONTENT_CHARS = 500; // soft-404 / cookie wall guard

// ─────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────
function domainOf(u: string): string {
  try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; }
}

// Discovery via Perplexity sonar — returns curated, high-quality URLs.
// Prefers consulting firms, research institutes, and credible publishers.
async function perplexityDiscover(
  apiKey: string,
  profileContext: string,
  queries: string[],
): Promise<Array<{ url: string; title?: string; description?: string }>> {
  const prompt = `You are a research analyst sourcing recent (last 60 days) industry trend articles for a senior consultant.

Profile: ${profileContext}

Topics to cover:
${queries.map((q, i) => `${i + 1}. ${q}`).join("\n")}

Rules:
- Return ONLY high-credibility sources: top consulting firms (McKinsey, BCG, Bain, Deloitte, EY, PwC, KPMG, Accenture, Oliver Wyman, Roland Berger), research institutes (MIT Sloan, HBR, Brookings, Gartner, Forrester, IDC), reputable financial press (FT, WSJ, Bloomberg, Economist, Reuters), or official industry bodies.
- Avoid forums, Reddit, YouTube, X/Twitter, Pinterest, personal blogs, low-trust aggregators.
- Each URL must be a direct article, not a homepage or category page.
- Return up to 10 distinct URLs across the topics.`;

  const res = await fetch(PERPLEXITY_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "sonar",
      messages: [
        { role: "system", content: "You return curated, recent, high-credibility article URLs only. Be precise." },
        { role: "user", content: prompt },
      ],
      search_recency_filter: "month",
      temperature: 0.2,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "discovered_articles",
          schema: {
            type: "object",
            properties: {
              articles: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    url: { type: "string" },
                    title: { type: "string" },
                    description: { type: "string" },
                  },
                  required: ["url"],
                },
              },
            },
            required: ["articles"],
          },
        },
      },
    }),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    console.error("[trends] perplexity discovery failed", res.status, data);
    return [];
  }

  // Merge model-returned articles with raw citations as a fallback
  const collected = new Map<string, { url: string; title?: string; description?: string }>();

  const content: string = data?.choices?.[0]?.message?.content ?? "";
  if (content) {
    try {
      const parsed = JSON.parse(content);
      const arr = Array.isArray(parsed?.articles) ? parsed.articles : [];
      for (const a of arr) {
        if (a?.url && typeof a.url === "string") {
          collected.set(a.url, { url: a.url, title: a.title, description: a.description });
        }
      }
    } catch (e) {
      console.warn("[trends] could not parse perplexity content as JSON, falling back to citations", e);
    }
  }

  const citations: string[] = Array.isArray(data?.citations) ? data.citations : [];
  for (const url of citations) {
    if (typeof url === "string" && !collected.has(url)) {
      collected.set(url, { url });
    }
  }

  return Array.from(collected.values());
}

async function firecrawlScrape(apiKey: string, url: string) {
  const res = await fetch(`${FIRECRAWL_BASE}/scrape`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      url,
      formats: ["markdown"],
      onlyMainContent: true,
    }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    return { ok: false as const, status: res.status, error: data?.error || "scrape failed" };
  }
  // v2 may return either { data: { markdown, metadata } } or top-level fields
  const markdown: string =
    data?.data?.markdown ?? data?.markdown ?? "";
  const metadata = data?.data?.metadata ?? data?.metadata ?? {};
  const sourceURL: string = metadata?.sourceURL ?? metadata?.url ?? url;
  const title: string = metadata?.title ?? "";
  const statusCode: number = metadata?.statusCode ?? 200;
  return { ok: true as const, markdown, title, sourceURL, statusCode };
}

async function aiSynthesize(lovableKey: string, profileContext: string, items: Array<{ title: string; url: string; markdown: string }>) {
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${lovableKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        {
          role: "system",
          content: `You are a strategic intelligence editor for a senior consultant with this profile: ${profileContext}. For each article, write a punchy headline (<= 10 words), a one-sentence "why this matters to you" insight (<= 25 words), a 2-3 sentence summary, and a relevance_score 0-100.`,
        },
        {
          role: "user",
          content: `Articles:\n\n${items.map((it, i) => `[${i}] ${it.title}\nURL: ${it.url}\nContent (truncated):\n${it.markdown.slice(0, 4000)}\n---`).join("\n")}`,
        },
      ],
      tools: [{
        type: "function",
        function: {
          name: "return_trends",
          description: "Return synthesized trend metadata",
          parameters: {
            type: "object",
            properties: {
              trends: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    index: { type: "integer" },
                    headline: { type: "string" },
                    insight: { type: "string" },
                    summary: { type: "string" },
                    relevance_score: { type: "integer", minimum: 0, maximum: 100 },
                  },
                  required: ["index", "headline", "insight", "summary", "relevance_score"],
                },
              },
            },
            required: ["trends"],
          },
        },
      }],
      tool_choice: { type: "function", function: { name: "return_trends" } },
    }),
  });
  if (!res.ok) {
    console.error("AI synth failed", res.status, await res.text());
    return [];
  }
  const data = await res.json();
  const args = data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!args) return [];
  try { return JSON.parse(args).trends ?? []; } catch { return []; }
}

// ─────────────────────────────────────────
// Handler
// ─────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const lovableKey = Deno.env.get("LOVABLE_API_KEY")!;
    const firecrawlKey = Deno.env.get("FIRECRAWL_API_KEY");

    if (!firecrawlKey) {
      return new Response(JSON.stringify({ error: "FIRECRAWL_API_KEY not configured", inserted: 0 }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claimsData.claims.sub as string;
    const adminClient = createClient(supabaseUrl, serviceKey);

    // 1. Profile → query
    const { data: profile } = await adminClient
      .from("diagnostic_profiles")
      .select("firm, level, core_practice, sector_focus, north_star_goal, leadership_style")
      .eq("user_id", userId)
      .single();

    if (!profile) {
      return new Response(JSON.stringify({ error: "No profile found", inserted: 0 }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const year = new Date().getFullYear();
    const profileContext = [profile.sector_focus, profile.core_practice, profile.firm, profile.level, profile.north_star_goal].filter(Boolean).join(", ");
    const queries = [
      `${profile.sector_focus || ""} ${profile.core_practice || ""} ${year}`.trim(),
      `${profile.sector_focus || ""} digital transformation strategy ${year}`.trim(),
      `${profile.core_practice || ""} consulting trends ${year}`.trim(),
    ].filter(q => q.length > 8);

    // 2. Discovery via Firecrawl Search
    console.log("[trends] discovery queries:", queries);
    const discoveryResults: Array<{ url: string; title?: string; description?: string }> = [];
    for (const q of queries) {
      const found = await firecrawlSearch(firecrawlKey, q, 4);
      discoveryResults.push(...found);
    }
    console.log("[trends] discovery raw:", discoveryResults.length);

    // De-dupe by URL + reject obvious bad domains
    const seen = new Set<string>();
    const candidates = discoveryResults.filter(r => {
      if (!r.url) return false;
      const dom = domainOf(r.url);
      if (!dom) return false;
      // Skip aggregators / forums / tracking domains
      if (/(reddit|youtube|twitter|x\.com|facebook|pinterest|quora|tiktok)\./i.test(dom)) return false;
      if (seen.has(r.url)) return false;
      seen.add(r.url);
      return true;
    }).slice(0, 10); // scrape budget

    // 3. Existing canonical URLs (skip already-saved)
    const { data: existingRows } = await adminClient
      .from("industry_trends")
      .select("id, canonical_url, url")
      .eq("user_id", userId)
      .eq("status", "new");
    const existingUrls = new Set<string>();
    (existingRows ?? []).forEach((r: any) => {
      if (r.canonical_url) existingUrls.add(r.canonical_url);
      if (r.url) existingUrls.add(r.url);
    });

    // 4. Scrape + validate
    const scraped: Array<{ url: string; canonical: string; title: string; markdown: string; source: string }> = [];
    for (const c of candidates) {
      if (existingUrls.has(c.url)) continue;
      const result = await firecrawlScrape(firecrawlKey, c.url);
      if (!result.ok) {
        console.log("[trends] scrape failed", c.url, result.status);
        continue;
      }
      if (result.statusCode >= 400) {
        console.log("[trends] http error", c.url, result.statusCode);
        continue;
      }
      if (!result.markdown || result.markdown.length < MIN_CONTENT_CHARS) {
        console.log("[trends] thin content", c.url, result.markdown?.length || 0);
        continue;
      }
      const canonical = result.sourceURL || c.url;
      if (existingUrls.has(canonical)) continue;
      scraped.push({
        url: c.url,
        canonical,
        title: result.title || c.title || canonical,
        markdown: result.markdown,
        source: domainOf(canonical),
      });
      if (scraped.length >= 6) break;
    }
    console.log("[trends] validated articles:", scraped.length);

    // 5. AI synthesis (headline / insight / summary / relevance)
    let synthesized: any[] = [];
    if (scraped.length > 0) {
      synthesized = await aiSynthesize(lovableKey, profileContext, scraped.map(s => ({ title: s.title, url: s.canonical, markdown: s.markdown })));
    }

    // 6. Build rows + insert
    const newRows = synthesized
      .map((s: any) => {
        const src = scraped[s.index];
        if (!src) return null;
        return {
          user_id: userId,
          headline: (s.headline || src.title || "").slice(0, 200),
          insight: (s.insight || "").slice(0, 500),
          summary: (s.summary || "").slice(0, 2000),
          source: src.source.slice(0, 100),
          url: src.canonical,
          canonical_url: src.canonical,
          content_markdown: src.markdown.slice(0, 50000),
          relevance_score: Math.max(0, Math.min(100, Number(s.relevance_score) || 0)),
          validation_status: "ok",
          last_checked_at: new Date().toISOString(),
          published_at: null,
          status: "new",
        };
      })
      .filter(Boolean)
      .sort((a: any, b: any) => b.relevance_score - a.relevance_score)
      .slice(0, 5);

    let inserted = 0;
    if (newRows.length > 0) {
      const { error: insertErr, count } = await adminClient
        .from("industry_trends")
        .insert(newRows, { count: "exact" });
      if (insertErr) console.error("[trends] insert error:", insertErr);
      else inserted = count || newRows.length;
    }

    // 7. Cap active at 5 — expire oldest beyond
    const { data: activeAfter } = await adminClient
      .from("industry_trends")
      .select("id")
      .eq("user_id", userId)
      .eq("status", "new")
      .order("fetched_at", { ascending: false });
    const ids = (activeAfter || []).map((r: any) => r.id);
    if (ids.length > 5) {
      await adminClient.from("industry_trends").update({ status: "expired" }).in("id", ids.slice(5));
    }

    return new Response(JSON.stringify({
      inserted,
      scraped: scraped.length,
      candidates: candidates.length,
      total_active: Math.min(ids.length, 5),
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("fetch-industry-trends error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error", inserted: 0 }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
