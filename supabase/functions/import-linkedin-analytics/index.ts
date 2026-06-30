import { createClient } from "https://esm.sh/@supabase/supabase-js@2.99.3";
import * as XLSX from "https://esm.sh/xlsx@0.18.5";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

/** Parse a value (number, string, or Excel date serial) into YYYY-MM-DD */
function toISODate(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") {
    // Excel serial date
    const d = XLSX.SSF.parse_date_code(v);
    if (!d) return null;
    const mm = String(d.m).padStart(2, "0");
    const dd = String(d.d).padStart(2, "0");
    return `${d.y}-${mm}-${dd}`;
  }
  const s = String(v).trim();
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

const toNum = (v: unknown): number => {
  if (v == null || v === "") return 0;
  const n = Number(String(v).replace(/[, %]/g, ""));
  return isNaN(n) ? 0 : n;
};

Deno.serve(async (req) => {
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
    const { data: { user }, error: authErr } = await userClient.auth.getUser(token);
    if (authErr || !user) return json({ error: "Unauthorized" }, 401);
    const userId = user.id;

    const form = await req.formData();
    const file = form.get("file") as File | null;
    if (!file) return json({ error: "No file provided" }, 400);
    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      return json({ error: "Please upload a .xlsx file" }, 400);
    }

    const buf = new Uint8Array(await file.arrayBuffer());
    const wb = XLSX.read(buf, { type: "array", cellDates: false });

    const admin = createClient(supabaseUrl, serviceKey);
    const today = new Date().toISOString().slice(0, 10);

    /** Find a sheet by case-insensitive name match */
    const findSheet = (...names: string[]) => {
      const lower = wb.SheetNames.map((s) => s.toLowerCase());
      for (const n of names) {
        const idx = lower.indexOf(n.toLowerCase());
        if (idx >= 0) return wb.Sheets[wb.SheetNames[idx]];
      }
      // partial match fallback
      for (const n of names) {
        const idx = lower.findIndex((s) => s.includes(n.toLowerCase()));
        if (idx >= 0) return wb.Sheets[wb.SheetNames[idx]];
      }
      return null;
    };

    let postRows = 0;
    let totalFollowers = 0;

    /* ───────── SHEET: FOLLOWERS (total only — absolute anchor) ───────── */
    const folSheet = findSheet("FOLLOWERS", "Followers");
    if (folSheet) {
      const rows = XLSX.utils.sheet_to_json<any[]>(folSheet, { header: 1, raw: true, defval: "" });
      totalFollowers = Math.round(toNum(rows[0]?.[1]));
    }

    /* ───────── Follower re-anchor (single today row) ───────── */
    if (totalFollowers > 0) {
      const { data: todayRow } = await admin
        .from("influence_snapshots")
        .select("id")
        .eq("user_id", userId)
        .eq("snapshot_date", today)
        .maybeSingle();
      if (todayRow?.id) {
        await admin
          .from("influence_snapshots")
          .update({ followers: totalFollowers })
          .eq("id", todayRow.id);
      } else {
        await admin.from("influence_snapshots").insert({
          user_id: userId,
          snapshot_date: today,
          followers: totalFollowers,
          source_type: "linkedin_export",
        });
      }
    }

    /* ───────── SHEET: TOP POSTS → linkedin_post_metrics ───────── */
    const topSheet = findSheet("TOP POSTS", "Top posts", "Posts");
    if (topSheet) {
      const rows = XLSX.utils.sheet_to_json<any[]>(topSheet, { header: 1, raw: true, defval: "" });
      // Headers at row 2; data from row 3
      // Left: 0=URL, 1=PublishDate, 2=Engagements
      // Right: 4=URL, 5=PublishDate, 6=Impressions
      const merged: Record<string, { url: string; date: string | null; engagements: number; impressions: number }> = {};

      for (let i = 3; i < rows.length; i++) {
        const row = rows[i];
        if (!row) continue;
        const lUrl = String(row[0] ?? "").trim();
        if (lUrl) {
          const date = toISODate(row[1]);
          const eng = Math.round(toNum(row[2]));
          merged[lUrl] = merged[lUrl] || { url: lUrl, date, engagements: 0, impressions: 0 };
          merged[lUrl].engagements = eng;
          if (date) merged[lUrl].date = date;
        }
        const rUrl = String(row[4] ?? "").trim();
        if (rUrl) {
          const date = toISODate(row[5]);
          const imp = Math.round(toNum(row[6]));
          merged[rUrl] = merged[rUrl] || { url: rUrl, date, engagements: 0, impressions: 0 };
          merged[rUrl].impressions = imp;
          if (date && !merged[rUrl].date) merged[rUrl].date = date;
        }
      }

      for (const m of Object.values(merged)) {
        if (!m.url) continue;
        const snapshot_date = m.date ?? today;
        const rate = m.impressions > 0 ? Math.round((m.engagements / m.impressions) * 10000) / 100 : 0;

        // Look up linkedin_posts by URL
        const { data: postMatch } = await admin
          .from("linkedin_posts")
          .select("id")
          .eq("user_id", userId)
          .eq("post_url", m.url)
          .maybeSingle();
        const postId = postMatch?.id ?? null;

        // We need a non-null post_id to insert (table requires it). If no match, create a shell post.
        let effectivePostId = postId;
        if (!effectivePostId) {
          const { data: created } = await admin
            .from("linkedin_posts")
            .insert({
              user_id: userId,
              linkedin_post_id: m.url,
              post_url: m.url,
              source_type: "linkedin_export",
              source_trust: 2,
              tracking_status: "tracked",
              published_at: snapshot_date,
            })
            .select("id")
            .single();
          effectivePostId = created?.id ?? null;
        }
        if (!effectivePostId) continue;

        // Manual upsert on (user_id, post_id, snapshot_date)
        const { data: existingMetric } = await admin
          .from("linkedin_post_metrics")
          .select("id")
          .eq("user_id", userId)
          .eq("post_id", effectivePostId)
          .eq("snapshot_date", snapshot_date)
          .maybeSingle();

        const metricPayload = {
          user_id: userId,
          post_id: effectivePostId,
          snapshot_date,
          impressions: m.impressions,
          reactions: m.engagements,
          engagement_rate: rate,
          source_type: "linkedin_export",
        };

        if (existingMetric?.id) {
          // metrics table has no UPDATE policy for users; use admin client (service role bypasses RLS)
          await admin.from("linkedin_post_metrics").delete().eq("id", existingMetric.id);
        }
        await admin.from("linkedin_post_metrics").insert(metricPayload);
        postRows++;
      }
    }

    /* ───────── SHEET: DEMOGRAPHICS ───────── */
    const demoSheet = findSheet("DEMOGRAPHICS", "Demographics");
    let demoRows = 0;
    const uploadBatchId = crypto.randomUUID();

    // Parse period from DISCOVERY header first (needed for demographics rows)
    let periodStart: string | null = null;
    let periodEnd: string | null = null;
    const discSheet = findSheet("DISCOVERY", "Discovery");
    if (discSheet) {
      const discRows = XLSX.utils.sheet_to_json<any[]>(discSheet, { header: 1, raw: true, defval: "" });
      const periodStr = String(discRows[0]?.[1] ?? "");
      const periodMatch = periodStr.match(/(\d{1,2}\/\d{1,2}\/\d{4})\s*-\s*(\d{1,2}\/\d{1,2}\/\d{4})/);
      if (periodMatch) {
        const parseUSDate = (s: string) => {
          const [m, d, y] = s.split("/");
          return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
        };
        periodStart = parseUSDate(periodMatch[1]);
        periodEnd = parseUSDate(periodMatch[2]);
      }
    }

    if (demoSheet) {
      const rows = XLSX.utils.sheet_to_json<any[]>(demoSheet, { header: 1, raw: true, defval: "" });

      // Full replace on each upload
      await admin.from("audience_demographics").delete().eq("user_id", userId);

      const demoPayloads: Array<Record<string, unknown>> = [];
      const importedAt = new Date().toISOString();

      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length < 3) continue;
        const category = String(row[0] ?? "").trim();
        const value = String(row[1] ?? "").trim();
        const pctStr = String(row[2] ?? "").trim();

        if (!category || !value || !pctStr) continue;

        let pctNum = 0.5;
        if (pctStr.includes("<")) {
          pctNum = 0.5;
        } else {
          const parsed = parseFloat(pctStr.replace("%", ""));
          if (!isNaN(parsed)) pctNum = parsed;
        }

        demoPayloads.push({
          user_id: userId,
          category,
          value,
          percentage: pctStr,
          percentage_numeric: pctNum,
          period_start: periodStart,
          period_end: periodEnd,
          upload_batch_id: uploadBatchId,
          source_type: "upload",
          imported_at: importedAt,
        });
      }

      if (demoPayloads.length > 0) {
        const { error: demoErr } = await admin
          .from("audience_demographics")
          .insert(demoPayloads);
        if (!demoErr) demoRows = demoPayloads.length;
      }
    }

    return json({
      success: true,
      imported: {
        demographics_rows: demoRows,
        post_rows: postRows,
      },
      follower_anchor: totalFollowers > 0 ? totalFollowers : null,
      period: periodStart && periodEnd ? { start: periodStart, end: periodEnd } : null,
    });
  } catch (e) {
    console.error("import-linkedin-analytics error:", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
