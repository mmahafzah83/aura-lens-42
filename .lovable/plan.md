

## Plan: Daily Auto-Refresh Trends — Top 5 Live Intelligence

### Current behavior
- Trends are fetched on Home page visit if the latest trend is older than 6 hours
- Shows up to 4 trends with status "new"
- Edge function `fetch-industry-trends` inserts new trends but never cleans up old ones
- Trends accumulate indefinitely in the database

### Changes needed

**1. Set up a daily cron job (morning refresh)**

Run `fetch-industry-trends` automatically every day at 6:00 AM UTC via `pg_cron` + `pg_net`. This ensures fresh trends are ready before the user opens the app.

Enable extensions `pg_cron` and `pg_net`, then schedule the job using the insert tool (not migration).

**2. Update the edge function `fetch-industry-trends`**

Before inserting new trends, mark stale trends. The logic:
- Query all existing "new" status trends for the user
- After fetching fresh AI results, compare: if an existing trend's URL matches a new one, keep it (it's still valid)
- Mark non-matching old "new" trends as "expired" (so they disappear from the feed)
- Insert only genuinely new URLs
- Cap total active ("new") trends at 5 per user

**3. Update HomeTab.tsx**

- Change the trend query limit from 4 to 5
- Change staleness check from 6 hours to 18 hours (since cron runs daily, we only need a fallback)
- Increase the timeline slice from 6 to 8 to accommodate 5 trends + signals

**4. No database schema changes needed**

The existing `industry_trends` table already has the `status` field ("new", "dismissed", "added") — we just add "expired" as a new status value used by the edge function.

### Technical details

**Cron schedule**: `0 6 * * *` (6:00 AM UTC daily)

The cron job calls the edge function without a specific user context, so the edge function needs a small update: when called without auth (from cron), iterate over all users who have a `diagnostic_profiles` record and fetch trends for each. Rate-limited to avoid overloading.

Alternatively (simpler): keep the user-triggered approach but make the staleness window 24 hours so it refreshes once per day on first visit. This avoids the complexity of a cron job iterating all users.

**Recommended approach**: Staleness-based daily refresh (simpler, no cron needed). Change the 6-hour window to check if the latest trend was fetched today. If not, trigger a refresh. The edge function handles cleanup of old trends (cap at 5, expire the rest).

### Summary of file changes

| File | Change |
|------|--------|
| `supabase/functions/fetch-industry-trends/index.ts` | Add cleanup logic: expire old "new" trends beyond top 5, skip URLs already present |
| `src/components/tabs/HomeTab.tsx` | Change limit to 5, staleness to "not fetched today", timeline cap to 8 |

