# Local development

**Local dev never points at production.** `pnpm dev:up` runs the whole
Supabase stack on this machine — Postgres, Auth, PostgREST — and `pnpm dev`
talks to it. The hosted project is for deploys; see `docs/setup.md`.

Verified end to end: seeded, signed in through the real magic-link flow, and
`pnpm verify:schema` passes against the local database.

## Once

Install a container runtime. Docker Desktop works; so do OrbStack, colima,
Podman and Rancher Desktop.

Then write `apps/web/.env.development.local`:

```
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH
SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
```

Those are the CLI's fixed development credentials — identical on every
machine, published in Supabase's own docs, stable across resets. Nothing here
is a secret.

**Next.js loads `.env.development.local` before `.env.local` in development**,
which is what makes this safe: `pnpm dev` gets local, while `pnpm migrate` and
`pnpm verify:schema` still read `.env.local` and reach production. There is no
flag to remember and no way to accidentally develop against real data.

## Every day

```bash
pnpm dev:up        # start the stack (first run pulls images)
pnpm dev           # in apps/web
```

`pnpm dev:reset` rebuilds the database from migrations plus `seed.sql` —
the fastest way back to a known state. `pnpm dev:down` stops it;
`pnpm dev:status` prints the URLs.

| What | Where |
|---|---|
| App | http://localhost:3100 |
| Studio (browse tables) | http://127.0.0.1:54323 |
| Mailpit (every sent email) | http://127.0.0.1:54324 |
| Postgres | `postgresql://postgres:postgres@127.0.0.1:54322/postgres` |

## Signing in

**Any email address works** — including your real one. Enter it on `/signin`,
then open **Mailpit** and click the link. No mail leaves the machine, so
there is nothing in your actual inbox and nothing to rate-limit.

`auth.email.enable_confirmations` is `false` locally, so a brand-new address
is usable immediately; `dev@localhost.test` is the one the seed owns, so it is
the only one that comes with clients, projects and entries.

**Always start from `/signin` in the browser you want signed in**, and never
paste someone else's link. Sign-in is PKCE: the form stores a code verifier in
*that browser's* localStorage, and the emailed link carries a `pkce_` token
redirecting to `/auth/callback?code=…`, which only completes with the matching
verifier. A link generated any other way — `curl` against
`/auth/v1/otp`, for instance — comes back **without** the `pkce_` prefix and
with `redirect_to` defaulting to the bare origin, so the token arrives as a
URL `#fragment` that nothing on `/` reads. The click looks like it worked and
you land signed out; a re-click then says `bad request`, because verification
consumed the one-time token on the first try.

So two people (or a person and an agent) cannot share one link — but they can
both be signed in at once. Sessions are independent; only the token is
single-use and browser-bound. Request one link each.

**Click the newest message in Mailpit.** It keeps every email, and an older
one has almost certainly been spent.

**Everything speaks `localhost`, never `127.0.0.1`.** A browser treats them as
different hosts, so a link verified through one sets its session cookie for a
host the app is not served from — the click appears to work and the app stays
signed out. `auth.external_url` in `config.toml` is what puts the right host
into the emailed link; it is set for this reason and should stay set.

Note that `[studio].api_url` is a different setting and does *not* affect the
link — it only changes Studio's own API calls. Changing it looks like it should
work and does nothing.

## What the seed contains

`supabase/seed.sql` deliberately includes the cases that break layouts,
because an empty app is a poor test of one:

- two **overlapping** entries, so the calendar's lane assignment is exercised
  rather than assumed
- a **very long** task name, which is what finds a missing truncation
- an **empty** task name, which must render as "Untitled" and not a blank row
- **non-billable** work, for the badge and the em-dash rate
- three different **resolved rates** (override, project, client), so an invoice
  preview has more than one line and "the rate is part of the grouping key"
  is visible
- an **archived** client and a project with **no client**, which is how
  internal work is modelled and the one case that renders with no colour

Dates are relative to `now()`, so the current week is always populated.

## Traps found setting this up

**The CLI skips a migration named `init`.** Ours was
`00000000000001_init.sql`, and `supabase start` printed one line about
skipping it, then applied the *rest* — so the stack came up with no tables and
failed confusingly on the second file. Renamed to `..._schema.sql`.

Because `migrate.mjs` keys `schema_migrations` on the filename, that rename
made production consider the first migration unapplied. `scripts/record-rename.mjs`
is the one-off bookkeeping fix; it changes no schema. It is deliberately not a
migration, since `migrate.mjs` reads `schema_migrations` once before applying
anything and a fix-up file cannot run early enough to help itself.

**A hand-written `auth.users` row needs empty strings, not NULL**, in
`confirmation_token`, `recovery_token`, `email_change_token_new` and
`email_change`. GoTrue scans them into non-nullable Go strings, so a NULL
fails every lookup with `Database error finding user` and a 500 — and the
error names none of those columns. Only hand-written rows hit this.

**`supabase db reset` invalidates any session you were holding.** The old
user id is gone, RLS correctly returns nothing for it, and the app renders as
though it has no data. Clear cookies and sign in again rather than debugging
the query.

## What is not running

`realtime`, `storage`, `edge_runtime` and `analytics` are disabled in
`config.toml`. The app touches none of them — its Supabase surface is
`.from()`, one `.rpc()`, and auth. That matters in practice: the full stack
wants ~7GB of RAM, and this subset runs in about **540MB** across seven
containers.

Enable one by flipping `enabled = true` in `supabase/config.toml` if a feature
ever needs it.

## Keeping local and production honest

Local runs the **same migrations** as production, so schema drift shows up
here first. Two things worth running against local before a deploy:

```bash
SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres pnpm verify:schema
```

and a signup, which exercises `create_default_settings` — a trigger that runs
inside Supabase's own signup transaction and once broke production with a
missing `search_path`. Local reproduces that code path faithfully.

`major_version = 17` in `config.toml` matches the hosted project (17.6). If
you upgrade one, upgrade the other.

## The route tests can use it too

`apps/web/test/routes.test.ts` runs the real handlers against real Postgres,
and the local stack is real Postgres with the real migrations:

```bash
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres pnpm test
```

Verified: 45 tests pass. This replaces the throwaway-instance procedure that
CLAUDE.md describes for migration work — that is still the right tool for
testing a migration in isolation, but not for running the suite.

Note the tests **truncate tables in `beforeEach`**, so running them wipes the
seed. `pnpm dev:reset` puts it back.
