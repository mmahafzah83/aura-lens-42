import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.99.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/* ───────── CSV parsing (minimal, RFC-4180-ish) ───────── */
function parseCsv(text: string): Record<string, string>[] {
  // Strip BOM
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const rows: string[][] = [];
  let cur: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else { inQuotes = false; }
      } else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") { cur.push(field); field = ""; }
      else if (c === "\n") { cur.push(field); rows.push(cur); cur = []; field = ""; }
      else if (c === "\r") { /* ignore */ }
      else field += c;
    }
  }
  if (field.length > 0 || cur.length > 0) { cur.push(field); rows.push(cur); }

  // LinkedIn often prepends preamble lines. Find header row = first row with >= 2 non-empty cells
  // and that contains a recognised column.
  let headerIdx = 0;
  const looksLikeHeader = (r: string[]) => {
    const lc = r.map(x => x.trim().toLowerCase());
    return lc.some(x =>
      x === "date" || x.includes("impressions") || x.includes("followers") ||
      x.includes("engagement rate") || x.includes("reactions")
    );
  };
  for (let i = 0; i < rows.length; i++) {
    if (looksLikeHeader(rows[i])) { headerIdx = i; break; }
  }
  const headers = rows[headerIdx]?.map(h => h.trim()) ?? [];
  const dataRows = rows.slice(headerIdx + 1).filter(r => r.some(c => c && c.trim() !== ""));

  return dataRows.map(r => {
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { obj[h] = (r[i] ?? "").trim(); });
    return obj;
  });
}

/* ───────── helpers ───────── */
const findKey = (row: Record<string, string>, candidates: string[]): string | null => {
  const keys = Object.keys(row);
  for (const c of candidates) {
    const lc = c.toLowerCase();
    const k = keys.find(k => k.toLowerCase().trim() === lc);
    if (k) return k;
  }
  for (const c of candidates) {
    const lc = c.toLowerCase();
    const k = keys.find(k => k.toLowerCase().includes(lc));
    if (k) return k;
  }
  return null;
};

const toNum = (v: unknown): number => {
  if (v === null || v === undefined || v === "") return 0;
  const n = Number(String(v).replace(/[,\s%]/g, ""));
  return isNaN(n) ? 0 : n;
};

