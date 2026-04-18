import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.99.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FIRECRAWL_BASE = "https://api.firecrawl.dev/v2";
const EXA_URL = "https://api.exa.ai/search";
const MIN_CONTENT_CHARS = 1200;       // raw markdown gate (relaxed; clean gate is the hard rule)
const MIN_CLEAN_TEXT_CHARS = 800;     // post-clean hard gate (per spec)
const MAX_NOISE_RATIO = 0.30;         // reject if >30% of raw is noise
const ADAPTIVE_FLOORS = [60, 50, 40]; // adaptive final_score floors
const MIN_TARGET_SIGNALS = 3;         // minimum we'll show before relaxing

// Trusted publisher domains
const TRUSTED_DOMAINS = [
  "mckinsey.com", "bcg.com", "bain.com", "deloitte.com", "ey.com", "pwc.com",
  "kpmg.com", "accenture.com", "oliverwyman.com", "rolandberger.com",
  "hbr.org", "sloanreview.mit.edu", "brookings.edu", "gartner.com",
  "forrester.com", "idc.com", "ft.com", "wsj.com", "bloomberg.com",
  "economist.com", "reuters.com", "weforum.org", "imf.org", "worldbank.org",
  "nature.com", "science.org", "nber.org",
];

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
  "please log in", "please sign in", "you must be logged in", "you must be signed in",
  "members only", "for members only", "members-only content",
  "this content requires a subscription", "subscriber-exclusive",
  "create an account to continue", "sign up to read", "sign up to continue",
  "login required", "authentication required", "session expired",
];

const VALID_CATEGORIES = new Set([
  "Strategy", "AI", "Operations", "Regulation", "Technology",
  "Market", "Talent", "Sustainability", "Finance",
]);
const VALID_IMPACT     = new Set(["High", "Emerging", "Watch"]);
const VALID_CONFIDENCE = new Set(["High", "Medium", "Low"]);
const VALID_OPPORTUNITY= new Set(["Content", "Consulting", "Product", "Partnership", "Internal"]);
const VALID_SIGNAL_TYPE= new Set(["Trend", "Insight", "Disruption", "Benchmark", "Risk"]);

// ───────── Helpers ─────────
function domainOf(u: string): string {
  try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; }
}
function isTrustedDomain(domain: string): boolean {
  const d = domain.toLowerCase();
  return TRUSTED_DOMAINS.some(td => d === td || d.endsWith("." + td));
}
function markdownToText(md: string): string {
  if (!md) return "";
  return md
    .replace(/```[\s\S]*?```/g, " ").replace(/`[^`]*`/g, " ")
    .replace(/!\[[^\]]*]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)]\([^)]+\)/g, "$1")
    .replace(/^>\s?/gm, "").replace(/^#{1,6}\s+/gm, "")
    .replace(/[*_~]{1,3}([^*_~]+)[*_~]{1,3}/g, "$1")
    .replace(/^\s*[-*+]\s+/gm, "").replace(/^\s*\d+\.\s+/gm, "")
    .replace(/\|/g, " ").replace(/\s+/g, " ").trim();
}

// ───────── Content cleaning pipeline ─────────
// Phrases that, if present anywhere in a line, mark the line as non-article
// noise (site chrome, journal boilerplate, related content, system text).
const NOISE_PHRASE_PATTERNS: RegExp[] = [
  /skip to (main )?content/i,
  /skip to navigation/i,
  /jump to (content|navigation|main)/i,
  /back to top/i,
  /thank you for visiting/i,
  /you are using a browser version/i,
  /to obtain the best experience/i,
  /turn off compatibility mode/i,
  /displaying the site without styles/i,
  /we are displaying the site/i,
  /(view|download)( the)? pdf\b/i,
  /^\s*pdf\s*$/i,
  /print this/i,
  /^\s*subscribe( now| today)?\s*$/i,
  /^\s*sign (in|up)\s*$/i,
  /^\s*log ?in\s*$/i,
  /follow us( on)?/i,
  /^\s*share (this|on|via)\b/i,
  /(figure|table|image|fig\.?|tbl\.?)\s+\d+[:.]/i,
  /^\s*caption\b/i,
  /^\s*citation\b/i,
  /cite this (article|paper|chapter)/i,
  /how to cite/i,
  /download citation/i,
  /export citation/i,
  /metrics\s*$/i,
  /^\s*advertisement\s*$/i,
  /sponsored content/i,
  /^\s*related (articles?|reading|content|posts?|topics?|stories|insights?)/i,
  /similar content( being)? viewed/i,
  /you may (also )?like/i,
  /^\s*read (more|next|on)\b/i,
  /more (from|on|in)( this)?( author| topic| section)?/i,
  /^\s*comments?\s*\(\d+\)/i,
  /leave a (comment|reply)/i,
  /privacy policy/i,
  /terms of (service|use)/i,
  /cookie (policy|preferences|settings|notice)/i,
  /all rights reserved/i,
  /copyright\s+©/i,
  /©\s*\d{4}/,
  /^\s*table of contents/i,
  /^\s*on this page/i,
  /^\s*(home|about|contact|services|products|blog|news|careers|press|investors)\s*$/i,
  // Scientific / journal chrome
  /^\s*open access\s*$/i,
  /^\s*article open access/i,
  /^\s*author information/i,
  /^\s*about (the )?authors?/i,
  /^\s*about this article/i,
  /^\s*affiliations?\s*$/i,
  /^\s*corresponding author/i,
  /^\s*editor['']?s? note/i,
  /^\s*peer review information/i,
  /^\s*ethics declarations?/i,
  /^\s*supplementary (material|information)/i,
  /^\s*data availability/i,
  /^\s*acknowledg(e?)ments?/i,
  /^\s*funding\s*$/i,
  /^\s*disclosures?/i,
  /^\s*conflicts? of interest/i,
  /^\s*reprints? and permissions?/i,
  /^\s*rights and permissions?/i,
  // System / runtime
  /\bmathjax\b/i,
  /\bcss warning\b/i,
  /\bjavascript (is )?(required|disabled|enabled|must be enabled)\b/i,
  /enable javascript/i,
  /accept( all)? cookies/i,
  /we use cookies/i,
];

// Section headers that mark the start of "junk" trailing content.
const TRAILING_SECTION_RE = /^(#{1,6}\s*)?(references?|bibliography|works cited|notes?|footnotes?|further reading|see also|related (articles?|topics?|content|reading)|similar (content|articles?)|comments?|about (the )?authors?|author information|about this article|acknowledg(e?)ments?|disclosures?|conflicts? of interest|funding|data availability|supplementary (material|information)|appendix|reprints? and permissions?|rights and permissions?|cite this article|how to cite|metrics|peer review information|ethics declarations?|publisher['']?s note)\s*[:.]?\s*$/im;

// Strip markdown link wrappers so line-start matches work on "[Skip…](url)"
function unwrapMarkdownArtifacts(line: string): string {
  let s = line;
  // images: ![alt](url) → ""
  s = s.replace(/!\[[^\]]*]\([^)]*\)/g, "");
  // links: [text](url) → text
  s = s.replace(/\[([^\]]*)]\([^)]*\)/g, "$1");
  // bare URLs
  s = s.replace(/https?:\/\/\S+/g, "");
  // emphasis markers
  s = s.replace(/[*_~`]+/g, "");
  return s.trim();
}

