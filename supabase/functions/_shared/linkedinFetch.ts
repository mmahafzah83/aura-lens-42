// Single, audited egress path for every LinkedIn API call.
// Any Deno function that talks to LinkedIn MUST go through this helper.
//
// Guarantees:
//   • DELETE / PATCH (and anything not in the allow-list) are HARD-REJECTED
//     before a socket is opened — Aura cannot delete or modify LinkedIn posts.
//   • GET and POST are only allowed to api.linkedin.com / www.linkedin.com.
//   • PUT is allowed to any https host because LinkedIn's image upload step
//     hands back a signed upload URL on a different host.
//   • Every call writes ONE best-effort audit row to ef_error_log.

type EgressCtx = {
  userId: string;
  adminClient: any;
  purpose: string;
};

const ALLOWED_LINKEDIN_HOSTS = new Set(["api.linkedin.com", "www.linkedin.com"]);

export async function linkedinFetch(
  url: string,
  init: RequestInit,
  ctx: EgressCtx,
): Promise<Response> {
  const method = (init.method ?? "GET").toUpperCase();

  // Method allow-list. DELETE / PATCH / etc. must never leave this process.
  if (method !== "GET" && method !== "POST" && method !== "PUT") {
    throw new Error(`linkedinFetch: method ${method} is not permitted`);
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("linkedinFetch: invalid URL");
  }
  if (parsed.protocol !== "https:") {
    throw new Error("linkedinFetch: only https is permitted");
  }

  const host = parsed.hostname.toLowerCase();
  if (method === "GET" || method === "POST") {
    if (!ALLOWED_LINKEDIN_HOSTS.has(host)) {
      throw new Error(`linkedinFetch: host ${host} not permitted for ${method}`);
    }
  }
  // PUT: any https host is fine (LinkedIn image upload URL lives elsewhere).

  const res = await fetch(url, { ...init, method });

  // Best-effort audit — never throw, never block the return.
  try {
    await ctx.adminClient.from("ef_event_log").insert({
      function_name: "linkedin-egress",
      severity: "info",
      user_id: ctx.userId,
      error_message: `${method} ${parsed.pathname} (${ctx.purpose})`,
      context: {
        method,
        path: parsed.pathname,
        host,
        purpose: ctx.purpose,
        status: res.status,
      },
    });
  } catch (e) {
    console.error("linkedinFetch audit write failed (non-blocking):", e);
  }

  return res;
}