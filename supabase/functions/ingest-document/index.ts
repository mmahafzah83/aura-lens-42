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

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 8192;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    for (let j = 0; j < chunk.length; j++) {
      binary += String.fromCharCode(chunk[j]);
    }
  }
  return btoa(binary);
}

// Heavy processing — runs in background via EdgeRuntime.waitUntil
async function processDocument(
  document_id: string,
  userId: string,
  supabaseUrl: string,
  serviceRoleKey: string,
  lovableApiKey: string,
) {
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  try {
    // Fetch document record (using admin since user token may expire)
    const { data: doc, error: docErr } = await adminClient
      .from("documents")
      .select("*")
      .eq("id", document_id)
      .single();

    if (docErr || !doc) {
      console.error("Document not found:", docErr);
      await adminClient.from("documents").update({ status: "error" }).eq("id", document_id);
      return;
    }

    // Download file
    const storagePath = doc.file_url.includes("/storage/v1/")
      ? doc.file_url.split("/documents/")[1]
      : doc.file_url;

    const { data: fileData, error: dlErr } = await adminClient.storage
      .from("documents")
      .download(storagePath);

    if (dlErr || !fileData) {
      console.error("Download error:", dlErr);
      await adminClient.from("documents").update({ status: "error" }).eq("id", document_id);
      return;
    }

    const arrayBuffer = await fileData.arrayBuffer();
    const base64 = arrayBufferToBase64(arrayBuffer);

    let mimeType = "application/octet-stream";
    const ft = doc.file_type?.toLowerCase();
    if (ft === "pdf") mimeType = "application/pdf";
    else if (ft === "docx") mimeType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    else if (ft === "image" || doc.filename?.match(/\.(png|jpg|jpeg|webp|gif)$/i)) {
      const ext = doc.filename?.split(".").pop()?.toLowerCase();
      mimeType = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
    }

    // Extract text with Gemini
    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{
          role: "user",
          content: [
            { type: "text", text: "Extract ALL text content from this document. Return ONLY the raw text content, preserving structure (headings, lists, paragraphs). Do not add commentary or analysis." },
            { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64}` } },
          ],
        }],
      }),
    });

    if (!aiRes.ok) {
      console.error("AI extraction failed:", aiRes.status, await aiRes.text());
      await adminClient.from("documents").update({ status: "error" }).eq("id", document_id);
      return;
    }

    const aiData = await aiRes.json();
    const extractedText = aiData.choices?.[0]?.message?.content || "";

    if (!extractedText.trim()) {
      await adminClient.from("documents").update({ status: "error" }).eq("id", document_id);
      return;
    }

    // Generate summary
    let docSummary = "";
    try {
      const summaryRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${lovableApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash-lite",
          messages: [
            { role: "system", content: "You are a senior executive summarizer. Produce a 2-3 sentence strategic summary. Focus on key themes, frameworks, and actionable insights." },
            { role: "user", content: extractedText.slice(0, 4000) },
          ],
        }),
      });
      if (summaryRes.ok) {
        const sumData = await summaryRes.json();
        docSummary = sumData.choices?.[0]?.message?.content || "";
      }
    } catch (e) {
      console.error("Summary error:", e);
    }

    // Chunk and insert
    const chunks = chunkText(extractedText);
    const chunkRows = chunks.map((content, i) => ({
      document_id,
      user_id: userId,
      content,
      chunk_index: i,
      metadata: { filename: doc.filename, file_type: doc.file_type },
    }));

    if (chunkRows.length > 0) {
      const { error: insertErr } = await adminClient.from("document_chunks").insert(chunkRows);
      if (insertErr) {
        console.error("Chunk insert error:", insertErr);
        await adminClient.from("documents").update({ status: "error" }).eq("id", document_id);
        return;
      }
    }

    // Generate embeddings
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (OPENAI_API_KEY && chunkRows.length > 0) {
      try {
        const embRes = await fetch("https://api.openai.com/v1/embeddings", {
          method: "POST",
          headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model: "text-embedding-3-small", input: chunkRows.map((r) => r.content) }),
        });
        if (embRes.ok) {
          const embData = await embRes.json();
          const { data: insertedChunks } = await adminClient
            .from("document_chunks")
            .select("id, chunk_index")
            .eq("document_id", document_id)
            .order("chunk_index", { ascending: true });

          if (insertedChunks) {
            for (const emb of embData.data || []) {
              const chunk = insertedChunks[emb.index];
              if (chunk) {
                await adminClient
                  .from("document_chunks")
                  .update({ embedding: `[${emb.embedding.join(",")}]` } as any)
                  .eq("id", chunk.id);
              }
            }
          }
        }
      } catch (embErr) {
        console.error("Embedding error:", embErr);
      }
    }

    // Mark as ready
    await adminClient.from("documents").update({
      status: "ready",
      summary: docSummary,
      page_count: chunks.length,
    }).eq("id", document_id);

    console.log(`Document ${document_id} processed: ${chunks.length} chunks`);
  } catch (e) {
    console.error("processDocument error:", e);
    await adminClient.from("documents").update({ status: "error" }).eq("id", document_id);
  }
}

// Main handler — validates auth, returns immediately, processes in background
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { document_id } = await req.json();
    if (!document_id) {
      return new Response(JSON.stringify({ error: "document_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    // Verify user
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await userClient.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Kick off background processing — does NOT block the response
    // @ts-ignore EdgeRuntime.waitUntil is available in Supabase Edge Functions
    EdgeRuntime.waitUntil(
      processDocument(document_id, user.id, supabaseUrl, serviceRoleKey, LOVABLE_API_KEY)
    );

    return new Response(
      JSON.stringify({ success: true, message: "Processing started" }),
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
