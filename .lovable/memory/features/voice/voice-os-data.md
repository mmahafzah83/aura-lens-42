---
name: Voice OS data foundation
description: voice_trait_registry / voice_traits / voice_feedback tables, computable traits, post fingerprint labels, readiness
type: feature
---
## Tables
- `voice_trait_registry` — dictionary of 9 traits (directness, warmth, challenge, evidence_density, pace, formality, length, emoji, language_mix) with poles, group, `computable`, `min_evidence`.
- `voice_traits` — measured values per (profile_id, trait_key), 0–100, with `confidence`, `source` (learned|user|inferred), `locked`, `evidence_count`, bands. **An absent row means unknown. Never zero-fill.**
- `voice_feedback` — verdict plus the changes that were applied.
- `authority_voice_profiles` gained `mode_key`, `mode_label`, `readiness` (forming → emerging → clear → distinctive, via SQL `voice_profile_readiness(uuid)`).

## Functions
- `voice-compute-traits` — pure text arithmetic over the member's own writing (`_shared/voiceCorpus.ts`: excludes discovered posts, reposts, aura drafts). Measures length, pace, emoji, language_mix, evidence_density. Never overwrites `locked=true` or `source='user'`. Figures regex counts Arabic-Indic digits (٠-٩) — Arabic posts are not evidence-free.
- `voice-classify-posts` — fills null `hook_style` / `ending_type` only. Deterministic rules first, Gemini fallback in batches of 20. Vocabulary: hooks = contrarian_claim, number_first, short_story, question, experience_led, announcement, other; endings = question, suspended, reframe, equation, number, cta, other (legacy labels still valid in the DB constraint).
- Both accept an `x-cron-secret` header or a signed-in member; the founder may pass `user_id`.

## Edit signal
`linkedin-publish` writes `edited_at` and normalised `edit_distance` onto `linkedin_posts` (alongside the richer `draft_edits` row) whenever the published text differs from `original_generated_text`.
