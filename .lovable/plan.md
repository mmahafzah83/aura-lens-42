AUDIT REGISTER — read-only. No files changed.

## 1 · RETIRED PALETTE in `src/` (excl. `src/index.css`)

Live / user-facing (logged-in product):
- `src/components/tabs/ImpactTab.tsx` — 1284, 1870, 1871, 1905, 1999, 2526, 2542, 2551 → `#B08D3A` (file is orphaned, see §5)
- `src/components/tabs/AuthorityTab.tsx` — 2056 `#36C5B0`; 4079, 4082, 4089, 4102 `var(--action, #D6A748)`; 4230 `#36C5B0` (its `CreateTab` export IS mounted in Composer)
- `src/components/tabs/IntelligenceTab.tsx` — 1542 `var(--brand, #B08D3A)` (its `SignalHero` / `EditorialReadingList` exports ARE mounted in Signals)
- `src/components/home/WeekReadyCard.tsx` — 75, 140, 247 `var(--brand, #B08D3A)` (orphaned, §5)
- `src/components/AuraCard.tsx` — 7 `#F1ECE1`, 8 `#1B1712`, 13 `#36C5B0`
- `src/components/AuraCardPanel.tsx` — 11 `#1B1712`, 14 `#F1ECE1` (mounted via IdentityTab → Profile)
- `src/components/AgentFindingCard.tsx` — 130 `#36C5B0`, 309 `#36C5B0`, 310 `#D6A748`
- `src/components/brand/AuraLogo.tsx` — 16 `#1B1712`, 18 `#36C5B0` (in nav shell + splash)
- `src/components/NotificationBell.tsx` — 32 `text-[#B08D3A]`
- `src/components/ui/AuraCard.tsx` — 40 `var(--brand, #B08D3A)`
- `src/components/ui/CollapsibleList.tsx` — 50 `var(--brand, #B08D3A)`
- `src/components/TierCeremonyModal.tsx` — 46 `#D4B056` (mounted from Dashboard)
- `src/components/LinkedInPostSteps.tsx` — 23 `#D4B056`
- `src/components/MilestoneShareModal.tsx` — 302, 370 `#B08D3A`
- `src/components/AuditRadarWidget.tsx` — 108 `#D4B056`; `src/components/AuditResultsView.tsx` — 107 `#B08D3A`
- `src/components/TodaysStatus.tsx` — 12 `#6E2A26` (orphaned); `src/components/SilenceAlarm.tsx` — 32 `#F97316` (orphaned); `src/components/StrategicCompanion.tsx` — 52 `#B08D3A` (orphaned); `src/components/ScrollSpyNav.tsx` — 3 `#B08D3A`; `src/components/intelligence/MarketCoverageSection.tsx` — 11 `#B08D3A` (orphaned)
- `src/pages/Auth.tsx` — 259, 260 `#1B1712` (autofill override)
- `src/pages/RequestAccess.tsx` — 23 `#F1ECE1`, 24 `#1B1712`
- `src/components/landing/HeroHead.tsx` — 193 `#d4b056`

Non-product / export-canvas, admin, or legacy (not part of the 14 surfaces):
- `src/pages/Landing.tsx` — 59 occurrences (legacy `/` landing, unmounted; `/` now = LandingV23)
- `src/components/visual-cards/styles/cardStyles.ts` — 15; `src/components/visual-cards/schematics/blackboard.ts` — 2; `src/components/broadsheet/pressTokens.ts` — 5; `src/components/signature/renderers/*` — 17 across shared/Statement/Line/Frame/Signature; `src/components/signature/Editor.tsx` — 3; `src/pages/SignatureStudio.tsx` — 173; `src/pages/CarouselStudio.tsx` — 10; `src/lib/exportBrand.ts` — 10; `src/components/ImageCardGenerator.tsx` — 42
- Admin only: `AdminDesignSystem.tsx` (5), `AdminQA.tsx` (3), `AdminJourney.tsx` (36, 37), `AdminPeople.tsx` (482), `AdminExperience.tsx` (521), `src/components/admin/cockpit/ui.tsx` (5), `src/utils/qaInteractionAudit.ts` (424, 617)
- `src/tailwind.config.lov.json` — 16 × `#f97316` (generated Tailwind ramp)

