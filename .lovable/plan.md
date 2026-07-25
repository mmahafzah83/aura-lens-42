## Scope
Copy and dead-path cleanup only. No SQL, no data deletion, no layout redesign. Everything classified OUT OF SCOPE in the diagnostic stays untouched.

## 1. Frontend copy (4 files)
- `src/components/tabs/ImpactTab.tsx:1322` — tooltip: replace "Imported LinkedIn history is your foundation" with "Your synced LinkedIn history is your foundation".
- `src/components/tabs/ImpactTab.tsx:1622` — empty state: replace "Import your LinkedIn analytics below to see post performance." with "Connect LinkedIn — post performance appears as it syncs."
- `src/components/home/AuthorityPulseStrip.tsx:158` — `delta`: `"imported"` → `"synced"`, `"Import LinkedIn"` → `"Connect LinkedIn"`.
- `src/constants/language.ts:203` — remove the `uploadNumbers` CTA constant.

## 2. Orphan component
- Delete `src/components/WeeklyIntelligenceLoopCard.tsx`. It has no importer, its entire premise ("export your analytics, upload here") is dead, and its CTA scrolls to the removed `[data-section="linkedin-upload"]` anchor. Deleting is cleaner than rewording an unreachable nag card. If you'd rather keep it, the alternative is rewording it as a sync-staleness notice and pointing the CTA at the LinkedIn connect section.

## 3. Demographics backend paths
- `supabase/functions/generate-audience-insight/index.ts` — has no remaining frontend caller and depends entirely on the removed upload. Delete the function folder (and remove it from any function registry list), rather than leaving an endpoint whose only error message tells users to upload analytics.
- `supabase/functions/integrate-facets/index.ts:183, 213, 350, 371` — stop counting `audience_demographics` toward facet completeness, so new users aren't permanently penalised for a facet they can no longer fill. Remove the query and the `demoExists` term; keep the rest of the scoring intact.
- The `audience_demographics` table and its rows stay in the database untouched.

## 4. Stale comments and dead files
- Fix "via xlsx import" comments: `send-lifecycle-email/index.ts:447`, `calculate-aura-score/index.ts:210` (comment text only — no logic change, respecting the guardrail on that file).
- Delete dead backups: `calculate-aura-score/index.pre-ef-defensive-reads.bak.ts`, `calculate-aura-score/index.pre-fix-calc-aura-score-auth.ts.bak`, `voice-distill/index.pre-voice-distill-posts-branch.bak.ts`.
- Delete stale scan artifacts `audit_results.txt`, `full_audit.txt`, `full_audit_v2.txt` (they reference `import-linkedin-csv`, which no longer exists).

## 5. Prompt review
- `supabase/functions/linkedin-expert-advisor/index.ts:173` — leave the "LinkedIn analytics" mention as-is; API sync still supplies analytics, so the sentence remains true. Flagging only; no change unless you want it narrowed.

## Verification
Re-run the Part 1 and Part 2 sweeps, confirm zero STALE hits remain, and confirm `tsgo --noEmit` stays green.
