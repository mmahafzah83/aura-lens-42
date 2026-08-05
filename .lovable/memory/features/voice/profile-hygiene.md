---
name: Voice profile hygiene and generation metadata
description: Caps/dedupe for authority_voice_profiles avoid+use (12) and example_posts (10), and required metadata on every aura_generated post
type: feature
---
`supabase/functions/_shared/voiceVocab.ts` is the single gate for voice profile writes:
- `avoid` and `use` are semantically deduplicated (token-overlap >= 0.6 merges) and capped at 12 entries, most specific kept.
- `example_posts` entries are always `{content, source, added_at}`; bare strings become `source:'legacy'`, entries containing "undefined" or shorter than 40 chars are dropped, nested `example_posts_levantine_backup` is promoted with `source:'levantine_backup'`, cap 10 most recent.
- Used by `voice-distill`, `_shared/voiceRefresh.ts`, and the re-runnable backfill `voice-profile-cleanup` (service-role/cron only).

Generation metadata: every `linkedin_posts` insert with `source_type='aura_generated'` must spread `generationMetadata()` (`src/lib/generationMetadata.ts`, Deno copy `_shared/generationMeta.ts`), which always writes `hook_style`, `ending_type`, `stance`, `content_type`, `original_generated_text` and `source_signal_id`, using 'unspecified' rather than null. `original_generated_text` is written at generation time only — user edits change `post_text` only, never the original.

## Style fields describe HOW, never WHAT (2026-08)
- Style fields = `tone`, `preferred_structures`, `storytelling_patterns`, and `vocabulary_preferences.rhythm/.texture/.notes`.
- `_shared/voiceStyle.ts` is the single gate: it strips figures, currency, percentages, dates and organisation names from every style field on write, on read in the generator, and in the backfill. `example_posts` is exempt.
- Ending mandates are never stored in a style field. They are lifted into `authority_voice_profiles.allowed_endings` (text[]); the generator picks one per post. A profile with fewer than two detected mandates gets the whole ending vocabulary.
- Controlled vocabularies (DB check constraints on `linkedin_posts`):
  - hook_style: scene | number | confession | claim | question | dialogue | contrast
  - ending_type: hanging_line | equation | number | reframe | question | signature
  - stance: asserts | story | teaches | doubts | analysis
- Provenance guard (`_shared/numberGuard.ts`): after generation, any percentage, currency amount, magnitude, date or large count not traceable to the driving evidence is removed and counted in `linkedin_posts.unsourced_numbers_removed`.
- `dedupeRules` merges by concept first (hedging, jargon, CTA, promo, motivational, …) then token overlap, so twelve entries mean twelve distinct constraints.
