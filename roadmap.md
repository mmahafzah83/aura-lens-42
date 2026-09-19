# Opportunity engine

## Step 11 — the source factory (in progress)
- [x] `oe_entities` table, candidate link, job plumbing
- [x] `oe-seed-entities` — Wikidata, Wikipedia lists, Wikipedia categories, directory attempts
- [x] `oe-resolve-entity` — domain, careers page, applicant-tracking fingerprint, newsroom
- [x] `oe-harvest-ats` — platform adapters plus a JSON-LD reader
- [x] Hourly resolve cron, daily role harvest cron
- [x] First harvest: 88 roles from 20 employers, 85 passed the filter
- [ ] Backlog of 972 organisations still resolving on the hourly job

## Step 12 — the eligibility gate and the two lanes (next)
- [ ] Snapshot "pre-step12-eligibility-gate"
- [ ] Migration: `oe_eligibility`, level vocabulary, founder seed, three columns on `oe_opportunities`
- [ ] `_shared/oeEligibility.ts` — deterministic four-screen gate
- [ ] Judge: screen before the model; lanes `act` / `write` / dropped; card lane and copy
- [ ] Discovery queries rebuilt from eligibility first
- [ ] "What you can hold" panel in the Opportunities tab
- [x] Self-check items 1–8

## Step 14 — app-only opportunities queue
- [ ] Snapshot `pre-step14-opportunities-tab`
- [ ] Standalone side-rail route and bilingual queue
- [ ] App serve ledger, decisions, proposal threshold, and suppression recovery
- [ ] Tuning drawer, completed-day state, outcomes, and history
- [ ] Disable opportunity email block without changing schedules
- [ ] 375px and database self-checks

## Step 15 — direction and mix
- [ ] Snapshot `pre-step15-direction-and-mix` (no repository snapshot command is available)
- [x] Owner-only ninety-day priority and current mix
- [x] Per-member deterministic purpose tagging
- [x] Tunable weighted queue interleaving
- [x] One ordinary direction question per session
- [x] Explore exception chip and drawer answers
- [ ] 375px and live founder self-checks

## Step 16 — the audit fixes
- [ ] Snapshot `pre-step16-audit-fixes` (no repository snapshot command is available)
- [x] F1 log severity vocabulary, backfill, normalising trigger, `ef_failures` view
- [x] F2 grounding breakdown produced — diagnosis only, no rule change
- [x] F3 `lane_final` / `eligibility_fail` moved to `oe_matches`, shared columns dropped
- [x] F4 unique constraint on `oe_candidates.canonical_url`; harvest verified clean
- [x] F5 access rules tested for real against a live non-owner account
- [x] F6 `oe-invariants-check` — eight assertions, daily, first run recorded
- [x] F7 morning email job unscheduled; function carries no opportunity code
- [x] F8 daily model-call ceiling (500, tunable) across harvest, triage and judging
- [x] F9 on-demand Refresh, once a minute; "next at 07:00" removed
