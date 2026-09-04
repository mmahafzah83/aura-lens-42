# 00 — Overview

> Grounded in the repository and the live database as of 2026-09-04.
> Anything not verifiable from code or catalog is marked
> `UNKNOWN - verify in Supabase dashboard`.

## What the product is

Aura is a bilingual (English / Arabic) authority-building instrument for senior
professionals. A member arrives from the public landing page, gets a free
"read" of their LinkedIn presence, then — if entitled — works a loop:

1. **Capture** — save things they read, write, or are sent (`entries`,
   `documents`, LinkedIn imports).
2. **Signals** — the system turns captured material and market data into
   `strategic_signals` and `agent_findings`.
3. **Write** — the Studio / composer turns a signal into a post or a carousel
   deck, in the member's own voice (`authority_voice_profiles`, `voice_traits`).
4. **Publish and measure** — posts are tracked (`linkedin_posts`,
   `linkedin_post_metrics`), and standing is scored (`imprint_snapshots`,
   `capability_radar_snapshots`).
5. **Your Desk** — a grounded assistant (`ask-aura`) that answers only from the
   member's own data, with tools that can save a draft, set a reminder, search
   the member's graph, and open a surface.

## Who uses it

| Audience | Entry | Access |
|---|---|---|
| Anonymous visitor | `/` landing, `/assessment`, `/r/:token` shared read | No account. Assessment sessions are anonymous rows claimed on sign-up. |
| Member | `/home` `/dashboard` | Requires auth. Feature access decided by `diagnostic_profiles.plan`. |
| Admin | `/admin/*` | Requires a row in `user_roles` with `role='admin'`; checked by `has_role()` / `is_current_user_admin()`. |

Entitlement (`src/lib/plan.ts`): `plan` is `trial | free | paid`.
`trial` and `paid` get the full loop; `free` gets the read only; anything
unrecognised (including `null`) resolves to `free` — it fails closed.
"Not loaded yet" is `null`, never `free`.

## Primary journeys

- **Free read** — landing → `/assessment` → LinkedIn URL → `mirror-read` edge
  function → `ReadResult` card → sign-up → session claimed to the new user.
- **Onboarding** — `/onboarding`: role/level + sector (both required to
  continue), CV upload, LinkedIn connect, first capture.
- **Daily loop** — morning signal email → `/dashboard?tab=…` → signal → Studio
  → draft → publish → metrics sync.

## Stack and exact versions

From `package.json` (see the file for the full list):

- React `^18.3.1`, React DOM `^18.3.1`, React Router `^6.30.4`
- Vite `^5.4.19`, `@vitejs/plugin-react-swc` `^3.11.0`, TypeScript `^5.8.3`
- Tailwind `^3.4.17`, `tailwindcss-animate`, `@tailwindcss/typography`
- shadcn/ui on Radix primitives (accordion → tooltip, ~28 packages)
- `@supabase/supabase-js` `^2.108.2`
- `@tanstack/react-query` `^5.83.0`
- `framer-motion` `^12.38.0`, `recharts` `^2.15.4`, `reactflow` `^11.11.4`,
  `three` `0.161.0`
- Documents/exports: `pdfjs-dist` `^6.1.200`, `mammoth`, `jspdf`, `jszip`,
  `html-to-image`, `html2canvas`, `papaparse`, `qrcode`
- Forms/validation: `react-hook-form` `^7.61.1`, `zod` `^4.4.3`
- Tests: `vitest` `^3.2.4`, `@testing-library/react` `^16`,
  `@playwright/test` `^1.57.0`
- Backend: Supabase (Postgres 15 + Edge Functions on Deno). 167 function
  directories, 397 migrations.

## Scripts

```
dev              vite
build            vite build           (runs the vocabulary gate inside the build)
build:dev        vite build --mode development
prebuild         node scripts/check-vocabulary.mjs
lint             vocabulary gate + eslint .
typecheck        tsc --noEmit -p tsconfig.app.json
test             vitest run
test:e2e         playwright test
```

## Environment variables

### Frontend (`.env`, must be prefixed `VITE_`, inlined at build time)

| Name | Purpose |
|---|---|
| `VITE_SUPABASE_URL` | Project API URL. Used by the generated client and by hand-rolled `fetch` calls to edge functions. |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Anon/publishable key. Public by design; RLS protects data. |
| `VITE_SUPABASE_PROJECT_ID` | Used by `src/lib/mcp/index.ts`. |

`import.meta.env.DEV` gates the dev-only `/carousel-preview` route and a few
hints. There is no missing-variable guard in the generated client: if these are
absent at build time the published app breaks silently.

### Backend (Edge Function secrets; counts = number of functions reading each)

| Name | Reads | Purpose |
|---|---|---|
| `SUPABASE_URL` | 197 | Auto-provided. |
| `SUPABASE_SERVICE_ROLE_KEY` | 162 | Auto-provided. Server-only. |
| `SUPABASE_ANON_KEY` | 128 | Auto-provided; used for user-scoped clients. |
| `CRON_SECRET` | 58 | Shared secret guarding cron-invoked functions. |
| `LOVABLE_API_KEY` | 46 | Lovable AI Gateway (default model provider). |
| `ANTHROPIC_API_KEY` | 22 | Claude calls (e.g. `mirror-read`). |
| `RESEND_API_KEY` | 21 | Transactional and lifecycle email. |
| `PERPLEXITY_API_KEY` | 8 | Industry trends / market research. |
| `OPENAI_API_KEY` | 8 | Embeddings and some completions. |
| `APIFY_TOKEN` | 4 | LinkedIn profile/post scraping. |
| `LINKEDIN_CLIENT_ID` / `LINKEDIN_CLIENT_SECRET` | 3 each | LinkedIn OAuth. |
| `FIRECRAWL_API_KEY` | 2 | Page fetching. |
| `ADMIN_ALERT_EMAIL` | 3 | Where operational mail goes. |
| `RESEND_WEBHOOK_SECRET` | 1 | Verifies Resend webhooks. |
| `IP_HASH_SALT` | 1 | Sign-up fingerprint hashing. |
| `HEARTBEAT_URL` | 1 | External uptime ping. |
| `DISCOVERY_ENABLED`, `AURA_OPS_REPORT_EMAIL_ENABLED`, `ADMIN_DIGEST_EMAIL_ENABLED` | 1 each | Feature flags read as strings. |

Actual secret **values** are not readable from the repository —
`UNKNOWN - verify in Supabase dashboard`.

## Where to read next

- `docs/01-ARCHITECTURE.md` — directories, routes, data flow.
- `docs/02-DATABASE.md` — every table, function, trigger, policy.
- `docs/03-BUSINESS-LOGIC.md` — the rules that must not drift.
- `docs/04-EDGE-FUNCTIONS.md` — all 167 functions.
- `docs/05-LOCAL-SETUP.md` — running it locally.
- `docs/06-KNOWN-ISSUES.md` — debt and traps.
- `CLAUDE.md` — the short brief for an agent working in this repo.
