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

Import `BlakeEriks/stint` at vercel.com. `vercel.json` at the repo root
carries the build settings, so **leave Root Directory unset** — pointing it
at `apps/web` would make Vercel ignore that file.

What it configures, and why it is in the repo rather than the dashboard: the
build has to run from the root so pnpm can link the workspace packages, and
`apps/web`'s `prebuild` generates the design tokens that `dist/` does not
carry into a clone.

It deliberately sets **no `outputDirectory`** — Vercel's Next.js detection
finds `apps/web/.next` on its own, and naming it explicitly made the path
resolve twice (`apps/web/apps/web/.next`) and failed a build that had
otherwise succeeded.

Still set in the dashboard:
- Environment variables (Production and Preview):
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

`SUPABASE_DB_URL` does **not** belong here. The app never uses it; only the
migration scripts do, and they run in Actions.

## 3. The release gate

- **GitHub** → repo Settings → Environments → **Production** → add
  `PRODUCTION_DB_URL` as an *environment* secret (the same Session-pooler
  string `pnpm migrate` uses locally).

  An environment secret, not a repository one: only a job that declares
  `environment: Production` can read it, so a workflow added later cannot
  reach production credentials by accident. It also gives the deployment its
  own audit log, and is where a required reviewer would go if this stops
  being a solo project. Vercel already created the Production and Preview
  environments when you connected the repo.
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

## Gated behind a paid plan

Two checks exist in the repo but cannot run while it is private on a personal
account:

- **Branch protection / rulesets** need GitHub Pro. Until then `main` is
  unprotected: CI still runs on every PR and every push, but nothing *stops*
  a merge with it red. The workflow is the same either way — open a PR, let
  it go green, merge.
- **CodeQL** needs Advanced Security on a private repo. The workflow skips
  itself unless the repo is public, because a permanently-red check trains
  you to ignore checks.

Making the repo public enables both, free. The reason not to is that the
schema models bank details and invoicing.

## What is deliberately absent

- **No automatic rollback.** Migrations are forward-only and additive by
  rule — see `CLAUDE.md`. Reverting a deploy is a Vercel redeploy of the
  previous build; reverting a *migration* means writing a new additive one.
- **No linter.** Typecheck, the contrast contract, and the shadcn detox check
  cover the failure modes that actually bite here. This is a choice, not an
  oversight.
