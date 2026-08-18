# The read screen — exit, identity, spine, honesty

## The four questions

**1 · Which file renders the ninety-second read screen?**
`src/pages/Assessment.tsx`, line **282** (`<div>Ninety seconds ago Aura had never heard of you.</div>`), inside the `stage === "read"` branch that begins at line 279. The card and everything under it come from `src/components/read/ReadResult.tsx`, which renders `src/components/onboarding/RevealCard.tsx`.

**2 · Where is `PaperShell`?**
`src/pages/Onboarding.tsx` line **311** — a local component, **not exported**, so `/assessment` cannot import it as it stands. Props: `children`, `bead: number`, `cream?: boolean`, `footer?: ReactNode`, `onExit?: () => void`, `face?: boolean`, `subProgress?: number`. It accepts `onExit` and renders it only when present: `{onExit ? <JourneyHeader onExit={onExit} onBack={onBack} /> : null}`.

The account-wall call site (Onboarding.tsx line 3084) is the pattern:

```tsx
<PaperShell onExit={saveAndExit} bead={4} footer={escapeFooter}>
```

`saveAndExit` is defined at line 1624: it persists the screen, sets `journey_paused`, records `journey_paused_at`, sends one resume email, and shows an exit note. The reusable piece is `src/components/onboarding/JourneyHeader.tsx` — Aura mark left, `Finish later` right — and that is what the read screen will use.

**3 · How is resume decided on boot?**
Two independent readers, and they disagree:

- `src/pages/Assessment.tsx` lines 90–108: reads `readToken()` (`localStorage.aura_session_token`), calls `loadSession`, then `STEP_TO_STAGE[found.state.step]` maps `"read" → stage "read"`. **This is the one that makes a bare `/assessment` land silently on an already-completed read.** If `state.step === "onboarding"` it redirects to `/onboarding` instead.
- `src/pages/Onboarding.tsx` lines 837 and 932: `journey_screen` from session state / `identity_intelligence`, maxed against `localStorage.aura_ob_screen_*`. `journey_screen` is never read by `/assessment`.
- `src/components/home/ResumeJourneyCard.tsx:39` reads `journey_screen` for the signed-in home card.

**4 · Does `/read/:id` or `/r/:token` exist?**
`/r/:token` exists (`src/App.tsx:121`) and renders `src/pages/SharedRead.tsx` — a public, ungated night-surface page whose only data call is the `get_shared_read` RPC; it prints headline, archetype, market read, subjects and the own-words quote. `/read` also exists (line 118) but is only a `ReadAlias` redirect. No `/read/:id`.

**On the missing date (change 4):** the plumbing exists but the design cancels it. `RevealCard.tsx:221` reads
`data.dateLine ? \`Read by Aura · ${data.dateLine}\` : "Read by Aura · aura-intel.org"` — the date **replaces** the domain rather than sitting beside it, and only when `generated_at` survives into session state. `mirror-read` does return `generated_at` on all three paths (fresh, cached, stale), so any session saved before that field existed renders the domain-only fallback and no date at all. Fix: print both, keep the date mono, render nothing when the timestamp is absent.

## The median completion time (change 6)

`assessment_sessions` has no completion timestamp — its columns are `id, token, ip_hash, created_at, last_seen_at, expires_at, user_id, runs_started, state`. The best available proxy (`last_seen_at - created_at` on claimed sessions) gives a median of ~34 minutes on **n = 4** claimed rows out of 47 total. That is not a median, it is an anecdote, and `last_seen_at` is not a finish time. **I cannot compute it honestly, so per your rule the sentence is left out entirely.** No "twelve minutes" will ship.

## What gets built

All work is in `src/pages/Assessment.tsx`, `src/components/read/ReadResult.tsx`, `src/components/onboarding/RevealCard.tsx`, plus one new component. No edge function, no migration.

