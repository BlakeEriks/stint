# Deploying

One environment: production. No staging project — CI already applies every
migration to a real Postgres and runs `verify:schema` against it, so a
staging database would mostly rehearse what CI covers. Add one when there
are users to protect.

## The shape

```
PR ──► CI ──► review ──► merge ──► Vercel builds ──► Release gate ──► live
       (tests, schema)                               (migrate + verify)
```

The gate is the point. **Code must never go live before its migration** — a
handler that assumes a column the database does not have yet returns 500s on
live invoices. Vercel builds a production deployment but does not alias it to
the domain until required checks pass, so the migration runs while the
*previous* build is still serving traffic.

## 1. Branch protection

Repo → Settings → Branches → Add rule for `main`:

- Require a pull request before merging
- Require status checks to pass → **`verify`**
- **Leave "include administrators" off.** Solo, you want the gate to hold by
  default but to be bypassable at 2am when you are the only person who can
  fix production.

Once this is on, remove `push: { branches: [main] }` from `ci.yml` — a push
to main is then always a merge whose PR already ran the suite, and leaving it
pays for every suite twice. Do it in that order; removing the trigger first
leaves no gate at all.

## 2. Vercel project

Import `BlakeEriks/stint` at vercel.com. Settings:

- **Root directory:** `apps/web`
- **Install command:** `pnpm install --frozen-lockfile`
- Environment variables (Production and Preview):
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

`SUPABASE_DB_URL` does **not** belong here. The app never uses it; only the
migration scripts do, and they run in Actions.

## 3. The release gate

- **GitHub** → repo Settings → Secrets → Actions → add `PRODUCTION_DB_URL`
  (the same Session-pooler connection string `pnpm migrate` uses locally).
- **Vercel** → Project Settings → Git → Deployment Checks → connect this
  repository, and mark the check **Required**.

That wires `.github/workflows/release.yml`: Vercel dispatches
`vercel.deployment.ready`, the workflow migrates production and runs
`verify:schema`, and reports back. Success aliases the deployment; failure
leaves the previous one serving. **Force Promote** in the Vercel UI is the
override.

## 4. Auth redirect URLs

Supabase → Authentication → URL Configuration. Add the production origin to
**Site URL** and `https://<domain>/auth/callback` to **Redirect URLs**, or
magic links bounce. Preview deployments get a new URL per branch; add a
wildcard redirect if you want sign-in to work on them.

## What is deliberately absent

- **No automatic rollback.** Migrations are forward-only and additive by
  rule — see `CLAUDE.md`. Reverting a deploy is a Vercel redeploy of the
  previous build; reverting a *migration* means writing a new additive one.
- **No linter.** Typecheck, the contrast contract, and the shadcn detox check
  cover the failure modes that actually bite here. This is a choice, not an
  oversight.
