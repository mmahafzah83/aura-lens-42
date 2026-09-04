# 03 — Business logic

Every rule below is grounded in a named file. When two places implement the same
rule (frontend + edge function), both are listed; **they must be changed
together** — drift makes the product lie to the member.

## 1. Entitlement

`src/lib/plan.ts` (+ `src/hooks/usePlan.ts`)

- Source of truth: `diagnostic_profiles.plan`, values `trial | free | paid`.
- `normalizePlan()` — anything unrecognised, including `null`, becomes `free`
  (fails closed).
- `resolvePlan(value, loaded)` — returns `null` while loading. `null` is not a
  plan: render a neutral state, never a lock and never full access.
- `hasFullAccess()` = `trial || paid`. `isFree()` = read-only, loop locked.
- The legacy `tier` column is **not** entitlement. The word "tier" now only means
  the achievement band on `imprint_snapshots` / `score_snapshots`.
- `beta_allowlist` is no longer a gate; it is invite bookkeeping only.
- Enforced server-side by the `guard_profile_billing_columns()` trigger — a
  member cannot PATCH themselves onto a paid plan.

## 2. Counts — one number, one definition

`src/lib/counts.ts` ⇄ `supabase/functions/_shared/counts.ts` (twins)

- `user_captures` = `entries` where `source_type` is null or ≠ `'aura_agent'`.
- `agent_captures` = `entries` where `source_type = 'aura_agent'` — visible with
  their badge, **never** counted as something the member saved.
- `total` = all `entries` rows.
- `documents` are not entries and are never folded into "you saved"; they get
  their own line.
- Concept names and formatting come from `src/constants/concepts.ts` and
  `src/constants/vocabulary.ts`. Hand-written count nouns fail the build.

## 3. What "published" means

`src/lib/postProvenance.ts` ⇄ `supabase/functions/_shared/postProvenance.ts`

`isPublishedPost()` matches an exact `(source_type, tracking_status)` pair:

```
aura_generated  · published
linkedin_export · tracked
browser_capture · confirmed
browser_capture · metrics_imported
search_discovery· confirmed
manual_url      · manual
carousel_studio · published
```

Excluded from the catalog: `rejected`, `external_reference`.

Two numbers that must never be merged:

- **publishedLive** — the post is public on LinkedIn, whoever wrote it
  (includes imported history).
- **publishedThroughAura** (`isMadeWithAura`) — Aura produced the draft and the
  member published it. This is the product's output claim and the milestone
  wording ("Published through Aura").

## 4. Capability bands (no percentages)

`src/lib/capabilityBands.ts` ⇄ `supabase/functions/_shared/capabilities.ts`

Bands: `not_assessed | developing | solid | strong`.

- Ordinal ladder emits only `0 / 33 / 50 / 66 / 70 / 100`; `0` means "no evidence
  ticked", never a measured zero.
- Slider: `1–39` developing, `40–74` solid, `75–100` strong; an untouched slider
  sits at exactly `50` and is **not** an answer.
- Surfaces show a band meter and legend — never a percentage.
- Responses are stamped with the **database** clock: the client never sends a
  timestamp; the `capability_responses_touch` trigger calls
  `touch_capability_response()`.

## 5. Cost and abuse limits

`supabase/functions/_shared/limits.ts` — the only place these numbers live.

| Limit | Value |
|---|---|
| Sign-ups per address fingerprint per rolling 24 h | 100 |
| Full instrument runs per account, ever | 1 |
| Full instrument runs product-wide per UTC day | 40 |
| Email must be verified before a run | yes |

`clientIp()` returns `""` when no address header exists; callers must treat an
empty value as "no fingerprint" and skip the check rather than pool every
header-less caller into one bucket. `hashIp()` salts with `aura:`.

Trend fan-out (`fetch-industry-trends`): only members active in the last 14 days,
oldest-served-first by `industry_trends.fetched_at`, a 100-second wall-clock
budget, and a 15-second timeout on each Perplexity call.

## 6. Your Desk (ask-aura) contract

