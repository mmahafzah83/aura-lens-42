# F3 World-Class Onboarding

Replaces the current 3-step form wizard with a value-first, 4-step flow inspired by Apple/Duolingo/Canva. The user sees value before doing any work.

## Snapshots
- Before: `pre-F3-world-class-onboarding`
- After: `post-F3-world-class-onboarding`

## Database

Add nullable column to `diagnostic_profiles`:
```sql
ALTER TABLE diagnostic_profiles ADD COLUMN IF NOT EXISTS linkedin_url TEXT;
```

## New Edge Functions

1. **`onboarding-linkedin-prefill`** — accepts `{ linkedin_url }`, scrapes via Firecrawl, extracts structured fields (first_name, firm, level, core_practice, sector_focus, headline, about_summary, experience_years, skills, etc.) via Lovable AI Gateway (`google/gemini-3-flash-preview`). Always returns 200 with either `{ success, profile }` or `{ fallback: true, error }`. Adds CORS, validates URL pattern, truncates markdown to 8000 chars, strips ```json fences.

2. **`onboarding-find-article`** — accepts `{ sector_focus, core_practice, firm, level }`. Calls Exa neural search restricted to a trusted-domain allowlist (McKinsey, HBR, BCG, Bain, Deloitte, PwC, EY, Accenture, Gartner, WEF, Reuters, Bloomberg, FT, MIT Sloan, GCC press, etc.) with a 30-day lookback. Falls back to broader search without domain restriction. Returns `{ found: true, article: { url, title, summary, source } }` or `{ found: false }`. Never blocks onboarding on failure.

Both functions use `verify_jwt = false` (default for Lovable functions). Add config blocks to `supabase/config.toml`.

## New Frontend Component

Replace `src/components/OnboardingWizard.tsx` with a 4-step flow (rename internal logic; keep the file path so existing import in `Dashboard.tsx` still works).

### Step 1 — Unboxing Card (no form)
- Full-screen, centered card (max 560px)
- Cormorant Garamond heading "YOUR INTELLIGENCE OS IS LIVE"
- Body copy with 3 staggered ◆ items (0.3s delay each)
- Single CTA: "Let's begin →"
- Card fades in + slides up 20px on mount

### Step 2 — LinkedIn Pre-fill
- LinkedIn URL input + "Read →" button
- "or" divider + "Fill manually instead"
- On submit: validate `linkedin.com/in/`, strip query/hash, call `onboarding-linkedin-prefill` with 15s `AbortController` timeout
- During load: shimmer animation on input + staggered status messages ("Reading your profile…" / "Extracting your expertise…" / "Almost there…")
- On success: render editable pre-filled profile form (first_name, firm, level, sector_focus dropdown, core_practice, north_star_goal blank with warm placeholder)
- On fallback: gentle message + show same form blank
- "Confirm & continue →" upserts to `diagnostic_profiles` with `linkedin_url`
- **Brand pillars / skills sliders removed from this step**

### Step 3 — Pre-found Article
- Background-fetch `onboarding-find-article` (10s timeout) right after profile save
- If found: render article card with title, source · age, summary, "Capture this article →"
- On capture: invoke existing `ingest-capture` EF, show progress + celebration, auto-advance after 2.5s
- If not found or skipped: fall back to URL paste field
- "Skip for now" advances to Step 4

### Step 4 — Brand Assessment intro
- Updated framing copy: "How the market sees you"
- "Discover my market position →" opens existing `BrandAssessmentModal`
- "I'll do this later" closes onboarding, sets `localStorage.aura_onboarding_complete = true` and marks `onboarding_completed = true, completed = true` on profile

### Shared shell
- Centered card via `createPortal` to `document.body`
- 3-dot progress indicator at top (steps 2/3/4 — Step 1 is the unboxing intro)
- Slide transitions via framer-motion (left exit / right enter, 400ms ease-out)
- Uses CSS tokens (`var(--surface)`, `var(--ink)`, `var(--brand)`) — works in light + dark
- Mobile: full-width minus 20px, stacked inputs

## Edge cases
- LinkedIn URL validation with friendly error
- Firecrawl/AI/Exa failures → silent fallback, never block
- Profile save error → retry button, do not advance
- Timeouts via `AbortController`

## Untouched
- Brand Assessment questions/logic
- `ingest-capture` / `summarize-link` pipelines
- Sidebar nav, admin pages, Home for existing users
- Existing capture pipeline downstream

## Verification
After deploy: confirm new file exists, edge functions deploy, ALTER ran, light/dark + mobile look right, happy path + fallback path both work.
