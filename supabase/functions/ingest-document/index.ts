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

async function fetchWithTimeout(url: string, options: RequestInit, ms: number) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

// Mark a doc as errored with a short reason
async function markError(adminClient: any, document_id: string, reason: string) {
  console.error(`[ingest-document] document ${document_id} -> error: ${reason}`);
  await adminClient
    .from("documents")
    .update({ status: "error", error_message: reason.slice(0, 500) })
    .eq("id", document_id);
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
  console.log(`[ingest-document] processDocument START id=${document_id} user=${userId}`);

  try {
    const { data: doc, error: docErr } = await adminClient
      .from("documents")
      .select("*")
      .eq("id", document_id)
      .single();

    if (docErr || !doc) {
      await markError(adminClient, document_id, `Document not found: ${docErr?.message || "missing"}`);
      return;
    }

    const storagePath = doc.file_url.includes("/storage/v1/")
      ? doc.file_url.split("/documents/")[1]
      : doc.file_url;

    const { data: signed, error: signErr } = await adminClient.storage
      .from("documents")
      .createSignedUrl(storagePath, 3600);

    if (signErr || !signed?.signedUrl) {
      await markError(adminClient, document_id, `Could not generate signed URL: ${signErr?.message || "unknown"}`);
      return;
    }

    const fileUrl = signed.signedUrl;
    console.log(`[ingest-document] signed URL ok, file_type=${doc.file_type}`);

    // TODO: PDF/DOCX extraction transport — passing a signed URL via image_url to
    // Gemini chat completions is unreliable for non-image files. A proper fix would
    // download bytes and send as base64 with the correct mime, or use a dedicated
    // PDF text extractor before calling the LLM. For now we surface failures clearly.
    console.log(`[ingest-document] extraction START`);
    let aiRes: Response;
    try {
      aiRes = await fetchWithTimeout("https://ai.gateway.lovable.dev/v1/chat/completions", {
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
              { type: "image_url", image_url: { url: fileUrl } },
            ],
          }],
        }),
      }, 25000);
    } catch (e) {
      await markError(adminClient, document_id, `Extraction request failed or timed out: ${e instanceof Error ? e.message : String(e)}`);
      return;
    }

    if (!aiRes.ok) {
      const errText = await aiRes.text().catch(() => "");
      await markError(adminClient, document_id, `Extraction API ${aiRes.status}: ${errText.slice(0, 200)}`);
      return;
    }

    const aiData = await aiRes.json();
    const extractedText = aiData.choices?.[0]?.message?.content || "";

    if (!extractedText.trim()) {
      await markError(adminClient, document_id, "No text could be extracted from the document. PDF/DOCX transport may not be supported by the extraction model.");
      return;
    }
    console.log(`[ingest-document] extraction OK, ${extractedText.length} chars`);

    console.log(`[ingest-document] summary START`);
    let docSummary = "";
    try {
      const summaryRes = await fetchWithTimeout("https://ai.gateway.lovable.dev/v1/chat/completions", {
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
      }, 20000);
      if (summaryRes.ok) {
        const sumData = await summaryRes.json();
        docSummary = sumData.choices?.[0]?.message?.content || "";
      }
    } catch (e) {
      console.error("[ingest-document] summary error (non-fatal):", e);
    }

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
        await markError(adminClient, document_id, `Chunk insert failed: ${insertErr.message}`);
        return;
      }
    }

    console.log(`[ingest-document] final status update -> completed (${chunks.length} chunks)`);
    await adminClient.from("documents").update({
      status: "completed",
      summary: docSummary || extractedText.slice(0, 300),
      page_count: chunks.length,
      error_message: null,
    }).eq("id", document_id);

    console.log(`[ingest-document] document ${document_id} processed: ${chunks.length} chunks`);

    // Fire-and-forget: feed into evidence + signals pipeline
    adminClient.functions.invoke("extract-evidence", {
      body: { source_type: "document", source_id: document_id, user_id: userId },
    }).then(({ data: extractResult, error: extractError }) => {
      if (extractError) {
        console.error("extract-evidence error:", extractError);
        return;
      }
      const registryId = extractResult?.source_registry_id;
      if (!registryId) return;
      return adminClient.functions.invoke("detect-signals-v2", {
        body: { source_registry_id: registryId, user_id: userId },
      });
    }).catch((e) => console.error("post-completion pipeline error:", e));

    // Generate embeddings (non-critical)
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (OPENAI_API_KEY && chunkRows.length > 0) {
      try {
        const embRes = await fetchWithTimeout("https://api.openai.com/v1/embeddings", {
          method: "POST",
          headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model: "text-embedding-3-small", input: chunkRows.map((r) => r.content) }),
        }, 30000);
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
        console.error("[ingest-document] embedding error (non-fatal):", embErr);
      }
    }
  } catch (e) {
    await markError(adminClient, document_id, `Unexpected: ${e instanceof Error ? e.message : String(e)}`);
  }
}

// Main handler — validates auth, returns immediately, processes in background
Deno.serve(async (req) => {
  console.log(`[ingest-document] handler start method=${req.method}`);
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
    if (!LOVABLE_API_KEY) {
      console.error("[ingest-document] LOVABLE_API_KEY missing");
      throw new Error("LOVABLE_API_KEY not configured");
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await userClient.auth.getUser(token);
    if (authError || !user) {
      console.error("[ingest-document] auth failed:", authError?.message);
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    console.log(`[ingest-document] auth OK user=${user.id} doc=${document_id}`);

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    await adminClient
      .from("documents")
      .update({ status: "processing", error_message: null })
      .eq("id", document_id);

    console.log(`[ingest-document] kicking off background processDocument for ${document_id}`);
    // @ts-ignore EdgeRuntime.waitUntil is available in Supabase Edge Functions
    EdgeRuntime.waitUntil(
      processDocument(document_id, user.id, supabaseUrl, serviceRoleKey, LOVABLE_API_KEY)
    );

    return new Response(
      JSON.stringify({ success: true, message: "Processing started" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("[ingest-document] handler error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
