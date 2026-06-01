## Goal
Add a service-role / cron auth override to `calculate-aura-score` (mirroring `voice-distill` L51–95) so server-side callers — specifically `detect-signals-v2` L408–412, which currently 401s — succeed. This is the wiring fix: the capture → signals → score loop starts working the moment this deploys.

## Why no dedup/debounce
Diagnostic confirmed the function is already idempotent:
- `score_snapshots` is gated to 1/day per user (L218–232).
- `user_milestones` inserts are gated by `earnedMap` (L322–344) and `existingTierMs` (L162–198).
- No other per-call writes.

Expectation for the UI: the visible score moves on a **once-a-day cadence**, not instantly per capture, because the UI reads from `score_snapshots` and that table is 1/day-gated. By design, not a bug.

## Pre-change

1. **Snapshot the file** — copy `supabase/functions/calculate-aura-score/index.ts` to `supabase/functions/calculate-aura-score/index.pre-fix-calc-aura-score-auth.ts.bak` before editing. Standing discipline.

## Change (single file)

**`supabase/functions/calculate-aura-score/index.ts` — replace the auth block (current L12–31)** with the voice-distill L51–95 pattern:

1. Read `Authorization`, `apikey` / `x-api-key`, and `x-cron-secret` headers.
2. `isServiceRole = bearer === SERVICE_ROLE || apiKeyHeader === SERVICE_ROLE`.
3. `isCron = CRON_SECRET && cronHeader === CRON_SECRET`.
4. Parse JSON body once (tolerate missing body).
5. If `isServiceRole || isCron`: take `userId` from `body.user_id`; 400 if missing/invalid.
6. Else (user path): keep current `userClient.auth.getUser(token)` flow → 401 on failure → `userId = authUser.id`.
7. Continue with existing `admin` client (service-role) and all downstream logic unchanged.

Nothing else changes. No SQL, no other functions, no frontend. Same security posture as the four prior applications of this pattern (service-role key isn't forgeable; browser path still goes through `getUser`).

## Out of scope
- Scoring math, milestones, snapshots, response shape — unchanged.

## Verification (post-deploy)

1. Browser call with user JWT → 200, payload identical to today.
2. `curl_edge_functions` with `Authorization: Bearer <service-role>` + `{ "user_id": "<uuid>" }` → 200.
3. `x-cron-secret: <CRON_SECRET>` + body `{ "user_id": "<uuid>" }` → 200.
4. No auth → 401. Service-role with missing `user_id` → 400.
5. **End-to-end proof:** perform a real capture in the preview, then check `detect-signals-v2` logs and confirm its `calculate-aura-score` invocation at L408–412 returns **200, not 401**. This is the proof the no-op chain call is fixed.
