// Redirects to a fresh short-lived signed URL for a document.
// Using an edge-function URL avoids ad-blocker rules that target *.supabase.co/storage paths.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function htmlError(status: number, message: string) {
  const body = `<!doctype html><html><head><meta charset="utf-8"><title>${message}</title></head><body style="font-family:system-ui;background:#0b0b0b;color:#eee;padding:48px;text-align:center"><h1 style="font-size:18px;font-weight:600">${message}</h1><p style="color:#888;font-size:13px">You can close this tab and try again.</p></body></html>`;
  return new Response(body, { status, headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" } });
}

function jsonError(message: string, stage: string, status = 200) {
  return new Response(JSON.stringify({ ok: false, error: message, stage }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Inputs can come from query string (GET redirect) or JSON body (POST/invoke).
  const url = new URL(req.url);
  let documentId = url.searchParams.get("id");
  let mode = url.searchParams.get("mode") === "download" ? "download" : "inline";
  // "json" → return { signedUrl } instead of 302. Used by supabase.functions.invoke
  // to avoid top-level browser navigation to *.functions.supabase.co (ad-blocker safe).
  let format: "redirect" | "json" = url.searchParams.get("format") === "json" ? "json" : "redirect";
  let token = url.searchParams.get("token") || req.headers.get("Authorization")?.replace("Bearer ", "");

  if (req.method === "POST") {
    try {
      const body = await req.json();
      if (body?.id) documentId = body.id;
      if (body?.mode === "download") mode = "download";
      // Default JSON for POST/invoke flows.
      format = body?.format === "redirect" ? "redirect" : "json";
    } catch { /* empty body is fine */ }
  }

  const fail = (status: number, msg: string, stage: string) =>
    format === "json" ? jsonError(msg, stage) : htmlError(status, msg);

  try {
    if (!documentId) return fail(400, "Missing document id", "missing_id");
    if (!token) return fail(401, "Authentication failed", "no_token");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey);
    const { data: userData, error: userErr } = await userClient.auth.getUser(token);
    if (userErr || !userData?.user?.id) {
      console.error("[open-document] auth_failed", userErr?.message);
      return fail(401, "Authentication failed", "auth_failed");
    }
    const userId = userData.user.id;

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: doc, error: docErr } = await admin
      .from("documents")
      .select("id, user_id, file_url, filename")
      .eq("id", documentId)
      .maybeSingle();

    if (docErr || !doc) return fail(404, "Document not found", "row_lookup_failed");
    if (doc.user_id !== userId) return fail(403, "Not authorized", "ownership_failed");
    if (!doc.file_url) return fail(404, "File path missing", "no_file_url");

    const path = doc.file_url.startsWith("http")
      ? doc.file_url.replace(/^https?:\/\/[^/]+\/storage\/v1\/object\/(public|sign)\/documents\//, "")
      : doc.file_url;

    const opts: { download?: string } = {};
    if (mode === "download") opts.download = (doc.filename || path.split("/").pop() || "document").replace(/^\d+-/, "");

    const { data: signed, error: signErr } = await admin.storage
      .from("documents")
      .createSignedUrl(path, 60 * 10, opts);

    if (signErr || !signed?.signedUrl) {
      console.error("[open-document] signed_url_generation_failed", { path, err: signErr?.message });
      return fail(500, "Could not generate signed URL", "signed_url_generation_failed");
    }

    if (format === "json") {
      return new Response(JSON.stringify({ ok: true, signedUrl: signed.signedUrl, filename: doc.filename }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(null, {
      status: 302,
      headers: { ...corsHeaders, Location: signed.signedUrl, "Cache-Control": "no-store" },
    });
  } catch (e) {
    console.error("[open-document]", e);
    return fail(500, "Could not open document", "exception");
  }
});
