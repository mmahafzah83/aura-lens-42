---
name: Voice learning loop — edits, provenance, evidence-backed rules
description: Member edits persisted with edit_distance, entity provenance guard, and evidence/verified/contradictions on every voice rule
type: feature
---
## Member edits are the product's best signal
- `linkedin_posts.post_text` always holds what the member saved; `original_generated_text` is written once at generation and never overwritten.
- Every save where the two differ sets `edited_at` and `edit_distance` (normalised Levenshtein, 0–1) via `src/lib/editDistance.ts` → `editFields()`.
- The Composer (`src/components/studio/StudioPanel.tsx`) saves on "Save and come back later" AND on advancing from steps 2 and 3.

## Provenance guard covers numbers AND named entities
- `_shared/numberGuard.ts` = figures; `_shared/entityGuard.ts` = organisations, people, specific dates.
- Both run against the same evidence set. Behaviour: one corrective regeneration, then return the draft with a `warnings` entry. Never blocking, never cut in place (a name removed in place makes nonsense of the sentence).
- Counts land in `unsourced_numbers_removed` and `unsourced_entities_removed`.

## A voice rule must be OBSERVED, never inferred
- `_shared/voiceRules.ts` is the single definition. Every `vocabulary_preferences.avoid`/`.use` entry is `{rule, evidence, verified, contradictions}`.
- `use` evidence comes from the member's own posts; `avoid` evidence can ONLY come from an edit pair (pattern present in `original_generated_text`, gone from `post_text`). Absence of a thing in a sample is not evidence the member avoids it.
- Unverified rules are soft guidance in the prompt; verified ones are constraints. Mechanical enforcement (e.g. the emoji strip) uses `enforcedRuleTexts()` only.
- `contradictions >= 3` (CONTRADICTION_LIMIT) retires a rule. Observed behaviour outranks an inferred rule, always.
