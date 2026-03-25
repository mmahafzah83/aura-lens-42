import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");

  // This is a browser redirect endpoint - returns HTML
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const LINKEDIN_CLIENT_ID = Deno.env.get("LINKEDIN_CLIENT_ID")!;
  const LINKEDIN_CLIENT_SECRET = Deno.env.get("LINKEDIN_CLIENT_SECRET")!;
  const redirectUri = `${SUPABASE_URL}/functions/v1/linkedin-oauth-callback`;

  // Get the origin from the state or use a default
  const appOrigin = url.searchParams.get("state") || "";

  if (error || !code) {
    return new Response(renderHTML("error", "LinkedIn authorization was denied or failed."), {
      headers: { "Content-Type": "text/html" },
    });
  }

  try {
    // Exchange code for access token
    const tokenRes = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: LINKEDIN_CLIENT_ID,
        client_secret: LINKEDIN_CLIENT_SECRET,
      }),
    });

    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || !tokenData.access_token) {
      console.error("Token exchange failed:", tokenData);
      return new Response(renderHTML("error", "Failed to obtain LinkedIn access token."), {
        headers: { "Content-Type": "text/html" },
      });
    }

    const accessToken = tokenData.access_token;
    const refreshToken = tokenData.refresh_token || null;
    const expiresIn = tokenData.expires_in || 5184000; // 60 days default

    // Fetch LinkedIn profile using userinfo endpoint
    const profileRes = await fetch("https://api.linkedin.com/v2/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const profile = await profileRes.json();

    const linkedinId = profile.sub || "unknown";
    const displayName = profile.name || profile.given_name || "LinkedIn User";

    // Store connection using service role
    const supabaseAdmin = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // The user_id will be set via a temp claim passed through state
    // For now, we store with a placeholder and the frontend will link it
    // Actually, we need the user's JWT. Let's use a different approach:
    // Store the token temporarily and let the frontend claim it

    const tempId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    // Store in a temp way - the frontend will call to claim this
    await supabaseAdmin.from("linkedin_connections").upsert({
      id: tempId,
      user_id: "00000000-0000-0000-0000-000000000000", // placeholder
      linkedin_id: linkedinId,
      display_name: displayName,
      access_token: accessToken,
      refresh_token: refreshToken,
      token_expires_at: expiresAt,
      scopes: ["openid", "profile", "email"],
      status: "pending_claim",
    });

    // Redirect back to app with temp ID
    return new Response("", {
      status: 302,
      headers: {
        Location: `${appOrigin || "https://aura-lens-42.lovable.app"}/dashboard?linkedin_temp_id=${tempId}`,
      },
    });
  } catch (err) {
    console.error("LinkedIn OAuth callback error:", err);
    return new Response(renderHTML("error", `OAuth error: ${err.message}`), {
      headers: { "Content-Type": "text/html" },
    });
  }
});

function renderHTML(status: string, message: string) {
  return `<!DOCTYPE html>
<html><head><title>LinkedIn Connection</title></head>
<body style="font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;background:#0B0C0F;color:#fff;">
<div style="text-align:center;max-width:400px;">
  <h2>${status === "error" ? "❌ Connection Failed" : "✅ Connected"}</h2>
  <p style="color:#999;">${message}</p>
  <p style="color:#666;font-size:14px;">You can close this window.</p>
</div>
</body></html>`;
}