function stripTrailingSections(md: string): string {
  if (!md) return md;
  const lines = md.split(/\r?\n/);
  let cutAt = -1;
  for (let i = 0; i < lines.length; i++) {
    const probe = unwrapMarkdownArtifacts(lines[i]).trim();
    if (TRAILING_SECTION_RE.test(probe)) {
      // Cut at section if it's past 35% of doc (intros stay safe).
      if (i >= Math.floor(lines.length * 0.35)) { cutAt = i; break; }
    }
  }
  return cutAt > 0 ? lines.slice(0, cutAt).join("\n") : md;
}

function isNoiseLine(line: string): boolean {
  const stripped = unwrapMarkdownArtifacts(line);
  const t = stripped.trim();
  if (!t) return false;
  if (t.length < 4) return true;
  if (NOISE_PHRASE_PATTERNS.some(re => re.test(t))) return true;
  // standalone citation markers
  if (/^\[\d+(\s*,\s*\d+)*]\s*$/.test(t)) return true;
  // ALL-CAPS short lines (nav/section labels)
  if (t.length <= 40 && /^[A-Z0-9\s\-:|·•]+$/.test(t) && /[A-Z]/.test(t) && !/[.!?]$/.test(t)) return true;
  // pure numeric / DOI-ish
  if (/^(doi[:\s]|https?:|www\.|10\.\d{4,})/i.test(t) && t.length < 120) return true;
  return false;
}

// ───────── Stage 1: Article start detection via line scoring ─────────
// Each line is scored. The article begins at the first BLOCK of consecutive
// lines whose cumulative score reaches >= 4. Everything before is dropped.
const NAV_SYSTEM_WORDS = [
  "skip", "download", "share", "subscribe", "login", "log in", "sign in", "sign up",
  "view pdf", "download pdf", "thank you for visiting", "menu", "navigation",
  "follow us", "newsletter", "cookie", "accept all", "privacy policy",
];
const BUSINESS_TERMS = [
  "strategy", "transformation", "efficiency", "operations", "regulation",
  "investment", "growth", "market", "industry", "leadership", "innovation",
  "performance", "revenue", "risk", "governance", "compliance", "scale",
  "digital", "technology", "ai ", "artificial intelligence", "data",
  "consulting", "client", "executive", "stakeholder", "decision",
  "research", "analysis", "evidence", "finding", "outcome", "impact",
  "policy", "framework", "model", "infrastructure", "supply chain",
  "sustainability", "emission", "energy", "utility", "utilities",
  "healthcare", "financial", "bank", "manufacturing", "retail",
];
const VERB_TOKENS = [
  " is ", " are ", " was ", " were ", " will ", " enables ", " drives ",
  " improves ", " reduces ", " increases ", " creates ", " transforms ",
  " requires ", " demands ", " shows ", " finds ", " reveals ", " indicates ",
  " suggests ", " demonstrates ", " confirms ", " forces ", " unlocks ",
  " accelerates ", " disrupts ", " threatens ", " enables ", " allows ",
];

function scoreLine(line: string): number {
  const stripped = unwrapMarkdownArtifacts(line).trim();
  if (!stripped) return 0;
  const lower = " " + stripped.toLowerCase() + " ";
  let s = 0;
  // +3 full sentence (>100 chars with sentence-ending punctuation)
  if (stripped.length > 100 && /[.!?]/.test(stripped)) s += 3;
  // +2 verbs
  if (VERB_TOKENS.some(v => lower.includes(v))) s += 2;
  // +2 business/analytical language
  if (BUSINESS_TERMS.some(t => lower.includes(t))) s += 2;
  // -3 navigation/system words
  if (NAV_SYSTEM_WORDS.some(w => lower.includes(" " + w + " ") || lower.includes(" " + w))) s -= 3;
  // -2 very short
  if (stripped.length < 40) s -= 2;
  // -2 ALL CAPS line
  if (stripped.length <= 80 && /^[^a-z]+$/.test(stripped) && /[A-Z]/.test(stripped)) s -= 2;
  return s;
}

function detectArticleStart(md: string): number {
  const lines = md.split(/\r?\n/);
  // Scan a sliding window over the first 80 lines; cumulative score over a
  // 3-line window must reach ≥4 to declare "article body started".
  const SCAN_LIMIT = Math.min(lines.length, 80);
  for (let i = 0; i < SCAN_LIMIT; i++) {
    if (!unwrapMarkdownArtifacts(lines[i]).trim()) continue;
    const s1 = scoreLine(lines[i]);
    const s2 = i + 1 < SCAN_LIMIT ? scoreLine(lines[i + 1]) : 0;
    const s3 = i + 2 < SCAN_LIMIT ? scoreLine(lines[i + 2]) : 0;
    if (s1 + s2 + s3 >= 4 && s1 >= 0) return i;
    // Single very strong line (≥5) also qualifies
    if (s1 >= 5) return i;
  }
  return 0;
}

function stripLeadingChrome(md: string): string {
  const startIdx = detectArticleStart(md);
  return md.split(/\r?\n/).slice(startIdx).join("\n");
}

