# Deploying

One environment: production. No staging project — CI already applies every
migration to a real Postgres and runs `verify:schema` against it, so a
staging database would mostly rehearse what CI covers. Add one when there
are users to protect.

## The shape

```
PR ──► CI ──► merge ──► Vercel builds ──► plan ──► you approve ──► backup ──► migrate + verify ──► live
```

**Every production release waits for your approval.** GitHub notifies you;
the run's summary shows the commit and every pending migration's SQL, with a
warning when one drops, truncates or deletes. Rejecting leaves the previous
build serving.

The gate is the point. **Code must never go live before its migration** — a
handler that assumes a column the database does not have yet returns 500s on
live invoices. Vercel builds a production deployment but does not alias it to
the domain until required checks pass, so the migration runs while the
*previous* build is still serving traffic.

## 0. What CI runs

`.github/workflows/ci.yml`, four jobs in parallel:

- **`static`** — lint, token drift, the contrast contract, shadcn detox, the
  typography scale, typecheck, the UI suite, core logic, then a build.
  Needs no database, so an obvious slip fails in seconds.
- **`database`** — the route and RLS suites against a real Postgres service
  container. `scripts/ci-db.sh` builds both databases, applying migrations
  through `pnpm migrate` so the real migration script is what runs: `tt` with
  RLS off for the route tests, `tt_rls` with it on and reached as a
  non-superuser. `verify:schema` runs against `tt_rls`, the one where RLS is
  still on.
- **`macos`** — `swift build` on the menu bar app, its only check.
- **`e2e`** — Playwright against a real local Supabase stack. Its own job
  because it needs GoTrue and Mailpit, not the bare Postgres the others use,
  and because keeping it separate means a type error reports without waiting
  behind a Docker pull.

Two narrowings in `e2e` pay for themselves and are easy to undo by accident:
`supabase start -x studio,postgres-meta` skips 2.25GB of images the browser
suite never touches, and `playwright install --only-shell` skips the full
Chrome build that Playwright never launches. Local `dev:up` excludes more
again; `pnpm dev:up:studio` brings Studio up when the dashboard is what you
want.

**The Supabase images are pulled, not cached, and that was measured.** A cache
cost 7s to restore plus 38s for `docker load` against an 18s pull — `docker
load` decodes a tarball serially on a slow runner disk while a pull fetches
layers in parallel. It took 6s locally, which is exactly the trap:
extrapolating from a laptop made it look like a win twice. Do not reintroduce
it without measuring on a runner.

**`gh run rerun` cannot answer "is the cache hit now?"** A re-run replays the
original run and keeps its point-in-time view of the caches, so a cache saved
after that run started reports a miss forever. Use `workflow_dispatch`.

## 1. Branch protection

Repo → Settings → Branches → Add rule for `main`:

- Require a pull request before merging
- Require status checks to pass → **`static`** and **`database`**
- **Leave "include administrators" off.** Solo, you want the gate to hold by
  default but to be bypassable at 2am when you are the only person who can
  fix production.

Once this is on, remove `push: { branches: [main] }` from `ci.yml` — a push
to main is then always a merge whose PR already ran the suite, and leaving it
pays for every suite twice. Do it in that order; removing the trigger first
leaves no gate at all.

## 2. Vercel project

Import `BlakeEriks/stint` at vercel.com.

- **Root Directory:** `apps/web`
- Build settings live in `apps/web/vercel.json`, beside the app they
  describe, rather than in the dashboard where they are invisible from a
  checkout.

`pnpm install` and `pnpm --filter` both walk up to the workspace root from
there, so `prebuild` still reaches `packages/design-tokens` — verified from a
clean clone rather than assumed.

It deliberately sets **no `outputDirectory`**: Next.js detection finds
`.next` on its own, and naming it explicitly made the path resolve twice and
failed a build that had otherwise succeeded.

Still set in the dashboard:
- Environment variables (Production and Preview):
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
  - `NEXT_PUBLIC_APP_ORIGIN` — `https://app.runstint.com`. The code
    falls back to `''`, so an unset one costs a redirect hop on every landing
    CTA rather than failing the build.

