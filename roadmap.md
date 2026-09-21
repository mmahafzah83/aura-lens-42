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

## Step 18 — comments are not rules (done 2026-09-19)
- oe_notebook split into comments (verbatim, never executed) and rules (field/op/value, derived_from, ratified_at).
- All 8 founder sentences reclassified as comments; 8 rules derived (1 place, 5 sector, 1 never-held board, 1 Saudi-nationality requirement with legal basis).
- oe_eligibility rebuilt from ratified rules only; level_ceiling and level_floor deleted as exclusions.
- screen() is now profile-versus-requirement: excluded / unknown / eligible, stored on oe_matches.
- Purpose re-tagged: stretch above current level counts as build.
- Invariant 10 added: any eligibility value without a ratified rule.

## Step 19C — full judging coverage
- [x] Diagnose 28 missing match rows: 24 country prefilter, 4 retrieval cutoff
- [x] Remove silent country and retrieval exclusions; preserve them as coverage stages
- [x] Create access outcomes for all 74 live records
- [ ] Complete model review for the final 14 records in bounded batches
- [ ] Re-run purpose classification and report final lane and purpose totals

## Step 17 — the review changes
- [ ] Snapshot `pre-step17-review-changes` (no repository snapshot command is available)
- [x] 2 Unknown is not ineligible — three outcomes, investigation queue
- [x] 1 Five-state access ladder, member_access_confirmed, specific-route law
- [x] 3 Writing value assessed independently, discards kept for debugging
- [x] 4 Five claim checks recorded per claim
- [x] 5 `oe_truth_reports` + `oe-truth-verify` worker with backoff and named causes
- [x] 6 Private-data scan, honest privacy comment, extended security probes
- [x] 7 Learning by evidence type; "still pursuing" distinct from "nothing came of it"
- [x] 8 `oe_coverage_funnel` view with seven visible stages
- [x] 9 Retrieval before judging; shortlist cap logged when smaller than the pool

## Step 20 — the screening brain (2026-09-19)
- oe_member_identity derived from the profile snapshot; three gates (licence, profession, level with employer tier) in supabase/functions/_shared/oeScreen.ts; oe-screen-member runs them and the presentation test.
- Open: the presentation test writes no line for any of the nine survivors, so the act lane is empty. Not a defect — reported as a finding.

## Step 21A — the catalogue tables (2026-09-19)
- oe_opportunity_kinds (11, required fields as data), oe_source_types (16) seeded deterministically; no model called.
- kind + kind_completeness on oe_opportunities; source_type on oe_surfaces and oe_feeds; structured on oe_feeds.
- Incomplete records are queued to oe_investigations as kind_field:<name> and excluded from oe_app_queue.
- Telegram feeds (2) marked inactive, unclassified.
- Open: 21B — entity classification and oe_source_strength.

## Step 31 (A and C only — B is done, leave it)
- [ ] A1 second-person rewrite covers the verb (has→have, is→are, was→were, past unchanged, his→your, him→you); deterministic
- [ ] A2 oe_opportunities.cost_of_door (text, quote-verified); populate for today's card; vocabulary door_cost_en/door_cost_ar; act card shows it instead of the direct-application line; exclude fee/price requirements from matching and rebuild the line
- [ ] C oe_issuer_people from stored page text of all 47 alive market signals; in the reader, not a one-off; route_kind='named_person' + route_url; identified_route only where the role in the matter is stated

## Step 32 — member Opportunities tab
- [ ] Plain-language grouped history with no internal JSON, ids, or codes
- [ ] 375px decision, decline, confirmation, next-item, and empty states
- [ ] Suggested-but-unselected primary goal, secondary goals, and expiry reconfirmation
- [ ] Human-language “What reaches you” drawer with progressive disclosure
- [ ] `oe_app_queue_core` history payload and `oe_goal_save` secondary-goal support
- [ ] Seven dated self-checks, including available 375px screenshots
