import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function chunkText(text: string, chunkSize = 800, overlap = 100): string[] {
  const chunks: string[] = [];
  if (!text || text.trim().length === 0) return chunks;

  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + chunkSize, text.length);
    // Try to break at sentence boundary
    if (end < text.length) {
      const lastPeriod = text.lastIndexOf(".", end);
      const lastNewline = text.lastIndexOf("\n", end);
      const breakPoint = Math.max(lastPeriod, lastNewline);
      if (breakPoint > start + chunkSize * 0.5) end = breakPoint + 1;
    }
    const chunk = text.slice(start, end).trim();
    if (chunk.length > 20) chunks.push(chunk);
    start = end - overlap;
    if (start >= text.length) break;
  }
  return chunks;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { document_id } = await req.json();
    if (!document_id) {
      return new Response(JSON.stringify({ error: "document_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    // User client for auth
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await userClient.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Service client for storage + inserting chunks
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Fetch document record
    const { data: doc, error: docErr } = await userClient
      .from("documents")
      .select("*")
      .eq("id", document_id)
      .single();

    if (docErr || !doc) {
      return new Response(JSON.stringify({ error: "Document not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Download file from storage
    const storagePath = doc.file_url.includes("/storage/v1/")
      ? doc.file_url.split("/documents/")[1]
      : doc.file_url;

    const { data: fileData, error: dlErr } = await adminClient.storage
      .from("documents")
      .download(storagePath);

    if (dlErr || !fileData) {
      await adminClient.from("documents").update({ status: "error" }).eq("id", document_id);
      return new Response(JSON.stringify({ error: "Could not download file" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Convert to base64 in chunks to avoid stack overflow
    const arrayBuffer = await fileData.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    const chunkSize = 8192;
    let binary = "";
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
      for (let j = 0; j < chunk.length; j++) {
        binary += String.fromCharCode(chunk[j]);
      }
    }
    const base64 = btoa(binary);

    let mimeType = "application/octet-stream";
    const ft = doc.file_type?.toLowerCase();
    if (ft === "pdf") mimeType = "application/pdf";
    else if (ft === "docx") mimeType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    else if (ft === "image" || doc.filename?.match(/\.(png|jpg|jpeg|webp|gif)$/i)) {
      const ext = doc.filename?.split(".").pop()?.toLowerCase();
      mimeType = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
    }

    // Use Gemini multimodal to extract text
    const extractionPrompt = `Extract ALL text content from this document. Return ONLY the raw text content, preserving structure (headings, lists, paragraphs). Do not add commentary or analysis. If it's an image, transcribe all visible text. If it's a PDF or document, extract every page's text.`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: extractionPrompt },
              {
                type: "image_url",
                image_url: { url: `data:${mimeType};base64,${base64}` },
              },
            ],
          },
        ],
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error("AI extraction failed:", aiRes.status, errText);
      await adminClient.from("documents").update({ status: "error" }).eq("id", document_id);
      return new Response(JSON.stringify({ error: "AI extraction failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiRes.json();
    const extractedText = aiData.choices?.[0]?.message?.content || "";

    if (!extractedText.trim()) {
      await adminClient.from("documents").update({ status: "error" }).eq("id", document_id);
      return new Response(JSON.stringify({ error: "No text extracted" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Generate summary
    const summaryRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          {
            role: "system",
            content: "You are a senior executive summarizer. Produce a 2-3 sentence strategic summary of the document. Focus on key themes, frameworks, and actionable insights.",
          },
          { role: "user", content: extractedText.slice(0, 4000) },
        ],
      }),
    });

    let docSummary = "";
    if (summaryRes.ok) {
      const sumData = await summaryRes.json();
      docSummary = sumData.choices?.[0]?.message?.content || "";
    }

    // Chunk the text
    const chunks = chunkText(extractedText);

    // Insert chunks
    const chunkRows = chunks.map((content, i) => ({
      document_id,
      user_id: user.id,
      content,
      chunk_index: i,
      metadata: { filename: doc.filename, file_type: doc.file_type },
    }));

    if (chunkRows.length > 0) {
      const { error: insertErr } = await adminClient
        .from("document_chunks")
        .insert(chunkRows);
      if (insertErr) {
        console.error("Chunk insert error:", insertErr);
        await adminClient.from("documents").update({ status: "error" }).eq("id", document_id);
        return new Response(JSON.stringify({ error: "Failed to store chunks" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Generate embeddings for each chunk (fire-and-forget, non-blocking)
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (OPENAI_API_KEY) {
      const chunkTexts = chunkRows.map((r) => r.content);
      try {
        const embRes = await fetch("https://api.openai.com/v1/embeddings", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${OPENAI_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "text-embedding-3-small",
            input: chunkTexts,
          }),
        });
        if (embRes.ok) {
          const embData = await embRes.json();
          // Fetch inserted chunk IDs
          const { data: insertedChunks } = await adminClient
            .from("document_chunks")
            .select("id, chunk_index")
            .eq("document_id", document_id)
            .order("chunk_index", { ascending: true });

          if (insertedChunks) {
            for (const emb of embData.data || []) {
              const chunk = insertedChunks[emb.index];
              if (chunk) {
                const vectorStr = `[${emb.embedding.join(",")}]`;
                await adminClient
                  .from("document_chunks")
                  .update({ embedding: vectorStr } as any)
                  .eq("id", chunk.id);
              }
            }
          }
        } else {
          console.error("Embedding API error:", embRes.status, await embRes.text());
        }
      } catch (embErr) {
        console.error("Embedding generation error:", embErr);
      }
    }

    // Update document status
    await adminClient
      .from("documents")
      .update({
        status: "ready",
        summary: docSummary,
        page_count: chunks.length,
      })
      .eq("id", document_id);

    return new Response(
      JSON.stringify({
        success: true,
        chunks: chunks.length,
        summary: docSummary,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("ingest-document error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
