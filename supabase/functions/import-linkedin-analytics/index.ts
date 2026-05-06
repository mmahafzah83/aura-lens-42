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

    /* ───────── Snapshot accumulator (merge engagement + follower per date) ───────── */
    const snapshots: Record<string, {
      snapshot_date: string;
      impressions?: number;
      engagement_rate?: number;
      follower_growth?: number;
      followers?: number;
    }> = {};
    const ensureSnap = (date: string) => {
      if (!snapshots[date]) snapshots[date] = { snapshot_date: date };
      return snapshots[date];
    };

    let engagementRows = 0;
    let followerRows = 0;
    let postRows = 0;
    let totalFollowers = 0;

    /* ───────── SHEET 1: ENGAGEMENT ───────── */
    const engSheet = findSheet("ENGAGEMENT", "Engagement");
    if (engSheet) {
      const rows = XLSX.utils.sheet_to_json<any[]>(engSheet, { header: 1, raw: true, defval: "" });
      // Headers row 0; data from row 1
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length === 0) continue;
        const date = toISODate(row[0]);
        if (!date) continue;
        const impressions = Math.round(toNum(row[1]));
        const engagements = Math.round(toNum(row[2]));
        const rate = impressions > 0 ? Math.round((engagements / impressions) * 10000) / 100 : 0;
        const snap = ensureSnap(date);
        snap.impressions = impressions;
        snap.engagement_rate = rate;
        engagementRows++;
      }
    }

    /* ───────── SHEET 2: FOLLOWERS ───────── */
    const folSheet = findSheet("FOLLOWERS", "Followers");
    if (folSheet) {
      const rows = XLSX.utils.sheet_to_json<any[]>(folSheet, { header: 1, raw: true, defval: "" });
      // Row 0, col 1 = total followers
      totalFollowers = Math.round(toNum(rows[0]?.[1]));
      // Headers at row 2; data from row 3
      for (let i = 3; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length === 0) continue;
        const date = toISODate(row[0]);
        if (!date) continue;
        const growth = Math.round(toNum(row[1]));
        const snap = ensureSnap(date);
        snap.follower_growth = growth;
        followerRows++;
      }
      // today snapshot gets the total followers
      if (totalFollowers > 0) {
        const snap = ensureSnap(today);
        snap.followers = totalFollowers;
      }
    }

    /* ───────── Upsert influence_snapshots ───────── */
    // Manual upsert (no unique constraint guaranteed): select existing then update or insert
    for (const snap of Object.values(snapshots)) {
      const { data: existing } = await admin
        .from("influence_snapshots")
        .select("id")
        .eq("user_id", userId)
        .eq("snapshot_date", snap.snapshot_date)
        .maybeSingle();

      const payload: Record<string, unknown> = {
        user_id: userId,
        snapshot_date: snap.snapshot_date,
        source_type: "linkedin_export",
      };
      if (snap.impressions !== undefined) payload.impressions = snap.impressions;
      if (snap.engagement_rate !== undefined) payload.engagement_rate = snap.engagement_rate;
      if (snap.follower_growth !== undefined) payload.follower_growth = snap.follower_growth;
      if (snap.followers !== undefined) payload.followers = snap.followers;

      if (existing?.id) {
        await admin.from("influence_snapshots").update(payload).eq("id", existing.id);
      } else {
        await admin.from("influence_snapshots").insert(payload);
      }
    }

    /* ───────── SHEET 3: TOP POSTS ───────── */
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

    return json({
      success: true,
      imported: {
        engagement_rows: engagementRows,
        follower_rows: followerRows,
        post_rows: postRows,
      },
      total_followers: totalFollowers,
    });
  } catch (e) {
    console.error("import-linkedin-analytics error:", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
