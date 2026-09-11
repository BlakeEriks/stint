# Time Tracking

A time tracker for solo contractors. One timer, a calendar, and invoicing —
and deliberately nothing else.

## Status

Foundation. Design system, data model, API contract and shared logic are
complete and verified. No app code yet.

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
pnpm test               # run package tests
```

## Read first

- [docs/architecture.md](docs/architecture.md) — the shape and why
- [docs/data-model.md](docs/data-model.md) — schema and integrity rules
- [docs/api.md](docs/api.md) — endpoint contract
- [docs/design/principles.md](docs/design/principles.md) — what this app refuses to do
