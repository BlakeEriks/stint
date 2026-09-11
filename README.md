# Time Tracking

A time tracker for solo contractors. One timer, a calendar, and invoicing —
and deliberately nothing else.

## Status

Foundation plus the complete API layer. Design system, schema, shared logic
and all 18 `/api/v1/*` route handlers — including invoicing and PDF
generation — are built and verified. No UI yet.

## Layout

```
docs/            architecture, data model, API contract, ADRs, design system
packages/
  schema/        Zod schemas — the API contract
  core/          timer math, rate resolution, outbox, duration formatting
  design-tokens/ tokens.json -> CSS + TS + Swift (generated)
  api-client/    typed fetch wrapper
apps/
  web/           Next.js — all features
  mobile/        Expo
  macos/         Swift menu bar
supabase/migrations/
```

## Commands

```bash
pnpm tokens             # regenerate CSS / TS / Swift from tokens.json
pnpm tokens:validate    # assert the contrast contract (runs in CI)
pnpm test               # package tests
pnpm --filter @tt/web dev
```

### Running the API tests

They exercise the real handlers against a real database:

```bash
createdb tt && psql tt -f supabase/migrations/00000000000001_init.sql
DATABASE_URL=postgresql://localhost/tt pnpm --filter @tt/web test
```

See `.github/workflows/ci.yml` for the full sequence, including the `auth`
schema stub that stands in for Supabase locally.

## Read first

- [docs/architecture.md](docs/architecture.md) — the shape and why
- [docs/data-model.md](docs/data-model.md) — schema and integrity rules
- [docs/api.md](docs/api.md) — endpoint contract
- [docs/design/principles.md](docs/design/principles.md) — what this app refuses to do
