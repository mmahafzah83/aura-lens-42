## Goal
One global, per-browser flag suppresses every celebration surface for the current user. Milestone writes to `user_milestones` and the first-login welcome are untouched. The flag is one constant to flip later.

## Files

### NEW — `src/hooks/useCelebrationsEnabled.ts`
- Reads `localStorage["aura_celebrations_muted"]`.
- Module-level constant `DEFAULT_MUTED = true` (the one-character flip — change to `false` to re-enable across the build for users who never set the key).
- Returns `{ enabled, muted }` where `enabled === !muted`.
- Subscribes to the `storage` event so changes in other tabs propagate.

### EDIT — `src/hooks/useMilestones.ts`
- Import `useCelebrationsEnabled`.
- Inside the hook, compute `const { enabled } = useCelebrationsEnabled();`.
- Replace the existing `unacknowledgedMilestones` derivation with:
  `const unacknowledgedMilestones = enabled ? allMilestones.filter(m => !m.acknowledged) : [];`
- `allMilestones`, `refresh`, `checkAndAwardMilestone`, `acknowledgeMilestone`, `shareMilestone` are NOT touched — all `user_milestones` reads/writes continue exactly as today.

### EDIT — `src/components/tabs/HomeTab.tsx`
- Import `useCelebrationsEnabled`; `const { enabled: celebrationsEnabled } = useCelebrationsEnabled();` near the other hooks.
- Wrap in `{celebrationsEnabled && (...)}`:
  - `MilestoneNotification` block at line 1517.
  - `TierCeremonyModal` block at line 1520.
  - Score-jump banner conditional at line 1529 — add `celebrationsEnabled &&` to the existing guard `(!scoreJumpDismissed && auraData && (auraData.score_trend ?? 0) >= 10)`.
  - `MilestoneShareModal` block at line 2649–2655.

### EDIT — `src/components/tabs/IdentityTab.tsx`
- Import `useCelebrationsEnabled`; same hook call.
- Wrap in `{celebrationsEnabled && (...)}`:
  - `TierCeremonyModal` block at line 1271 (keeps `forceOpen` re-entry path muted too; if/when re-enabled the modal returns).
  - `MilestoneShareModal` block at line 1278.
- `MilestonesSection` mount at line 1257 is left as-is (already `className="hidden"`).

### EDIT — `src/components/MilestonesSection.tsx`
- Import `useCelebrationsEnabled`; `const { enabled: celebrationsEnabled } = useCelebrationsEnabled();`.
- Keep all earned/unearned rendering intact (history is preserved as a quiet record).
- In the earned-list `renderItem`, hide the `<button>...Share</button>` block (lines 235–264) behind `{celebrationsEnabled && (...)}`.
- Hide the `MilestoneShareModal` block at lines 308–314 behind `{celebrationsEnabled && (...)}` (defensive — modal can't open without the button anyway).
- No copy changes to headings/labels (already neutral: "Achievements", "Your milestones", "Earned …").

### NOT TOUCHED
- `src/components/FirstLoginWelcome.tsx` and its mount at `src/pages/Dashboard.tsx:915` — first-login welcome continues to render.
- `AuthorityJourney.tsx` tier strip — it's informational tier progress, not a celebration surface in the inventory; its embedded Share affordance is via `ShareLink`, but per the request only `MilestoneShareModal` entry points and the Share buttons in `MilestonesSection` are gated. (If you also want `AuthorityJourney`'s ShareLink gated, say so — it's a one-line addition.)
- `calculate-aura-score` edge function and any `user_milestones` SQL — untouched.

## Default state for this build
`DEFAULT_MUTED = true` in `useCelebrationsEnabled.ts`. The founder's G1 week is quiet by default. To re-enable globally, flip that single constant to `false`. To re-enable per user without redeploy, set `localStorage.aura_celebrations_muted = "false"` in the browser.

## Self-check (post-implementation)
1. Load `/home` as a fresh user: no `MilestoneNotification` toast, no `TierCeremonyModal`, no score-jump banner.
2. Earn a milestone (trigger `calculate-aura-score`): SQL `select milestone_id, acknowledged from user_milestones where user_id = '<me>' order by earned_at desc;` shows the new row written.
3. Load `/dashboard?tab=identity`: `MilestonesSection` (when surfaced) shows earned items with dates but no Share button; `TierCeremonyModal` / `MilestoneShareModal` do not mount.
4. Wipe `localStorage["aura_welcome_briefing_done"]` and reload `/dashboard`: `FirstLoginWelcome` still appears.
5. In DevTools set `localStorage.aura_celebrations_muted = "false"` and reload: all celebrations return without code changes.
