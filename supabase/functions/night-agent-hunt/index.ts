// Sleeping Agent Phase 1 — nightly one-article hunt per eligible user.
// Backend only. Never surfaces errors to users; per-user failures are logged
// into agent_findings.status='error' and the run continues.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { withObserve } from "../_shared/observe.ts";
import { logError } from "../_shared/logError.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

/* ── JSON salvage parser (mirrors detect-signals-v2) ── */
function parseAiJson(raw: string): any | null {
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { /* fall through */ }
  try {
    const m = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    const cleaned = (m ? m[1] : raw).replace(/[\u0000-\u001F\u007F]/g, " ");
    return JSON.parse(cleaned);
  } catch { /* fall through */ }
  try {
    const cleaned = raw.replace(/[\u0000-\u001F\u007F]/g, " ");
    const start = cleaned.indexOf("{");
    if (start >= 0) {
      let depth = 0;
      for (let i = start; i < cleaned.length; i++) {
        const c = cleaned[i];
        if (c === "{") depth++;
        else if (c === "}") {
          depth--;
          if (depth === 0) return JSON.parse(cleaned.slice(start, i + 1));
        }
      }
    }
  } catch { /* fall through */ }
  return null;
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(t);
  }
}

async function callPerplexity(apiKey: string, system: string, userMsg: string): Promise<any | null> {
  // Two-attempt pattern (aligned with onboarding-find-article).
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetchWithTimeout(
        "https://api.perplexity.ai/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "sonar",
            messages: [
              { role: "system", content: system },
              { role: "user", content: userMsg },
            ],
            search_recency_filter: "week",
          }),
        },
        25000,
      );
      if (!res.ok) {
        if (attempt === 0) continue;
        return null;
      }
      return await res.json();
    } catch (_e) {
      if (attempt === 0) continue;
      return null;
    }
  }
  return null;
}

function extractArticle(perp: any): { url: string; title: string; source: string; summary: string } | null {
  const content: string = perp?.choices?.[0]?.message?.content || "";
  const citations: string[] = (perp?.citations || []).filter(
    (u: unknown): u is string => typeof u === "string" && u.startsWith("http"),
  );
  // 1) Try JSON parse from content
  const parsed = parseAiJson(content);
  if (parsed && typeof parsed === "object") {
    const url = String(parsed.url || citations[0] || "").trim();
    if (url && url.startsWith("http")) {
      let host = "";
      try { host = new URL(url).hostname.replace(/^www\./, ""); } catch {}
      return {
        url,
        title: String(parsed.title || "").slice(0, 300) || host || "Article",
        source: String(parsed.source || host || "Web").slice(0, 200),
        summary: String(parsed.summary || parsed.description || content).slice(0, 1200),
      };
    }
  }
  // 2) Fallback: first citation
  if (citations[0]) {
    let host = "Web";
    try { host = new URL(citations[0]).hostname.replace(/^www\./, ""); } catch {}
    return {
      url: citations[0],
      title: content.slice(0, 140) || host,
      source: host,
      summary: content.slice(0, 1200),
    };
  }
  return null;
}

interface RelevanceGate {
  score: number;
  implication: string;
}

const BANNED_WORDS = ["authority", "trajectory", "personal brand", "thought leader", "leverage", "utilize", "facilitate"];

function cleanImplication(s: string): string {
  let out = (s || "").trim();
  // If model slipped a banned word in, downgrade — do not publish that string.
  const low = out.toLowerCase();
  for (const w of BANNED_WORDS) if (low.includes(w)) return "";
  return out.slice(0, 400);
}

async function scoreRelevance(
  lovableKey: string,
  article: { url: string; title: string; source: string; summary: string },
  ctx: { level: string; sector: string; practice: string; themes: string[] },
): Promise<RelevanceGate | null> {
  const system =
    "You score how relevant a news article is to a specific professional. " +
    "Return a strict JSON object: {\"score\": number 0-1, \"implication\": \"one plain-language sentence\"}. " +
    "STRICT EXCLUSION: any political, religious, or socially controversial topic → score MUST be 0. " +
    "The implication must be ONE sentence, plain English, personalized to their level + sector + top theme, " +
    "stating what this development means for their position. " +
    "Never use these words: authority, trajectory, personal brand, thought leader, leverage, utilize, facilitate.";
  const user =
    `Reader profile:\n` +
    `- Level: ${ctx.level || "senior professional"}\n` +
    `- Sector: ${ctx.sector || "unspecified"}\n` +
    `- Core practice: ${ctx.practice || "unspecified"}\n` +
    `- Top themes: ${ctx.themes.slice(0, 5).join(", ") || "none"}\n\n` +
    `Article:\n- Title: ${article.title}\n- Source: ${article.source}\n- URL: ${article.url}\n- Summary: ${article.summary}\n\n` +
    `Return JSON only.`;

  try {
    const res = await fetchWithTimeout(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${lovableKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          response_format: { type: "json_object" },
        }),
      },
      20000,
    );
    if (!res.ok) return null;
    const data = await res.json();
    const raw = data?.choices?.[0]?.message?.content || "";
    const parsed = parseAiJson(raw);
    if (!parsed) return null;
    const score = Number(parsed.score);
    const implication = cleanImplication(String(parsed.implication || ""));
    if (!Number.isFinite(score)) return null;
    return { score: Math.max(0, Math.min(1, score)), implication };
  } catch {
    return null;
  }
}

