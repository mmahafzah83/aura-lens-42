// linkedin-token-refresh — daily scheduled refresh
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const LINKEDIN_CLIENT_ID = Deno.env.get("LINKEDIN_CLIENT_ID");
  const LINKEDIN_CLIENT_SECRET = Deno.env.get("LINKEDIN_CLIENT_SECRET");

  if (!LINKEDIN_CLIENT_ID || !LINKEDIN_CLIENT_SECRET) {
    return json({ error: "LinkedIn client credentials not configured" }, 500);
  }

  try {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const cutoff = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

    const { data: rows, error: selErr } = await admin
      .from("linkedin_connections")
      .select("id, user_id, refresh_token, token_expires_at")
      .eq("status", "active")
      .not("refresh_token", "is", null)
      .lt("token_expires_at", cutoff);

    if (selErr) return json({ error: selErr.message }, 500);

    const candidates = (rows ?? []).filter(
      (r: any) => typeof r.refresh_token === "string" && r.refresh_token.length > 0,
    );

    let refreshed = 0;
    let failed = 0;

    for (const row of candidates) {
      try {
        const body = new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: row.refresh_token,
          client_id: LINKEDIN_CLIENT_ID,
          client_secret: LINKEDIN_CLIENT_SECRET,
        });

        const res = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: body.toString(),
        });

        if (res.status === 200) {
          const payload = await res.json();
          const newAccess = payload.access_token as string;
          const expiresIn = Number(payload.expires_in ?? 0);
          const newRefresh = payload.refresh_token as string | undefined;
          const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
          const now = new Date().toISOString();

          await admin
            .from("linkedin_connections")
            .update({
              access_token: newAccess,
              token_expires_at: expiresAt,
              refresh_token: newRefresh && newRefresh.length > 0 ? newRefresh : row.refresh_token,
              status: "active",
              last_synced_at: now,
              updated_at: now,
            })
            .eq("id", row.id);

          refreshed++;
        } else {
          const detail = await res.text();
          console.error("linkedin-token-refresh failed", {
            id: row.id,
            status: res.status,
            detail,
          });
          await admin
            .from("linkedin_connections")
            .update({ status: "needs_reconnect", updated_at: new Date().toISOString() })
            .eq("id", row.id);
          failed++;
        }
      } catch (err) {
        console.error("linkedin-token-refresh exception", row.id, err);
        failed++;
      }
    }

    return json({ checked: candidates.length, refreshed, failed });
  } catch (err) {
    console.error("linkedin-token-refresh error:", err);
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});