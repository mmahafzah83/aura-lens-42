import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function extractTextFromHtml(html: string): string {
  // Remove script and style blocks
  let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
  // Remove nav and footer blocks
  text = text.replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, "");
  text = text.replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, "");
  text = text.replace(/<header[^>]*>[\s\S]*?<\/header>/gi, "");
  // Remove all remaining HTML tags
  text = text.replace(/<[^>]+>/g, " ");
  // Decode common HTML entities
  text = text.replace(/&nbsp;/g, " ");
  text = text.replace(/&amp;/g, "&");
  text = text.replace(/&lt;/g, "<");
  text = text.replace(/&gt;/g, ">");
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#39;/g, "'");
  // Collapse whitespace
  text = text.replace(/\s+/g, " ").trim();
  return text;
}

function extractTitle(html: string): string {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? match[1].replace(/\s+/g, " ").trim() : "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Verify user
    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
    const { data: { user }, error: authError } = await anonClient.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { type, content, metadata, source_url } = body;

    if (!type || !content) {
      return new Response(JSON.stringify({ error: "type and content are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check for duplicate URL
    if (type === "link" && source_url) {
      const { data: existing } = await supabase
        .from("captures")
        .select("id, created_at")
        .eq("user_id", user.id)
        .eq("source_url", source_url)
        .limit(1);

      if (existing && existing.length > 0) {
        return new Response(JSON.stringify({
          error: "duplicate_url",
          processing_status: "duplicate",
          message: `You already captured this URL on ${new Date(existing[0].created_at).toLocaleDateString()}.`,
          existing_id: existing[0].id,
          created_at: existing[0].created_at,
        }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Insert the capture record
    const { data: capture, error: insertError } = await supabase
      .from("captures")
      .insert({
        user_id: user.id,
        type,
        raw_content: content,
        source_url: source_url || null,
        metadata: metadata || {},
        processing_status: "processing",
      })
      .select("id")
      .single();

    if (insertError) {
      return new Response(JSON.stringify({ error: insertError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Process based on type
    let extracted_text = content;
    let extracted_title: string | null = null;

    try {
      if (type === "link") {
        const targetUrl = source_url || content;
        let fetchSuccess = false;

        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 10000);

          const pageRes = await fetch(targetUrl, {
            headers: {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
              Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
              "Accept-Language": "en-US,en;q=0.9",
            },
            signal: controller.signal,
          });
          clearTimeout(timer);

          if (pageRes.ok) {
            const html = await pageRes.text();
            extracted_title = extractTitle(html) || null;
            const bodyText = extractTextFromHtml(html);
            if (bodyText.length > 50) {
              extracted_text = bodyText.substring(0, 3000);
              fetchSuccess = true;
            }
          }
        } catch (fetchErr) {
          console.warn("Failed to fetch link content:", (fetchErr as Error).message);
        }

        // Fallback: save URL as content, domain as title
        if (!fetchSuccess) {
          extracted_text = targetUrl;
          try {
            extracted_title = new URL(targetUrl).hostname;
          } catch {
            extracted_title = targetUrl.slice(0, 60);
          }
        }

        // Also call summarize-link for AI summary (fire-and-forget style, but await for capture record)
        const { data: summaryData, error: summaryError } = await supabase.functions.invoke("summarize-link", {
          body: { url: targetUrl },
        });

        const captureMetadata = { ...metadata };
        if (!summaryError && summaryData && !summaryData.error) {
          captureMetadata.title = summaryData.title || extracted_title;
          captureMetadata.summary = summaryData.summary;
          captureMetadata.skill_pillar = summaryData.skill_pillar;
          extracted_title = summaryData.title || extracted_title;
        }

        await supabase.from("captures").update({
          extracted_text,
          metadata: captureMetadata,
          processing_status: "completed",
        }).eq("id", capture.id);
      } else {
        // For text, voice, image, document — store content directly
        await supabase.from("captures").update({
          extracted_text,
          processing_status: "completed",
        }).eq("id", capture.id);
      }
    } catch (processingError: any) {
      await supabase.from("captures").update({
        processing_status: "failed",
        error_message: processingError.message || "Processing failed",
      }).eq("id", capture.id);
    }

    // Fetch the final state
    const { data: finalCapture } = await supabase
      .from("captures")
      .select("*")
      .eq("id", capture.id)
      .single();

    let newEntryId: string | null = null;
    try {
      const { data: entryRow, error: entryErr } = await supabase
        .from("entries")
        .insert({
          user_id: user.id,
          type: type === "link" ? "link" : type,
          title: extracted_title || null,
          content: extracted_text?.slice(0, 10000) || content,
          summary: finalCapture?.metadata?.summary || null,
          image_url: (type === "link") ? (source_url || content) : null,
          skill_pillar: finalCapture?.metadata?.skill_pillar || null,
        })
        .select("id")
        .single();

      if (!entryErr && entryRow?.id) {
        newEntryId = entryRow.id;
        console.log("[ingest-capture] entries insert ok:", newEntryId);
        supabase.functions.invoke("detect-signals-v2", {
          body: { entry_id: newEntryId, user_id: user.id },
        }).catch((e: any) =>
          console.warn("[ingest-capture] detect-signals-v2 invoke failed:", e?.message)
        );
        console.log("[ingest-capture] detect-signals-v2 invoked for entry:", newEntryId);
      }
    } catch (entryWriteErr: any) {
      console.warn("[ingest-capture] entries write failed (non-fatal):", entryWriteErr?.message);
    }

    // Include extracted content for the frontend to use
    return new Response(JSON.stringify({
      ...finalCapture,
      extracted_title: extracted_title,
      extracted_content: extracted_text,
      original_url: source_url || content,
    }), {
      status: 201,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