// ───────── Stage 2: Section-aware extraction ─────────
const SCIENTIFIC_DOMAINS_RE = /(nature\.com|science\.org|sciencedirect\.com|springer\.com|wiley\.com|tandfonline\.com|nih\.gov|pubmed|arxiv\.org|nber\.org|jstor\.org|cell\.com|thelancet\.com|nejm\.org|plos\.org|mdpi\.com|frontiersin\.org|acs\.org|aip\.org|ieee\.org|acm\.org|biorxiv\.org)/i;

const SCI_KEEP_RE = /^(#{1,6}\s*)?(abstract|summary|introduction|background|results?|key findings?|main findings?|findings|discussion|conclusions?|implications?|policy implications?)\s*[:.]?\s*$/i;
const SCI_DROP_RE = /^(#{1,6}\s*)?(references?|bibliography|works cited|citations?|notes?|footnotes?|further reading|see also|related (articles?|topics?|content|reading)|similar (content|articles?)|metrics|author (information|contributions?)|about (the )?authors?|affiliations?|acknowledg(e?)ments?|funding|data availability|supplementary (material|information)|appendix|reprints? and permissions?|rights and permissions?|cite this article|how to cite|peer review|ethics declarations?|conflicts? of interest|disclosures?)\s*[:.]?\s*$/i;
const BIZ_DROP_RE = /^(#{1,6}\s*)?(related (articles?|topics?|content|reading|insights?|stories)|more (from|on|in)|newsletter|sign up( for)?|subscribe( to)?|footer|comments?|share this|about( the)? author|tags?|categories?)\s*[:.]?\s*$/i;

function sectionAwareExtract(md: string, isScientific: boolean): string {
  const lines = md.split(/\r?\n/);
  if (isScientific) {
    let keep = true;
    const out: string[] = [];
    for (const line of lines) {
      const probe = unwrapMarkdownArtifacts(line).trim();
      if (SCI_KEEP_RE.test(probe)) { keep = true; out.push(line); continue; }
      if (SCI_DROP_RE.test(probe)) { keep = false; continue; }
      if (keep) out.push(line);
    }
    return out.join("\n");
  }
  let keep = true;
  const out: string[] = [];
  for (const line of lines) {
    const probe = unwrapMarkdownArtifacts(line).trim();
    if (BIZ_DROP_RE.test(probe)) { keep = false; continue; }
    if (/^#{1,3}\s+\S/.test(line) && !BIZ_DROP_RE.test(probe)) keep = true;
    if (keep) out.push(line);
  }
  return out.join("\n");
}

function cleanArticleMarkdown(md: string, sourceUrl?: string): string {
  if (!md) return "";
  const isScientific = !!sourceUrl && SCIENTIFIC_DOMAINS_RE.test(sourceUrl);
  let out = stripLeadingChrome(md);
  out = stripTrailingSections(out);
  out = sectionAwareExtract(out, isScientific);
  const cleanedLines: string[] = [];
  for (const raw of out.split(/\r?\n/)) {
    if (isNoiseLine(raw)) continue;
    cleanedLines.push(raw);
  }
  out = cleanedLines.join("\n");
  out = out.replace(/\[\d+(\s*,\s*\d+)*]/g, "");
  out = out.replace(/<script[\s\S]*?<\/script>/gi, " ");
  out = out.replace(/\\\([\s\S]*?\\\)/g, " ");
  out = out.replace(/\$\$[\s\S]*?\$\$/g, " ");
  out = out.replace(/\n{3,}/g, "\n\n");
  const pass2: string[] = [];
  for (const raw of out.split(/\r?\n/)) {
    if (isNoiseLine(raw)) continue;
    pass2.push(raw);
  }
  out = pass2.join("\n");
  // Re-run leading chrome removal in case section extraction left dross at the top
  out = stripLeadingChrome(out);
  const paras = out.split(/\n{2,}/);
  const dedup: string[] = [];
  for (const p of paras) {
    const norm = p.trim().toLowerCase();
    if (!norm) continue;
    if (dedup.length && dedup[dedup.length - 1].trim().toLowerCase() === norm) continue;
    dedup.push(p.trim());
  }
  return dedup.join("\n\n").trim();
}

// ───────── Stage 3: Hard rejection rules ─────────
const SYSTEM_PHRASES_500 = [
  "skip", "download pdf", "share", "login", "log in", "sign in", "subscribe",
  "thank you for visiting", "view pdf", "newsletter",
];
const DESCRIPTIVE_COMPANY_RE = /\b(is (a|an) (flemish|belgian|dutch|french|german|italian|spanish|swiss|american|british|european|leading|global|international) (company|firm|provider|organization|organisation|group|corporation|operator)|provides? (water|energy|telecom|cloud|software|consulting|advisory) services?)\b/i;

function openingLooksLikeArticle(cleanText: string): { ok: boolean; reason?: string } {
  if (!cleanText || cleanText.length < 200) return { ok: false, reason: "thin_opening" };
  const head = cleanText.slice(0, 500).toLowerCase();
  const noiseHits = SYSTEM_PHRASES_500.filter(p => head.includes(p)).length;
  if (noiseHits >= 2) return { ok: false, reason: "chrome_in_opening" };
  if (!/[a-z][a-z ,;:'"-]{40,}[.!?]/i.test(cleanText.slice(0, 800))) {
    return { ok: false, reason: "no_sentence_in_opening" };
  }
  const firstPara = cleanText.split(/\n{2,}/)[0] || cleanText.slice(0, 600);
  if (scoreLine(firstPara) < 3) {
    return { ok: false, reason: "weak_opening_paragraph" };
  }
  return { ok: true };
}

// Stage 5.5: Consultant gate — strict LLM ACCEPT/REJECT arbiter on cleaned text.
// Final filter after rule-based gates. Uses Lovable AI Gateway (Gemini 2.5 Flash Lite).
// Returns { decision: "ACCEPT"|"REJECT", reason: string }. On any error → ACCEPT (fail-open
// because rule gates already passed and we don't want to drop valid signals on transient errors).
async function consultantGate(cleanText: string): Promise<{ decision: "ACCEPT" | "REJECT"; reason: string }> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) return { decision: "ACCEPT", reason: "no_api_key" };
  const sample = cleanText.slice(0, 6000);
  const systemPrompt = `You are a strict senior strategy consultant reviewing intelligence inputs.

Your job is NOT to summarize.
Your job is NOT to generate insights.

Your ONLY job: Decide if this article is worth generating a strategic signal.

REJECT if ANY:
- Describes a company (who they are, what they do)
- No numbers or data
- No argument or claim
- Marketing / PR style
- Generic (can apply to any industry)
- Storytelling without insight

ACCEPT only if:
- Contains a clear insight or argument
- OR contains numbers (% / data / stats)
- OR shows a gap, risk, or shift

EXAMPLES:
REJECT: "Water-link is a Flemish water company..."
REJECT: "Digital transformation is important..."
ACCEPT: "70% of utilities fail to scale transformation due to governance issues"

RULE: If unsure → REJECT. Return JSON only.`;

  try {
    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: sample },
        ],
        tools: [{
          type: "function",
          function: {
            name: "consultant_decision",
            description: "Return ACCEPT or REJECT with a short reason.",
            parameters: {
              type: "object",
              properties: {
                decision: { type: "string", enum: ["ACCEPT", "REJECT"] },
                reason: { type: "string" },
              },
              required: ["decision", "reason"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "consultant_decision" } },
      }),
    });
    if (!resp.ok) {
      console.log("[consultant_gate] gateway error", resp.status);
      return { decision: "ACCEPT", reason: `gateway_${resp.status}` };
    }
    const json = await resp.json();
    const args = json?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) return { decision: "ACCEPT", reason: "no_tool_call" };
    const parsed = JSON.parse(args);
    const decision = parsed.decision === "REJECT" ? "REJECT" : "ACCEPT";
    return { decision, reason: String(parsed.reason || "").slice(0, 200) };
  } catch (e) {
    console.log("[consultant_gate] error", (e as Error).message);
    return { decision: "ACCEPT", reason: "exception" };
  }
}