const toDate = (v: unknown): string => {
  if (!v) return new Date().toISOString().slice(0, 10);
  const s = String(v).trim();
  // dd/mm/yyyy or mm/dd/yyyy → try ISO first
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  // Try dd/mm/yyyy
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m) {
    const yr = m[3].length === 2 ? Number(m[3]) + 2000 : Number(m[3]);
    const iso = new Date(yr, Number(m[2]) - 1, Number(m[1]));
    if (!isNaN(iso.getTime())) return iso.toISOString().slice(0, 10);
  }
  return new Date().toISOString().slice(0, 10);
};

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
    const admin = createClient(supabaseUrl, serviceKey);

    /* ── Read body: support multipart form, raw CSV, or { rows } JSON ── */
    const contentType = req.headers.get("content-type") ?? "";
    let csvText = "";
    let filename = "linkedin-export.csv";
    let prebuiltRows: Record<string, string>[] | null = null;

    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      if (!file || !(file instanceof File)) {
        return new Response(JSON.stringify({ error: "Please upload a CSV file" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (!file.name.toLowerCase().endsWith(".csv")) {
        return new Response(JSON.stringify({ error: "Please upload a CSV file" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      filename = file.name;
      csvText = await file.text();
    } else if (contentType.includes("application/json")) {
      const body = await req.json();
      if (Array.isArray(body?.rows)) {
        prebuiltRows = body.rows;
        filename = body?.filename ?? filename;
      } else if (typeof body?.csv === "string") {
        csvText = body.csv;
        filename = body?.filename ?? filename;
      } else {
        return new Response(JSON.stringify({ error: "Provide a CSV file or rows array" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else {
      // Treat as raw CSV body
      csvText = await req.text();
    }

    const rows = prebuiltRows ?? (csvText ? parseCsv(csvText) : []);
    if (rows.length === 0) {
      return new Response(JSON.stringify({ error: "File is empty" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    /* ── Detect file type ── */
    const sample = rows[0];
    const headerKeys = Object.keys(sample).map(h => h.toLowerCase());
    const isFollowerFile = headerKeys.some(h => h.includes("new follower") || h.includes("total follower"))
      || /follower/i.test(filename);
    const isPostFile = headerKeys.some(h => h.includes("impression") || h.includes("engagement rate") || h.includes("reaction"));

    if (!isFollowerFile && !isPostFile) {
      return new Response(JSON.stringify({
        error: "Unrecognised CSV format. Please upload a LinkedIn analytics export file."
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Track import job
    const { data: job } = await admin
      .from("import_jobs")
      .insert({
        user_id: userId,
        filename,
        import_type: isFollowerFile ? "csv_followers" : "csv_posts",
        status: "running",
        total_rows: rows.length,
        started_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    const jobId = job?.id;

    let imported = 0;
    let skipped = 0;
    const errors: any[] = [];

    if (isFollowerFile) {
      /* ── FOLLOWERS → influence_snapshots ── */
      const dateKey = findKey(sample, ["Date"]);
      const newKey = findKey(sample, ["New followers"]);
      const totalKey = findKey(sample, ["Total followers"]);

      // Aggregate by date so we don't insert duplicates from same file
      const byDate = new Map<string, { followers: number; growth: number }>();
      for (const row of rows) {
        try {
          const date = toDate(dateKey ? row[dateKey] : null);
          const growth = toNum(newKey ? row[newKey] : 0);
          const followers = toNum(totalKey ? row[totalKey] : 0);
          if (!followers && !growth) { skipped++; continue; }
          byDate.set(date, { followers, growth });
        } catch (e) {
          errors.push({ row, error: String(e) });
          skipped++;
        }
      }

      for (const [date, v] of byDate) {
        // upsert: delete existing for (user, date, csv_import) then insert
        await admin.from("influence_snapshots")
          .delete()
          .eq("user_id", userId)
          .eq("snapshot_date", date)
          .eq("source_type", "csv_import");

        const { error } = await admin.from("influence_snapshots").insert({
          user_id: userId,
          snapshot_date: date,
          followers: v.followers,
          follower_growth: v.growth,
          source_type: "csv_import",
        });
        if (error) { errors.push({ date, error: error.message }); skipped++; }
        else imported++;
      }
    } else {
      /* ── POSTS → linkedin_post_metrics (+ create linkedin_posts shell if needed) ── */
      const urlKey = findKey(sample, ["Post URL", "post_url", "URL", "Permalink"]);
      const titleKey = findKey(sample, ["Post title", "Title", "Headline", "Content"]);
      const dateKey = findKey(sample, ["Date", "Created date", "Posted on"]);
      const impKey = findKey(sample, ["Impressions"]);
      const reactKey = findKey(sample, ["Reactions", "Likes"]);
      const commentKey = findKey(sample, ["Comments"]);
      const shareKey = findKey(sample, ["Reposts", "Shares"]);
      const engKey = findKey(sample, ["Engagement rate", "Engagement"]);

      for (const row of rows) {
        try {
          const postUrl = urlKey ? String(row[urlKey] || "").trim() : "";
          const titleRaw = titleKey ? String(row[titleKey] || "").trim() : "";
          const snapshotDate = toDate(dateKey ? row[dateKey] : null);
          const impressions = toNum(impKey ? row[impKey] : 0);
          const reactions = toNum(reactKey ? row[reactKey] : 0);
          const comments = toNum(commentKey ? row[commentKey] : 0);
          const shares = toNum(shareKey ? row[shareKey] : 0);
          let engagementRate = toNum(engKey ? row[engKey] : 0);
          if (engagementRate > 1) engagementRate = engagementRate / 100;
          if (!engagementRate && impressions > 0) {
            engagementRate = (reactions + comments + shares) / impressions;
          }

          if (!postUrl && !titleRaw && impressions === 0 && reactions === 0) {
            skipped++; continue;
          }

          /* Find post: by URL first, then by ILIKE title */
          let postId: string | null = null;
          if (postUrl) {
            const { data: existing } = await admin
              .from("linkedin_posts")
              .select("id")
              .eq("user_id", userId)
              .eq("post_url", postUrl)
              .maybeSingle();
            if (existing?.id) postId = existing.id;
          }
          if (!postId && titleRaw) {
            const { data: byTitle } = await admin
              .from("linkedin_posts")
              .select("id")
              .eq("user_id", userId)
              .ilike("title", titleRaw.slice(0, 100))
              .limit(1)
              .maybeSingle();
            if (byTitle?.id) postId = byTitle.id;
          }
          // Create shell row if we have at least a URL or title
          if (!postId && (postUrl || titleRaw)) {
            const { data: created } = await admin
              .from("linkedin_posts")
              .insert({
                user_id: userId,
                linkedin_post_id: postUrl || `csv:${titleRaw.slice(0, 80)}:${snapshotDate}`,
                post_url: postUrl || null,
                title: titleRaw ? titleRaw.slice(0, 200) : null,
                source_type: "csv_import",
                source_trust: 2,
                tracking_status: "tracked",
                published_at: snapshotDate,
              })
              .select("id")
              .single();
            postId = created?.id ?? null;
          }

          if (!postId) { skipped++; continue; }

          // Upsert metrics: delete existing (user, post, date) row from csv_import then insert
          await admin.from("linkedin_post_metrics")
            .delete()
            .eq("user_id", userId)
            .eq("post_id", postId)
            .eq("snapshot_date", snapshotDate)
            .eq("source_type", "csv_import");

          const { error } = await admin.from("linkedin_post_metrics").insert({
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
          if (error) { errors.push({ row, error: error.message }); skipped++; }
          else imported++;
        } catch (e) {
          errors.push({ row, error: String(e) });
          skipped++;
        }
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

    return new Response(JSON.stringify({
      imported,
      skipped,
      errors: errors.length,
      file_type: isFollowerFile ? "followers" : "posts",
    }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("import-linkedin-csv error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
