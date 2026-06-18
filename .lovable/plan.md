# Inventory — Old Horizon Eye + Bronze Hardcodes

Read-only diagnostic. No files will be changed by this plan; it is the report you asked for, staged so you can approve a follow-up swap.

## 1) Brand Assessment loading screen

**File:** `src/components/BrandAssessmentModal.tsx`
- L1181–1191 — `PROCESSING_LINES` array, including L1186 `"Almost there — depth takes a moment..."`
- L1192 — `function CinematicLoading({ stage })` — this is the loader screen
- L1214–1227 — the loader's logo/spinner mark: an 80×80 inline SVG with `aura-eye-in` + `aura-eye-pulse` animations
- L506 — the modal's "Brand Assessment" header label (with the progress bar above it)

The mark on the loader is the OLD Horizon Eye (inline SVG, see §2 below).

## 2) Inline Horizon Eye SVGs (ellipse + iris circle + pupil)

Three instances; the AuraChatSidebar one is only nominally old (already swapped internally).

- **`src/components/BrandAssessmentModal.tsx` L1222–1226** — loader mark
  ```
  <ellipse cx="40" cy="40" rx="34" ry="18" stroke="#B08D3A" .../>
  <circle  cx="40" cy="40" r="11"          stroke="#B08D3A" .../>
  <circle  cx="40" cy="40" r="4"           fill="#B08D3A" />
  ```
- **`src/pages/CarouselStudio.tsx` L215–222** — `function HorizonEye({ x, y, size, color })` used as a decorative mark inside carousel slides
  ```
  <ellipse rx={size/2} ry={size/3.2} stroke={color} .../>
  <circle  r={size/5.5} fill={color} />
  ```
- **`src/components/AuraChatSidebar.tsx` L80–90, used L1461** — named `HorizonEye` but the body now renders `<AuraLogo size={26} variant="dark" />` (Radiant Dial). No inline ellipse/iris/pupil. Flagging only because of the stale identifier; no SVG change needed, just a rename if you want consistency.

`src/pages/PublicWelcome.tsx` L390/407 references "pupil" / `pupilR`, but those drive `HeroHead` orbital-node ellipses (`rx`/`ry` orbits), not an iris+pupil eye. Not an old-eye instance.

## 3) Bronze hardcodes (`#B08D3A` and `#D4B056`)

Also surfacing `#8A6D2A` (bronze-text) since it's part of the same family.

### `#B08D3A`

Root/manifest/splash
- `index.html:19` — `<meta name="theme-color" content="#B08D3A" />`
- `index.html:70` — splash SVG `style="color:#B08D3A"` (48×48 inline mark)
- `public/manifest.json:8` — `"theme_color": "#B08D3A"`
- `public/admin/aura-standard-v2.html:11,14,179,180` — design-system reference doc

CSS fallbacks
- `src/index.css:380` `outline: 2px solid var(--brand, #B08D3A);`
- `src/index.css:1721, 1728` — same outline fallback

Components
- `src/components/BrandAssessmentModal.tsx` L914 (comment), L923 (`border-left:3px solid #B08D3A`), L1223–1225 (loader eye, see §2)
- `src/components/FirstTimeHint.tsx` L62, L71 — sparkle + text color
- `src/components/ImageCardGenerator.tsx:42` — `brand: "#B08D3A"`
- `src/components/MilestoneShareModal.tsx:302, 370`
- `src/components/NotificationBell.tsx:31` — `momentum: "text-[#B08D3A]"`
- `src/components/ReportDocument.tsx:21` — `const BRONZE = "#B08D3A"`
- `src/components/ScrollSpyNav.tsx:3` — `const BRONZE = "#B08D3A"`
- `src/components/StrategicCompanion.tsx:52` — Tailwind arbitrary `text-[#B08D3A] bg-[#B08D3A]/10 border-[#B08D3A]/20`
- `src/components/VoiceEngineSection.tsx` L578, 579, 588, 762, 911, 915, 942, 1022, 1161, 1165, 1191 — extensive inline use
- `src/components/AuditResultsView.tsx:107` — `cs.getPropertyValue("--brand") || "#B08D3A"`
- `src/components/visual-cards/schematics/blackboard.ts:8, 21` — `gold` + `nodeStrokeHighlighted`
- `src/components/visual-cards/styles/cardStyles.ts` L11, 84, 89, 91, 165, 170, 172, 182 — card style accents/gradients/tags
- `src/components/intelligence/MarketCoverageSection.tsx:11` — `const ORANGE = "#B08D…"` (truncated in grep)
- `src/components/tabs/IdentityTab.tsx:1097`
- `src/components/tabs/IntelligenceTab.tsx:1491` — `var(--brand, #B08D3A)` fallback
- `src/components/tabs/ImpactTab.tsx` L1554, 1712, 1789, 1852, 2577–2578 (chart gradient stops), 2612 (stroke), 2706 (Bar fill), 3223, 3239, 3248 — chart + panel accents

Pages
- `src/pages/AcceptInvitation.tsx:185` — `const BRAND = "#B08D3A"`
- `src/pages/AdminDesignSystem.tsx:199, 226, 238, 267`
- `src/pages/AdminExperience.tsx:541` — placeholder text
- `src/pages/AdminQA.tsx:634, 972, 1000`
- `src/pages/Onboarding.tsx:1332, 1341, 1359, 1441`

Utils/QA
- `src/utils/qaInteractionAudit.ts:672` — expected-string reference

### `#D4B056` (and lowercase `#d4b056`)

- `src/components/BrandAssessmentModal.tsx:1234` — loader caption `color: "#d4b056"`
- `src/components/TierCeremonyModal.tsx:54` — `const GOLD = "#D4B056"`
- `src/components/LinkedInPostSteps.tsx:23` — `isDark ? "#D4B056" : ...`
- `src/components/AuditRadarWidget.tsx:108` — `cs.getPropertyValue("--bronze") || "#D4B056"`
- `src/components/home/HomeTab.tsx:376` — `color: "#d4b056"` (sparkle)
- `src/components/visual-cards/styles/cardStyles.ts` L12, 22, 137, 142, 146, 156 — `BRONZE_TEXT`/`GOLD_LIGHT` + card accents
- `src/pages/CarouselStudio.tsx` L47 (comment), L81, 82, 85, 86, 90, 298, 299, 308 — extensive carousel styling
- `public/admin/aura-standard-v2.html` L11, 14, 179, 180 — design-system reference

### `#8A6D2A` (bronze-text, related)

- `src/components/ReportDocument.tsx:22` — `const BRONZE_TEXT = "#8A6D2A"`
- `public/admin/aura-standard-v2.html:11, 180`

## Notes for the eventual swap

- The loader at `BrandAssessmentModal.tsx` L1214–1226 is the only place that visually renders the OLD eye to the end user during Brand Assessment; swapping it to `<AuraLogo />` (already used by `AuraChatSidebar`) is a one-block change plus an animation rename.
- `CarouselStudio.tsx`'s `HorizonEye` is decorative inside generated carousel slides — confirm whether you want those replaced with the Radiant Dial or kept as a generic abstract mark before any swap.
- `index.html:70` (splash) and `index.html:19` / `manifest.json:8` (theme-color) are the brand-color hardcodes most visible to users outside the app shell.
- `public/admin/aura-standard-v2.html` is a static design-system reference doc; leave or update intentionally.

No code changes proposed in this pass — awaiting your go-ahead to plan the actual swap.
