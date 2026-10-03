# 0001. SQL migrations are the source of truth for the database

- Status: accepted
- Date: 2026-10-03

## Context

Dunnit runs on Supabase Postgres. Most of what keeps the data safe lives in the database itself: row level security policies, the `handle_new_user()` trigger on `auth.users`, the append-only trigger on `agent_events`, the `security_invoker` view, column-level grants, and the pg_cron and pg_net schedules. ORM migration tools (Prisma, Drizzle Kit) model tables and columns well. They cover policies, triggers, grants, extensions and cron jobs badly or not at all, so those would end up as hand-written SQL anyway, split from the schema they protect.

The app reads and writes through `@supabase/supabase-js` and Server Actions. It does not need an ORM to build queries.

## Decision

- The database is defined only by plain SQL files in `supabase/migrations/`, named `<timestamp>_<topic>.sql` and applied in order by the Supabase CLI (`supabase db push` against the hosted project, `supabase db reset` locally).
- No ORM migrations and no schema changes made in the dashboard. A change made in the dashboard by mistake is pulled back with `supabase db diff` into a new migration before anything else ships.
- Migrations are append-only once applied to a shared environment. Fixes go in a new migration; applied files are never edited.
- TypeScript types are generated from the database (`supabase gen types typescript`), not written by hand.
- Per-environment secrets (cron URL and secret) are never committed. Migrations read them at run time and document the one-off setup step.

## Consequences

- Schema, RLS, triggers and jobs are reviewed together in one diff, and security changes are visible in code review.
- Contributors need to be comfortable with Postgres SQL and RLS. There is no ORM layer to hide it.
- No ORM means no ORM drift checks. Generated types and CI typecheck are what catch mismatches between code and schema.
- Rolling back means writing a forward migration. There are no automatic down migrations.
- Some objects need manual setup per environment (database settings for pg_cron). These steps are written as comments in the migration that depends on them.
