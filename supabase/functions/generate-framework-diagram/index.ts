import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { framework_id, diagram_description, framework_title } = await req.json();
    if (!framework_id) throw new Error("framework_id required");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // If no diagram_description provided, fetch from the framework
    let diagramDesc = diagram_description;
    let title = framework_title || "Framework";
    if (!diagramDesc) {
      const { data: fw } = await adminClient
        .from("master_frameworks")
        .select("diagram_description, title, framework_steps, summary")
        .eq("id", framework_id)
        .single();
      if (!fw) throw new Error("Framework not found");
      diagramDesc = fw.diagram_description;
      title = fw.title || title;

      // If still no diagram description, generate one from steps
      if (!diagramDesc || Object.keys(diagramDesc).length === 0) {
        const steps = fw.framework_steps as any[];
        const descRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [
              {
                role: "system",
                content: `Given a framework with steps, determine the best visual diagram type and describe its structure. Choose from: "sequential_flow", "layered_architecture", "circular_model", "pyramid", "matrix", "hub_spoke". Return JSON: { "diagram_type": "...", "nodes": [{"id": "n1", "label": "...", "description": "..."}], "connections": [{"from": "n1", "to": "n2", "label": "..."}], "layout_notes": "..." }`,
              },
              {
                role: "user",
                content: `Framework: ${title}\nSummary: ${fw.summary || ""}\nSteps:\n${steps.map((s: any) => `${s.step_number}. ${s.step_title}: ${s.step_description}`).join("\n")}`,
              },
            ],
            response_format: { type: "json_object" },
          }),
        });
        if (!descRes.ok) throw new Error("Failed to generate diagram description");
        const descData = await descRes.json();
        const raw = descData.choices?.[0]?.message?.content || "{}";
        diagramDesc = repairAndParseJson(raw);

        // Save the diagram description
        await adminClient
          .from("master_frameworks")
          .update({ diagram_description: diagramDesc })
          .eq("id", framework_id);
      }
    }

    // Build image prompt from diagram description
    const dd = diagramDesc as any;
    const nodesText = (dd.nodes || []).map((n: any) => `- ${n.label}: ${n.description || ""}`).join("\n");
    const connectionsText = (dd.connections || []).map((c: any) => `${c.from} -> ${c.to}${c.label ? ` (${c.label})` : ""}`).join(", ");

    const diagramTypeLabels: Record<string, string> = {
      sequential_flow: "left-to-right or top-to-bottom sequential flow with arrows",
      layered_architecture: "horizontally stacked layers from top to bottom",
      circular_model: "circular cycle with arrows showing continuous flow",
      pyramid: "pyramid with widest layer at bottom narrowing to top",
      matrix: "2x2 or grid matrix with labeled quadrants",
      hub_spoke: "central hub with radiating spokes to connected nodes",
    };

    const layoutDesc = diagramTypeLabels[dd.diagram_type] || "clean structured diagram";

    const imagePrompt = `Create a minimalist handwritten blackboard schematic diagram.

Style: Deep charcoal/black background. White and gold handwritten ink. Minimalist line art with simple boxes, circles, connecting arrows. Simulated clear human handwriting for all labels. NO photorealistic elements, NO glossy renders.

Diagram type: ${layoutDesc}

Title (written at top in larger handwriting): "${title}"

Nodes:
${nodesText}

Flow/Connections: ${connectionsText}

Layout: ${dd.layout_notes || "Clean, balanced spacing"}

At the very bottom, ultra-slim footer (8% height max): Left side small handwritten "M. Mahafdhah | Digital Transformation Architect | 18Y Sector Expert". Right side "-> Share this Framework".

Make the diagram educational and easy to understand at a glance. The overall image should look like a professor's whiteboard sketch.`;

    // Generate image with Gemini
    const imgRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3.1-flash-image-preview",
        messages: [{ role: "user", content: imagePrompt }],
        modalities: ["image", "text"],
      }),
    });

    if (!imgRes.ok) {
      const errText = await imgRes.text();
      throw new Error(`Image generation failed: ${imgRes.status} ${errText}`);
    }

    const imgData = await imgRes.json();
    const base64Url = imgData.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    if (!base64Url) throw new Error("No image generated");

    // Upload to storage
    const base64Data = base64Url.split(",")[1];
    const imageBytes = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));
    const fileName = `diagrams/${framework_id}_${Date.now()}.png`;

    const { error: uploadErr } = await adminClient.storage
      .from("capture-images")
      .upload(fileName, imageBytes, { contentType: "image/png", upsert: true });

    if (uploadErr) throw new Error(`Upload error: ${uploadErr.message}`);

    const { data: publicUrl } = adminClient.storage
      .from("capture-images")
      .getPublicUrl(fileName);

    // Update framework with diagram URL
    await adminClient
      .from("master_frameworks")
      .update({ diagram_url: publicUrl.publicUrl })
      .eq("id", framework_id);

    return new Response(JSON.stringify({
      success: true,
      diagram_url: publicUrl.publicUrl,
      diagram_description: diagramDesc,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("generate-framework-diagram error:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
