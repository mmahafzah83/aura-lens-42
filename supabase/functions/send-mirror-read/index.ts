/**
 * SEND-MIRROR-READ — posts an existing Mirror read to an inbox.
 *
 * It never generates. The read is built by `mirror-read` and nowhere else;
 * this function only reads `mirror_reads` and hands it to Resend.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";
import { mirrorReadEmail } from "../_shared/personEmails.ts";
import { langFromBody } from "../_shared/emailLang.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

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
      .select("handle, read, read_ar, name, emailed_at, emailed_to")
      .eq("handle", handle)
      .maybeSingle();
    if (!row?.read) return json({ error: "not_found" }, 404);

    // A public reader has no account: the request's language, else English.
    // In Arabic, the saved Arabic read when there is one; otherwise the stored read.
    const lang = langFromBody(body?.lang) ?? "en";
    const read = ((lang === "ar" && (row as any).read_ar) ? (row as any).read_ar : row.read) as Record<string, string | undefined>;

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) return json({ error: "send_failed" }, 502);

    const mail = mirrorReadEmail(lang, read);

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "KnownBy <Mohammad.Mahafdhah@aura-intel.org>",
        to: [email],
        reply_to: "Mohammad.Mahafdhah@aura-intel.org",
        subject: mail.subject,
        html: mail.html,
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