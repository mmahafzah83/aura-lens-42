# Step 14 — app-only opportunities queue

## What will change
- Add **Opportunities / الفرص** to the side rail and mount the authenticated `/opportunities` view without inner tabs.
- Replace the five-panel console with a one-card decision queue: live greeting/load, reading status, tuning drawer, ordered act/write cards, decline tuning, proposals, keyboard actions, and the completed-day state.
- Keep all member-facing copy bilingual in `oe_vocabulary`; use System-B tokens and the five existing primitives.
- Remove scores and bands from every member-visible opportunity view while preserving those fields in storage.

## Learning and recordkeeping
- Record each rendered card as an app serve with a complete reason record; reject and log cards missing that record.
- Route personal declines only into the member’s record, and factual corrections into the shared world record.
- Surface at most one soft-rule proposal per session after repeated declines, with a 90-day decline pause.
- Make held-back findings recoverable from the drawer and record that the relevant rule may be too strict.
- Place due 14-day outcome questions in the completed-day state and retain expandable serve history.

## App-only delivery
- Hard-disable opportunity cards in `send-morning-signal`, independent of environment configuration.
- Do not create or change any opportunity email schedule.
- Keep unrelated Overnight findings email behavior unchanged.

## Technical details
- Add only the smallest database additions/RPCs needed for atomic app-serve recording, queue decisions, soft proposals, suppression recovery, and outcomes, with owner-only access.
- Build the queue from today’s real `oe_cards`, ordered act then write, with live source/entity/rule/suppression counts.
- Use a portal-based drawer; support keys 1/2/3 except while typing.
- Preserve the legacy public tap page while the new authenticated queue uses the app pathways.

## Verification
- Check the requested forbidden terms, fonts, colours, score fields, and percentages.
- Verify computed styles and one-primary-action states at 375px.
- Walk a real preview queue, capture every requested state available from live data, and verify one app serve has a populated reason record.
- Dry-run `send-morning-signal` and confirm no opportunity card is selected or rendered.
- Confirm the founder sees the rail item and authenticated `/opportunities` route.

## Assumption
- “Later” removes the item from the current browser session without teaching a preference; it can return on a later visit.
