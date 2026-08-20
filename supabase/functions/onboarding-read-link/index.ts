/**
 * onboarding-read-link — the anonymous capture payoff.
 *
 * A stranger with no account pastes a link. We read the page, pull three to
 * five real fragments out of it, and hand them straight back so the member
 * sees what Aura found in their own link. The fragments are also written into
 * the anonymous session state so a reload does not lose them; the link itself
 * is still replayed into `ingest-capture` at hand-off, which is what creates
 * the durable `evidence_fragments` rows against the account.
 *
 * Public (verify_jwt = false). The assessment session token is the only key.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { callAI } from "../_shared/ai-router.ts";
import { withObserve } from "../_shared/observe.ts";

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

function textFromHtml(html: string): string {
  let t = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
  t = t.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
  t = t.replace(/<(nav|footer|header)[^>]*>[\s\S]*?<\/\1>/gi, "");
  t = t.replace(/<[^>]+>/g, " ");
  t = t.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  return t.replace(/\s+/g, " ").trim();
}

function titleFromHtml(html: string): string | null {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? m[1].replace(/\s+/g, " ").trim() : null;
}

Deno.serve(withObserve("onboarding-read-link", async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({} as any));
    const token = typeof body?.token === "string" ? body.token : "";
    const url = typeof body?.url === "string" ? body.url.trim() : "";
    if (!token || !url) return json({ ok: false, reason: "missing_input" }, 400);

    let target: URL;
    try { target = new URL(url); } catch { return json({ ok: false, reason: "bad_url" }, 400); }
    if (target.protocol !== "https:" && target.protocol !== "http:") {
      return json({ ok: false, reason: "bad_url" }, 400);
    }
    const host = target.hostname.toLowerCase();
    if (
      host === "localhost" || host.endsWith(".local") ||
      /^(10\.|127\.|0\.|169\.254\.|192\.168\.|::1|fc|fd)/i.test(host) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host)
    ) return json({ ok: false, reason: "bad_url" }, 400);

    const svc = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    const { data: sess } = await svc
      .from("assessment_sessions")
      .select("state, expires_at")
      .eq("token", token)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    if (!sess) return json({ ok: false, reason: "no_session" }, 200);

    /* ── read the page ── */
    let pageText = "";
    let pageTitle: string | null = typeof body?.title === "string" ? body.title : null;
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 12000);
      const res = await fetch(target.toString(), {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      if (res.ok) {
        const html = await res.text();
        pageTitle = pageTitle || titleFromHtml(html);
        pageText = textFromHtml(html).slice(0, 12000);
      }
    } catch { /* fall through — handled below */ }

    if (pageText.length < 400 && !body?.summary) {
      return json({ ok: false, reason: "unreadable" }, 200);
    }

    const state = ((sess as any).state ?? {}) as Record<string, any>;

    const systemPrompt = [
      "You extract evidence fragments from an article a senior executive has just saved.",
      "Return ONLY JSON: {\"fragments\":[{\"title\":string,\"content\":string}]} with 3 to 5 items.",
      "Each title is a short claim in plain English (max 12 words), stated as the article states it.",
      "Each content is one or two sentences of supporting detail drawn from the text — never invented.",
      "No jargon. Do not use the words authority, personal brand, thought leader, or leverage as a verb.",
      "Do not address the reader. Do not recommend anything. Only report what the piece says.",
    ].join(" ");

    const userMessage = [
      pageTitle ? `TITLE: ${pageTitle}` : "",
      body?.summary ? `SUMMARY: ${String(body.summary).slice(0, 1200)}` : "",
      state.sector_focus ? `READER SECTOR: ${state.sector_focus}` : "",
      "",
      "ARTICLE TEXT:",
      pageText || String(body?.summary ?? ""),
    ].filter(Boolean).join("\n");

    let fragments: { title: string; content: string }[] = [];
    try {
      const { content } = await callAI({ task: "speed", systemPrompt, userMessage, jsonMode: true });
      const parsed = JSON.parse(content.replace(/^```json\s*|\s*```$/g, ""));
      const raw = Array.isArray(parsed?.fragments) ? parsed.fragments : [];
      fragments = raw
        .map((f: any) => ({
          title: String(f?.title ?? "").trim(),
          content: String(f?.content ?? "").trim(),
        }))
        .filter((f: any) => f.title)
        .slice(0, 5);
    } catch (e) {
      console.error("[onboarding-read-link] extraction failed:", (e as Error)?.message);
    }

    if (fragments.length === 0) return json({ ok: false, reason: "unreadable" }, 200);

    /* Keep them on the session so a reload does not lose the payoff. */
    try {
      await svc.from("assessment_sessions")
        .update({
          state: {
            ...state,
            capture_fragments: fragments,
            capture_source: { url, title: pageTitle },
          },
        })
        .eq("token", token);
    } catch { /* the fragments still go back in the response */ }

    return json({ ok: true, fragments, title: pageTitle });
  } catch (err: any) {
    return json({ ok: false, reason: "error", message: err?.message }, 200);
  }
}));
