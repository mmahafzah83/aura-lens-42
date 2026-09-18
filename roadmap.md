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
