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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const documentId = url.searchParams.get("id");
    const mode = url.searchParams.get("mode") === "download" ? "download" : "inline";
    const token = url.searchParams.get("token") || req.headers.get("Authorization")?.replace("Bearer ", "");

    if (!documentId) return htmlError(400, "Missing document id");
    if (!token) return htmlError(401, "Not authorized");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Validate the user via the provided JWT (use getUser — getClaims is not in v2.45.0).
    const userClient = createClient(supabaseUrl, anonKey);
    const { data: userData, error: userErr } = await userClient.auth.getUser(token);
    if (userErr || !userData?.user?.id) {
      console.error("[open-document] auth_failed", userErr?.message);
      return htmlError(401, "Authentication failed");
    }
    const userId = userData.user.id;

    // Look up the document, scoped to the requesting user.
    const admin = createClient(supabaseUrl, serviceKey);
    const { data: doc, error: docErr } = await admin
      .from("documents")
      .select("id, user_id, file_url, filename")
      .eq("id", documentId)
      .maybeSingle();

    if (docErr || !doc) return htmlError(404, "Document not found");
    if (doc.user_id !== userId) return htmlError(403, "Not authorized");
    if (!doc.file_url) return htmlError(404, "No file attached");

    // Normalize storage path (strip any accidental absolute URL prefix).
    const path = doc.file_url.startsWith("http")
      ? doc.file_url.replace(/^https?:\/\/[^/]+\/storage\/v1\/object\/(public|sign)\/documents\//, "")
      : doc.file_url;

    const opts: { download?: string } = {};
    if (mode === "download") opts.download = (doc.filename || path.split("/").pop() || "document").replace(/^\d+-/, "");

    const { data: signed, error: signErr } = await admin.storage
      .from("documents")
      .createSignedUrl(path, 60 * 10, opts);

    if (signErr || !signed?.signedUrl) return htmlError(500, "Could not generate file link");

    return new Response(null, {
      status: 302,
      headers: { ...corsHeaders, Location: signed.signedUrl, "Cache-Control": "no-store" },
    });
  } catch (e) {
    console.error("[open-document]", e);
    return htmlError(500, "Could not open document");
  }
});
