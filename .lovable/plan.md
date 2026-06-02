
# Persona source + mapping fix

Snapshot label: `pre-persona-source-and-mapping`. Single concern: make `generate-market-mirror` resolve the user's rank from `beta_allowlist.seniority` (with fallbacks), widen the seniority→bucket mapping at both authoritative sites, and stop the client-side auto-regenerate loop. No onboarding changes.

## Step 1 — Widen shared helper (client)

File: `src/lib/marketPersonas.ts` (`rankFromLevel`)

Keep `PERSONA_LABELS` unchanged. Replace the regex bodies:

- **c_suite**: `chief|c-suite|c-level|ceo|cfo|cio|cto|cdo|cmo|coo|chro|\b(vp|svp|evp)\b|vice[\s-]?president|\bhead of\b|advisor|board member|chairman`
- **partner**: `\bpartner\b|managing director|associate partner`
- else → `director`

Add a comment above the function:
`// KEEP IN SYNC with supabase/functions/generate-market-mirror/index.ts persona regex.`

## Step 2 — Resolver + mapping in the EF (authoritative)

File: `supabase/functions/generate-market-mirror/index.ts`

1. **Resolve email**: use the authenticated user from the JWT (already validated in the EF); fall back to `auth.admin.getUserById(user_id)` if email isn't on the claims.
2. **Resolve seniority** via service-role client, in precedence order:
   - (a) `beta_allowlist.seniority` — `ilike(email, …)`, `order(requested_at desc nulls last)`, `limit(1)`, when non-null/non-empty
   - (b) `diagnostic_profiles.level`
   - (c) literal `"senior leader"`
3. **Replace inlined regex (~lines 87–94)** with the SAME widened patterns from Step 1, applied to the resolved seniority string. Add comment:
   `// KEEP IN SYNC with src/lib/marketPersonas.ts rankFromLevel.`
4. **Stamp** `gaps.persona_set` with the resolved bucket (unchanged behavior, new source).

No other EF logic touched (cache TTL, generation prompt, response shape all unchanged).

## Step 3 — Stop the client regenerate loop

File: `src/components/MarketMirror.tsx` (~lines 103–110)

Remove the `useEffect` that calls `generate()` when `rowRank !== currentRank`. The client cannot read `beta_allowlist` (admin RLS), so its locally-computed rank can disagree with the EF-stamped value indefinitely and trigger refresh on every mount until the 7-day cooldown blocks it. Also drop the now-unused `currentRank` state + the `diagnostic_profiles.level` fetch effect (~lines 49–62) since nothing else consumes it.

Keep untouched: no-cache first-load generation, the explicit Refresh button, any cron path.

## Step 4 — Request-access option

File: `src/pages/RequestAccess.tsx`

Add `"Partner"` to the `SENIORITY` array immediately after `"VP"`.

## Step 5 — Report (read-only)

Run a single SELECT (no writes) joining `auth.users` → `beta_allowlist` (by email, case-insensitive) → `market_mirror_cache` to list users whose stamped `gaps->>'persona_set'` would change under the new resolver. Output: `user_id, email, current_persona_set, new_persona_set, source (beta_allowlist|diagnostic_profiles|default)`. Hand the list back so you can selectively clear `market_mirror_cache` rows yourself. No mass-delete, no `user_id` backfill.

## Self-check before reporting

- Quote both regex blocks (`marketPersonas.ts` and EF) and confirm character-for-character match.
- Confirm resolver precedence in EF: `beta_allowlist.seniority` → `diagnostic_profiles.level` → `"senior leader"`.
- Confirm `MarketMirror.tsx` no longer contains any effect that calls `generate()` based on a recomputed rank.
- Confirm `"Partner"` appears in `SENIORITY` after `"VP"`.
- Trace a synthetic user with `beta_allowlist.seniority='VP'` through the EF resolver and confirm it returns `c_suite`.

## Files touched

- `src/lib/marketPersonas.ts` (regex widen + sync comment)
- `supabase/functions/generate-market-mirror/index.ts` (resolver + widened regex + sync comment)
- `src/components/MarketMirror.tsx` (remove auto-regenerate effect + unused level fetch)
- `src/pages/RequestAccess.tsx` (add "Partner")

Snapshot `.bak` copies created for each edited file before changes.