1. **Named exit.** An exit control on the read screen following the `JourneyHeader` pattern: `Finish later` immediately right of the Aura mark, both padded to a ≥44×44 hit area, with `Your read is saved.` at 12.5px `#5B6673` directly beneath. It clears nothing — the session token stays.
2. **Identity strip.** New `src/components/read/ReadIdentityStrip.tsx`: 56px sticky, `#FFFFFF`, bottom border `#E2E7EE`. Left: Aura mark + `Finish later`. Right: a night-circle monogram built from the initials already on `state.name`, the first name, then `Sign in`. **No image element and no `avatar_url` read on this strip.** Under 375px, `Sign in` collapses into the exit control.
3. **Three-beat spine.** A 36px row under the strip: `Your read` complete (cyan dot `#00CEC9`, text `#00807B`) — `Your evidence` — `Your position` (`#5B6673`, hollow `#E2E7EE` dots). No counter, no "N of M". The moment line at 282 is untouched.
4. **Date on the card.** `signatureText` becomes `Read by Aura · aura-intel.org · 18 AUG 2026`, the date in IBM Plex Mono at 0.12em tracking, sourced from `generated_at` only; an absent timestamp renders no date segment. Applies to both the on-screen and export variants, inside the card's own bounds.
5. **The honest loss.** A new canvas-surface block between the last white card and the CTA: 1px `#E2E7EE`, radius 12, heading 15/700 `This read is anonymous.`, body 14px `#5B6673` `It lives in this browser only. Clear your history or switch to your phone and it is gone.` No amber, no icon, no countdown, no second button.
6. **Order and timing below the card.** The CTA keeps its label and stays the only filled blue button. The twelve-minutes line is omitted (see above). `What Aura still can't see` moves below the CTA. `Save this card` and `Share it` both go to 48px tall; `Share it` renders disabled with the adjacent reason `Sharing opens once the preview card is updated.`
7. **Resume interstitial.** In the `/assessment` boot effect, a completed read (`state.step === "read"` with a stored `read`) no longer restores the read screen silently. It renders a white-card interstitial: heading `You already have a read.`, then the name and the read's date in IBM Plex Mono, a filled `#0670C4` primary `Open my read`, and a text button `Start a new one` with the adjacent line `This replaces the read above.` — which confirms before clearing anything.

## Constraint check

The forbidden-token grep is clean for every file this build touches (`src/pages/Assessment.tsx`, `src/components/read/**`). The hits in the raw output below all live in legacy System-A surfaces (carousel themes, signature renderers, admin cockpit, broadsheet) that this build does not open. One filled blue button per view; cyan only as a dot and as `#00807B` text; every number in mono; every target ≥44×44; body never below 12.5px; no LinkedIn photograph on the read screen; the card's copy, archetype, signals, quote and honest gap are not edited.

## Raw grep output

