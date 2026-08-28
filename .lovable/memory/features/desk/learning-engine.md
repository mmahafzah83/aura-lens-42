---
name: Desk learning engine — counted observations only
description: desk_learning five kinds, minimum-3 evidence, decay/delete, member-visible and erasable; desk_answer_feedback wiring
type: feature
---
## What may be learned
`desk_learning` holds exactly five `kind` values and nothing else: `asks_about`, `acts_on`, `rejects`, `talks_like`, `corrects`. Written only by `learn-from-sessions` (service role); the member reads and dismisses their own rows.

## The discipline
- Every observation is a COUNT with its evidence ids/dates in `evidence`. Never an adjective, never a mood, never a motive, never a personality reading.
- Minimum 3 occurrences before a row is written; `strong` at 5+.
- Unseen 60 days → decays to `observed`; unseen 90 days → deleted. Stale learning describes someone he no longer is.
- `corrects` rows are never overwritten. A dismissed observation is never re-learned (`skipped_dismissed`).
- Learned lines pass through the numeric gate like every other figure.

## Reader
`ask-aura` injects the top 5 non-dismissed rows as `WHAT I HAVE LEARNED ABOUT WORKING WITH YOU`. Rule in prompt: state them only when they change what to do; never recite as a profile. `body.learning === false` disables the block for one turn (A/B).

## Member control
Gear → "What I've learned about you": each row with its count, `Forget this`, plus `Forget everything`.

## Feedback
`desk_answer_feedback` (question, answer, verdict) is written by the Desk's "Was this right?" control; a `No` becomes a counted `rejects` observation on the next nightly run.
