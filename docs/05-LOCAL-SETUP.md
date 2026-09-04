# 05 — Local setup

## 1. Prerequisites

- Node 20+ (or Bun). `package.json` has no `engines` field —
  `UNKNOWN - verify with the team`; Node 20 matches the toolchain versions.
- Supabase CLI (for a local stack or for deploying functions).
- Docker, only if you want `supabase start` (local Postgres + Auth + Storage).

## 2. Install and run the frontend

```bash
npm install
npm run dev          # http://localhost:8080  (port is pinned in vite.config.ts)
```

Create `.env` at the repo root:

```
VITE_SUPABASE_URL="https://<project>.supabase.co"
VITE_SUPABASE_PUBLISHABLE_KEY="<anon key>"
VITE_SUPABASE_PROJECT_ID="<project ref>"
```

These are public values (RLS protects the data). Without them the generated
client initialises with `undefined` and the app fails with no clear message.

## 3. Point at a fresh Supabase project

Two routes.

### A. Replay the migration history (matches production exactly)

```bash
supabase link --project-ref <ref>
supabase db push          # applies supabase/migrations/ in filename order
psql "$DB_URL" -f supabase/seed.sql
```

### B. Apply the schema snapshot (faster, same end state)

```bash
psql "$DB_URL" -f supabase/schema/01-extensions-and-types.sql
psql "$DB_URL" -f supabase/schema/02-tables.sql
psql "$DB_URL" -f supabase/schema/03-functions.sql
psql "$DB_URL" -f supabase/schema/04-constraints-and-indexes.sql
psql "$DB_URL" -f supabase/schema/05-views.sql
psql "$DB_URL" -f supabase/schema/06-triggers.sql
psql "$DB_URL" -f supabase/schema/07-grants-rls-policies.sql
psql "$DB_URL" -f supabase/seed.sql
```

Order matters: functions before constraints/triggers/policies, because those
reference functions. See `supabase/schema/README.md` for what the snapshot does
**not** cover (storage buckets, cron jobs, non-`public` schemas).

## 4. Things the snapshot does not create

- **Storage buckets** — create five: `capture-images` (public, no size limit),
  `documents` (private), `captures` (private), `avatars` (public, 5 MiB),
  `deck-media` (private, 25 MiB). Bucket policies on `storage.objects` live in
  the migration history.
- **Cron jobs** — 44 `pg_cron` jobs call edge functions through `pg_net` with
  `CRON_SECRET`. Their exact schedules and payloads:
  `UNKNOWN - verify in Supabase dashboard`.
- **Auth settings** — providers, email templates, redirect URLs:
  `UNKNOWN - verify in Supabase dashboard`.

## 5. Edge Functions

```bash
supabase functions serve <name>          # local
supabase functions deploy <name>         # deploy one
```

`supabase/config.toml` sets `verify_jwt` per function; almost all are `false`
because they verify the caller themselves (`getUser()` on an anon client with
the caller's `Authorization` header) or are cron-only and check `CRON_SECRET`.
Set the secrets listed in `docs/00-OVERVIEW.md` before serving anything that
calls a model or LinkedIn.

## 6. Verify the setup

```bash
npm run typecheck     # tsc --noEmit
npm run lint          # vocabulary gate + eslint
npm run test          # vitest
npm run build         # the vocabulary gate runs inside the build and can fail it
npm run test:e2e      # playwright, needs the dev server
```

Then, in the browser: `/` loads the landing page, `/assessment` accepts a
LinkedIn URL and shows the working panel, `/auth` signs in, `/dashboard` renders
with your counts. If a table read returns a permission error, check the GRANT —
RLS alone is not enough.
