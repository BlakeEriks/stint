---
paths:
  - "supabase/migrations/**"
  - "supabase/*.sql"
  - "scripts/verify-schema.mjs"
---

## Migrations

`pnpm migrate` applies `supabase/migrations/`; `docs/setup.md` has the
connection and the flags.

**Production migrates itself — never tell the user to run `pnpm migrate`
against it.** `.github/workflows/release.yml` is a Vercel deployment check:
the production build is built but not aliased until that workflow runs
`pnpm migrate` and `verify:schema` against `PRODUCTION_DB_URL`, so the
migration lands while the previous build still serves traffic. Merging is
the whole deploy step. `pnpm migrate` by hand is for a local or throwaway
database only, and `docs/deploying.md` owns the shape.

**They are additive and forward-only.** Each file runs in its own
transaction, so one that *fails* rolls back clean. There is no down path for
one that *succeeds and is wrong* — and for a billing system that is the right
trade: a rollback that drops a column takes issued invoices with it. So write
migrations that cannot need reverting:

- **Add, never destroy.** New columns are nullable or defaulted. Do not drop
  or rename a column that has shipped, and do not narrow a type.
- **Retiring a column is two releases.** Stop writing it, ship, confirm
  nothing reads it, then drop it in a later migration — never in the same one
  that changes the code.
- **A destructive change to unreleased schema is fine.** Before anything is
  live, fold the correction into the original file rather than stacking a
  fix-up on top.
- Backfills belong in their own migration, separate from the DDL, so a slow
  one cannot hold a lock on the change that needs to land.

`verify:schema` checks the shape is correct, not that getting there was safe.
This one is a review rule.

**The publishable key is public by design** — it ships in the browser bundle,
so RLS is the only thing protecting the data. That makes `verify:schema` the
real security control: a table reaching production without RLS exposes every
user's rows, and nothing else in the stack notices.

`pnpm verify:schema` asserts seven tables with **RLS on**, at least one policy
each (RLS with no policies denies everything), and the invariants a migration
can silently undo — the partial unique index behind the timer rule, the
composite key keeping an entry's project with its owner, that no application
function is executable by `anon`, and the signup trigger. CI runs it in the `database` job
against the RLS database, so a migration creating a table without RLS fails
before it reaches a real project. It reads `SUPABASE_DB_URL` from
`apps/web/.env.local` — a secret that bypasses RLS and is never used by the
app itself.

### Triggers on `auth.users`

`create_default_settings` fires inside Supabase's **signup transaction**.
Anything it raises rolls the whole signup back, and the Auth service swallows
the useful error: the client sees only `unexpected_failure` / "Database error
saving new user" with a 500, which names nothing.

Any future `security definer` function needs `set search_path = public,
pg_temp` for the reason the trigger carries it — see the comment above
`create_default_settings` in `00000000000002_integrity.sql`. It is also the
standard hardening against a caller shadowing a table name.

**Anything added to that trigger inserts `on conflict do nothing`**, for the
same reason the settings insert does: a duplicate must not become the error
that rolls a signup back.

To test a migration locally without touching a real project, start a
throwaway Postgres (`/opt/homebrew/opt/postgresql@14/bin`) on a spare port
over TCP — the socket path in the scratchpad exceeds the 103-byte limit —
stub `auth.users` and `auth.uid()`, then point `pnpm migrate --url` at it.
