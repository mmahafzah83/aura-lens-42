import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const MAX_INVITES = 3;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userErr } = await userClient.auth.getUser(token);
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const callerId = userData.user.id;
    const callerEmail = userData.user.email || "";
    const admin = createClient(supabaseUrl, serviceKey);

    const body = await req.json().catch(() => ({}));
    const action = body.action || "invite";

    // Always compute remaining
    const { count: usedCount } = await admin
      .from("beta_allowlist")
      .select("id", { count: "exact", head: true })
      .eq("invited_by", callerId);
    const used = usedCount || 0;
    const remaining = Math.max(0, MAX_INVITES - used);

    if (action === "count") {
      return new Response(JSON.stringify({ used, remaining, max: MAX_INVITES }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // action === "invite"
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const note = typeof body.note === "string" ? body.note.trim().slice(0, 500) : "";

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return new Response(JSON.stringify({ error: "Please enter a valid email." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (remaining <= 0) {
      return new Response(JSON.stringify({ error: "You've used all 3 invitations." }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check for existing entry
    const { data: existing } = await admin
      .from("beta_allowlist")
      .select("id, status, invited_by")
      .eq("email", email)
      .maybeSingle();

    if (existing) {
      return new Response(JSON.stringify({ error: "This email is already on the list." }), {
        status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { error: insertErr } = await admin.from("beta_allowlist").insert({
      email,
      status: "pending",
      source: "colleague_invite",
      personal_note: note || null,
      invited_by: callerId,
      requested_at: new Date().toISOString(),
    });

    if (insertErr) {
      console.error("[colleague-invite] insert failed", insertErr);
      return new Response(JSON.stringify({ error: "Could not record invitation." }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Best-effort notification email to admin via Resend (does not block success)
    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (resendKey) {
      try {
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: "Aura <hello@aura-intel.org>",
            to: ["mohammad@aura-intel.org"],
            subject: `New colleague invite: ${email}`,
            html: `<p><strong>${callerEmail}</strong> invited <strong>${email}</strong> to the Aura beta.</p>${note ? `<p>Note: ${note}</p>` : ""}`,
          }),
        });
      } catch (e) {
        console.warn("[colleague-invite] notify admin failed", e);
      }
    }

    return new Response(
      JSON.stringify({ ok: true, remaining: remaining - 1 }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    console.error("[colleague-invite] error", e);
    return new Response(JSON.stringify({ error: e?.message || "Server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});