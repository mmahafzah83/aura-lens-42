import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { text, table, record_id } = await req.json();
    if (!text || !table || !record_id) {
      return new Response(
        JSON.stringify({ error: "text, table, and record_id required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Truncate text to ~8000 tokens (~32000 chars) for embedding model
    const truncated = text.slice(0, 32000);

    const embRes = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "text-embedding-3-small",
        input: truncated,
      }),
    });

    if (!embRes.ok) {
      const errText = await embRes.text();
      console.error("OpenAI embedding error:", embRes.status, errText);
      throw new Error(`Embedding API error: ${embRes.status}`);
    }

    const embData = await embRes.json();
    const embedding = embData.data?.[0]?.embedding;
    if (!embedding) throw new Error("No embedding returned");

    // Format as pgvector string
    const vectorStr = `[${embedding.join(",")}]`;

    // Update the record with the embedding
    const { error: updateErr } = await adminClient
      .from(table)
      .update({ embedding: vectorStr })
      .eq("id", record_id);

    if (updateErr) {
      console.error("Embedding update error:", updateErr);
      throw new Error(`Failed to store embedding: ${updateErr.message}`);
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("generate-embedding error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
