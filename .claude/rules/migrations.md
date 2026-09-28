---
paths:
  - "supabase/migrations/**"
  - "supabase/*.sql"
  - "scripts/verify-schema.mjs"
---

## Migrations

`pnpm migrate` applies `supabase/migrations/`; `docs/setup.md` has the
connection and the flags.

**Count the rows before proposing anything destructive.** A script under
`scripts/` importing `connectionString()` from `db-url.mjs` queries the
hosted database without the secret passing through a command or a log —
`short(url)` masks it for output, and `docs/local-dev.md` has the shape.

**Editing an existing migration changes nothing that has already run.**
`pnpm migrate` records applied files by name, so a database that has seen
the old version keeps it. Correcting migration 1 is right for a fresh build
AND needs a new migration carrying the same change to production — and
`verify:schema` will not catch the gap unless it happens to assert that
column.

**Production migrates itself — never tell the user to run `pnpm migrate`
against it.** `.github/workflows/release.yml` is a Vercel deployment check:
the production build is built but not aliased until that workflow runs
`pnpm migrate` and `verify:schema` against `PRODUCTION_DB_URL`, so the
migration lands while the previous build still serves traffic. Merging and
approving the release are the whole deploy step: the approval page shows each
pending migration's SQL. `pnpm migrate` by hand is for a local or throwaway
database only, and `docs/deploying.md` owns the shape.

**From Launch, they are additive and forward-only** (constitution V). Each file runs in
its own transaction, so one that *fails* rolls back clean; there is no down
path for one that succeeds and is wrong, so write migrations that cannot need
reverting:

- **Before Launch, a destructive change is fine.** Drop what a cut feature
  left behind in a new migration, and update the macOS app in the same PR.
  Schema that has never reached production folds into its original file
  instead.
- Backfills belong in their own migration, separate from the DDL, so a slow
  one cannot hold a lock on the change that needs to land.

`verify:schema` checks the shape is correct, not that getting there was safe;
from Launch, #141 checks it.

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
before it reaches a real project. It takes `--url` or `SUPABASE_DB_URL` from
the environment — a secret that bypasses RLS, kept in no file on disk.

**Production has an `rls_auto_enable` event trigger that no migration
creates** — see `docs/data-model.md`. Never let it stand in for a table's own
`enable row level security` and policy: local and CI have no such trigger, and
it cannot write policies anyway.

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
