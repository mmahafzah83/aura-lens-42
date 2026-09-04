# 01 — Architecture

## Shape

A single-page Vite/React app talking directly to Supabase (Postgres + Auth +
Storage + Realtime) and to 167 Deno Edge Functions. There is no Node server and
no API layer of our own: the browser either uses the Supabase JS client (RLS
enforces access) or `supabase.functions.invoke` / raw `fetch` against an edge
function.

```text
browser (React SPA)
  ├── @supabase/supabase-js ──► Postgres (RLS)     reads/writes member rows
  ├── supabase.functions.invoke ──► Edge Functions ──► Anthropic / Lovable AI /
  │                                                    OpenAI / Perplexity /
  │                                                    Apify / Firecrawl / Resend
  ├── Realtime channels ──► operation_runs, notifications
  └── Storage ──► capture-images, documents, captures, avatars, deck-media

pg_cron (44 jobs) ──► pg_net ──► Edge Functions (guarded by CRON_SECRET)
```

## Directories

| Path | Responsibility |
|---|---|
| `src/pages/` | One file per route. Big surfaces: `Dashboard.tsx` (tabbed member home), `Assessment.tsx` (public read), `LandingV2.tsx`, `Studio.tsx`, `Settings.tsx`, `Onboarding.tsx`, `Admin*.tsx`. |
| `src/components/` | Feature components, grouped by folder: `ask/` (Your Desk), `studio/` (composer/drafts), `tabs/` (dashboard tabs), `settings/`, `read/`, `visual-cards/`, `ui/` (shadcn primitives). |
| `src/carousel/` | The deck pipeline: `deckIR.ts` (intermediate representation), `compose.ts`, `render/` (Deck, fit ladder, export), `studio/` (edit panel, canvas), `__fixtures__/` + `__tests__/`. |
| `src/lib/` | Pure logic and canonical definitions. This is where "one number, one definition" rules live (`counts.ts`, `plan.ts`, `postProvenance.ts`, `capabilityBands.ts`). |
| `src/hooks/` | Data hooks (`usePlan`, `useAuthReady`, `useRunStages`, `useMilestones`, …). |
| `src/constants/` | Vocabulary, concepts, sectors, seniority, tier copy. Enforced by the vocabulary gate. |
| `src/contexts/` | `LanguageContext` (EN/AR + RTL). |
| `src/integrations/supabase/` | Auto-generated client and types. **Never edit.** |
| `supabase/functions/` | Edge Functions; shared code in `_shared/`. |
| `supabase/migrations/` | 397 timestamped migrations, applied in filename order. |
| `.lovable/memory/` | Long-form product decisions (design law, waiting law, voice, signals). Read these before changing behaviour. |
| `e2e/`, `src/test/` | Playwright specs and Vitest setup. |
| `scripts/check-vocabulary.mjs` | The vocabulary gate; runs inside `vite build`. |

## Routes and access

Defined in `src/App.tsx`. Three gate components wrap routes:

- `PasswordGate` — requires an authenticated member.
- `AdminGate` — additionally requires the admin role.
- no wrapper — public.

| Route | Component | Gate |
|---|---|---|
| `/`, `/v2` | `LandingV2` | public |
| `/assessment` | `Assessment` | public |
| `/read`, `/mirror` | redirect to `/assessment` keeping `?url=` and `?ref=` | public |
| `/r/:token` | `SharedRead` | public |
| `/auth`, `/login` | `Auth` | public |
| `/request-access`, `/accept-invitation` | | public |
| `/onboarding` | `Onboarding` | public route, member flow |
| `/home`, `/dashboard` | `Dashboard` | PasswordGate |
| `/settings` (`/preferences` → `?tab=preferences`) | `Settings` | PasswordGate |
| `/studio`, `/compose`, `/carousel-studio` | `Studio` | `/studio` gated; the two aliases render `Studio` directly |
| `/trends/:id` | `TrendDetail` | PasswordGate |
| `/linkedin-import`, `/edition`, `/card-preview`, `/signature`, `/signature-harness` | | PasswordGate |
| `/voice-harness` | `VoiceHarness` | public (static fixtures only) |
| `/carousel-preview` | `CarouselPreview` | dev builds only |
| `/admin`, `/admin/{access,cost,people,journey,crons,design-system,experience,appearance,qa,guide-health,standard}` | | PasswordGate + AdminGate |
| `/terms`, `/privacy`, `/trust`, `/our-story`, `/guide`, `/guide/thought-leadership-strategy`, `/contact` | | public |
| `/api/auth/linkedin/callback` | `LinkedInCallback` | public (OAuth return) |
| `/.lovable/oauth/consent` | `OAuthConsent` | public |
| `*` | `NotFound` | public |

Heavy or rare routes are `React.lazy`; the Suspense fallback is the Aura mark.
`Mirror.tsx` and `PublicWelcome.tsx` exist in `src/pages/` but are **not routed**.

## Data flow

**Reads.** Components use the Supabase client directly; RLS restricts rows to
`auth.uid()`. React Query is configured globally in `App.tsx` with
`staleTime` 3 min, `gcTime` 10 min, no refetch on focus or mount, one retry.

**Writes that need a secret, a model, or another user's data** go through an
edge function. Client callers must have a live session first — a session is
fetched/refreshed before `functions.invoke` (see `src/lib/invokeEdgeFunction.ts`
and the memory note on edge-function auth).

**Long operations** (LinkedIn read, deck generation, instrument runs) write
stage rows to `operation_runs` keyed by a client-generated run id. The client
subscribes over Realtime and renders `WorkingPanel` ticks from real backend
stage events — never timers. See `src/lib/operationStages.ts`,
`src/lib/useRunStages.ts` and `.lovable/memory` "waiting law".

**Retrieval / grounding.** `search_vault` (SQL) does hybrid text + vector search
with reciprocal-rank fusion across `entries`, `content_items`,
`document_chunks`, `strategic_signals` and LinkedIn rows. `ask-aura` and
`chat-aura` call it; answers must cite retrieved rows.

## Auth and roles

- Supabase email/password auth. No anonymous sign-up; anonymous assessment work
  lives in `assessment_sessions` and is claimed with `claim_assessment_session`
  after sign-up.
- `user_roles` (`app_role` = `admin | member`) is the only role store.
  `has_role()` and `is_current_user_admin()` are SECURITY DEFINER and are what
  policies call — never read roles from a profile column or localStorage.
- `diagnostic_profiles` holds the member profile. Billing/privilege columns
  (`plan`, `tier`, `account_type`, `plan_source`, `trial_ends_at`,
  `excluded_at`, `excluded_reason`) are protected by the
  `guard_profile_billing_columns()` trigger: only service-role or admin may
  change them, regardless of RLS.

## State, cache, i18n

- Server state: React Query. Local UI state: component state + a few persisted
  `localStorage` keys (collapse blocks, language, first-visit hints).
- Language: `LanguageContext` gives `lang` (`en`/`ar`) and RTL direction.
  **Chrome language and writing language are separate** — the composer's UI
  language is not seeded from the language the member is writing in.

## Integrations

LinkedIn (OAuth + Apify scraping), Anthropic, Lovable AI Gateway, OpenAI
(embeddings), Perplexity (trends), Firecrawl (page fetch), Resend (email +
webhook). Each is reached only from an edge function.
