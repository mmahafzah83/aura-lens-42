import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.99.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FIRECRAWL_BASE = "https://api.firecrawl.dev/v2";
const PERPLEXITY_URL = "https://api.perplexity.ai/chat/completions";
const MIN_CONTENT_CHARS = 1500; // markdown gate
const MIN_CLEAN_TEXT_CHARS = 1200; // post-clean gate

// Trusted publisher domains (boost validation_score)
const TRUSTED_DOMAINS = [
  "mckinsey.com", "bcg.com", "bain.com", "deloitte.com", "ey.com", "pwc.com",
  "kpmg.com", "accenture.com", "oliverwyman.com", "rolandberger.com",
  "hbr.org", "sloanreview.mit.edu", "brookings.edu", "gartner.com",
  "forrester.com", "idc.com", "ft.com", "wsj.com", "bloomberg.com",
  "economist.com", "reuters.com", "weforum.org", "imf.org", "worldbank.org",
  "nature.com", "science.org", "nber.org",
];

// Phrases that indicate a blocked / cookie-wall / JS-required / paywall page.
// Matched against the lowercased clean text.
const BLOCKED_PHRASES = [
  "enable javascript", "please enable javascript", "javascript is required",
  "javascript must be enabled", "you need to enable javascript",
  "accept cookies", "accept all cookies", "we use cookies", "cookie preferences",
  "manage cookie", "cookie consent",
  "page not found", "404 not found", "this page does not exist",
  "subscribe to continue", "subscribe to read", "subscribe for unlimited",
  "subscribe now", "create a free account to read",
  "access denied", "request blocked", "are you a robot", "verify you are human",
  "checking your browser", "ddos protection by cloudflare",
  "this content is for subscribers", "premium subscribers only",
  "log in to continue", "sign in to continue", "register to continue",
  // Login walls — pages that return HTML but require authentication
  "please log in", "please sign in", "you must be logged in", "you must be signed in",
  "members only", "for members only", "members-only content",
  "this content requires a subscription", "subscriber-exclusive",
  "create an account to continue", "sign up to read", "sign up to continue",
  "login required", "authentication required", "session expired",
];

// ─────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────
function domainOf(u: string): string {
  try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; }
}

function markdownToText(md: string): string {
  if (!md) return "";
  return md
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/!\[[^\]]*]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)]\([^)]+\)/g, "$1")
    .replace(/^>\s?/gm, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[*_~]{1,3}([^*_~]+)[*_~]{1,3}/g, "$1")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/\|/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Detect cookie walls / JS-required pages / 404 / paywalls / placeholder noise.
function detectBlockedContent(text: string): { blocked: boolean; reason?: string } {
  if (!text) return { blocked: true, reason: "empty_text" };
  const lower = text.toLowerCase();

  // Hard keyword match
  for (const phrase of BLOCKED_PHRASES) {
    if (lower.includes(phrase)) {
      // For a real article that briefly mentions cookies, require the page to be SHORT
      // before flagging it. Long articles can mention "cookies" without being a wall.
      if (text.length < 3000) {
        return { blocked: true, reason: `phrase_${phrase.replace(/\s+/g, "_").slice(0, 24)}` };
      }
    }
  }

  // Thin placeholder
  if (text.length < MIN_CLEAN_TEXT_CHARS) {
    return { blocked: true, reason: "thin_clean_text" };
  }

  // Repetition heuristic — navigation-only pages repeat the same short tokens
  const tokens = lower.split(/\s+/).filter(Boolean);
  if (tokens.length > 0) {
    const unique = new Set(tokens);
    const ratio = unique.size / tokens.length;
    if (tokens.length > 200 && ratio < 0.18) {
      return { blocked: true, reason: "low_lexical_diversity" };
    }
  }

  return { blocked: false };
}

