# Opportunity Engine Step 5 plan

## Outcome
Ship the two reader corrections, the public tap journey, authenticated Home/Intelligence/Settings surfaces, three learning jobs, outcome follow-up email, database changes, deployment, and reversible founder self-checks.

## Assumptions required by the live schema
The requested names differ from existing columns or constraints. I will preserve the established schema rather than create duplicate concepts:

- Consent shutdown uses existing `oe_consents.revoked_at` rather than a new `ended_at` column.
- Outcome lifecycle uses existing `oe_outcomes.stage`; its accepted values will be extended for `asked`, `applied`, `won`, and `nothing` rather than adding a parallel `status` column.
- App taps will be stored with existing source value `inapp`; the shared UI may call its helper with `app`, but the database RPC will normalise that to `inapp`.
- The throwaway self-check card will use existing channel `inapp`; adding a production `test` channel solely for one check would weaken the domain constraint.
- The existing `oe_record_tap` currently writes corrections immediately. I will make it record/update the tap only; `oe-learn-taps` becomes the single correction writer, preventing duplicate corrections.
- `oe_card_public` will provide the token-scoped opportunity fields needed by both the public page and authenticated card hydration. This avoids granting members direct access to machine tables.

## 1. Reader fixes

- Update `oe-fetch-feed` to P2 `p2-1.2` with the past-event/recurring-edition rule.
- Add deterministic `dropped_past` handling for past `open_now` speaking, room, and learning records using deadline or a parsed date in the verified quote.
- Store the first 12,000 characters of cleaned page text in `raw.page_text` for every inserted opportunity.
- Retitle the live LEAP opportunity to `Speaker at LEAP — next edition (2027)` without replacing its identity, so the existing unsent card resolves to the corrected title through its join.

## 2. Database migration

Create one new migration, leaving every existing migration untouched:

- Add nullable `oe_taps.applied_at` and `oe_faces.few_shot jsonb not null default '[]'`.
- Update the existing tap RPC so it remains anon-callable, token-scoped, idempotent, normalises app source, updates scope cleanly, and leaves learning/corrections to the learner.
- Add `oe_card_public(p_token)` as a security-definer, token-expiry-scoped read returning only card display fields, language, current tap, and the permitted scope values.
- Add `oe_record_outcome(p_token, p_outcome)` as a security-definer, token-scoped updater with strict outcome validation.
- Extend the existing outcome-stage constraint for the requested ask and response states.
- Schedule `oe-learn-taps-30min`, `oe-weekly-rules`, and `oe-outcome-ask-daily` with the existing Vault-backed HTTP pattern.
- Preserve RLS and grant only the minimum RPC execution rights needed by anonymous tap links and service jobs.

## 3. Shared Opportunity card and tap controls

Build small focused UI pieces using the five System-B primitives:

- `OpportunityCard`: one reusable full card for Home and expanded Intelligence history, including empty-day state.
- `TapRow`: shared by the public tap page and authenticated card; handles first response, scoped follow-up chips, confirmations, disabled/read-only state, and Arabic direction.
- A focused data hook/service to load owner cards, hydrate token-scoped opportunity details, resolve member-local dates, record taps, and manage matching/forwarding consents.
- Use only explicit System-B semantic tokens, Inter, IBM Plex Mono for numbers, Cairo for Arabic, 375px-first spacing, AA contrast, and one primary action per view.

## 4. Public tap page

- Add lazy public route `/t/:token` beside `/r/:token`, outside `PasswordGate` and outside the app shell.
- Read `a=right|not_quite|not_my_area|less_from_here`, immediately record it with email source, then render the card title and confirmation.
- For `not_quite` and `not_my_area`, show only the allowed scope chips and submit their exact value from the token-scoped card response.
- Handle `o=applied|won|nothing` through `oe_record_outcome` and render a single confirmation.
- Return a compact bilingual expired-link state, one `Open Aura` link, no other navigation, and no images.

## 5. Authenticated surfaces

- **Home:** place today’s `OpportunityCard` after the greeting and before the existing intelligence content in the mounted `HomeSpine` path.
- **Intelligence:** add `Opportunities / الفرص` under the live `SignalsBoardV2` content, not the unused legacy Intelligence component. Show 30 days newest-first through `CollapsibleList`; expanded cards reuse `OpportunityCard` and become read-only after a tap.
- **Consent empty state:** when matching consent is absent, show the specified single-action card. Starting inserts a consent for the active policy and invokes `oe-build-faces` only when any face is missing.
- **Face auth:** extend `oe-build-faces` so a signed-in member can build only their own faces; retain cron/service access and reject cross-user requests.
- **Forwarding:** add the secondary forwarding consent toggle and requested description.
- **Settings:** add the morning-card switch to the live Preferences panel. Turning off stamps `revoked_at`; turning on inserts a fresh active consent using the active policy version.

## 6. Learner functions

- `oe-learn-taps`: claim unapplied taps safely, apply positive/negative EMA moves only to cited faces, append bounded few-shot examples, create correctly scoped 42/90-day corrections, renormalise all five weights with a 0.05 floor, mark taps applied, and log `oe_runs` counts.
- `oe-weekly-rules`: calculate 28-day speed/yield/tap scores per feed, promote on any recent right tap, move persistently weak feeds to weekly then paused without touching `terms_ok`, and log counts.
- `oe-outcome-ask`: create one pending ask for eligible right-tapped cards in the 13–15 day window, idempotently, for inclusion in the next morning email.
- Add only these three functions to `supabase/config.toml` with `verify_jwt=false`; each validates cron auth in code.

## 7. Morning email

- Add the optional outcome question below findings while preserving all existing send and dry-run behavior.
- Include bilingual copy and three token links for applied, won, or nothing.
- Keep the existing opportunity block above findings.
- Ensure a pending outcome ask is included in the member’s next eligible morning email and is not duplicated.

## 8. Verification and cleanup

- Deploy `oe-fetch-feed`, `oe-build-faces`, `oe-learn-taps`, `oe-weekly-rules`, `oe-outcome-ask`, and the edited morning-email function.
- Create one throwaway founder card dated yesterday without altering the real 2026-09-18 card; open its tap URL logged out at 375px, record `not_quite`, choose `This type`, and capture the page/result evidence.
- Snapshot all five founder face weights and few-shot arrays; run the learner; report before/after; restore the snapshot exactly.
- Remove the throwaway card, tap, learner correction, and any test outcome. Confirm the founder has exactly one remaining card dated 2026-09-18, untapped, and zero corrections.
- Verify Home and Intelligence while authenticated, including a 375px screenshot and computed System-B colors/fonts.
- Verify the public tap route does not redirect to auth.
- Run targeted tests, the vocabulary/type/build checks, preview diagnostics, forbidden-font/color grep, banned-copy grep, cron listing, and database result checks.

## Technical note

The live Intelligence surface is `SignalsBoardV2`, not the older `IntelligenceTab`. Home is mounted through `HomeSpine`. Implementing against those live paths avoids adding polished but unreachable UI.
