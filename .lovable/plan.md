## The Connected Journey Rebuild

The new user experience today is a set of disconnected pages. This plan unifies Home, My Story, Quest Log, Intelligence, and Publish around **one shared journey state** so every surface tells the user the same story: where you are, what's next, and why it matters.

### Single source of truth

Create `src/hooks/useJourneyState.ts` that returns:

```text
profileComplete      first_name + firm + level + sector_focus all set
assessmentComplete   brand_assessment_completed_at OR brand_pillars.length > 0
distinctSources      count of distinct entries.account_name
capturesReady        distinctSources >= 3
voiceTrained         authority_voice_profiles row exists
hasSignals           active strategic_signals >= 1
hasThreeSignals      active strategic_signals >= 3
hasPublished         linkedin_posts has self_reported_published
hasLinkedInData      influence_snapshots OR linkedin_post_metrics rows
currentGate          0 | 1 | 2 | 3   (next gate user must clear)
```

Cached per-user with a small in-memory store + window event `aura:journey-refresh` so any save (profile, assessment, voice, capture) refreshes all consumers. `useQuestProgress` will be refactored to consume this hook so quest log, Home, and My Story can never disagree.

### My Story — guided journey for pre-journey users

When `currentGate < 3`, `IdentityTab` renders a new `<GuidedJourney />` component INSTEAD of the normal identity layout. The component shows three numbered steps with the emotional copy from the spec:

```text
STEP 1 — Your professional profile     [active | ✅ completed | 🔒 locked]
STEP 2 — Brand assessment               [locked until 1]
STEP 3 — Train your voice (optional)   [locked until 2, skippable]
```

- Active step: full opacity, bronze border, expanded with inline form.
- Completed: collapsed, ✅ badge, click to re-expand (read-only summary).
- Locked: 50% opacity, grayed CTA, "Unlocks after Step X".
- Step 1 expanded reveals existing `<ProfileManagement />` form (reused, no rewrite).
- Step 2 CTA dispatches the existing `aura:open-brand-assessment` event.
- Step 3 CTA scrolls to `<VoiceEngineSection />` rendered inline below; "Skip for now" sets `localStorage.aura_voice_skipped=1` and marks step done-as-skipped.

After all gates clear (or 1+2 done with voice skipped), the normal IdentityTab content renders. The Objective Audit button and "Reset Assessment" button only render when `assessmentComplete === true`.

### Home — welcome state mirrors the gates

Replace the current 3-step welcome block in `HomeTab` with a renderer driven by `useJourneyState`:

- Gate 0 active: Step 1 ACTIVE → "Set up your profile" navigates to Identity tab. Steps 2 & 3 locked.
- Gate 1 active: Step 1 ✅, Step 2 ACTIVE → "Start your assessment" dispatches `aura:open-brand-assessment`. Step 3 locked.
- Gate 2 active: Steps 1 & 2 ✅, Step 3 ACTIVE → "Capture your first article" opens capture sidebar.
- 1–2 captures: existing "intelligence is building" state (kept).
- 3+ captures + signals: existing normal Home (kept).

### Quest Log — locked states and same data

`QuestLog.tsx` gets a `lockedAfter?: string` field per quest. When locked, item shows 🔒, muted, and tooltip "Unlocks after: …". Click on locked items shows tooltip instead of navigating. The hook now derives quests from `useJourneyState` so checkmarks always match Home and My Story.

### Intelligence — gate behind 3 distinct captures

In `IntelligenceTab`, when `!capturesReady`, render only the radar shell with copy:

```text
YOUR STRATEGIC RADAR
Intelligence emerges from patterns across your captures. Aura needs at
least 3 articles from different sources to start detecting meaningful
signals.

[Current: X of 3 captures needed]   [Capture an article →]
```

Hide signals list, "Your Next Move", automation cards, market coverage. Existing 3+ behaviour unchanged.

### Publish — soft banner before assessment

If `!assessmentComplete`, render a dismissible banner at the top of the Publish/Strategy tab linking to the assessment. Tools remain accessible (no hard block).

### Out of scope

- No edge function, schema, score, or signal-detection changes.
- Brand assessment questionnaire itself untouched — only its entry point moves.
- Existing users where all gates already cleared see no change.

### Risks & mitigations

- Two flows could compute "complete" differently → mitigated by the single hook.
- IdentityTab is 1158 lines with deep conditional sections → we wrap the existing return in `if (showGuidedJourney) return <GuidedJourney/>` early, leaving normal-path code untouched.
- Quest Log refactor could break for existing power users → keep current quest IDs and labels; only add `locked` flag.

### Verification after build

1. Brand-new user: Home shows Step 1 active, Steps 2-3 locked; My Story shows guided journey; Quest log shows 0/6 with locks.
2. Save profile → all three surfaces flip Step 1 to ✅ within one render (event-driven refresh).
3. Complete assessment → Step 2 ✅ everywhere; Voice unlocks.
4. Skip voice → guided journey closes; normal My Story renders.
5. Capture 3 distinct sources → Intelligence unlocks signals.
6. Existing account with all data: no guided journey, no banners, no regressions.
