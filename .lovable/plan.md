

# Plan: Switch Influence Page to `influence_dashboard_view`

## Summary
Create a SQL view that joins `linkedin_posts` with `linkedin_post_metrics`, then rewrite the Influence page data-loading to use a single query against that view.

## Step 1 — Create the SQL view (database migration)

```sql
CREATE OR REPLACE VIEW public.influence_dashboard_view AS
SELECT
  p.id,
  p.user_id,
  p.linkedin_post_id,
  p.post_url,
  p.post_text,
  p.hook,
  p.title,
  p.theme,
  p.tone,
  p.format_type,
  p.content_type,
  p.topic_label,
  p.media_type,
  p.tracking_status,
  p.source_type,
  p.published_at,
  p.like_count,
  p.comment_count,
  p.repost_count,
  p.engagement_score,
  p.created_at,
  COALESCE(m.impressions, 0) AS impressions,
  COALESCE(m.reactions, p.like_count) AS reactions,
  COALESCE(m.comments, p.comment_count) AS comments,
  COALESCE(m.shares, p.repost_count) AS shares,
  COALESCE(m.saves, 0) AS saves,
  COALESCE(m.engagement_rate, p.engagement_score) AS engagement_rate,
  m.snapshot_date AS metrics_date,
  m.source_type AS metrics_source_type
FROM public.linkedin_posts p
LEFT JOIN LATERAL (
  SELECT * FROM public.linkedin_post_metrics lpm
  WHERE lpm.post_id = p.id
  ORDER BY lpm.snapshot_date DESC
  LIMIT 1
) m ON true
WHERE p.tracking_status != 'rejected';
```

The view inherits RLS from the underlying tables — authenticated users only see their own rows.

## Step 2 — Rewrite `InfluenceTabNew.tsx` data loading

Replace the multi-query `loadAll` function with a single query:

```ts
const { data, error } = await supabase
  .from("influence_dashboard_view")
  .select("*")
  .eq("user_id", user.id)
  .order("published_at", { ascending: false });
```

- If `error` exists → render the exact `error.message` on screen in a red alert box.
- If `data.length === 0` and no error → show the true empty state.
- If rows exist → render immediately into Overview KPIs, Content Performance table, and Intelligence analysis.

**Derived metrics from the view rows:**
- `totalPostCount` = `data.length`
- `postsWithMetrics` = rows where `reactions > 0 || comments > 0 || impressions > 0`
- Theme/format/topic aggregations computed client-side from the returned rows (same as today)

**Kept separate** (not in the view): `influence_snapshots` for follower chart, `sync_runs`/`sync_errors` for system health section — these are different data domains.

## Step 3 — Update TypeScript types

Add the view type to the Supabase types overlay or use `any` since views aren't auto-typed. The component already uses `any[]` for posts.

## Step 4 — Error rendering

Add an error state variable and render it prominently:
```tsx
{queryError && (
  <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-5 py-4">
    <p className="text-sm text-destructive">{queryError}</p>
  </div>
)}
```

## Files changed
- **New migration**: SQL to create `influence_dashboard_view`
- **`src/components/tabs/InfluenceTabNew.tsx`**: Rewrite `loadAll` to use the view, add error display, remove old multi-table join logic for posts+metrics

