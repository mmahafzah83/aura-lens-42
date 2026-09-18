# Step 15 — Direction and mix

## Goal
Add two lightweight, member-stated choices inside the existing Opportunities decision queue. They change per-member purpose tagging and queue order immediately, without adding setup, navigation, scores, bands, or percentages.

## Build

1. **Create the pre-change checkpoint**
   - Record the named checkpoint `pre-step15-direction-and-mix` before implementation, using the project’s existing snapshot mechanism.

2. **Add owner-only direction data**
   - Create `oe_direction` exactly as specified, with one row per member.
   - Constrain `priority` to the five keys and `mix` to `win | build | explore`.
   - Add explicit authenticated/service grants, owner-only row policies, and an update-time trigger.
   - Add nullable `purpose` to `oe_matches`, constrained to `strength | build | explore`.
   - Store the three mix ratios in the existing parameter store so ranking can change without a deploy.

3. **Add all bilingual vocabulary**
   - Insert the five priority labels and sub-lines, three mix labels, question and renewal copy, “Not now,” drawer sentences, “Change,” and the explore exception chip into `oe_vocabulary`.
   - Preserve the supplied English wording and Arabic wording exactly; add native Arabic for the supplied English-only sub-lines and supporting copy.

4. **Classify every member match deterministically**
   - Add a database classifier that updates `oe_matches.purpose` from `oe_eligibility`, `oe_direction`, the opportunity, requirements, and cited `oe_faces`.
   - Precedence: `strength`, then `build`, then `explore`, ensuring exactly one purpose.
   - `strength`: normalized sector overlap with `sectors_core`, or meaningful normalized term overlap between published requirements and cited evidence summaries.
   - `build`: priority-specific rules exactly as requested. The ordered level ladder is `ic → manager → senior_manager → director → senior_director → vp → c_suite → board`; “one band above” means the immediate next value.
   - `explore`: the remaining eligible record inside allowed countries and level range.
   - Recompute on queue load so a changed answer re-tags and re-ranks immediately; no model call.

5. **Interleave by mix, never expose a score**
   - Keep Step 14’s grounding gate, prior-decision exclusion, act-before-write lane rule, deadline/recency tie-breaks, and three-write daily cap.
   - Read the selected mix, defaulting to `win`, and interleave purpose buckets using the stored ratios rather than adding a card score.
   - Use deterministic weighted round-robin ordering so `win` and `explore` produce visibly different orderings whenever multiple purpose buckets exist.
   - Return `purpose` only for display logic; do not return or render weights, scores, bands, or percentages.

6. **Ask inside the queue**
   - Add a priority question card before the first real finding only when a real finding exists and no direction row exists, or when the priority has expired.
   - “Not now” stores a seven-day deferral without creating a direction answer.
   - On a later browser session, if priority exists and mix is absent, show the mix card before the first real finding.
   - Use session storage only to enforce “at most one direction question per session”; answers remain in the database.
   - Never show priority and mix together in one session, and never show either when there is no real finding.
   - A tap saves immediately, refreshes ranking, and continues to the real queue.

7. **Update cards and drawer**
   - Add only the muted “Outside your usual” chip to `explore` findings.
   - Add both direction sentences above hard rules in “What reaches you,” including the priority date and vocabulary labels.
   - “Change” opens the corresponding ordinary queue card, still respecting one direction question per session.
   - Preserve System-B tokens, existing radius rules, one primary action per view, RTL/Cairo behavior, and reduced-motion handling.

8. **Verify with live data**
   - Confirm all eight keys and Arabic strings in `oe_vocabulary`.
   - For the founder, set `bigger_seat + win`, capture the ordered queue and purpose tags; then set `explore`, rerun the same query, and compare order visibly.
   - Paste the founder’s purpose distribution across all 74 alive records, including a plain zero if `build` is zero.
   - Verify question-card session rules, absence of member-facing numbers/percentages/bands, and zero forbidden fonts/colors/words in new files.
   - Capture 375px screenshots for priority, mix, explore chip, and drawer. If the first-time password screen still blocks authenticated rendering, report that plainly and do not fabricate screenshots.

## Technical notes

- The legacy `oe_cards` table and public tap page remain untouched.
- Existing grounded-card requirements remain unchanged: a verified quote and at least one resolvable cited evidence row.
- “Outside current sectors” uses normalized token matching because stored opportunity sectors are display phrases while `sectors_core` uses normalized keys.
- Country and level checks reuse `oe_eligibility`; null level remains eligible under the existing rule but cannot qualify as “one band above.”
- Data updates used only for the requested founder self-check will use the data-update path, not a schema migration.