async function preflightUrl(url: string): Promise<{ ok: boolean; reason?: string; finalUrl?: string }> {
  const check = (res: Response) => {
    const ct = (res.headers.get("content-type") || "").toLowerCase();
    if (res.status !== 200) return { ok: false, reason: `status_${res.status}` };
    if (!ct.includes("text/html")) return { ok: false, reason: `content_type_${ct || "missing"}` };
    return { ok: true, finalUrl: res.url || url };
  };
  try {
    const head = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0 (compatible; AuraTrendsBot/1.0)" },
    });
    if (head.status === 405 || head.status === 501) {
      const get = await fetch(url, {
        method: "GET",
        redirect: "follow",
        headers: { "User-Agent": "Mozilla/5.0 (compatible; AuraTrendsBot/1.0)", Range: "bytes=0-1024" },
      });
      return check(get);
    }
    return check(head);
  } catch (e) {
    return { ok: false, reason: `fetch_error_${(e as Error).message?.slice(0, 40)}` };
  }
}

// Validation: trusted domain (40) + length (40) + density (20)
function computeValidationScore(opts: { domain: string; markdown: string; text: string }): number {
  let score = 0;
  const dom = opts.domain.toLowerCase();
  if (TRUSTED_DOMAINS.some(td => dom === td || dom.endsWith("." + td))) {
    score += 40;
  } else if (/\.(edu|gov|org)$/.test(dom)) {
    score += 20;
  } else {
    score += 5;
  }

  const len = opts.text.length;
  if (len >= 6000) score += 40;
  else if (len >= 3500) score += 30;
  else if (len >= 2000) score += 20;
  else if (len >= 1500) score += 10;

  const ratio = opts.markdown.length > 0 ? opts.text.length / opts.markdown.length : 0;
  if (ratio >= 0.7) score += 20;
  else if (ratio >= 0.5) score += 12;
  else if (ratio >= 0.3) score += 6;

  return Math.max(0, Math.min(100, score));
}

