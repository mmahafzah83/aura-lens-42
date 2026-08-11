import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { withObserve } from "../_shared/observe.ts";
import { nameFromLinkedIn, vanityFromLinkedIn, profileUrlFor } from "../_shared/identity.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(withObserve("linkedin-oauth-callback", async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const LINKEDIN_CLIENT_ID = Deno.env.get("LINKEDIN_CLIENT_ID");
  const LINKEDIN_CLIENT_SECRET = Deno.env.get("LINKEDIN_CLIENT_SECRET");

  if (!LINKEDIN_CLIENT_ID || !LINKEDIN_CLIENT_SECRET) {
    return new Response(JSON.stringify({ error: "LinkedIn credentials not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    // Authenticate the calling user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { code, redirect_uri } = await req.json();
    if (!code) {
      return new Response(JSON.stringify({ error: "Missing authorization code" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!redirect_uri) {
      return new Response(JSON.stringify({ error: "Missing redirect_uri" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Exchange code for access token
    const tokenRes = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri,
        client_id: LINKEDIN_CLIENT_ID,
        client_secret: LINKEDIN_CLIENT_SECRET,
      }),
    });

    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || !tokenData.access_token) {
      console.error("Token exchange failed:", tokenData);
      const errorMsg = tokenData.error_description || tokenData.error || "Token exchange failed";
      return new Response(JSON.stringify({ error: errorMsg }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const accessToken = tokenData.access_token;
    const refreshToken = tokenData.refresh_token || null;
    const grantedScopes = (typeof tokenData.scope === "string" && tokenData.scope.trim()) ? tokenData.scope.split(/[\s,]+/).filter(Boolean) : ["r_basicprofile", "w_member_social", "r_member_postAnalytics", "r_member_profileAnalytics"];
    const expiresIn = tokenData.expires_in || 5184000;

    // Fetch LinkedIn profile. vanityName must be asked for explicitly — it is
    // what gives us the member's handle and public profile URL.
    const profileRes = await fetch(
      "https://api.linkedin.com/v2/me?projection=(id,localizedFirstName,localizedLastName,vanityName)",
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    let profile = await profileRes.json();
    if (!profileRes.ok) {
      console.error("LinkedIn /v2/me failed:", profileRes.status, JSON.stringify(profile));
      profile = {};
    }

    // OIDC userinfo carries the member's own preferred name spelling, which is
    // more accurate than the localized first/last split.
    let userinfo: any = {};
    try {
      const uiRes = await fetch("https://api.linkedin.com/v2/userinfo", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (uiRes.ok) userinfo = await uiRes.json();
    } catch (_) { /* optional */ }

    const linkedinId = profile.id || userinfo.sub || "unknown";
    const displayName =
      nameFromLinkedIn(userinfo) || nameFromLinkedIn(profile) || "LinkedIn User";
    const handle = vanityFromLinkedIn(profile) || vanityFromLinkedIn(userinfo);
    const profileUrl = profileUrlFor(handle);
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    const adminClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // The row carries facts this callback does not know — whether a real read
    // confirmed the address, follower counts, posting permission, the claim
    // token and the timezone. Deleting the row destroyed all of them, so the
    // existing values are read first and carried through an upsert.
    const { data: existing } = await adminClient
      .from("linkedin_connections")
      .select("source_status, followers_total, can_post, claim_token_hash, timezone")
      .eq("user_id", user.id)
      .maybeSingle();

    const { data: snapshot } = await adminClient
      .from("linkedin_profile_snapshots")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle();

    const preserved: Record<string, unknown> = {};
    if (existing) {
      for (const k of ["source_status", "followers_total", "can_post", "claim_token_hash", "timezone"] as const) {
        const v = (existing as Record<string, unknown>)[k];
        if (v !== null && v !== undefined) preserved[k] = v;
      }
    }
    // A real profile read outranks whatever the old row said.
    if (snapshot) preserved.source_status = "verified_by_read";

    // A failed /v2/me read must never overwrite a good, confirmed address with
    // nulls or the "unknown" / "LinkedIn User" placeholders. Each identity key
    // is included only when this read actually produced a value.
    const identity: Record<string, unknown> = {};
    if (profile.id) identity.linkedin_id = profile.id;
    else if (userinfo.sub) identity.linkedin_id = userinfo.sub;
    const freshName = nameFromLinkedIn(userinfo) || nameFromLinkedIn(profile);
    if (freshName) {
      identity.display_name = freshName;
      identity.profile_name = freshName;
    }
    if (handle) identity.handle = handle;
    if (profileUrl) identity.profile_url = profileUrl;

    const { data: connection, error: insertError } = await adminClient
      .from("linkedin_connections")
      .upsert({
        user_id: user.id,
        access_token: accessToken,
        refresh_token: refreshToken,
        token_expires_at: expiresAt,
        scopes: grantedScopes,
        status: "active",
        connected_at: new Date().toISOString(),
        ...identity,
        ...preserved,
      }, { onConflict: "user_id" })
      .select("id, display_name, connected_at")
      .single();

    if (insertError) {
      console.error("DB upsert error:", insertError);
      return new Response(JSON.stringify({ error: "Failed to store connection" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      success: true,
      connection: {
        id: connection.id,
        display_name: connection.display_name,
        connected_at: connection.connected_at,
      },
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("LinkedIn OAuth callback error:", err);
    return new Response(JSON.stringify({ error: "An unexpected error occurred" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
}));
