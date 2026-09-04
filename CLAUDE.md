# CLAUDE.md — brief for an agent working in this repo

Aura is a bilingual (EN/AR) authority-building instrument for senior
professionals: capture what you read → the system finds signals → you write in
your own voice → you publish and it measures. Built on Vite + React 18 +
TypeScript + Tailwind, with Supabase (Postgres, Auth, Storage, Realtime) and 167
Deno Edge Functions.

## Read these first

| File | What it gives you |
|---|---|
| `docs/00-OVERVIEW.md` | Product, users, journeys, versions, every env var |
| `docs/01-ARCHITECTURE.md` | Directories, routes and gates, data flow, auth |
| `docs/02-DATABASE.md` | 140 tables, 211 functions, 39 triggers, 343 policies |
| `docs/03-BUSINESS-LOGIC.md` | The rules that must not drift |
| `docs/04-EDGE-FUNCTIONS.md` | Every function: JWT, payload, env, tables |
| `docs/05-LOCAL-SETUP.md` | Running it, standing up a fresh database |
| `docs/06-KNOWN-ISSUES.md` | Debt, dead code, traps |
| `.lovable/memory/` | Long-form product decisions (design, waiting, voice, signals) |

## Commands

```bash
npm run dev         # localhost:8080
npm run typecheck   # tsc --noEmit -p tsconfig.app.json
npm run lint        # vocabulary gate + eslint
npm run test        # vitest
npm run build       # the vocabulary gate runs inside the build and can fail it
npm run test:e2e    # playwright
```

## Conventions that are load-bearing

- **Design tokens only.** Colours, gradients and shadows are semantic tokens in
  `src/index.css`. Never `text-white`, `bg-black` or `bg-[#…]` in a component.
  Dark theme, gold accent `#C5A55A`.
- **Plain English, sentence case, no jargon, no emojis in navigation.** Copy is
  policed by `scripts/check-vocabulary.mjs`, which runs inside the build.
- **One definition per number.** Import from `src/lib/counts.ts`,
  `src/lib/plan.ts`, `src/lib/postProvenance.ts`, `src/lib/capabilityBands.ts`.
  Never inline a `(source_type, tracking_status)` test or a plan string compare.
  Each has a Deno twin under `supabase/functions/_shared/` — change both.
- **Never edit** `src/integrations/supabase/client.ts`,
  `previewAuthStorage.ts`, `types.ts`, `.env`, `supabase/config.toml`
  project-level settings.
- **Roles live in `user_roles`**, checked via `has_role()` /
  `is_current_user_admin()`. Never on a profile column, never client-side.
- **Every new public table needs GRANTs in the same migration**, then RLS, then
  policies. RLS alone returns a permission error.
- **Progress is real or absent.** Stage ticks come from `operation_runs` over
  Realtime; never a timer.
- **Snapshots are append-only**; profile writes merge, never replace.
- Overlays use `createPortal` to `document.body`.
- Edge functions: get a live session before `functions.invoke`; surface the
  provider's status and body on failure rather than a bare 500.

## Making a schema change

Write a new timestamped file in `supabase/migrations/`. Never renumber or
rewrite existing ones (there are 397). `supabase/schema/` is a generated
read-only snapshot of the end state — regenerate it after a change, do not edit
it by hand.

## Style of work

Surgical, minimal, non-destructive. Change what was asked and nothing adjacent.
When two readings of a request differ materially, ask; otherwise finish the
whole thing and say plainly what you could not verify.
