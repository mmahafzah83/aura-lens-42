import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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
    const { url } = await req.json();
    if (!url) {
      return new Response(JSON.stringify({ error: "URL is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Fetch the page content
    console.log("Fetching URL:", url);
    const pageRes = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; AuraBot/1.0)",
        Accept: "text/html,application/xhtml+xml,text/plain",
      },
    });

    if (!pageRes.ok) {
      return new Response(
        JSON.stringify({ error: `Failed to fetch URL (${pageRes.status})` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let pageText = await pageRes.text();
    // Truncate to avoid token limits - keep first ~8000 chars
    if (pageText.length > 8000) {
      pageText = pageText.substring(0, 8000);
    }

    // Strip HTML tags for cleaner input
    pageText = pageText.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
    pageText = pageText.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
    pageText = pageText.replace(/<[^>]+>/g, " ");
    pageText = pageText.replace(/\s+/g, " ").trim();

    console.log("Page text length:", pageText.length);

    // Call Lovable AI for summary
    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content:
              "You are an executive intelligence analyst. Given the content of a web page, produce exactly 3 concise bullet points that capture the most strategically important takeaways. Each bullet should be one sentence. Use the format:\n• Bullet 1\n• Bullet 2\n• Bullet 3\nNo preamble, no extra text.",
          },
          {
            role: "user",
            content: `Summarize this page from ${url}:\n\n${pageText}`,
          },
        ],
      }),
    });

    if (!aiRes.ok) {
      if (aiRes.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again shortly." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiRes.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add funds in Settings." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errText = await aiRes.text();
      console.error("AI gateway error:", aiRes.status, errText);
      throw new Error("AI gateway error");
    }

    const aiData = await aiRes.json();
    const summary = aiData.choices?.[0]?.message?.content || "";

    console.log("Summary generated successfully");

    return new Response(JSON.stringify({ summary }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("summarize-link error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
