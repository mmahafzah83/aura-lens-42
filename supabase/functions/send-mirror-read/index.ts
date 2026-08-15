/**
 * SEND-MIRROR-READ — posts an existing Mirror read to an inbox.
 *
 * It never generates. The read is built by `mirror-read` and nowhere else;
 * this function only reads `mirror_reads` and hands it to Resend.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";
import {
  renderEmail, heading, paragraph, signature, escapeHtml as esc,
} from "../_shared/emailTemplate.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const ARABIC_RE = /[\u0600-\u06FF]/;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    let body: any = {};
    try { body = await req.json(); } catch { /* empty body */ }

    const email = typeof body?.email === "string" ? body.email.trim() : "";
    if (!EMAIL_RE.test(email) || email.length > 255) return json({ error: "invalid_email" }, 400);

    const handle = typeof body?.handle === "string" ? body.handle.trim() : "";
    if (!handle) return json({ error: "not_found" }, 404);

    // Rate limit — same shape as mirror-read: 5 per IP per hour.
    const fwd = req.headers.get("x-forwarded-for") ?? "";
    const firstIp = fwd.split(",")[0].trim() || "unknown";
    const ip_hash = await sha256Hex(firstIp);
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count } = await admin
      .from("mirror_requests")
      .select("id", { count: "exact", head: true })
      .eq("ip_hash", ip_hash)
      .gte("created_at", since);
    if ((count ?? 0) >= 5) return json({ error: "rate_limited" }, 429);

    const { data: row } = await admin
      .from("mirror_reads")
      .select("handle, read, name, emailed_at, emailed_to")
      .eq("handle", handle)
      .maybeSingle();
    if (!row?.read) return json({ error: "not_found" }, 404);

    const read = row.read as Record<string, string | undefined>;

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) return json({ error: "send_failed" }, 502);

    // Every string below is model-produced and therefore escaped.
    const parts: string[] = [];
    if (read.archetype) parts.push(heading(esc(read.archetype)));
    if (read.market_read) parts.push(paragraph(esc(read.market_read), false));
    if (read.uncontested_space) {
      parts.push(paragraph(`<strong>The space nobody has claimed</strong><br>${esc(read.uncontested_space)}`));
    }
    if (read.honest_gap) {
      parts.push(paragraph(`<strong>One honest gap</strong><br>${esc(read.honest_gap)}`));
    }
    if (read.own_words_quote) {
      const rtl = ARABIC_RE.test(read.own_words_quote);
      const style = rtl
        ? ' dir="rtl" style="margin:0 0 16px;font-family:Cairo,sans-serif;line-height:1.9;font-size:15px;color:#0F1519;text-align:right;"'
        : ' style="margin:0 0 16px;font-style:italic;font-size:15px;line-height:1.65;color:#0F1519;"';
      parts.push(`<p${style}>&ldquo;${esc(read.own_words_quote)}&rdquo;</p>`);
      if (read.own_words_read) parts.push(paragraph(esc(read.own_words_read)));
    }
    parts.push(paragraph(
      "This is what the world can see. Aura's members get the read on what only they can see. " +
      "If you want a founding seat, reply to this email and I will read it myself.",
    ));
    parts.push(signature());

    const html = renderEmail({
      preheader: "How your field sees you",
      body: parts.join("\n"),
    });

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "Aura <Mohammad.Mahafdhah@aura-intel.org>",
        to: [email],
        reply_to: "Mohammad.Mahafdhah@aura-intel.org",
        subject: "How your field sees you",
        html,
        tags: [{ name: "email_type", value: "mirror_read" }],
      }),
    });
    if (!res.ok) {
      console.error("[send-mirror-read] Resend failed:", res.status, await res.text());
      return json({ error: "send_failed" }, 502);
    }

    // First address wins; later sends only move the clock.
    await admin
      .from("mirror_reads")
      .update({
        emailed_at: new Date().toISOString(),
        ...(row.emailed_to ? {} : { emailed_to: email }),
      })
      .eq("handle", handle);

    return json({ ok: true });
  } catch (e) {
    console.error("[send-mirror-read] error:", e);
    return json({ error: "send_failed" }, 502);
  }
});