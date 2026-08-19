// Public sign-up door. Enforces the per-IP account-creation ceiling before an
// account can exist at all, then creates the account with email verification on.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { LIMITS, clientIp, hashIp } from "../_shared/limits.ts";
import { renderEmail, heading, paragraph } from "../_shared/emailTemplate.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

/** Every refusal leaves a row. A refusal with no evidence is a second bug. */
async function recordRefusal(admin: any, ip_hash: string | null, code: string) {
  try {
    await admin.from("signup_refusals").insert({ ip_hash, code });
  } catch (e) {
    console.error("refusal trace failed", (e as Error)?.message);
  }
}

/**
 * Tells the founder when a network hits the ceiling. At most one email per
 * fingerprint per hour, and a failure here never fails the signup.
 */
async function alertFounder(admin: any, ip_hash: string, attempts: number, shown: string) {
  try {
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { data: last } = await admin
      .from("signup_ceiling_alerts")
      .select("last_sent_at")
      .eq("ip_hash", ip_hash)
      .maybeSingle();
    if (last?.last_sent_at && last.last_sent_at > hourAgo) return;

    const RESEND_KEY = Deno.env.get("RESEND_API_KEY") || "";
    if (!RESEND_KEY) return;

    const html = renderEmail({
      preheader: "A network has reached the signup ceiling.",
      body: [
        heading("The signup ceiling was reached."),
        paragraph(`${attempts} accounts have been opened from this address fingerprint in the last 24 hours.`),
        paragraph(`The ceiling is ${LIMITS.SIGNUPS_PER_IP_PER_DAY} accounts per fingerprint per 24 hours.`),
        paragraph(`Address fingerprint: ${ip_hash}`),
        paragraph(`The person on the other end just read: "${shown}"`),
      ].join(""),
    });
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "Aura <invites@aura-intel.org>",
        to: ["mmahafzah8386@gmail.com"],
        subject: "Aura — signup ceiling reached",
        html,
      }),
    });
    if (!resp.ok) {
      console.error(`ceiling alert failed [${resp.status}]: ${await resp.text()}`);
      return;
    }
    await admin
      .from("signup_ceiling_alerts")
      .upsert({ ip_hash, last_sent_at: new Date().toISOString() }, { onConflict: "ip_hash" });
  } catch (e) {
    console.error("ceiling alert threw", (e as Error)?.message);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { email, password, origin, consent_version } = await req.json();
    const addr = String(email || "").trim().toLowerCase();
    const pwd = String(password || "");
    if (!addr.includes("@") || addr.length < 5) return json({ error: "Enter a valid email address." }, 400);
    if (pwd.length < 8) return json({ error: "Use eight characters or more." }, 400);
    const version = String(consent_version || "").trim();
    if (!version) return json({ error: "Consent is required before an account can be opened." }, 400);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // GoTrue deliberately disguises an existing email as a successful sign-up.
    // Detect it here so retries do not consume the per-IP new-account quota and
    // the client can show an honest route back to sign-in.
    let existing = false;
    for (let page = 1; page <= 10 && !existing; page += 1) {
      const { data: usersPage, error: usersError } = await admin.auth.admin.listUsers({
        page,
        perPage: 1000,
      });
      if (usersError) {
        console.error("existing-account lookup failed", usersError);
        const fp = clientIp(req);
        await recordRefusal(admin, fp ? await hashIp(fp) : null, "temporarily_unavailable");
        return json({ ok: false, code: "temporarily_unavailable", error: "Account lookup failed. Try again." });
      }
      existing = usersPage.users.some((user) => user.email?.toLowerCase() === addr);
      if (usersPage.users.length < 1000) break;
    }
    if (existing) return json({ ok: true, existing: true });

    // No address header means no fingerprint. Such a caller is not counted
    // against any bucket — pooling them all together would refuse strangers
    // for someone else's traffic.
    const rawIp = clientIp(req);
    const ip_hash = rawIp ? await hashIp(rawIp) : null;
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    let count = 0;
    if (ip_hash) {
      const { count: c } = await admin
        .from("signup_attempts")
        .select("id", { count: "exact", head: true })
        .eq("ip_hash", ip_hash)
        .gte("created_at", since);
      count = c ?? 0;
    }

    if (ip_hash && count >= LIMITS.SIGNUPS_PER_IP_PER_DAY) {
      // This is an expected product state, not a crashed function. Keeping the
      // HTTP response successful prevents the client runtime from treating the
      // limit as an uncaught Edge Function error while preserving the block.
      const shown =
        "That is as many accounts as can be opened from this network today. It lifts in 24 hours. Write to support@aura-intel.org and it is sorted by hand in the meantime.";
      await recordRefusal(admin, ip_hash, "signup_limit");
      await alertFounder(admin, ip_hash, count, shown);
      return json({ ok: false, code: "signup_limit", error: shown });
    }

    // The account is created already confirmed. A verification round-trip used
    // to break the free journey: the new member could not sign in, so the
    // anonymous run was never claimed onto the account.
    const { data: signUpData, error } = await admin.auth.admin.createUser({
      email: addr,
      password: pwd,
      email_confirm: true,
      user_metadata: { password_set: true },
    });
    if (error) {
      await recordRefusal(admin, ip_hash, "create_user_rejected");
      return json({ error: error.message }, 400);
    }

    if (ip_hash) await admin.from("signup_attempts").insert({ ip_hash });

    // Record the consent against the profile row. A ticked box that leaves no
    // record proves nothing later.
    const newUserId = signUpData?.user?.id;
    let onboardingStep = 0;
    if (newUserId) {
      const { error: profileError } = await admin
        .from("diagnostic_profiles")
        .upsert(
          {
            user_id: newUserId,
            consented_at: new Date().toISOString(),
            consent_version: version,
          },
          { onConflict: "user_id" },
        );
      if (profileError) console.error("consent record failed", profileError);
      const { data: prof } = await admin
        .from("diagnostic_profiles")
        .select("onboarding_step")
        .eq("user_id", newUserId)
        .maybeSingle();
      onboardingStep = Number((prof as any)?.onboarding_step ?? 0);
    }

    // Our own welcome, in our own shell. A failure here never fails sign-up.
    try {
      const RESEND_KEY = Deno.env.get("RESEND_API_KEY") || "";
      if (RESEND_KEY) {
        // The read is written after this email is composed, so the email must
        // not claim it is already waiting. And the CTA has to survive a second
        // device: the sign-in door carries the destination, never becomes it.
        const base = origin || "https://www.aura-intel.org";
        const dest = onboardingStep >= 4 ? "/home" : "/onboarding";
        const html = renderEmail({
          preheader: "Your account is open. Your read is being written now.",
          body: [
            heading("Your account is open."),
            paragraph("Everything you just answered is saved to it. Your read is being written now."),
          ].join(""),
          cta: {
            href: `${base}/auth?next=${encodeURIComponent(dest)}`,
            label: "Open your read",
          },
        });
        const resp = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: "Aura <invites@aura-intel.org>",
            to: [addr],
            subject: "Welcome to Aura",
            html,
          }),
        });
        if (!resp.ok) console.error(`welcome email failed [${resp.status}]: ${await resp.text()}`);
      }
    } catch (e) {
      console.error("welcome email threw", (e as Error)?.message);
    }

    return json({ ok: true, existing: false });
  } catch (e) {
    return json({ error: (e as Error)?.message || "Something went wrong. Try again." }, 500);
  }
});
