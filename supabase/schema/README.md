# supabase/schema — full schema export

Generated from the **live database catalog** on 2026-09-04. This is a snapshot,
not a migration history.

## Why this exists alongside `supabase/migrations/`

`supabase/migrations/` holds 397 timestamped migrations. They are the real,
canonical history and are what Supabase applies. **Do not renumber, rewrite, or
replace them** — the migration table keys off their names.

This folder is the *readable* form of the same end state: what the database
looks like today, in dependency order, without replaying 397 files. Use it to
understand the schema, to diff after a change, or to stand up a scratch database
quickly.

## Apply order

```
01-extensions-and-types.sql     extensions, then the four enums
02-tables.sql                   every public table: columns, defaults, nullability
03-functions.sql                93 application functions (extension functions excluded)
04-constraints-and-indexes.sql  PK → UNIQUE → CHECK → FK, then remaining indexes
05-views.sql                    20 views
06-triggers.sql                 39 non-internal triggers
07-grants-rls-policies.sql      GRANTs, ENABLE ROW LEVEL SECURITY, 343 policies
../seed.sql                     reference/config rows (no member data)
```

`03` must run before `04`, `06` and `07` because constraints, triggers and
policies reference functions.

## Known limits of this export

- Extension-owned functions (pgvector, pg_cron, pg_net helpers) are excluded;
  `CREATE EXTENSION` in `01` recreates them.
- Grants were read from `pg_class.relacl`, so they include Postgres-internal
  privileges (`MAINTAIN`, `TRIGGER`, `REFERENCES`, `TRUNCATE`) that a
  hand-written migration would not normally list. They are the live values.
- Objects outside `public` (`auth`, `storage`, `realtime`, `vault`,
  `supabase_functions`, `cron`) are **not** exported — they are managed by the
  platform. Storage buckets and the 44 cron jobs are documented in
  `docs/02-DATABASE.md` but not scripted here:
  `UNKNOWN - verify in Supabase dashboard` for exact cron `pg_net` payloads.
- No data other than `../seed.sql`.

## Regenerating

Read-only catalog queries only; nothing here mutates the database. The
generation logic is described in `docs/05-LOCAL-SETUP.md`.