## 2 · RETIRED FONTS

On product surfaces a logged-in user sees:
- `src/components/CaptureModal.tsx` — 766, 894, 1503 `var(--font-serif)` — YES, capture sheet
- `src/components/tabs/IdentityTab.tsx` — 744 `var(--font-serif)` — YES, Profile H1
- `src/components/FirstFlightCard.tsx` — 55, 217 `var(--font-serif)` (217 also italic) — YES, first-flight card on Home
- `src/pages/Onboarding.tsx` — 956 `'JetBrains Mono'` — YES, onboarding
- `src/pages/Auth.tsx` — 265, 294, 368 `var(--font-serif)` — YES, auth
- `src/pages/NotFound.tsx` — 25 `'Cormorant Garamond'` — YES (404)
- `src/pages/AcceptInvitation.tsx` — 77, 230 `var(--font-serif)` — YES (invite flow)
- `src/pages/RequestAccess.tsx` — 137, 207, 430 `var(--font-serif)` — public, pre-login

Not on the 14 surfaces:
- `src/pages/PublicWelcome.tsx` — 18, 83, 123, 133, 202, 529, 578, 603, 639, 657, 672, 693, 719, 764, 1055 `var(--font-serif)` (orphan page, §5)
- `src/pages/SignatureStudio.tsx` — 174, 175, 191, 198, 604, 613 `Newsreader`; `src/pages/CarouselStudio.tsx` — 96–98, 110–112, 123–125, 136–138, 149–151, 163, 164, 455, 674, 2113, 2115, 2260, 2588, 2685, 2686 (`DM Sans`, `Cormorant`, `JetBrains Mono`, `Newsreader`) — export canvases
- Admin: `AdminCrons.tsx` 137/141/145, `AdminCost.tsx` 47/61, `AdminPeople.tsx` 72/184, `AdminQA.tsx` 981/1007/1012/1017/1030, `AdminGuideHealth.tsx` 82/146/165/234, `AdminExperience.tsx` 60/236, `AdminDesignSystem.tsx` 223/229 — `Cormorant` / `DM Sans` / `JetBrains Mono`
- `src/index.css` 196/199/200 keeps `--font-serif` mapped to Newsreader for reports (excluded by scope); `src/utils/qaInteractionAudit.ts` 357–405 still whitelists Newsreader as the System-A font

## 3 · SURFACE REGISTER (verified against `src/App.tsx` + `src/pages/Dashboard.tsx` NAV_ITEMS/render)

