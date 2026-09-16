---
paths:
  - "apps/web/src/app/api/**"
  - "apps/web/src/lib/**"
  - "packages/schema/src/**"
---

## API layer

All routes live in `apps/web/src/app/api/v1/`.

**Every request shape comes from `@stint/schema`.** A route parses its body or
query against a schema the package exports; it never declares one inline. A
route validating something the package does not model means adding it to the
package, because the package is also what the browser's types derive from — an
inline copy drifts from the contract in silence, and Zod strips what it does
not name, so a field the schema forgets is a 200 that discards the value.

Shared plumbing in `apps/web/src/lib/`:

- `auth.ts` — `requireSession()` accepts both a bearer token (Expo, macOS) and
  a cookie session (web); both yield an RLS-scoped client.

  **`getClaims()` must be passed the token explicitly on the bearer path.** It
  reads the *stored session*, not the `Authorization` header `bearerClient`
  sets via `global.headers`. With no stored session it returns
  `{ data: null, error: null }` — no error, no claims, and every bearer
  request 401s. The route tests inject `__TEST_DB__` and never exercise this
  path, so only a real token against a real server catches it.
- `errors.ts` — `handle()` wraps every route; `ApiError` maps to documented
  status codes. Contains a compile-time guard asserting the local `Code` union
  matches `ErrorCode` in `@stint/schema`.
- `rows.ts` — the only snake_case↔camelCase boundary, invoices and line
  items included. Rename a column here and nowhere else.

  Each converter takes a row interface, and `columns<Row>()` ties that
  interface to the select list that fills it — a column the row does not
  declare and a field the list does not select both fail to compile. The list
  stays one string literal because supabase-js parses it to infer the row
  type; a `join()` over an array degrades every consumer to an error type.

- `validate.ts` — Zod parsing with 422 + `treeifyError` details.

The browser's types in `lib/client/api.ts` **derive** from `@stint/schema`
rather than copying it.

The wrapper is `Response<T>`, which makes every field required: a schema marks
a field `.optional()` to describe what a *request* may omit, but every
converter in `rows.ts` sets every field unconditionally, so a response never
omits one.

### Conventions

- Never pre-check the running timer before inserting. Attempt the insert and
  translate the unique-violation — a pre-check is a race, the index is not.
- Numeric columns arrive from PostgREST as **strings**; `rows.ts` converts them.
  Never pass them straight through.
- Offline replays: a duplicate-key insert with a client-supplied id returns the
  existing row with 200, not an error.
- `nextInvoiceNumber` is not client-settable — gapless numbering depends on
  `allocate_invoice_number()` holding the row lock.

### Testing

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