// Stage 5: Business relevance — reject pure company storytelling without insight.
function passesBusinessRelevance(cleanText: string): { ok: boolean; reason?: string } {
  if (!cleanText) return { ok: false, reason: "empty" };
  const head = cleanText.slice(0, 1500);
  const hasAnalytical = /\b(finds?|shows?|indicates?|reveals?|argues?|concludes?|estimates?|projects?|warns?|implies?|forecasts?|demonstrates?|exposes?)\b/i.test(head);
  const isDescriptive = DESCRIPTIVE_COMPANY_RE.test(head);
  if (isDescriptive && !hasAnalytical) {
    return { ok: false, reason: "descriptive_company_copy" };
  }
  const hasNumber = /\b\d+(\.\d+)?\s?%|\b\d{2,}\s?(billion|million|trillion|bn|mn|years?|months?|companies|firms|utilities|clients|customers|patients|hospitals|banks)\b/i.test(cleanText.slice(0, 4000));
  if (!hasAnalytical && !hasNumber) {
    return { ok: false, reason: "no_analytical_or_quantitative_content" };
  }
  return { ok: true };
}

// 0–100 quality score: length + structure + readability + signal density.
function computeContentQualityScore(opts: { clean: string; raw: string }): number {
  const clean = opts.clean || "";
  const raw = opts.raw || "";
  if (!clean) return 0;
  let s = 0;
  // length (0-35)
  const len = clean.length;
  if (len >= 6000) s += 35;
  else if (len >= 4000) s += 28;
  else if (len >= 2500) s += 20;
  else if (len >= 1500) s += 12;
  else if (len >= 800) s += 6;
  // structure: number of paragraphs ≥80 chars (0-25)
  const paras = clean.split(/\n{2,}/).filter(p => p.trim().length >= 80).length;
  if (paras >= 8) s += 25;
  else if (paras >= 5) s += 18;
  else if (paras >= 3) s += 10;
  else if (paras >= 1) s += 4;
  // readability: avg sentence length 12–28 words is healthy (0-15)
  const sentences = clean.split(/(?<=[.!?])\s+/).filter(x => x.trim().length > 20);
  if (sentences.length > 0) {
    const avgWords = sentences.reduce((a, x) => a + x.split(/\s+/).length, 0) / sentences.length;
    if (avgWords >= 12 && avgWords <= 28) s += 15;
    else if (avgWords >= 8 && avgWords <= 36) s += 8;
  }
  // signal density: clean / raw (0-25)
  if (raw.length > 0) {
    const ratio = clean.length / raw.length;
    if (ratio >= 0.7) s += 25;
    else if (ratio >= 0.5) s += 18;
    else if (ratio >= 0.3) s += 10;
    else if (ratio >= 0.15) s += 4;
  } else {
    s += 10;
  }
  return Math.max(0, Math.min(100, s));
}

// noise_ratio: how much of the raw markdown was stripped during cleaning.
function computeNoiseRatio(raw: string, clean: string): number {
  if (!raw) return 1;
  const rawLen = raw.replace(/\s+/g, " ").trim().length;
  const cleanLen = (clean || "").replace(/\s+/g, " ").trim().length;
  if (rawLen <= 0) return 1;
  return Math.max(0, Math.min(1, 1 - cleanLen / rawLen));
}

function detectBlockedContent(text: string): { blocked: boolean; reason?: string } {
  if (!text) return { blocked: true, reason: "empty_text" };
  const lower = text.toLowerCase();
  for (const phrase of BLOCKED_PHRASES) {
    if (lower.includes(phrase) && text.length < 3000) {
      return { blocked: true, reason: `phrase_${phrase.replace(/\s+/g, "_").slice(0, 24)}` };
    }
  }
  if (text.length < MIN_CLEAN_TEXT_CHARS) {
    return { blocked: true, reason: "thin_clean_text" };
  }
  const tokens = lower.split(/\s+/).filter(Boolean);
  if (tokens.length > 200) {
    const ratio = new Set(tokens).size / tokens.length;
    if (ratio < 0.18) return { blocked: true, reason: "low_lexical_diversity" };
  }
  return { blocked: false };
}

async function preflightUrl(url: string): Promise<{ ok: boolean; reason?: string; finalUrl?: string }> {
  const ua = "Mozilla/5.0 (compatible; AuraSignalsBot/1.0)";
  const check = (res: Response) => {
    const ct = (res.headers.get("content-type") || "").toLowerCase();
    if (res.status !== 200) return { ok: false, reason: `status_${res.status}` };
    if (!ct.includes("text/html")) return { ok: false, reason: `content_type_${ct || "missing"}` };
    return { ok: true, finalUrl: res.url || url };
  };
  try {
    const head = await fetch(url, { method: "HEAD", redirect: "follow", headers: { "User-Agent": ua } });
    if (head.status === 405 || head.status === 501) {
      const get = await fetch(url, {
        method: "GET", redirect: "follow",
        headers: { "User-Agent": ua, Range: "bytes=0-1024" },
      });
      return check(get);
    }
    return check(head);
  } catch (e) {
    return { ok: false, reason: `fetch_error_${(e as Error).message?.slice(0, 40)}` };
  }
}