```
$ grep -rn "onExit" src/ | grep -i read
src/pages/Onboarding.tsx:2018:      <PaperShell onExit={saveAndExit} bead={0} subProgress={readDone ? 0.5 : undefined} cream footer={escapeFooter}>

$ grep -rn "B08D3A\|F1ECE1\|6E2A26\|36C5B0\|F97316\|Cormorant\|DM Sans\|Newsreader\|JetBrains" src/pages/Assessment.tsx src/components/read/
(no output)

$ grep -rn "B08D3A\|F1ECE1\|6E2A26\|36C5B0\|F97316\|Cormorant\|DM Sans\|Newsreader\|JetBrains" src/
src/carousel/render/CarouselPreview.tsx:29:  border: `1px solid ${active ? "#36C5B0" : "rgba(255,255,255,.2)"}`,
src/carousel/render/CarouselPreview.tsx:30:  background: active ? "#36C5B0" : "transparent",
src/carousel/render/themes.ts:57:    accent: "#36C5B0",
src/carousel/render/themes.ts:64:    avA: "#36C5B0",
src/carousel/render/themes.ts:103:    bg: "#F1ECE1",
src/carousel/render/themes.ts:104:    bgSolid: "#F1ECE1",
src/carousel/render/themes.ts:108:    accent: "#6E2A26",
src/carousel/render/themes.ts:109:    accentLight: "#6E2A26",
src/carousel/render/themes.ts:110:    accentInk: "#F1ECE1",
src/carousel/render/themes.ts:115:    avA: "#6E2A26",
src/carousel/render/themes.ts:117:    avInk: "#F1ECE1",
src/components/AuthorityJourney.tsx:143:          fontFamily: "'DM Sans', sans-serif",
src/components/AuthorityJourney.tsx:156:      <div style={{ fontFamily: "var(--font-display, 'Cormorant Garamond')", ... }}>
src/components/AuthorityJourney.tsx:229:            fontFamily: "'Cormorant Garamond', serif",
src/components/ImageCardGenerator.tsx:21,30,42,46,47
src/components/SilenceAlarm.tsx:32,138,150
src/components/StrategicCompanion.tsx:52
src/components/TierCeremonyModal.tsx:50,279,470,1118
src/components/TierCredentialCard.tsx:38,39
src/components/TodaysStatus.tsx:12
src/components/admin/AdminShell.tsx:46,111
src/components/admin/cockpit/ui.tsx:6,11,14,17
src/components/broadsheet/pressTokens.ts:5,9,10,17,19
src/components/home/WeekReadyCard.tsx:75,140,243
src/components/intelligence/MarketCoverageSection.tsx:11,181,287
src/components/report/AuraPaper.tsx:30
src/components/signature/DESIGN_MANUAL.ts:40
src/components/signature/Editor.tsx:42,43,206,665,767,770,801,818,831,834,863
src/components/signature/FilmStrip.tsx:30
src/components/signature/MiniPreview.tsx:6,63,82,130
src/components/signature/Preview.tsx:64,166
src/components/signature/Publish.tsx:70,442,467,475,479
src/components/signature/fitText.ts:43,44,45,46,47
src/components/signature/renderers/CoverCard.tsx:48,135
src/components/signature/renderers/FrameCard.tsx:56,92,93,94,104
src/components/signature/renderers/LineCard.tsx:17,32,33,34
src/components/signature/renderers/MilestoneCard.tsx:18
src/components/signature/renderers/SignatureCard.tsx:124,125,126
src/components/signature/renderers/StatementHeadlineCard.tsx:50,94
(file:line list truncated by the shell at this point; none of these files are opened by this build)

$ grep -rn "linkedin.*photo\|profilePicture\|avatar.*linkedin" src/ -i
src/components/LinkedInImportCard.tsx:176:                alt={result?.author?.name ? `${result.author.name} on LinkedIn` : "LinkedIn profile photo"}
src/components/identity/HowYouAppear.tsx:208:  const useLinkedInPhoto = useCallback(async () => {
src/components/identity/HowYouAppear.tsx:212:    else { setAvatarUrl(snapshot.photo_url); toast.success("Your LinkedIn photo is now your Aura photo."); }
src/components/identity/HowYouAppear.tsx:343:                    onUsePhoto={useLinkedInPhoto}
src/components/identity/HowYouAppear.tsx:435:    return <button type="button" style={quietLinkStyle} onClick={onUsePhoto}>Use my LinkedIn photo</button>;
src/pages/Onboarding.tsx:2151:            <img src={liProfile.photo_url} alt={`${liProfile?.full_name || "Your"} LinkedIn photo`} loading="lazy"
src/pages/Onboarding.tsx.before-reveal-endgame:1855:            <img src={liProfile.photo_url} alt={`${liProfile?.full_name || "Your"} LinkedIn photo`} loading="lazy"

$ grep -rn "step.*of\|Step [0-9]" src/ | grep -i assess
src/components/BrandAssessmentModal.tsx:624:                Question {step + 1} of {QUESTIONS.length}
src/components/GuidedJourney.tsx:132:  const step2Status: StepStatus = !profileComplete ? "locked" : assessmentComplete ? "completed" : "active";
src/components/read/ReadResult.tsx:3: * by step one of the assessment. One source, so the two can never drift.
src/lib/brand.ts:42:export const stepLabel = (n: number) => `Step ${n} of ${ASSESSMENT_STEPS}`;
src/pages/Assessment.tsx:17: * The Gate — and the quick read, which is step one of the one assessment.
src/pages/Assessment.tsx:209:        ...state, step: "read", profile_url: target, name: data.name ?? null,
```

## One decision I need from you

`PaperShell` is private to `Onboarding.tsx`. Rather than export it — which would drag `JourneyNav` context, progress beads and `escapeFooter` onto a page that has no beads — I will reuse `JourneyHeader`, the same Aura-mark + `Finish later` control the shell renders, inside the new identity strip. Same control, same label, same behaviour, no counter. Say the word if you want the whole shell lifted out instead.