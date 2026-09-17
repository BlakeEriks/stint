---
paths:
  - "apps/web/test/**"
  - "apps/web/e2e/**"
  - "packages/core/test/**"
  - "scripts/ci-db.sh"
  - ".github/workflows/ci.yml"
---

# Tests

## Running them

    pnpm verify:static     # no database
    pnpm db:setup          # after a new migration
    pnpm verify:db         # route tests, RLS tests, verify:schema

Both take no arguments. **Run `db:setup` whenever a migration lands** — the
test databases are built from migrations and a new one is otherwise simply
absent from them, so the suite tests a schema that no longer exists.

Invoking a suite directly means supplying its connection variables yourself,
and the RLS suite reads two: without `DATABASE_URL` its admin pool falls back
to the tenant URL, cannot seed `auth.users`, and fails as "permission denied
for table users" — which reads like a broken policy. Prefer the scripts.

## Route and RLS tests

`apps/web/test/routes.test.ts` runs the **real** handlers against a **real**
Postgres with the real migrations. `requireSession` has a `__TEST_DB__` seam;
`test/shim.mjs` is a supabase-js-shaped builder over node-postgres, and
`test/loader.mjs` resolves `next/*` and the `@/` alias for `node --test`.

**CI splits by what a check needs**: `static` for everything that needs no
database, `database` for the route and RLS suites over a Postgres service
container built by `scripts/ci-db.sh`, `macos` for `swift build`, and `e2e`
for the browser. Root `pnpm test` is `pnpm -r test`, so it runs the core
package's suite too — filter to `@stint/web` for the route suite alone.

Node's `--experimental-strip-types` rejects **TypeScript parameter
properties** — write constructor fields explicitly in any code the tests load.

Zod 4 is used throughout: `z.uuid()`, `z.iso.datetime()`, `z.email()`,
`z.record(z.string(), z.unknown())`. Keep every workspace package on the same
Zod major, or `z.infer` degrades to `unknown` across package boundaries.

## End-to-end tests

`pnpm test:e2e` — Playwright against the local stack, and deliberately outside
`pnpm test`: a browser download must not become a prerequisite for the unit
suites. `docs/local-dev.md` has how to run them and the traps.

**No retries, in CI either.** A retry doubles the time before a real failure
is reported — a genuine failure is a 30s timeout, so two failures become four.
At ten tests and ~31s of work, a flaky test going red is the intent.

**They sign in for real**, through Mailpit, because sign-in is the flow most
worth covering and stubbing it would test the stub.

## UI tests

`pnpm test:ui` — Vitest + Testing Library in jsdom, `test/ui/*.test.tsx`.
Separate from `pnpm test` (route handlers against real Postgres under
`node --test`); the Vitest config never picks those up.

`test/ui/appearance.test.tsx` covers the design rules that fail **silently**:
white-on-accent, the accent on a stopped or runaway timer, an accent focus
ring, hand-rolled type instead of a role, and a `type-*` that is not a real
role. Verify each new assertion fails when its rule is broken.

**Do not add computed-style assertions.** jsdom cannot parse Tailwind 4's
compiled output (`@layer`, `@property`, `oklch()`, nested `@media`) and
silently drops what it does not understand, so `getComputedStyle` returns
browser defaults — 16px, black — for every one of our utilities. Injecting the
real `.next` CSS does not resolve it either. Real pixels need a browser.

These tests assert *rules*, not class strings — `toHaveClass('type-nav')` on
its own is a change detector.