- **Layers.** Every answer is `§§PLAIN` / `§§MORE` / `§§MOVES`. Secretary mode
  strips `MORE`.
- **Voice contract.** Two sentences max in the opener, one number max, facts over
  feelings, no jargon, contractions allowed, varied openings.
- **Numeric gate.** Only figures present in the grounded facts block may appear;
  a sentence containing an unpermitted number is dropped and logged to
  `desk_number_violations`.
- **Grounding.** Counts are pre-rendered server-side (`count_rendered`) — the
  model never computes them. Document chunks are labelled reference material.
- **Honesty.** Success is claimed only after a verified write; "Open in Publish"
  needs a real id; internal tool names are never shown (labels are capped at four
  words); if the member says an action is broken, believe them.
- **Human limits.** No scheduling around illness or exhaustion; ask when unclear
  rather than guess; no manufactured urgency.
- **Language.** Conversation language and output language are separate settings.
- Tools: `save_draft`, `set_reminder`, `search_my_graph`, `open_surface`.
  Max 2 tool rounds (`MAX_TOOL_ROUNDS`).
- Learning (`desk_learning`) is count-based only, needs evidence ids, and a
  rhythm claim requires ≥3 distinct days **and** ≥3 distinct ISO weeks.

## 7. Voice

- `authority_voice_profiles` holds the member's voice, including
  `marker_style` (jsonb) — whether they habitually use slide markers, detected
  from ≥2 example/admired posts with ≥3 hits.
- Principle: **voice decides words, the slide decides capacity.** Physical limits
  win: `↳` is forbidden in Arabic, no symbols on cover/close/hero slides, symbols
  do not consume the hero budget. `INV-24` fails a deck with disallowed glyphs.
- Admired posts are reference-only and capped; they are never published from.

## 8. Deck / carousel generation

- One `HERO_BUDGET` constant; identity renders once (cover only); soft word
  counters outside hero lines.
- Model call is pinned: `max_tokens: 8000`, `temperature: 0.3`, with JSON repair
  for truncated output.
- Invariants `INV-*` gate output; `INV-07` (Latin ratio) tolerates Latin
  acronyms inside Arabic runs.
- Terminal failures surface a plain-language banner with retry and
  "use another signal", never a silent stall.
- Decks persist in `public.decks` (owner-only RLS).

## 9. Waiting and progress

`src/lib/operationStages.ts`, `src/lib/useRunStages.ts`, `WorkingPanel`

Ticks come from real backend stage events written to `operation_runs`
(`open`, `posts`, `evidence`, `write`). Never fake a tick with a timer. Honest
progress estimates stay `—` until at least ten completed samples exist.

## 10. Snapshots are append-only

`imprint_snapshots`, `score_snapshots`, `capability_radar_snapshots`,
`linkedin_profile_snapshots`, `daily_brief_snapshots` are INSERT-only (a trigger
enforces immutability on daily briefs). Profile writes MERGE rather than
replace, and a claimed LinkedIn handle cannot be reassigned.

## 11. Language and copy

- Plain English, sentence case, no emojis in navigation.
- One bilingual dictionary entry per concept (`src/constants/concepts.ts`) with
  name, meaning, count function, phrasing and exclusions; counts are
  dictionary-driven.
- `scripts/check-vocabulary.mjs` runs inside `vite build` and fails the build on
  hand-written count nouns, banned jargon, internal names, noun stacks and
  noun-only buttons.

## 12. State machines

- **Assessment session**: created anonymously (`create_assessment_session`) →
  read/updated by token (`get_assessment_session`) → claimed on sign-up
  (`claim_assessment_session`) → orphan rescue for unclaimed rows.
- **Document**: uploaded → `document_jobs` queued → chunked
  (`document_chunks`) → brief built (`document_briefs`) → stuck jobs reaped by
  `reap-stuck-documents`.
- **Job queue**: `claim_job(type, worker)` → work → `complete_job(id, success,
  error)`.
- **Post**: draft (`content_items` / studio draft) → published → tracked →
  metrics imported; provenance pair decides the label at every step.