/* ── main ── */

Deno.serve(withObserve("night-agent-hunt", async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  // Vault stores this as lowercase `cron_secret`; also accept uppercase env fallback.
  const CRON_SECRET = Deno.env.get("cron_secret") || Deno.env.get("CRON_SECRET") || "";
  const PERPLEXITY_API_KEY = Deno.env.get("PERPLEXITY_API_KEY");
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

  const authHeader = req.headers.get("Authorization") ?? "";
  const bearer = authHeader.replace("Bearer ", "");
  const cronHeader = req.headers.get("x-cron-secret") || "";
  const isCron = !!CRON_SECRET && cronHeader === CRON_SECRET;
  const isServiceRole = !!bearer && bearer === SERVICE_KEY;

  // Auth: cron secret, service role, or a verified JWT.
  let authedUserId: string | null = null;
  if (!isCron && !isServiceRole) {
    if (!bearer) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const anon = createClient(SUPABASE_URL, ANON_KEY);
    const { data: { user }, error } = await anon.auth.getUser(bearer);
    if (error || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    authedUserId = user.id;
  }

  if (!PERPLEXITY_API_KEY || !LOVABLE_API_KEY) {
    return new Response(
      JSON.stringify({ error: "Missing PERPLEXITY_API_KEY or LOVABLE_API_KEY" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  // Discover eligible users.
  // Eligibility: diagnostic_profiles row, ≥3 active strategic_signals, sign-in within 21 days,
  //              fewer than 3 pending agent_findings.
  let candidateUserIds: string[] = [];

  if (authedUserId && !isCron && !isServiceRole) {
    candidateUserIds = [authedUserId];
  } else {
    // Pull recent sign-ins from auth.users via admin API.
    const cutoff = Date.now() - 21 * 24 * 60 * 60 * 1000;
    const collected: string[] = [];
    try {
      // paginate up to a few hundred users
      for (let page = 1; page <= 5; page++) {
        const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
        if (error || !data) break;
        for (const u of (data.users || [])) {
          const last = u.last_sign_in_at ? Date.parse(u.last_sign_in_at) : 0;
          if (last && last >= cutoff) collected.push(u.id);
        }
        if (!data.users || data.users.length < 200) break;
      }
    } catch (e) {
      // If listing fails, log and abort — we can't safely enumerate.
      await logError("night-agent-hunt", e, { severity: "high", context: { step: "listUsers" } });
      return new Response(JSON.stringify({ error: "listUsers failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    candidateUserIds = Array.from(new Set(collected));
  }

  const summary = {
    considered: candidateUserIds.length,
    processed: 0,
    kept: 0,
    below_bar: 0,
    duplicate: 0,
    skipped: 0,
    error: 0,
  };

  for (const userId of candidateUserIds) {
    try {
      // Skip if already has ≥3 pending findings
      const { count: pendingCount } = await admin
        .from("agent_findings")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("status", "pending");
      if ((pendingCount ?? 0) >= 3) {
        summary.skipped++;
        continue;
      }

      // Diagnostic profile
      const { data: profile } = await admin
        .from("diagnostic_profiles")
        .select("sector_focus, core_practice, level")
        .eq("user_id", userId)
        .maybeSingle();
      if (!profile) { summary.skipped++; continue; }

      // Active signals count + theme_tags
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { data: signals, count: activeCount } = await admin
        .from("strategic_signals")
        .select("theme_tags, updated_at", { count: "exact" })
        .eq("user_id", userId)
        .eq("status", "active")
        .gte("updated_at", since)
        .limit(200);
      if ((activeCount ?? 0) < 3) { summary.skipped++; continue; }

      const tagCounts = new Map<string, number>();
      for (const s of (signals || [])) {
        for (const t of ((s as any).theme_tags || [])) {
          const k = String(t).trim().toLowerCase();
          if (!k) continue;
          tagCounts.set(k, (tagCounts.get(k) || 0) + 1);
        }
      }
      const topThemes = [...tagCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([t]) => t);

      const ctx = {
        level: String((profile as any).level ?? ""),
        sector: String((profile as any).sector_focus ?? ""),
        practice: String((profile as any).core_practice ?? ""),
        themes: topThemes,
      };

      // Perplexity search
      const system =
        `You are a research assistant finding ONE highly significant professional development from the last 7 days ` +
        `for a ${ctx.level || "senior professional"} in ${ctx.sector || "their sector"}. ` +
        `Focus on themes: ${topThemes.join(", ") || ctx.practice || "their core practice"}. ` +
        `GCC / Middle East regional context is preferred when available. ` +
        `STRICT: professional and sector content only. Strictly exclude political, religious, or socially controversial topics. ` +
        `Return ONLY a JSON object: {"title": "...", "url": "https://...", "source": "publisher name", "summary": "2-3 sentence executive summary"}. ` +
        `The URL must be a real, direct article URL.`;
      const userMsg = `Themes: ${topThemes.join(", ") || ctx.practice}\nSector: ${ctx.sector}\nLevel: ${ctx.level}\n\nFind exactly one article.`;

      const perp = await callPerplexity(PERPLEXITY_API_KEY, system, userMsg);
      if (!perp) {
        await admin.from("agent_findings").insert({
          user_id: userId, status: "error", error_detail: "perplexity_failed",
        });
        summary.error++;
        continue;
      }

      const article = extractArticle(perp);
      if (!article || !article.url) {
        await admin.from("agent_findings").insert({
          user_id: userId, status: "error", error_detail: "no_article_extracted",
          perplexity_raw: perp,
        });
        summary.error++;
        continue;
      }

      // Dedupe — entries.image_url for this user
      const { data: existingEntry } = await admin
        .from("entries")
        .select("id")
        .eq("user_id", userId)
        .eq("image_url", article.url)
        .limit(1);
      if (existingEntry && existingEntry.length > 0) {
        await admin.from("agent_findings").insert({
          user_id: userId, status: "duplicate", url: article.url,
          title: article.title, source: article.source,
        });
        summary.duplicate++;
        continue;
      }
      // Dedupe — agent_findings last 14 days for this user
      const dedupeSince = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
      const { data: recentFindings } = await admin
        .from("agent_findings")
        .select("id")
        .eq("user_id", userId)
        .eq("url", article.url)
        .gte("created_at", dedupeSince)
        .limit(1);
      if (recentFindings && recentFindings.length > 0) {
        await admin.from("agent_findings").insert({
          user_id: userId, status: "duplicate", url: article.url,
          title: article.title, source: article.source,
        });
        summary.duplicate++;
        continue;
      }

      // Relevance gate
      const gate = await scoreRelevance(LOVABLE_API_KEY, article, ctx);
      if (!gate) {
        await admin.from("agent_findings").insert({
          user_id: userId, status: "error", error_detail: "relevance_gate_failed",
          url: article.url, title: article.title, source: article.source,
          perplexity_raw: perp,
        });
        summary.error++;
        continue;
      }
      if (gate.score < 0.7) {
        await admin.from("agent_findings").insert({
          user_id: userId, status: "below_bar",
          url: article.url, title: article.title, source: article.source,
          relevance_score: gate.score, implication: gate.implication || null,
          perplexity_raw: perp,
        });
        summary.below_bar++;
        continue;
      }

      // Insert into entries — mirrors the shape used by ingest-capture for link captures.
      const { data: entryRow, error: entryErr } = await admin
        .from("entries")
        .insert({
          user_id: userId,
          type: "link",
          title: article.title.slice(0, 300),
          content: (article.summary || article.url).slice(0, 10000),
          summary: article.summary?.slice(0, 2000) || null,
          image_url: article.url,
          source_type: "aura_agent",
        })
        .select("id")
        .single();

      if (entryErr || !entryRow) {
        await admin.from("agent_findings").insert({
          user_id: userId, status: "error",
          error_detail: `entry_insert_failed: ${entryErr?.message ?? "unknown"}`,
          url: article.url, title: article.title, source: article.source,
          relevance_score: gate.score, implication: gate.implication || null,
          perplexity_raw: perp,
        });
        summary.error++;
        continue;
      }

      // Trigger the same downstream chain a normal URL capture uses:
      // extract-evidence → detect-signals-v2 (chained inside extract-evidence).
      try {
        await admin.functions.invoke("extract-evidence", {
          body: { source_type: "entry", source_id: entryRow.id, user_id: userId },
        });
      } catch (e) {
        console.warn("[night-agent-hunt] extract-evidence invoke threw:", (e as Error)?.message);
      }

      await admin.from("agent_findings").insert({
        user_id: userId, status: "pending",
        url: article.url, title: article.title, source: article.source,
        relevance_score: gate.score, implication: gate.implication || null,
        entry_id: entryRow.id, perplexity_raw: perp,
      });
      summary.kept++;
    } catch (e) {
      summary.error++;
      try {
        await admin.from("agent_findings").insert({
          user_id: userId, status: "error",
          error_detail: `exception: ${(e as Error)?.message?.slice(0, 500) ?? "unknown"}`,
        });
      } catch { /* swallow */ }
      await logError("night-agent-hunt", e, {
        user_id: userId, severity: "high", context: { step: "per_user_loop" },
      });
      continue;
    } finally {
      summary.processed++;
    }
  }

  return new Response(JSON.stringify({ ok: true, summary }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}));