| Surface | Mounted file (verified) | Status |
|---|---|---|
| auth | `src/pages/Auth.tsx` (`/auth`, `/login`) | PARTIAL — `#1B1712` 259/260, `--font-serif` 265/294/368, amber misuse (§4) |
| landing `/` | `src/pages/LandingV23.tsx` (lazy) | MIGRATED — 0 retired hex/fonts, 56 semantic-token reads |
| nav shell / sidebar | `src/components/rail/AuraRail.tsx` | PARTIAL — file clean, but renders `AuraLogo` (`#1B1712`, `#36C5B0`) |
| mobile bottom nav | none — no bottom-nav component; mobile nav is the inline drawer in `src/pages/Dashboard.tsx` (Menu/X, ~line 728 rail + fixed elements) | NOT MIGRATED (does not exist as a discrete surface) |
| Home (Brief) | `src/components/home/BriefV2.tsx` | PARTIAL — file clean (35 token reads), but Home also mounts `FirstFlightCard` (`--font-serif`) and `NotificationBell` (`#B08D3A`) |
| Signals board | `src/components/signals/SignalsBoardV2.tsx` | PARTIAL — file clean, imports `EditorialReadingList`/`SignalHero` from `tabs/IntelligenceTab.tsx` (`#B08D3A` 1542) |
| Observatory / Intelligence | no route — `src/components/Observatory.tsx` not imported anywhere | NOT MIGRATED / dead (§5) |
| Composer / Authority | `src/components/composer/ComposerV2.tsx` | PARTIAL — file clean, imports `CreateTab` from `tabs/AuthorityTab.tsx` (`#36C5B0` 2056/4230, `#D6A748` 4079–4102) |
| Impact / Influence (Statement) | `src/components/analytics/AnalyticsV2.tsx` (tab `influence`, labelled "Analytics") | MIGRATED — 0 retired hex/fonts, 51 token reads. `tabs/ImpactTab.tsx` is NOT mounted |
| Identity / My Story | `src/components/tabs/IdentityTab.tsx` | NOT MIGRATED — `--font-serif` 744, only 5 semantic token reads, pulls `AuraCardPanel` (`#1B1712`/`#F1ECE1`), `AuditRadarWidget` (`#D4B056`), `MilestoneShareModal` (`#B08D3A`) |
| Library | `src/components/library/LibraryPage.tsx` | MIGRATED — clean, 29 token reads |
| Capture sheet | `src/components/CaptureModal.tsx` | PARTIAL — no retired hex, but `--font-serif` at 766, 894, 1503 |
| Ask Aura | `src/components/ask/AskAuraV2.tsx` | PARTIAL — no retired hex/fonts, but cyan on a pressable control (§4) |
| Onboarding / First Flight | `src/pages/Onboarding.tsx` + `src/components/FirstFlightCard.tsx` | NOT MIGRATED — `JetBrains Mono` 956; FirstFlightCard `--font-serif` 55/217 and only 1 token read |

Also mounted and clean: `overnight/OvernightPage.tsx`, `today/TodayPage.tsx`, `momentum/MomentumPage.tsx`, `widgets/WidgetsPage.tsx`.

## 4 · COLOUR LAW BREACHES

Cyan on a pressable control:
- `src/components/ask/AskAuraV2.tsx` 112–114 — citation pill is a `<button onClick>` with `--machine` background, border and text
- `src/components/systemb/Tooltip.tsx` 29 — `--machine` title text inside an interactive tooltip surface

Amber with no deadline/expiry:
- `src/pages/Auth.tsx` 663 — "Forgot password" button in `--deadline-text`
- `src/pages/Auth.tsx` 594 — "Set Password" inline emphasis in `--deadline-text`
- `src/pages/Auth.tsx` 729, 735, 741 — three static feature icons in `--deadline-text`
- `src/components/tabs/AuthorityTab.tsx` 4079–4102 — `var(--action, #D6A748)` on a section header, count chip and list border (no expiry)

Blue (`--act`) on a passive status chip: none found.

## 5 · DEAD / ORPHAN FILES among these surfaces

- `src/components/Observatory.tsx` — no import anywhere
- `src/components/Brief.tsx` — imported by `Dashboard.tsx:31` and `BriefV2.tsx:12` (type only); never rendered
- `src/components/tabs/ImpactTab.tsx` — only referenced from the unrendered `Brief.tsx`
- `src/components/tabs/InfluenceTab.tsx` — zero references
- `src/components/tabs/MarketTab.tsx` — zero references
- `src/components/home/WeekReadyCard.tsx` — zero imports
- `src/components/TodaysStatus.tsx` — zero imports
- `src/components/SilenceAlarm.tsx` — zero imports
- `src/components/StrategicCompanion.tsx` — zero imports
- `src/components/intelligence/MarketCoverageSection.tsx` — zero imports
- `src/components/ImageCardGenerator.tsx` — zero imports
- `src/pages/PublicWelcome.tsx` — no route in `src/App.tsx`
- `src/pages/Landing.tsx` — no route (`/` is `LandingV23`)
- `src/pages/Index.tsx`, `src/pages/AdminRedirect.tsx` — no route in `src/App.tsx`

Partially live, not orphans: `tabs/AuthorityTab.tsx` (`CreateTab`) and `tabs/IntelligenceTab.tsx` (`SignalHero`, `EditorialReadingList`) are imported by the V2 surfaces — their retired values do reach users.
