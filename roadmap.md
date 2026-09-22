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
- [x] A1 second-person rewrite covers the verb (has→have, is→are, was→were, past unchanged, his→your, him→you); deterministic
- [x] A2 oe_opportunities.cost_of_door (text, quote-verified); populate for today's card; vocabulary door_cost_en/door_cost_ar; act card shows it instead of the direct-application line; exclude fee/price requirements from matching and rebuild the line
- [x] C oe_issuer_people from stored page text of all 47 alive market signals; in the reader, not a one-off; route_kind='named_person' + route_url; identified_route only where the role in the matter is stated

## Step 32 — member Opportunities tab
- [x] Plain-language grouped history with no internal JSON, ids, or codes
- [x] 375px decision, decline, confirmation, next-item, and empty states
- [x] Suggested-but-unselected primary goal, secondary goals, and expiry reconfirmation
- [x] Human-language “What reaches you” drawer with progressive disclosure
- [x] `oe_app_queue_core` history payload and `oe_goal_save` secondary-goal support
- [x] Seven dated self-checks, including available 375px screenshots

## Step 33 — Opportunities tab structure
- [ ] Four URL-persistent views and sticky segments
- [ ] Grouped Today cards, decision states, render visibility, outcomes and empty state
- [ ] Direction setup strip and sheet
- [ ] Parked, History filters and Settings views
- [ ] Queue and bring-back RPC changes
- [ ] 375px and 1280px verification plus seven self-checks

## Step 34 — UNGM (21 Sep 2026)
- UNGM: recognised, not harvested — terms prohibit storage and commercial use. Route for UN mandates = the member's own UNGM tender alert, forwarded by the member (user-forwarded email source, next build), plus buyer portals whose terms allow it, checked one by one.
- Upwork: the API key application is the founder's action, not the engine's — pending.
- Five notices read once for calibration; answers only, in oe_investigations (kind='sample_test'). Nothing served, nothing stored.

## Step 35 — denominators (21 Sep 2026)
- Municipal: 17 amanat seeded from https://momah.gov.sa/ar/branches-secretariat (official denominator 17).
- Chambers: not readable — fsc.org.sa publishes no member list (holding page); nothing seeded.
- Listed: saudiexchange.sa still 403; cma.org.sa renders in JavaScript with no readable text; nothing seeded.

## Step 36B — level gate faults (open)
1. Lateral must pass the level gate (rank >= floor includes equality).
2. Unknown level: title grade word read first (Director/GM -> executive 4; Manager/Team Leader -> manager 2); employer ladder only adjusts; any still-unknown passes with gate_note='level_unconfirmed' and the card line "We could not confirm the level of this role".
3. Re-screen + judge on demand for the founder; paste breakdown, the eight records, survivors and today's card.

## Step 36C — writing value judged on its own (21 Sep 2026)
- oe_matches.write_tests jsonb + standing_overlap numeric; lane_final=write requires all four tests true.
- _shared/writeValue.ts: subject overlap (cosine over stemmed title+scope vs evidence), bestStanding, writeTests. Listings (kind executive_role, or any record with no access_state) need the profession held plus overlap >= 0.30 with two title-level terms.
- oe_matches_act_requires_route now clears the lane instead of dropping an act into writing.
- secondPersonClause fixes "you your ..." / "you advises".
- Founder after re-screen: 4 act, 14 write (all four tests true), 0 bad grammar lines, 1 card today.

## Step 37 — the seven audit blockers (21 Sep 2026)
- Done: learning ledger reset and weight guard, daily RLS probe cron, feed access law, own-record evidence + rubric agreement (screen and judge), quote-in-text verification, Arabic/board-seat classifier.
- Open: item 7 of the remediation order (not in this step); Upwork API key pending founder action.
## Roles-only opportunity surface (in progress)
- [ ] Three views only: Today, Parked, History
- [ ] Three-role stack, quiet-day state, held-back and current-bar panels
- [ ] Gear dialog for bar, comments, active rules, privacy actions
- [ ] Bilingual vocabulary, 375px and database self-checks

