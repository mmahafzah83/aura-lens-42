import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, svix-id, svix-timestamp, svix-signature",
};

const EVENT_MAP: Record<string, string> = {
  "email.sent": "email_sent",
  "email.delivered": "email_delivered",
  "email.opened": "email_opened",
  "email.clicked": "email_clicked",
  "email.bounced": "email_bounced",
  "email.complained": "email_complained",
  "email.delivery_delayed": "email_delayed",
};

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToB64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Svix signature scheme: HMAC-SHA256 over `${id}.${timestamp}.${body}`.
async function verifySvix(
  secret: string,
  svixId: string,
  svixTimestamp: string,
  svixSignature: string,
  rawBody: string,
): Promise<boolean> {
  const keyBytes = b64ToBytes(secret.startsWith("whsec_") ? secret.slice("whsec_".length) : secret);
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${svixId}.${svixTimestamp}.${rawBody}`),
  );
  const expected = bytesToB64(new Uint8Array(mac));
  let ok = false;
  for (const part of svixSignature.split(" ")) {
    const [version, sig] = part.split(",");
    if (version !== "v1" || !sig) continue;
    if (timingSafeEqual(sig, expected)) ok = true;
  }
  return ok;
}

function tagValue(payload: Record<string, unknown>, name: string): string | null {
  const data = (payload?.data ?? {}) as Record<string, unknown>;
  const tags = data.tags;
  if (Array.isArray(tags)) {
    for (const t of tags) {
      const tag = t as { name?: string; value?: string };
      if (tag?.name === name && typeof tag.value === "string") return tag.value;
    }
  } else if (tags && typeof tags === "object") {
    const v = (tags as Record<string, unknown>)[name];
    if (typeof v === "string") return v;
  }
  return null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  const secret = Deno.env.get("RESEND_WEBHOOK_SECRET") || "";
  if (!secret) {
    console.error("resend-webhook: RESEND_WEBHOOK_SECRET is not set — rejecting all requests");
    return json({ error: "Webhook secret not configured" }, 500);
  }

  const svixId = req.headers.get("svix-id") || "";
  const svixTimestamp = req.headers.get("svix-timestamp") || "";
  const svixSignature = req.headers.get("svix-signature") || "";
  if (!svixId || !svixTimestamp || !svixSignature) {
    return json({ error: "Missing signature headers" }, 401);
  }

  // Replay protection: reject timestamps more than 5 minutes from now.
  const ts = Number(svixTimestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 300) {
    return json({ error: "Timestamp out of tolerance" }, 401);
  }

  const rawBody = await req.text();

  let verified = false;
  try {
    verified = await verifySvix(secret, svixId, svixTimestamp, svixSignature, rawBody);
  } catch (e) {
    console.error("resend-webhook: verification error", e instanceof Error ? e.message : String(e));
  }
  if (!verified) return json({ error: "Invalid signature" }, 401);

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const resendType = String(payload.type ?? "");
  const eventName = EVENT_MAP[resendType];
  if (!eventName) return json({ ok: true, ignored: resendType });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const data = (payload.data ?? {}) as Record<string, unknown>;
  const resendId = typeof data.email_id === "string"
    ? data.email_id
    : (typeof data.id === "string" ? data.id : null);
  const userId = tagValue(payload, "user_id");
  const emailType = tagValue(payload, "email_type");
  const messageKey = tagValue(payload, "message_key");
  const clickUrl = ((data.click ?? {}) as Record<string, unknown>)?.link ??
    (typeof data.link === "string" ? data.link : null);
  const occurredAt = typeof payload.created_at === "string"
    ? payload.created_at
    : (typeof data.created_at === "string" ? data.created_at : new Date().toISOString());

  const logFailure = async (message: string) => {
    await admin.from("ef_error_log").insert({
      function_name: "resend-webhook",
      severity: "high",
      error_message: message,
      user_id: userId && UUID_RE.test(userId) ? userId : null,
      context: { resend_id: resendId, event: eventName, resend_type: resendType },
    });
  };

  try {
    if (!userId || !UUID_RE.test(userId)) {
      await logFailure("Verified Resend event carried no usable user_id tag");
      return json({ ok: true, skipped: "no_user_id" });
    }

    // Resend retries; never double-count the same event for the same message.
    if (resendId) {
      const { data: existing } = await admin
        .from("product_events")
        .select("id")
        .eq("event", eventName)
        .eq("props->>resend_id", resendId)
        .limit(1);
      if (existing && existing.length > 0) return json({ ok: true, duplicate: true });
    }

    const { error } = await admin.from("product_events").insert({
      user_id: userId,
      event: eventName,
      occurred_at: occurredAt,
      props: {
        resend_id: resendId,
        email_type: emailType,
        message_key: messageKey,
        click_url: clickUrl ?? null,
        resend_type: resendType,
        event_at: occurredAt,
      },
    });
    if (error) await logFailure(`product_events insert failed: ${error.message}`);
  } catch (e) {
    await logFailure(e instanceof Error ? e.message : String(e));
  }

  // Always 200 for verified events — a 500 makes Resend retry forever.
  return json({ ok: true });
});