# Stint

A time tracker for solo contractors. One timer, a calendar, and invoicing —
and deliberately nothing else.

## Status

Design system, schema, shared logic and the `/api/v1/*` route handlers —
including invoicing, payment details and PDF generation — are built and
covered by integration tests. The app sends no email: invoices are downloaded
and sent by the user from their own address.

**Not built yet:** the mobile app. The web app is complete: timer, calendar,
clients, projects, settings, payment profiles, invoicing. The macOS menu bar
app runs the timer — start, stop, task name, project — and nothing else.

## Layout

```
docs/            setup, deploying, architecture, data model, API contract, design system
docs/roadmap.md    wanted but not built, and the hard parts already thought through
docs/design/samples/  committed renderer output
packages/
  schema/        Zod schemas — the API contract
  core/          duration, rates, timer, uuid, calendar,
                 invoice, payment
  design-tokens/ tokens.json -> CSS + TS + Swift (generated into dist/)
apps/
  web/           Next.js — the API layer
  macos/         Swift menu bar app — the timer only
supabase/migrations/
```

`apps/mobile` (Expo) is planned, not created.

## Commands

```bash
pnpm tokens                      # generate CSS / TS / Swift from tokens.json
pnpm tokens:validate             # assert the contrast contract (runs in CI)
pnpm --filter @stint/core test      # pure logic, no database needed
pnpm --filter @stint/web dev
pnpm --filter @stint/web typecheck
pnpm --filter @stint/web sample:invoice   # regenerate docs/design/samples/

./apps/macos/bundle.sh                    # build and install ~/Applications/Stint.app
```

Run `pnpm tokens` first on a clean checkout: `@stint/design-tokens` resolves
through the generated `dist/`.

### Running the API tests

They exercise the real handlers against a real database, so **every**
migration must be applied and the Supabase `auth` schema stubbed:

```bash
createdb tt
psql tt -c "create schema auth" \
       -c "create table auth.users (id uuid primary key default gen_random_uuid(), email text)" \
       -c "create function auth.uid() returns uuid language sql stable as \$\$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid \$\$"
for f in supabase/migrations/*.sql; do psql tt -f "$f"; done
DATABASE_URL=postgresql://localhost/tt pnpm --filter @stint/web test
```

Those tests disable RLS to run through a direct connection. RLS is covered
separately by `pnpm --filter @stint/web test:rls`, which needs its own database
with RLS left on and a non-superuser `authenticated` role — see the
"Set up the RLS database" step in `.github/workflows/ci.yml`, the
authoritative sequence for both.

`pnpm db:setup` builds both databases on the local stack's Postgres, and
`pnpm verify:db` runs both suites and the schema check against them.

`pnpm test:e2e` is a fourth suite: Playwright against a real browser, needing
the local Supabase stack (`pnpm dev:up`) and the app (`pnpm dev`) already
running. It is deliberately outside `verify:static` and `verify:db` so a
browser download is not a prerequisite for the unit suites, and it signs in
for real through Mailpit rather than injecting a cookie. It is the only suite that sees cookies,
navigation, redirects and server components — see `docs/local-dev.md`.

## Read first

- [docs/architecture.md](docs/architecture.md) — the shape and why
- [docs/data-model.md](docs/data-model.md) — schema and integrity rules
- [docs/api.md](docs/api.md) — endpoint contract
- [docs/macos.md](docs/macos.md) — the menu bar app: building it, and which backend it talks to
- [docs/positioning.md](docs/positioning.md) — who this is for, what it competes with, what it costs
- [docs/design/principles.md](docs/design/principles.md) — what we believe about the product
- [docs/roadmap.md](docs/roadmap.md) — wanted but not built, and the gate it passes to get there
- [Issues labelled `bug`](https://github.com/BlakeEriks/stint/issues?q=is%3Aopen+label%3Abug) — known faults

## License

Copyright (C) 2026 Blake Eriks. Licensed under the
[GNU AGPL v3.0](LICENSE).

You may use, modify and self-host this freely. The one obligation that
matters: **if you run a modified version as a network service, you must
publish your source** — that is the difference between the AGPL and the GPL,
and it is why this license was chosen.

Copyright is held solely by the author, so these terms bind everyone else and
not the author. A commercial license, for anyone wanting to build on this
without the source obligation, is available on request.