// validation_score: trusted domain (40) + length (40) + density (20)
function computeValidationScore(opts: { domain: string; markdown: string; text: string }): number {
  let score = 0;
  if (isTrustedDomain(opts.domain)) score += 40;
  else if (/\.(edu|gov|org)$/.test(opts.domain.toLowerCase())) score += 20;
  else score += 5;

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

// snapshot_quality: a separate read of "is this a good READING experience"
function computeSnapshotQuality(opts: { markdown: string; text: string }): number {
  const len = opts.text.length;
  let s = 0;
  if (len >= 6000) s += 50;
  else if (len >= 4000) s += 40;
  else if (len >= 2500) s += 30;
  else if (len >= 1500) s += 20;
  // paragraph density
  const paragraphs = opts.markdown.split(/\n{2,}/).filter(p => p.trim().length > 80).length;
  if (paragraphs >= 8) s += 25;
  else if (paragraphs >= 5) s += 18;
  else if (paragraphs >= 3) s += 10;
  // signal-to-noise
  const ratio = opts.markdown.length > 0 ? opts.text.length / opts.markdown.length : 0;
  if (ratio >= 0.7) s += 25;
  else if (ratio >= 0.5) s += 15;
  else if (ratio >= 0.3) s += 8;
  return Math.max(0, Math.min(100, s));
}

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
    f.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/)
      .filter(t => t.length >= 4 && !STOPWORDS.has(t)).forEach(t => set.add(t));
  }
  return Array.from(set);
}
function computeTopicRelevance(text: string, profileTokens: string[]): number {
  if (!text || profileTokens.length === 0) return 0;
  const lower = text.toLowerCase().slice(0, 12000);
  let hits = 0, weighted = 0;
  for (const tok of profileTokens) {
    if (!tok || tok.length < 3) continue;
    const re = new RegExp(`\\b${tok.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi");
    const matches = lower.match(re);
    if (matches) {
      hits += 1;
      weighted += Math.min(matches.length, 5);
    }
  }
  const coverage = hits / profileTokens.length;
  const density = Math.min(weighted / 15, 1);
  return Math.round(coverage * 60 + density * 40);
}

// ───────── Exa discovery ─────────
async function exaDiscover(
  apiKey: string,
  profileContext: string,
  queries: string[],
): Promise<Array<{ url: string; title?: string; description?: string; reason?: string }>> {
  const collected = new Map<string, { url: string; title?: string; description?: string; reason?: string }>();

  // Strategy: run two passes per query — one biased to consulting/business
  // sources, one open. This avoids monoculture from a single category.
  const consultingDomains = TRUSTED_DOMAINS.filter(d =>
    !/(nature|science|nber)\.org?$/.test(d) && !/^nature\.com$/.test(d)
  );

  for (const q of queries) {
    if (!q || q.length < 6) continue;
    const passes: Array<Record<string, unknown>> = [
      // Pass 1: business/consulting bias (no category, restricted domains)
      {
        query: `${q} — strategic implications for senior consultants (${profileContext})`,
        numResults: 6,
        type: "neural",
        useAutoprompt: true,
        startPublishedDate: new Date(Date.now() - 120 * 86400_000).toISOString(),
        contents: { text: false, summary: { query: "Why this matters strategically" } },
        includeDomains: consultingDomains,
      },
      // Pass 2: open neural search (broader pool, no domain/category lock)
      {
        query: `${q} executive briefing OR analysis OR report`,
        numResults: 5,
        type: "neural",
        useAutoprompt: true,
        startPublishedDate: new Date(Date.now() - 120 * 86400_000).toISOString(),
      },
    ];

    for (const body of passes) {
      try {
        const res = await fetch(EXA_URL, {
          method: "POST",
          headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          console.error("[trends] exa pass failed", res.status, data);
          continue;
        }
        const results = Array.isArray(data?.results) ? data.results : [];
        for (const r of results) {
          if (r?.url && !collected.has(r.url)) {
            collected.set(r.url, {
              url: r.url,
              title: r.title,
              description: r.summary || r.text?.slice(0, 200),
              reason: r.summary,
            });
          }
        }
      } catch (e) {
        console.error("[trends] exa pass exception", e);
      }
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
  if (!res.ok) return { ok: false as const, status: res.status, error: data?.error || "scrape failed" };
  const markdown: string = data?.data?.markdown ?? data?.markdown ?? "";
  const metadata = data?.data?.metadata ?? data?.metadata ?? {};
  const sourceURL: string = metadata?.sourceURL ?? metadata?.url ?? url;
  const title: string = metadata?.title ?? "";
  const statusCode: number = metadata?.statusCode ?? 200;
  return { ok: true as const, markdown, title, sourceURL, statusCode };
}

// ───────── AI synthesis (signal model) ─────────
async function aiSynthesize(
  lovableKey: string,
  profileContext: string,
  items: Array<{ title: string; url: string; markdown: string }>,
) {
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${lovableKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        {
          role: "system",
          content: `You are the strategic intelligence editor for a senior consultant whose profile is: ${profileContext}.

You receive raw articles. For EACH one you must turn it into a SIGNAL OBJECT — not a summary.

A signal must answer: WHAT is changing? WHY does it matter? WHAT should I do? HOW can I use it?

For EACH article return:
- headline: punchy, <= 10 words, no clickbait, no "How to…", no questions. Lead with the shift, not the topic.
- insight: ONE sentence (<= 25 words). MUST start with EXACTLY one of:
    "This signals", "This indicates", "This exposes a gap", "This creates an opportunity".
    NEVER use: "This highlights", "This discusses", "This article", "According to", "The report says", "sets a precedent".
- summary: 2–3 strategic sentences. State the shift, the implication for THIS consultant's clients, and the second-order effect. No fluff. No restating the article.
- relevance_score: 0-100 — how relevant to THIS consultant's profile.
- category: ONE of [Strategy, AI, Operations, Regulation, Technology, Market, Talent, Sustainability, Finance].
- impact_level: ONE of [High, Emerging, Watch]. High = major shift already underway with money/regulation behind it. Emerging = early but credible signal. Watch = monitor.
- confidence_level: ONE of [High, Medium, Low]. Based on how strongly the article evidences its claim.
- signal_type: ONE of [Trend, Insight, Disruption, Benchmark, Risk].
- opportunity_type: ONE of [Content, Consulting, Product, Partnership, Internal] — the most natural way THIS consultant can act on it.
- action_recommendation: <= 200 chars. MUST contain THREE elements: (1) a specific target audience (CFO/COO/board/regulator/specific industry leader), (2) a concrete action verb (engage/diagnose/propose/build/pilot/launch), (3) the business value or outcome.
    GOOD: "Engage utility CFOs to assess digital twin ROI and position a predictive maintenance offering."
    GOOD: "Build a 90-day diagnostic offer for water utilities exposed to the new EU regulation; lead with risk quantification."
    BAD: "Consider exploring digital twins." / "Stay informed." / "Read more." / "Position digital transformation."
- content_angle: <= 200 chars. A LinkedIn-ready angle that ONLY this consultant could credibly write. Must be specific, sharp, and engaging — preferably contrarian or counted.
    GOOD: "Why 70% of utility transformations fail before scaling — and how to fix it."
    GOOD: "3 things water utility CFOs get wrong about digital twins — and the one number that fixes the conversation."
    BAD: "Digital transformation in utilities." / "AI in operations." / "The future of utilities." / "Why this trend is important."`,
        },
        {
          role: "user",
          content: `Articles:\n\n${items.map((it, i) =>
            `[${i}] ${it.title}\nURL: ${it.url}\nContent (truncated):\n${it.markdown.slice(0, 4000)}\n---`
          ).join("\n")}`,
        },
      ],
      tools: [{
        type: "function",
        function: {
          name: "return_signals",
          description: "Return synthesized signal objects",
          parameters: {
            type: "object",
            properties: {
              signals: {
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
                    confidence_level: { type: "string" },
                    signal_type: { type: "string" },
                    opportunity_type: { type: "string" },
                    action_recommendation: { type: "string" },
                    content_angle: { type: "string" },
                  },
                  required: ["index","headline","insight","summary","relevance_score",
                             "category","impact_level","action_recommendation","content_angle"],
                },
              },
            },
            required: ["signals"],
          },
        },
      }],
      tool_choice: { type: "function", function: { name: "return_signals" } },
    }),
  });
  if (!res.ok) {
    console.error("AI synth failed", res.status, await res.text());
    return [];
  }
  const data = await res.json();
  const args = data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!args) return [];
  try { return JSON.parse(args).signals ?? []; } catch { return []; }
}

// Domain "family" — collapse subdomains and journal siblings so we don't
// get 5x nature.com just because Nature has many sub-journals.
function domainFamily(domain: string): string {
  const d = (domain || "").toLowerCase();
  if (!d) return "";
  // Nature family: nature.com, www.nature.com, nature.com/articles/* (all same family)
  if (/(^|\.)nature\.com$/.test(d)) return "nature-family";
  if (/(^|\.)science\.org$/.test(d)) return "science-family";
  if (/(^|\.)springer\.com$/.test(d) || /(^|\.)springernature\.com$/.test(d)) return "springer-family";
  if (/(^|\.)sciencedirect\.com$/.test(d) || /(^|\.)elsevier\.com$/.test(d)) return "elsevier-family";
  if (/(^|\.)mckinsey\.com$/.test(d)) return "mckinsey";
  if (/(^|\.)bcg\.com$/.test(d)) return "bcg";
  if (/(^|\.)deloitte\.com$/.test(d)) return "deloitte";
  if (/(^|\.)ey\.com$/.test(d)) return "ey";
  if (/(^|\.)pwc\.com$/.test(d)) return "pwc";
  if (/(^|\.)kpmg\.com$/.test(d)) return "kpmg";
  if (/(^|\.)accenture\.com$/.test(d)) return "accenture";
  // Default: registrable domain (last 2 labels)
  const parts = d.split(".");
  return parts.length >= 2 ? parts.slice(-2).join(".") : d;
}

// Diversity: cap per-domain AND per-domain-family. Prefer broad variety.
function diversifyByDomain<T extends { source: string; final_score: number }>(
  rows: T[], perDomainCap = 2, max = 5, perFamilyCap = 2,
): T[] {
  const sorted = [...rows].sort((a, b) => b.final_score - a.final_score);
  const domCounts = new Map<string, number>();
  const famCounts = new Map<string, number>();
  const picked: T[] = [];
  for (const r of sorted) {
    const dom = (r.source || "").toLowerCase();
    const fam = domainFamily(dom);
    const dc = domCounts.get(dom) || 0;
    const fc = famCounts.get(fam) || 0;
    if (dc >= perDomainCap) continue;
    if (fc >= perFamilyCap) continue;
    domCounts.set(dom, dc + 1);
    famCounts.set(fam, fc + 1);
    picked.push(r);
    if (picked.length >= max) break;
  }
  // Relax family cap as a last resort — but never breach domain cap
  if (picked.length < max) {
    for (const r of sorted) {
      if (picked.includes(r)) continue;
      const dom = (r.source || "").toLowerCase();
      const dc = domCounts.get(dom) || 0;
      if (dc >= perDomainCap) continue;
      domCounts.set(dom, dc + 1);
      picked.push(r);
      if (picked.length >= max) break;
    }
  }
  return picked;
}

// Decision label per spec section 7
function computeDecisionLabel(impact: string | null, confidence: string | null): string {
  if (impact === "High" && confidence === "High") return "Act Now";
  if (impact === "Emerging") return "Early Opportunity";
  if (confidence === "Low") return "Monitor";
  if (impact === "High") return "Act Now";
  return "Monitor";
}

// Heuristic confidence_level if AI didn't provide one
function inferConfidence(validation: number, snapshot: number, trusted: boolean): "High" | "Medium" | "Low" {
  const composite = validation * 0.5 + snapshot * 0.4 + (trusted ? 10 : 0);
  if (composite >= 75) return "High";
  if (composite >= 55) return "Medium";
  return "Low";
}

function buildSelectionReason(opts: {
  domain: string; validation: number; topic: number; snapshot: number;
  decision: string; opportunity: string;
}): string {
  const parts: string[] = [];
  parts.push(opts.decision);
  if (isTrustedDomain(opts.domain)) parts.push(`trusted source (${opts.domain})`);
  if (opts.topic >= 60) parts.push("strong fit with your focus");
  else if (opts.topic >= 30) parts.push("relevant to your focus");
  if (opts.opportunity) parts.push(`${opts.opportunity.toLowerCase()} opportunity`);
  if (opts.validation >= 75) parts.push("high source quality");
  return parts.join(" · ").slice(0, 280);
}

// ───────── Handler ─────────
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    let mode: "light" | "full" = "full";
    if (req.method === "POST") {
      try {
        const body = await req.json();
        if (body?.mode === "light") mode = "light";
      } catch { /* no body */ }
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey     = Deno.env.get("SUPABASE_ANON_KEY")!;
    const lovableKey  = Deno.env.get("LOVABLE_API_KEY")!;
    const firecrawlKey= Deno.env.get("FIRECRAWL_API_KEY");
    const exaKey      = Deno.env.get("EXA_API_KEY");

    if (!firecrawlKey) {
      return new Response(JSON.stringify({ error: "FIRECRAWL_API_KEY not configured", inserted: 0 }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!exaKey) {
      return new Response(JSON.stringify({ error: "EXA_API_KEY not configured", inserted: 0 }), {
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

    console.log("[trends] exa discovery for queries:", queries);
    const discoveryResults = await exaDiscover(exaKey, profileContext, queries);
    console.log("[trends] exa returned:", discoveryResults.length);

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
    console.log("[trends] candidates after dedupe:", candidates.length);

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

    // Scrape + clean + multi-stage validation
    const scraped: Array<{
      url: string; canonical: string; title: string;
      raw_markdown: string; clean_markdown: string;
      text: string; source: string;
      validation_score: number; topic_relevance_score: number;
      snapshot_quality: number; content_quality_score: number;
      discovery_reason?: string;
    }> = [];

    let firecrawlQuotaExhausted = false;
    for (const c of candidates) {
      if (existingUrls.has(c.url)) continue;
      if (firecrawlQuotaExhausted) break; // stop hammering a dead key
      const pre = await preflightUrl(c.url);
      if (!pre.ok) { console.log("[trends] preflight reject", c.url, pre.reason); continue; }
      const result = await firecrawlScrape(firecrawlKey, pre.finalUrl || c.url);
      if (!result.ok) {
        console.log("[trends] scrape failed", c.url, result.status);
        if (result.status === 402) firecrawlQuotaExhausted = true;
        continue;
      }
      if (result.statusCode >= 400) { console.log("[trends] http error", c.url, result.statusCode); continue; }
      if (!result.markdown || result.markdown.length < MIN_CONTENT_CHARS) {
        console.log("[trends] thin raw markdown", c.url, result.markdown?.length || 0); continue;
      }
      const canonical = result.sourceURL || pre.finalUrl || c.url;
      if (existingUrls.has(canonical)) continue;

      // ── Cleaning pipeline (per spec) ──
      const raw_markdown = result.markdown;
      const clean_markdown = cleanArticleMarkdown(raw_markdown, canonical);
      const text = markdownToText(clean_markdown);
      const noiseRatio = computeNoiseRatio(raw_markdown, clean_markdown);

      // Stage 3: Hard rejection rules
      if (text.length < MIN_CLEAN_TEXT_CHARS) {
        console.log("[trends] reject thin_clean_text", c.url, text.length); continue;
      }
      if (noiseRatio > MAX_NOISE_RATIO) {
        console.log("[trends] reject high_noise_ratio", c.url, noiseRatio.toFixed(2)); continue;
      }
      const opening = openingLooksLikeArticle(text);
      if (!opening.ok) {
        console.log("[trends] reject opening", c.url, opening.reason); continue;
      }
      const blocked = detectBlockedContent(text);
      if (blocked.blocked) { console.log("[trends] blocked", c.url, blocked.reason); continue; }
      // Stage 5: Business relevance filter
      const biz = passesBusinessRelevance(text);
      if (!biz.ok) {
        console.log("[trends] reject business_relevance", c.url, biz.reason); continue;
      }

      // Stage 5.5: Consultant gate (LLM final arbiter on cleaned text)
      const gate = await consultantGate(text);
      if (gate.decision === "REJECT") {
        console.log("[trends] reject consultant_gate", c.url, gate.reason); continue;
      }
      console.log("[trends] consultant_gate ACCEPT", c.url, gate.reason);

      const source = domainOf(canonical);
      const validation_score = computeValidationScore({ domain: source, markdown: clean_markdown, text });
      if (validation_score <= 0) {
        console.log("[trends] reject zero_validation", c.url); continue;
      }
      const topic_relevance_score = computeTopicRelevance(text, profileTokens);
      const snapshot_quality = computeSnapshotQuality({ markdown: clean_markdown, text });
      const content_quality_score = computeContentQualityScore({ clean: clean_markdown, raw: raw_markdown });

      scraped.push({
        url: c.url, canonical,
        title: result.title || c.title || canonical,
        raw_markdown, clean_markdown, text, source,
        validation_score, topic_relevance_score, snapshot_quality, content_quality_score,
        discovery_reason: c.reason,
      });
    }
    console.log("[trends] validated articles:", scraped.length);

    let synthesized: any[] = [];
    if (scraped.length > 0) {
      // Feed AI the CLEAN markdown only (per spec).
      synthesized = await aiSynthesize(lovableKey, profileContext,
        scraped.map(s => ({ title: s.title, url: s.canonical, markdown: s.clean_markdown })));
    }

    type Built = {
      user_id: string; headline: string; insight: string; summary: string;
      source: string; url: string; canonical_url: string;
      content_markdown: string; content_text: string;
      content_raw: string; content_clean: string;
      relevance_score: number; validation_score: number;
      topic_relevance_score: number; snapshot_quality: number;
      content_quality_score: number; final_score: number;
      validation_status: string; last_checked_at: string;
      published_at: null; status: string;
      selection_reason: string;
      category: string | null; impact_level: string | null;
      confidence_level: string; signal_type: string; opportunity_type: string;
      action_recommendation: string; content_angle: string;
      decision_label: string; is_valid: boolean;
    };

    // Weighted scoring (per spec section 8):
    // final_score = validation*0.5 + topic_relevance*0.3 + content_quality*0.2
    const built: Built[] = [];
    for (const s of synthesized) {
      const src = scraped[s.index];
      if (!src) continue;
      const ai_relevance = Math.max(0, Math.min(100, Number(s.relevance_score) || 0));
      const final_score = Math.round(
        src.validation_score * 0.5 +
        src.topic_relevance_score * 0.3 +
        src.content_quality_score * 0.2
      );

      const rawCategory  = typeof s.category === "string" ? s.category.trim() : "";
      const category     = VALID_CATEGORIES.has(rawCategory) ? rawCategory : null;
      const rawImpact    = typeof s.impact_level === "string" ? s.impact_level.trim() : "";
      const impact_level = VALID_IMPACT.has(rawImpact) ? rawImpact : "Watch";

      const trusted = isTrustedDomain(src.source);
      const inferredConf = inferConfidence(src.validation_score, src.snapshot_quality, trusted);
      const rawConf      = typeof s.confidence_level === "string" ? s.confidence_level.trim() : "";
      const confidence_level = VALID_CONFIDENCE.has(rawConf) ? rawConf : inferredConf;

      const rawSig  = typeof s.signal_type === "string" ? s.signal_type.trim() : "";
      const signal_type = VALID_SIGNAL_TYPE.has(rawSig) ? rawSig : "Trend";

      const rawOpp  = typeof s.opportunity_type === "string" ? s.opportunity_type.trim() : "";
      const opportunity_type = VALID_OPPORTUNITY.has(rawOpp) ? rawOpp : "Content";

      const action_recommendation = (typeof s.action_recommendation === "string" ? s.action_recommendation : "").slice(0, 200).trim();
      const content_angle = (typeof s.content_angle === "string" ? s.content_angle : "").slice(0, 200).trim();
      const decision_label = computeDecisionLabel(impact_level, confidence_level);

      // Stage 6 enforcement: insight MUST start with one of the strict openers.
      const ALLOWED_OPENERS = ["This signals", "This indicates", "This exposes a gap", "This creates an opportunity"];
      const BANNED_OPENERS = /^(this highlights|this discusses|this article|according to|the report|the article|sets a precedent|highlights|discusses)/i;
      let rawInsight = (s.insight || "").trim();
      const startsAllowed = ALLOWED_OPENERS.some(p => rawInsight.toLowerCase().startsWith(p.toLowerCase()));
      if (!startsAllowed || BANNED_OPENERS.test(rawInsight)) {
        const stripped = rawInsight.replace(BANNED_OPENERS, "").replace(/^[\s,;:.-]+/, "").trim();
        const opener = impact_level === "Emerging" ? "This indicates"
          : opportunity_type === "Consulting" ? "This creates an opportunity to address"
          : "This signals";
        rawInsight = `${opener} ${stripped.charAt(0).toLowerCase()}${stripped.slice(1)}`.slice(0, 500);
      }
      const insightFinal = rawInsight.slice(0, 500);

      const selection_reason = buildSelectionReason({
        domain: src.source, validation: src.validation_score,
        topic: src.topic_relevance_score, snapshot: src.snapshot_quality,
        decision: decision_label, opportunity: opportunity_type,
      });

      built.push({
        user_id: userId,
        headline: (s.headline || src.title || "").slice(0, 200),
        insight: insightFinal,
        summary: (s.summary || "").slice(0, 2000),
        source: src.source.slice(0, 100),
        url: src.canonical, canonical_url: src.canonical,
        // content_markdown defaults to the CLEAN copy for default reading experience
        content_markdown: src.clean_markdown.slice(0, 50000),
        content_text: src.text.slice(0, 50000),
        content_raw: src.raw_markdown.slice(0, 80000),
        content_clean: src.clean_markdown.slice(0, 50000),
        relevance_score: ai_relevance,
        validation_score: src.validation_score,
        topic_relevance_score: src.topic_relevance_score,
        snapshot_quality: src.snapshot_quality,
        content_quality_score: src.content_quality_score,
        final_score,
        validation_status: src.validation_score >= 50 ? "ok" : "weak",
        last_checked_at: new Date().toISOString(),
        published_at: null, status: "new",
        selection_reason,
        category, impact_level,
        confidence_level, signal_type, opportunity_type,
        action_recommendation, content_angle,
        decision_label, is_valid: true,
      });
    }

    // Adaptive selection: try strict floor first, relax until we have >=3
    const isLight = mode === "light";
    const targetCount = isLight ? 3 : 5;
    let selected: Built[] = [];
    let usedFloor = ADAPTIVE_FLOORS[0];
    for (const floor of ADAPTIVE_FLOORS) {
      const eligible = built.filter(b => b.final_score >= floor && b.is_valid);
      const picked = diversifyByDomain(eligible, 2, targetCount);
      if (picked.length >= MIN_TARGET_SIGNALS || floor === ADAPTIVE_FLOORS[ADAPTIVE_FLOORS.length - 1]) {
        selected = picked;
        usedFloor = floor;
        break;
      }
    }
    console.log(`[trends] selected ${selected.length} signals (floor=${usedFloor})`);

    // Full refresh expires existing "new" trends BEFORE inserting fresh ones.
    if (!isLight && selected.length > 0) {
      await adminClient
        .from("industry_trends")
        .update({ status: "expired" })
        .eq("user_id", userId)
        .eq("status", "new");
    }

    let inserted = 0;
    if (selected.length > 0) {
      const { error: insertErr, count } = await adminClient
        .from("industry_trends")
        .insert(selected, { count: "exact" });
      if (insertErr) console.error("[trends] insert error:", insertErr);
      else inserted = count || selected.length;
    }

    // Cap active at 5
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
      inserted, scraped: scraped.length, candidates: candidates.length,
      selected: selected.length, total_active: Math.min(ids.length, 5),
      adaptive_floor: usedFloor,
      firecrawl_quota_exhausted: firecrawlQuotaExhausted,
      warning: firecrawlQuotaExhausted
        ? "Firecrawl returned 402 (insufficient credits). No new snapshots could be scraped. Top up Firecrawl credits to restore signal generation."
        : undefined,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("fetch-industry-trends error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error", inserted: 0 }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