`SUPABASE_DB_URL` does **not** belong here. The app never uses it; only the
migration scripts do, and they run in Actions.

## 3. The release gate

- **GitHub** → repo Settings → Environments → **Production** → add
  `PRODUCTION_DB_URL` as an *environment* secret (the Session-pooler
  string).

  An environment secret, not a repository one: only a job that declares
  `environment: Production` can read it, so a workflow added later cannot
  reach production credentials by accident. It also gives the deployment its
  own audit log. Vercel created the Production and Preview environments when
  you connected the repo.

- **GitHub** → Environments → **Release**: required reviewer (you), `main`
  only, no secrets. It is the pause and nothing else. Production carries no
  reviewer because the nightly backup runs in it unattended.

- **Vercel** → Project Settings → Git → **Deployment Checks** → Connect
  GitHub Actions → **Check Name: `migrate-production`**.

  That name has to match the `name:` input on the status step in
  `release.yml` exactly — the action passes it through verbatim, with no
  `Vercel - <project>:` prefix despite what the docs' example looks like.

  It carries the environment on purpose. Vercel warns that a status shared
  across triggered runs gets overwritten, so a preview dispatch must never be
  able to clobber the production result.

  The "use the `vercel/repository-dispatch/actions/status@v1` action" banner
  in that dialog is generic advice, not a correction — that is already what
  `release.yml` does.

  "No configured checks found" in that dialog is expected until the workflow
  has run once — it is listing statuses it has already seen, and nothing has
  produced one yet. Name it, save, and let the first production deployment
  create it.

- Mark the check **Required** once it has appeared, so a deployment is not
  promoted until it passes.

### How it fits together

Vercel dispatches `vercel.deployment.ready` when a production build exists
but is not yet serving. `plan` marks the check pending and writes the summary,
`approve` waits for you, `backup` takes a snapshot, and `migrate` runs
`pnpm migrate` and `pnpm verify:schema` while the *previous* build still
answers requests, then its status action's `post` hook reports the outcome as
a commit status. Success promotes the deployment; failure leaves
the old one serving, with **Force Promote** as the override.

Two things that fail quietly if they drift, so they are worth re-reading
before changing that file:

- The condition is `client_payload.environment == 'production'`. Get the
  field wrong and the job is skipped, no status is ever written, and the
  deployment simply waits.
- `report` is the only job that writes the final status, and it runs
  whatever happened before it. Vercel's own status action cannot be used
  here: with several jobs, it reports the first job's outcome, not its own.

## 3a. Deployment protection, and which URL you are testing

**One deployment serves two sites, split by hostname** in `apps/web/src/proxy.ts`:

| Hostname | Serves |
|---|---|
| `runstint.com` | the landing page, rewritten from `/landing` |
| `app.runstint.com` | the product |

Both domains point at the same project, so there is one build and one set of
environment variables. `isAppHost()` also treats bare `localhost` and any
`*.vercel.app` as the app, which is why a preview deployment lands on the
product rather than the pitch. `.claude/rules/routing.md` carries the rules
this puts on code.

Per-deployment URLs (`stint-<hash>-<scope>.vercel.app`) are fronted by SSO on
a private project, so an unauthenticated request 302s to `vercel.com/sso-api`.
That is protection on the *deployment* URL, not a broken app — test a real
domain instead.

The app's own redirect looks similar but is not the same thing: on the app
host, `/` returns 307 to `/signin` when signed out.

## 3b. Backups

