# V1 Final Cleanup + Quest Log

7 frontend-only fixes. No EF or schema changes.

## Investigation summary

- **`WeeklyIntelligenceLoopCard`** (`src/components/WeeklyIntelligenceLoopCard.tsx`) currently shows when neither table has rows by setting `days = 999`. That's the bug — needs to hide instead.
- **`StrategicAdvisorPanel`** is rendered inside `IntelligenceTab` and `HomeTab` / `StrategyTab`. We'll gate the Intelligence-page render on signal count.
- **`AutomationStrip`** is in `IntelligenceTab.tsx` lines 122-192 — the "Move generation" card is `cards[2]`. Will gate on signal count.
- **`AuthorityJourney.tsx`** lines 292-310 already strips "Your your" defensively. The broken sentence "Your [title] signal (70%) is ready to publish" comes from `data.personalized_nudge` (server-generated). Fix at render time by detecting the pattern and reformatting.
- **`FirstVisitHint`** (`src/components/ui/FirstVisitHint.tsx`) — used somewhere on Intelligence; will check usage and gate on signal count.
- **`HomeTab`** has the 3-step welcome — need to find and reorder.
- **`ProfileMenu`** is the dropdown — Quest Log goes at the top.
- **`user_milestones`** table exists per `useMilestones` hook with columns: `id, user_id, milestone_id, milestone_name, context, earned_at, acknowledged, shared`. Perfect for quests.

## Changes

### Fix 1 — Intelligence: gate "Next Move" + Move-generation card on `signals.length >= 3`
`IntelligenceTab.tsx`: pass signal count into `AutomationStrip`; conditionally swap `StrategicAdvisorPanel` for an "Intelligence is growing" empty card.

### Fix 2 — Home: hide WeeklyIntelligenceLoop for users with 0 LinkedIn rows
`WeeklyIntelligenceLoopCard.tsx`: change the `dates.length === 0` branch to set `days = -1` and return `null` instead of `999`.

### Fix 3 — Authority Journey nudge formatting
`AuthorityJourney.tsx`: detect pattern `/Your (.+?) signal \((\d+%)\) is ready to publish/i` and re-render as a multi-line block (title in bold/quotes on its own line).

### Fix 4 — Auto-hide Intelligence first-visit hint when signals exist
Locate `<FirstVisitHint>` usage on Intelligence; wrap with `{signals.length === 0 && ...}`.

### Fix 5 — Reorder Home welcome to Assessment → Capture → Watch
`HomeTab.tsx`: find the existing 3-step welcome block; swap order, make Assessment primary CTA, Capture secondary; mark Step 1 complete when `diagnostic_profiles.brand_assessment_completed_at` is set.

### Fix 6 — Quest Log in ProfileMenu
- New `src/components/QuestLog.tsx` with three phases (6 quests Phase 1, 6 Phase 2, 6 Phase 3).
- New hook `src/hooks/useQuestProgress.ts` that fetches counts from: `diagnostic_profiles`, `entries`, `authority_voice_profiles`, `linkedin_posts`, `strategic_signals`, `influence_snapshots`, `linkedin_post_metrics`, `market_mirror_cache`, `content_items`, `authority_scores`. Maps each to a milestone via `useMilestones.checkAndAwardMilestone`.
- Render compact view in `ProfileMenu.tsx` above the Appearance section: phase header, progress bar, next 3 unchecked items, "View full journey →" (links to a future page; for now toggles expanded view in dropdown).
- Phase-complete celebration: lightweight card on Home gated by sessionStorage flag set when a phase flips to complete.

### Fix 7 — Typo sweep
- ripgrep `"Your your"` and `"Your top signal is strong at 0%"` across `src/`; replace as specified.

## Out of scope
- No EF edits. No schema migrations. No changes to score logic, signal detection, or assessment flow.
- "View full journey →" link target is a placeholder in this PR (toggles expansion; no new route).

## Risks
- Quest condition queries add ~10 lightweight selects on profile dropdown open. Mitigated by running on mount + caching in `useQuestProgress`.
- `personalized_nudge` reformat is a regex-based render-time patch; if server text changes wording, it falls back to the raw string.
