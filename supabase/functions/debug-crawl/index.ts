const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");
  if (!FIRECRAWL_API_KEY) {
    return new Response(JSON.stringify({ error: "No Firecrawl key" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: any = {};
  try { body = await req.json(); } catch {}
  const url = body?.url || "https://www.linkedin.com/in/mmahafzah/recent-activity/all/";

  console.log("Debug crawl:", url);

  try {
    const res = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url,
        formats: ["markdown", "links", "html"],
        onlyMainContent: false,
        waitFor: 8000,
        actions: [
          { type: "wait", milliseconds: 3000 },
          { type: "scroll", direction: "down", amount: 5 },
          { type: "wait", milliseconds: 2500 },
          { type: "scroll", direction: "down", amount: 5 },
          { type: "wait", milliseconds: 2500 },
          { type: "scroll", direction: "down", amount: 5 },
          { type: "wait", milliseconds: 2000 },
        ],
      }),
    });

    const data = await res.json();
    const md = data?.data?.markdown || data?.markdown || "";
    const links: string[] = data?.data?.links || data?.links || [];
    const html = data?.data?.html || data?.html || "";
    const metadata = data?.data?.metadata || data?.metadata || {};

    const postLinks = links.filter((l: string) =>
      /linkedin\.com\/(feed\/update|posts\/|pulse\/)/.test(l)
    );

    const activityLinks = links.filter((l: string) =>
      /linkedin\.com\/in\/.*\/recent-activity/.test(l)
    );

    return new Response(JSON.stringify({
      crawled_url: url,
      http_status: res.status,
      firecrawl_success: data?.success ?? false,
      content_retrieved: md.length > 0,
      page_title: metadata?.title || null,
      markdown_length: md.length,
      html_length: html.length,
      first_3000_chars: md.slice(0, 3000),
      total_links: links.length,
      first_20_links: links.slice(0, 20),
      post_pattern_links: postLinks.length,
      post_links_sample: postLinks.slice(0, 10),
      activity_links: activityLinks.length,
      raw_metadata: metadata,
    }, null, 2), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
