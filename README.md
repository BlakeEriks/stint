# Time Tracking

A time tracker for solo contractors. One timer, a calendar, and invoicing —
and deliberately nothing else.

## Status

Design system, schema, shared logic and the `/api/v1/*` route handlers —
including invoicing, payment details and PDF generation — are built and
covered by integration tests. The app sends no email: invoices are downloaded
and sent by the user from their own address.

**Not built yet:** any UI, the mobile and macOS apps, and the `POST /sync`
handler (the client-side outbox exists; the server half does not).

## Layout

```
docs/            architecture, data model, API contract, ADRs, design system
docs/design/samples/  committed renderer output
packages/
  schema/        Zod schemas — the API contract
  core/          duration, rates, timer, uuid, outbox, calendar,
                 invoice, payment
  design-tokens/ tokens.json -> CSS + TS + Swift (generated into dist/)
  api-client/    typed fetch wrapper
apps/
  web/           Next.js — the API layer
supabase/migrations/
```

`apps/mobile` (Expo) and `apps/macos` (Swift) are planned, not created.

## Commands

```bash
pnpm tokens                      # generate CSS / TS / Swift from tokens.json
pnpm tokens:validate             # assert the contrast contract (runs in CI)
pnpm --filter @tt/core test      # pure logic, no database needed
pnpm --filter @tt/web dev
pnpm --filter @tt/web typecheck
pnpm --filter @tt/web sample:invoice   # regenerate docs/design/samples/
```

Run `pnpm tokens` first on a clean checkout: `@tt/design-tokens` resolves
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
DATABASE_URL=postgresql://localhost/tt pnpm --filter @tt/web test
```

Those tests disable RLS to run through a direct connection. RLS is covered
separately by `pnpm --filter @tt/web test:rls`, which needs its own database
with RLS left on and a non-superuser `authenticated` role — see the
"Set up the RLS database" step in `.github/workflows/ci.yml`, the
authoritative sequence for both.

Note that the root `pnpm test` recurses into `@tt/web`, which needs
`DATABASE_URL` — use the per-package commands above on a clean checkout.

## Read first

- [docs/architecture.md](docs/architecture.md) — the shape and why
- [docs/data-model.md](docs/data-model.md) — schema and integrity rules
- [docs/api.md](docs/api.md) — endpoint contract
- [docs/design/principles.md](docs/design/principles.md) — what this app refuses to do
