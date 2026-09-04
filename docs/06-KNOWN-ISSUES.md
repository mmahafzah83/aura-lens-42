# 06 — Known issues, debt and traps

Grounded in the repository, the live catalog and the security linter as of
2026-09-04. Anything speculative is labelled.

## Security

- **Five functions have an unpinned `search_path`.** The Supabase linter flags
  them as warnings. They predate the current convention
  (`SET search_path = public` on every SECURITY DEFINER function). Fix by
  altering the functions; no behaviour change expected.
- **Billing columns are protected by a trigger, not by RLS.**
  `guard_profile_billing_columns()` blocks client writes to `plan`, `tier`,
  `account_type`, `plan_source`, `trial_ends_at`, `excluded_at`,
  `excluded_reason` on `diagnostic_profiles`. The RLS policy itself is
  column-blind, so **never** drop or bypass that trigger.
- **`capture-images` is a public bucket by deliberate decision** (images are
  embedded in shareable cards). Do not put anything private in it.
- Grants read back from `pg_class.relacl` include broad privileges
  (`INSERT`/`UPDATE`/`DELETE` for `anon` on some admin tables). Access is held
  by RLS, not by grants — tightening grants would be an improvement but must be
  tested table by table.

## Dead and unrouted code

- `src/pages/Mirror.tsx` and `src/pages/PublicWelcome.tsx` are not routed.
  `Mirror.tsx` was kept because its LinkedIn processing was migrated to the
  shared `WorkingPanel` pattern; it is otherwise unreachable.
- Older landing pages remain in the tree but are not routed or bundled
  (comment in `src/App.tsx`).
- Retired tables still exist and are excluded from product logic by name:
  `recommended_moves_retired_20260718`, `ef_event_log_retired_20260724`,
  `linkedin_connections_guessed_20260812`, `strategic_signals_orphans_20260811`,
  `audit_interpretation_backup_20260816`,
  `linkedin_profile_snapshots_backup_20260821`,
  `deleted_test_accounts_20260818`. Do not read them in new code; do not drop
  them without checking the retention decision.
- `captures` is legacy. `entries` is the canonical knowledge table.

## Duplicated logic that must be kept in sync

Each pair implements the same rule twice, once for the browser and once for
Deno. Changing one without the other makes numbers disagree across surfaces —
this has already happened once in production.

| Frontend | Edge Function |
|---|---|
| `src/lib/counts.ts` | `supabase/functions/_shared/counts.ts` |
| `src/lib/postProvenance.ts` | `supabase/functions/_shared/postProvenance.ts` |
| `src/lib/capabilityBands.ts` | `supabase/functions/_shared/capabilities.ts` |

## Verification that could not be completed

- The Desk 12-question smoke set and the A/B answer-variation pair have been
  blocked repeatedly because the preview session was signed out
  (`LOVABLE_BROWSER_AUTH_STATUS = signed_out`). The last recorded harness run
  was 73 pass / 25 fail across 98 adversarial questions, with the 12-question
  common-path smoke set at 12/12.
- Honest wait estimates on `WorkingPanel` show `—` until ten completed samples
  exist for that operation. That is intended, but it means new operations look
  estimate-less for a while.

## Operational traps

- **The vocabulary gate runs inside `vite build`**, not only as `prebuild`. A
  hand-written count noun or a banned term fails the *build*, not just the lint.
  Use the formatters in `src/constants/vocabulary.ts`.
- **~248 deferred vocabulary violations** are recorded but not enforced. They
  live in non-member-facing strings; do not enforce them wholesale without
  reviewing each.
- **Never fake progress with a timer.** Ticks must come from real
  `operation_runs` stage rows.
- **Snapshots are append-only.** Never upsert `imprint_snapshots`,
  `score_snapshots`, `capability_radar_snapshots`,
  `linkedin_profile_snapshots` or `daily_brief_snapshots`; profile writes MERGE
  rather than replace.
- **Never write a client timestamp** for capability responses — the database
  trigger stamps them. An earlier bug wrote device clocks; 8 responses and 1
  snapshot had to be repaired.
- **A claimed LinkedIn handle cannot be reassigned.** The handle-resolution
  functions enforce this; bypassing them corrupts attribution.
- Edge functions mostly run with `verify_jwt = false` and verify the caller
  themselves. A new function that forgets to verify is an open endpoint.
- `mirror-read` had to strip lone UTF-16 surrogates from scraped LinkedIn text
  before sending it to Anthropic (`stripLoneSurrogates()`); any new provider
  call handling scraped text needs the same guard.
- Two counts in earlier notes disagreed with the catalog (21 views, 43 crons).
  The verified live values are **20 views** and **44 cron jobs**.

## Open TODO markers in code

Only two remain: `supabase/functions/detect-signals-v2/index.ts` and
`src/components/tabs/ImpactTab.tsx` (one each). Everything else is documented
decision rather than deferred work.