// Topic relevance: keyword overlap with profile context (sector/practice/goal).
// 0-100 score. Cheap, deterministic, transparent.
function computeTopicRelevance(text: string, profileTokens: string[]): number {
  if (!text || profileTokens.length === 0) return 0;
  const lower = text.toLowerCase().slice(0, 12000); // cap for perf
  let hits = 0;
  let weighted = 0;
  for (const tok of profileTokens) {
    if (!tok || tok.length < 3) continue;
    // count occurrences (capped at 5 per token)
    const re = new RegExp(`\\b${tok.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi");
    const matches = lower.match(re);
    if (matches) {
      const c = Math.min(matches.length, 5);
      hits += 1;
      weighted += c;
    }
  }
  // Normalize: coverage (how many tokens matched) + density (total weighted hits)
  const coverage = profileTokens.length > 0 ? hits / profileTokens.length : 0; // 0-1
  const density = Math.min(weighted / 15, 1); // 0-1, plateaus at 15 weighted hits
  return Math.round(coverage * 60 + density * 40);
}

// Tokenize profile fields → meaningful keywords (drop stopwords / short tokens).
const STOPWORDS = new Set([
  "the","a","an","and","or","of","in","on","for","to","with","at","by","from",
  "is","are","was","were","be","been","being","this","that","these","those",
  "it","its","as","but","not","no","yes","you","your","i","we","our","they",
  "their","my","me","us","do","does","did","done","have","has","had","will",
  "would","could","should","can","may","might","must","shall","2024","2025","2026",
]);
function tokenizeProfile(...fields: (string | null | undefined)[]): string[] {
  const set = new Set<string>();
  for (const f of fields) {
    if (!f) continue;
    f.toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter(t => t.length >= 4 && !STOPWORDS.has(t))
      .forEach(t => set.add(t));
  }
  return Array.from(set);
}

// ─────────────────────────────────────────
// Perplexity discovery
// ─────────────────────────────────────────
async function perplexityDiscover(
  apiKey: string,
  profileContext: string,
  queries: string[],
): Promise<Array<{ url: string; title?: string; description?: string; reason?: string }>> {
  const prompt = `You are a research analyst sourcing recent (last 60 days) industry trend articles for a senior consultant.

Profile: ${profileContext}

Topics to cover:
${queries.map((q, i) => `${i + 1}. ${q}`).join("\n")}

Rules:
- Return ONLY high-credibility sources: top consulting firms (McKinsey, BCG, Bain, Deloitte, EY, PwC, KPMG, Accenture, Oliver Wyman, Roland Berger), research institutes (MIT Sloan, HBR, Brookings, Gartner, Forrester, IDC), reputable financial press (FT, WSJ, Bloomberg, Economist, Reuters), or official industry bodies.
- Avoid forums, Reddit, YouTube, X/Twitter, Pinterest, personal blogs, low-trust aggregators.
- Each URL must be a direct, openly readable article — NOT a homepage, category page, paywalled stub, or login-gated page.
- SOURCE DIVERSITY IS MANDATORY: return articles from at least 6 DIFFERENT publisher domains. Never return more than 2 URLs from the same domain. Prefer breadth across consulting / research / press / industry-body sources.
- Spread coverage across the topics above — do not concentrate all picks on a single topic.
- Return up to 15 distinct URLs total.
- For each article, include a short reason (max 15 words) explaining why this source is credible AND why it matches the profile.`;

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
                    reason: { type: "string" },
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

  const collected = new Map<string, { url: string; title?: string; description?: string; reason?: string }>();
  const content: string = data?.choices?.[0]?.message?.content ?? "";
  if (content) {
    try {
      const parsed = JSON.parse(content);
      const arr = Array.isArray(parsed?.articles) ? parsed.articles : [];
      for (const a of arr) {
        if (a?.url && typeof a.url === "string") {
          collected.set(a.url, { url: a.url, title: a.title, description: a.description, reason: a.reason });
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
    body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    return { ok: false as const, status: res.status, error: data?.error || "scrape failed" };
  }
  const markdown: string = data?.data?.markdown ?? data?.markdown ?? "";
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
          content: `You are a strategic intelligence editor for a senior consultant with this profile: ${profileContext}.

For EACH article return:
- headline: punchy, <= 10 words, no clickbait
- insight: one sentence (<= 25 words) written in DECISION-ORIENTED language. Start with phrases like "This signals…", "This creates an opportunity to…", "This indicates a shift toward…", "This raises the bar for…". NEVER write "The article says…" or "This article discusses…".
- summary: 2-3 sentences, what changed and why it matters strategically (no fluff)
- relevance_score: 0-100, how relevant to THIS consultant's profile
- category: ONE of [Strategy, AI, Operations, Regulation, Technology, Market, Talent, Sustainability, Finance]
- impact_level: ONE of [High, Emerging, Watch] — "High" for major shifts already underway, "Emerging" for early but credible signals, "Watch" for things to monitor.`,
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
                    category: { type: "string" },
                    impact_level: { type: "string" },
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

// Domain diversity: greedily pick top-ranked items but cap per-domain to 2.
function diversifyByDomain<T extends { source: string; final_score: number }>(rows: T[], perDomainCap = 2, max = 5): T[] {
  const sorted = [...rows].sort((a, b) => b.final_score - a.final_score);
  const counts = new Map<string, number>();
  const picked: T[] = [];
  for (const r of sorted) {
    const dom = (r.source || "").toLowerCase();
    const c = counts.get(dom) || 0;
    if (c >= perDomainCap) continue;
    counts.set(dom, c + 1);
    picked.push(r);
    if (picked.length >= max) break;
  }
  // If we couldn't fill `max` (e.g. very few sources), backfill ignoring cap.
  if (picked.length < max) {
    for (const r of sorted) {
      if (picked.includes(r)) continue;
      picked.push(r);
      if (picked.length >= max) break;
    }
  }
  return picked;
}

// ─────────────────────────────────────────
// Handler
// ─────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // Refresh mode: "full" (default) re-runs full pipeline; "light" tops up with fewer items.
    let mode: "light" | "full" = "full";
    if (req.method === "POST") {
      try {
        const body = await req.json();
        if (body?.mode === "light") mode = "light";
      } catch { /* no body */ }
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const lovableKey = Deno.env.get("LOVABLE_API_KEY")!;
    const firecrawlKey = Deno.env.get("FIRECRAWL_API_KEY");
    const perplexityKey = Deno.env.get("PERPLEXITY_API_KEY");

    if (!firecrawlKey) {
      return new Response(JSON.stringify({ error: "FIRECRAWL_API_KEY not configured", inserted: 0 }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!perplexityKey) {
      return new Response(JSON.stringify({ error: "PERPLEXITY_API_KEY not configured", inserted: 0 }), {
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
    const profileTokens = tokenizeProfile(
      profile.sector_focus, profile.core_practice, profile.north_star_goal, profile.leadership_style,
    );
    const queries = [
      `${profile.sector_focus || ""} ${profile.core_practice || ""} ${year}`.trim(),
      `${profile.sector_focus || ""} digital transformation strategy ${year}`.trim(),
      `${profile.core_practice || ""} consulting trends ${year}`.trim(),
    ].filter(q => q.length > 8);

    console.log("[trends] perplexity discovery for queries:", queries);
    const discoveryResults = await perplexityDiscover(perplexityKey, profileContext, queries);
    console.log("[trends] perplexity returned:", discoveryResults.length);

    // No early slicing — keep ALL discovered candidates so validation/scoring
    // decides what survives. We only slice once, after final ranking.
    const seen = new Set<string>();
    const candidates = discoveryResults.filter(r => {
      if (!r.url) return false;
      const dom = domainOf(r.url);
      if (!dom) return false;
      if (/(reddit|youtube|twitter|x\.com|facebook|pinterest|quora|tiktok)\./i.test(dom)) return false;
      if (seen.has(r.url)) return false;
      seen.add(r.url);
      return true;
    });
    console.log("[trends] candidates after dedupe (no slicing):", candidates.length);

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

    // Scrape + multi-stage validation
    const scraped: Array<{
      url: string; canonical: string; title: string; markdown: string;
      text: string; source: string; validation_score: number; topic_relevance_score: number;
      discovery_reason?: string;
    }> = [];

    for (const c of candidates) {
      if (existingUrls.has(c.url)) continue;

      const pre = await preflightUrl(c.url);
      if (!pre.ok) {
        console.log("[trends] preflight rejected", c.url, pre.reason);
        continue;
      }

      const result = await firecrawlScrape(firecrawlKey, pre.finalUrl || c.url);
      if (!result.ok) {
        console.log("[trends] scrape failed", c.url, result.status);
        continue;
      }
      if (result.statusCode >= 400) {
        console.log("[trends] http error", c.url, result.statusCode);
        continue;
      }
      if (!result.markdown || result.markdown.length < MIN_CONTENT_CHARS) {
        console.log("[trends] thin markdown", c.url, result.markdown?.length || 0);
        continue;
      }

      const canonical = result.sourceURL || pre.finalUrl || c.url;
      if (existingUrls.has(canonical)) continue;

      const text = markdownToText(result.markdown);

      // Post-scrape quality gate (cookie wall, JS placeholder, paywall, login wall, thin)
      const blocked = detectBlockedContent(text);
      if (blocked.blocked) {
        console.log("[trends] blocked content", c.url, blocked.reason);
        continue;
      }

      const source = domainOf(canonical);
      const validation_score = computeValidationScore({ domain: source, markdown: result.markdown, text });
      const topic_relevance_score = computeTopicRelevance(text, profileTokens);

      scraped.push({
        url: c.url,
        canonical,
        title: result.title || c.title || canonical,
        markdown: result.markdown,
        text,
        source,
        validation_score,
        topic_relevance_score,
        discovery_reason: c.reason,
      });
      // No per-batch cap — let every validated candidate be scored,
      // diversity + ranking will pick the final top-K.
    }
    console.log("[trends] validated articles:", scraped.length);

    // AI synthesis
    let synthesized: any[] = [];
    if (scraped.length > 0) {
      synthesized = await aiSynthesize(lovableKey, profileContext, scraped.map(s => ({ title: s.title, url: s.canonical, markdown: s.markdown })));
    }

    // Build rows with weighted final_score
    // Per spec: validation 0.6, relevance 0.4. Topic-relevance folded into the
    // relevance bucket (60/40 split) so we keep one combined "relevance" weight.
    const W_VAL = 0.6, W_REL = 0.4;

    type Built = {
      user_id: string; headline: string; insight: string; summary: string;
      source: string; url: string; canonical_url: string;
      content_markdown: string; content_text: string;
      relevance_score: number; validation_score: number;
      topic_relevance_score: number; final_score: number;
      validation_status: string; last_checked_at: string;
      published_at: null; status: string;
      selection_reason: string;
      category: string | null;
      impact_level: string | null;
    };

    function buildSelectionReason(opts: {
      domain: string; validation: number; topic: number; ai: number; discoveryReason?: string;
    }): string {
      const parts: string[] = [];
      const dom = opts.domain.toLowerCase();
      const trusted = TRUSTED_DOMAINS.some(td => dom === td || dom.endsWith("." + td));
      if (trusted) parts.push(`Trusted source (${opts.domain})`);
      else parts.push(`Source: ${opts.domain}`);

      if (opts.topic >= 60) parts.push("strong match to your focus areas");
      else if (opts.topic >= 30) parts.push("relevant to your focus areas");

      if (opts.ai >= 70) parts.push("high editorial relevance");
      else if (opts.ai >= 50) parts.push("solid editorial relevance");

      if (opts.validation >= 80) parts.push("high content quality");
      else if (opts.validation >= 60) parts.push("good content quality");

      let reason = parts.join(" · ");
      if (opts.discoveryReason && opts.discoveryReason.length > 0) {
        reason += ` — ${opts.discoveryReason.slice(0, 140)}`;
      }
      return reason.slice(0, 300);
    }

    const VALID_CATEGORIES = new Set([
      "Strategy", "AI", "Operations", "Regulation", "Technology",
      "Market", "Talent", "Sustainability", "Finance",
    ]);
    const VALID_IMPACT = new Set(["High", "Emerging", "Watch"]);

    const built: Built[] = [];
    for (const s of synthesized) {
      const src = scraped[s.index];
      if (!src) continue;
      const ai_relevance = Math.max(0, Math.min(100, Number(s.relevance_score) || 0));
      // Combine AI editorial relevance + topic-keyword relevance into a single
      // relevance bucket (60% AI / 40% topic) before applying the 0.6/0.4 split.
      const combined_relevance = Math.round(ai_relevance * 0.6 + src.topic_relevance_score * 0.4);
      const final_score = Math.round(src.validation_score * W_VAL + combined_relevance * W_REL);
      const rawCategory = typeof s.category === "string" ? s.category.trim() : "";
      const category = VALID_CATEGORIES.has(rawCategory) ? rawCategory : null;
      const rawImpact = typeof s.impact_level === "string" ? s.impact_level.trim() : "";
      const impact_level = VALID_IMPACT.has(rawImpact) ? rawImpact : null;
      const selection_reason = buildSelectionReason({
        domain: src.source,
        validation: src.validation_score,
        topic: src.topic_relevance_score,
        ai: ai_relevance,
        discoveryReason: src.discovery_reason,
      });
      built.push({
        user_id: userId,
        headline: (s.headline || src.title || "").slice(0, 200),
        insight: (s.insight || "").slice(0, 500),
        summary: (s.summary || "").slice(0, 2000),
        source: src.source.slice(0, 100),
        url: src.canonical,
        canonical_url: src.canonical,
        content_markdown: src.markdown.slice(0, 50000),
        content_text: src.text.slice(0, 50000),
        relevance_score: combined_relevance,
        validation_score: src.validation_score,
        topic_relevance_score: src.topic_relevance_score,
        final_score,
        validation_status: src.validation_score >= 50 ? "ok" : "weak",
        last_checked_at: new Date().toISOString(),
        published_at: null,
        status: "new",
        selection_reason,
        category,
        impact_level,
      });
    }

    // Refresh mode: light = top up to 3 new, full = replace top 5 with diversity
    const isLight = mode === "light";
    const targetCount = isLight ? 3 : 5;
    const selected = diversifyByDomain(built, 2, targetCount);

    let inserted = 0;
    if (selected.length > 0) {
      const { error: insertErr, count } = await adminClient
        .from("industry_trends")
        .insert(selected, { count: "exact" });
      if (insertErr) console.error("[trends] insert error:", insertErr);
      else inserted = count || selected.length;
    }

    // Cap active at 5 — expire weakest beyond
    const { data: activeAfter } = await adminClient
      .from("industry_trends")
      .select("id")
      .eq("user_id", userId)
      .eq("status", "new")
      .order("final_score", { ascending: false })
      .order("fetched_at", { ascending: false });
    const ids = (activeAfter || []).map((r: any) => r.id);
    if (ids.length > 5) {
      await adminClient.from("industry_trends").update({ status: "expired" }).in("id", ids.slice(5));
    }

    return new Response(JSON.stringify({
      inserted,
      scraped: scraped.length,
      candidates: candidates.length,
      selected: selected.length,
      total_active: Math.min(ids.length, 5),
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("fetch-industry-trends error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error", inserted: 0 }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
