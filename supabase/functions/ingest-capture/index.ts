import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";

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
    let processing_status = "completed";
    let error_message: string | null = null;

    try {
      if (type === "link") {
        // Summarize the link
        const { data: summaryData, error: summaryError } = await supabase.functions.invoke("summarize-link", {
          body: { url: source_url || content },
        });
        if (!summaryError && summaryData && !summaryData.error) {
          extracted_text = [summaryData.title, summaryData.summary].filter(Boolean).join("\n\n");
          await supabase.from("captures").update({
            extracted_text,
            metadata: { ...metadata, title: summaryData.title, summary: summaryData.summary, skill_pillar: summaryData.skill_pillar },
            processing_status: "completed",
          }).eq("id", capture.id);
        } else {
          // Still mark as completed, just without extraction
          await supabase.from("captures").update({
            extracted_text: content,
            processing_status: "completed",
          }).eq("id", capture.id);
        }
      } else {
        // For text, voice, image, document — store content directly
        await supabase.from("captures").update({
          extracted_text,
          processing_status: "completed",
        }).eq("id", capture.id);
      }
    } catch (processingError: any) {
      processing_status = "failed";
      error_message = processingError.message || "Processing failed";
      await supabase.from("captures").update({
        processing_status: "failed",
        error_message,
      }).eq("id", capture.id);
    }

    // Fetch the final state
    const { data: finalCapture } = await supabase
      .from("captures")
      .select("*")
      .eq("id", capture.id)
      .single();

    return new Response(JSON.stringify(finalCapture), {
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