`.github/workflows/backup.yml` dumps production's data (`public` and `auth`)
nightly and before every migration, encrypts it with
[age](https://age-encryption.org) and uploads it to Azure Blob Storage:
account `stintbackups4b3306`, container `dumps`, in the personal subscription
(`AZURE_CONFIG_DIR=~/.azure-personal`, set by a local, untracked `.envrc`).

- **Nothing stored can reach Azure.** GitHub's OIDC token for the
  Production environment is exchanged for a storage token; the app
  registration `stint-backup-writer` trusts only that subject,
  `repo:BlakeEriks@35611123/stint@1366791093:environment:Production`. The
  repo uses GitHub's immutable subject (owner and repo ids), so a renamed or
  re-created repo does not inherit the trust.
- **It can write and nothing else.** The custom role "Stint Backup Writer"
  creates blobs; it cannot read, list or delete them.
- **Nobody can delete a backup for 90 days.** A time-based retention policy
  on the container, then a lifecycle rule removes it.
- **Only the private key opens one.** The public key is the Production
  variable `BACKUP_AGE_RECIPIENT`; the private key is in the password manager
  and nowhere else.
- **Silence alerts.** Each success pings healthchecks.io, which alerts when a
  day passes without one — including when GitHub disables the schedule on a
  quiet public repo.

**Restore.** A blob is named `<time>-<nightly|release>.dump.age`. Data only,
because the `auth` schema belongs to Supabase: structure comes from the
migrations, checked out at the last one the dump's own `schema_migrations`
lists — the commit that added it.

```bash
export AZURE_CONFIG_DIR=~/.azure-personal
SCOPE=$(az storage account show -n stintbackups4b3306 --query id -o tsv)/blobServices/default/containers/dumps
az role assignment create --role "Storage Blob Data Reader" --assignee "$(az ad signed-in-user show --query id -o tsv)" --scope "$SCOPE"
az storage blob list --auth-mode login --account-name stintbackups4b3306 -c dumps --query "[].name" -o tsv
az storage blob download --auth-mode login --account-name stintbackups4b3306 -c dumps -n <name> -f db.dump.age
age -d -i <(pbpaste | grep '^AGE-SECRET-KEY-') -o db.dump db.dump.age   # private key on the clipboard
pg_restore -a -t schema_migrations -f - db.dump | grep -o '^[0-9_a-z]*\.sql' | sort | tail -1
git checkout "$(git log -1 --format=%H -- supabase/migrations/<that file>)"
pnpm migrate --url "$TARGET"                                            # a fresh project
pg_restore -l db.dump | grep -E 'TABLE DATA public |TABLE DATA auth (users|identities) |SEQUENCE SET public ' \
  | grep -v schema_migrations > toc
pg_restore -L toc -f data.sql db.dump
psql "$TARGET" --single-transaction -v ON_ERROR_STOP=1 \
  -c 'set session_replication_role = replica' -f data.sql
```

**Of `auth`, only `users` and `identities` are restored.** They are the
accounts; the rest is sessions, tokens and logs, and costs only a fresh
sign-in. It also keeps a restore independent of Supabase's auth version:
tables and columns there change between releases, and a local stack lags the
hosted one. The replica role stops triggers and foreign keys firing on rows
that already satisfied them. Delete the files and remove the reader role
afterwards.

Rehearsed 2026-09-24 against the local stack: every row came back.

## 3c. Alerts

Alerts go to the private `#alerts` channel on the Stint Discord server.
**An alert is something you act on, or the one outcome you are waiting for;
everything else stays silent**, because a channel that reports routine
success teaches you to stop reading it.

| Event | Message | Source |
|---|---|---|
| Release live | ✅ commit and subject | `release.yml`, `report` |
| Release failed after approval, or its plan failed | ❌ with the run link | `release.yml`, `report` |
| Backup failed, or a day passed without one | healthchecks.io's own | healthchecks.io → Discord |

Never posted: a release awaiting approval (GitHub already notifies you), a
rejection or cancellation (you did it), and a backup that worked
(healthchecks.io is quiet until one does not arrive).

**A new alert names what you would do when it arrives.** If the answer is
nothing, it is a log line. One event is one message from one source — never
the same failure from GitHub and from healthchecks.io.

The webhook is the `DISCORD_ALERTS_WEBHOOK` secret on Production and exists
nowhere else: anyone holding it can post to the channel.

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
  rule — see `.claude/rules/migrations.md`. Reverting a deploy is a Vercel
  redeploy of the previous build; reverting a *migration* means writing a new
  additive one.
