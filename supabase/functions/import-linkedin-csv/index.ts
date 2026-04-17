import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.99.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Import LinkedIn analytics CSV export.
 * Accepts an array of row objects parsed by the client (PapaParse with header:true).
 * Tries to detect impressions / reactions / comments / shares / engagement / date / post URL columns.
 */
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: authErr } = await userClient.auth.getClaims(token);
    if (authErr || !claimsData?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claimsData.claims.sub as string;

    const body = await req.json();
    const rows: any[] = Array.isArray(body?.rows) ? body.rows : [];
    const filename: string = body?.filename ?? "linkedin-export.csv";

    if (rows.length === 0) {
      return new Response(JSON.stringify({ error: "No rows provided" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey);

    // Track import job
    const { data: job } = await admin
      .from("import_jobs")
      .insert({
        user_id: userId,
        filename,
        import_type: "csv",
        status: "running",
        total_rows: rows.length,
        started_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    const jobId = job?.id;

    const findKey = (row: any, candidates: string[]): string | null => {
      const keys = Object.keys(row);
      for (const c of candidates) {
        const lc = c.toLowerCase();
        const k = keys.find(k => k.toLowerCase().trim() === lc);
        if (k) return k;
      }
      // partial match
      for (const c of candidates) {
        const lc = c.toLowerCase();
        const k = keys.find(k => k.toLowerCase().includes(lc));
        if (k) return k;
      }
      return null;
    };

    const toNum = (v: any): number => {
      if (v === null || v === undefined || v === "") return 0;
      const n = Number(String(v).replace(/[,\s%]/g, ""));
      return isNaN(n) ? 0 : n;
    };

    const toDate = (v: any): string => {
      if (!v) return new Date().toISOString().slice(0, 10);
      const d = new Date(v);
      if (isNaN(d.getTime())) return new Date().toISOString().slice(0, 10);
      return d.toISOString().slice(0, 10);
    };

    let imported = 0;
    let skipped = 0;
    const errors: any[] = [];

    for (const row of rows) {
      try {
        const urlKey = findKey(row, ["Post URL", "post_url", "URL", "Permalink"]);
        const dateKey = findKey(row, ["Date", "Created date", "Posted on", "snapshot_date"]);
        const impKey = findKey(row, ["Impressions", "impressions", "views"]);
        const reactKey = findKey(row, ["Reactions", "reactions", "likes", "Likes"]);
        const commentKey = findKey(row, ["Comments", "comments"]);
        const shareKey = findKey(row, ["Shares", "shares", "Reposts", "reposts"]);
        const engKey = findKey(row, ["Engagement rate", "engagement_rate", "Engagement"]);
        const titleKey = findKey(row, ["Post title", "Title", "Headline", "Content"]);

        const postUrl = urlKey ? String(row[urlKey] || "").trim() : "";
        const snapshotDate = toDate(dateKey ? row[dateKey] : null);
        const impressions = toNum(impKey ? row[impKey] : 0);
        const reactions = toNum(reactKey ? row[reactKey] : 0);
        const comments = toNum(commentKey ? row[commentKey] : 0);
        const shares = toNum(shareKey ? row[shareKey] : 0);
        let engagementRate = toNum(engKey ? row[engKey] : 0);
        if (engagementRate > 1) engagementRate = engagementRate / 100; // normalize %
        if (!engagementRate && impressions > 0) {
          engagementRate = (reactions + comments + shares) / impressions;
        }

        if (!postUrl && impressions === 0 && reactions === 0) {
          skipped++;
          continue;
        }

        // Find or create the linkedin_posts row
        let postId: string | null = null;
        if (postUrl) {
          const { data: existing } = await admin
            .from("linkedin_posts")
            .select("id")
            .eq("user_id", userId)
            .eq("post_url", postUrl)
            .maybeSingle();
          if (existing?.id) {
            postId = existing.id;
          } else {
            const { data: created } = await admin
              .from("linkedin_posts")
              .insert({
                user_id: userId,
                linkedin_post_id: postUrl,
                post_url: postUrl,
                title: titleKey ? String(row[titleKey] || "").slice(0, 200) : null,
                source_type: "csv_import",
                source_trust: 2,
                tracking_status: "tracked",
                published_at: snapshotDate,
              })
              .select("id")
              .single();
            postId = created?.id ?? null;
          }
        }

        if (!postId) { skipped++; continue; }

        await admin.from("linkedin_post_metrics").insert({
          user_id: userId,
          post_id: postId,
          snapshot_date: snapshotDate,
          impressions,
          reactions,
          comments,
          shares,
          engagement_rate: engagementRate,
          source_type: "csv_import",
        });

        imported++;
      } catch (e) {
        errors.push({ row, error: String(e) });
        skipped++;
      }
    }

    if (jobId) {
      await admin.from("import_jobs").update({
        status: "completed",
        imported_rows: imported,
        skipped_rows: skipped,
        completed_at: new Date().toISOString(),
        error_details: errors.slice(0, 20),
      }).eq("id", jobId);
    }

    return new Response(JSON.stringify({ imported, skipped, errors: errors.length }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("import-linkedin-csv error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
