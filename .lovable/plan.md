# Step 32 — member Opportunities tab

## What will change
- Replace technical history output with a day-grouped, plain-language timeline that never exposes internal data.
- Tighten the decision card, decline state, confirmations, next-item list, and honest empty state for a 375px screen.
- Make goal suggestions visibly recommended but unselected; add optional secondary goals and the 90-day reconfirmation state.
- Simplify the “What reaches you” drawer into human labels, progressive explanation, and 44px controls.

## Data changes
- Add nullable `goal_secondary text[]` to `oe_direction`, restricted to the same five allowed goals.
- Extend `oe_goal_save` with optional `p_secondary text[] DEFAULT NULL`, preserving existing calls and the existing 90-day expiry.
- Replace `oe_app_queue_core` history output so it excludes `why` and includes decision timing, scope, outcome timing, issuer, location, and the latest grounded presentation line.

## Technical details
- Limit frontend work to `OpportunityQueue.tsx` and its existing queue CSS block in the global stylesheet.
- Preserve queue filters, gates, judging, learning, refresh limits, truth meanings, quotes, and direction-card gating.
- Use only existing System-B tokens and fonts; keep cards at 20px, panels at 12px, buttons at 8px, chips at 4px.

## Verification
- Run the requested grep and database checks.
- Verify the live member flow at 375px for goal, decision, decline, empty, drawer, and history states where live data permits.
- Capture screenshots for available states and report any state that cannot be reached honestly from current data.
