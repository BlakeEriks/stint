# Time Tracking — working notes

Time tracking and invoicing for one contractor. Tracking is free; the invoice
is what gets paid for. **`docs/positioning.md` owns who it's for, the
competitors and the price**, and wins any conflict about the product.

This file holds what every session needs before touching any file. Before
adding to it, name the doc that owns the claim:

| The claim is | It goes to |
| --- | --- |
| Who this is for, what it competes with, what it costs, and the US point of view | `docs/positioning.md` |
| A rule every spec, plan and PR is held to | `.specify/memory/constitution.md` |
| How work moves from an idea to production | `docs/sdlc.md` |
| How to run, build, or deploy something | `docs/local-dev.md`, `docs/deploying.md`, `docs/setup.md` |
| How one screen or part looks, in each state | its `*.stories.tsx`, beside the component |
| A visual or UI convention every screen keeps | `.claude/rules/web-ui.md` |
| Why one screen or component is the way it is | a comment at the line it governs |
| About the macOS app | `docs/macos.md`, `docs/design/menubar.html` |
| Enforced by a check or a config | that script or config, in a comment at the line someone edits |
| True only under one path | `.claude/rules/<topic>.md`, with `paths:` frontmatter |
| A new capability, or a fault or improvement | a GitHub issue (`docs/sdlc.md`) |

Only a claim no doc in the table owns belongs here, and then as one paragraph. Keep
this file under 200 lines, Anthropic's target for a file loaded into every
session.

## The constitution

Every plan and PR meets `.specify/memory/constitution.md`. The rules that
bite anywhere in the repo:

- **One running timer per user, enforced by a database index** (I). Never
  add a code path that could produce overlapping entries.
- **The app never silently modifies user data** (III). A suspect record goes
  to the inbox.
- **Every client goes through `/api/v1/*`; no Server Actions** (VIII). The
  server owns timer truth; clients own responsiveness.
- **`packages/core` does no I/O** (IX).
- **Migrations and API responses stay compatible with a client that hasn't
  updated** (X).
- **New code ships with its suite** (XII).

## Design tokens

Tokens are **generated**: edit `packages/design-tokens/tokens.json`, then run
`pnpm tokens`. Never edit files in `dist/`. One source feeds CSS, TypeScript
and Swift, so the clients cannot drift. Text on the accent is always
`--text-on-accent`; `tokens:validate` rejects anything else.

## Local development

**Never point local dev at production.** `pnpm dev` reads
`apps/web/.env.development.local`, and no file on disk holds the production
database string — **never save it to one**. A merge deploys. Vercel holds the
build unaliased while `release.yml` verifies it, and a release with a
migration also waits for your approval and a backup (`docs/deploying.md`).

**A new worktree is made with `pnpm worktree <branch>`**, never
`git worktree add`. Git carries no `node_modules`, no
`packages/design-tokens/dist` and no `.env.development.local`, so a
hand-made worktree cannot run the app or resolve `@stint/design-tokens` —
and a change verified only against jsdom is a change nobody has seen. The
script does those three; `--from <ref>` branches off something other than
main. Two worktrees are long-lived and switch branches: `../stint-issues`, where
`/work-issues` builds, and `../stint-review`, where `pnpm try-mac` checks out
a PR.

**Merging a branch closes its worktree in the same step.** Once its PR has
merged: `git worktree remove <path>`, then `git branch -D <branch>`. PRs
squash-merge, so git never sees the branch as merged and `-d` refuses. A
worktree with uncommitted changes is someone's work; ask before touching it.
`git worktree list` should show only what is still in flight.

`docs/local-dev.md` has the rest: one sign-in at a time per browser and how a
failed magic link is diagnosed, why everything speaks `localhost` and never
`127.0.0.1`, and which services `dev:up` leaves out.

## Generated files and a fresh clone

`packages/design-tokens/dist/` is gitignored but two of its outputs are needed
to build, so every `apps/web` script that needs them has a `pre` script
that builds them.
**Anything generated and gitignored needs the same treatment**: assume the
build machine has only what git tracks. A suite is not exempt — the PDF route
imports `dist/tokens.ts` and the UI suite resolves `@stint/design-tokens`, so
both fail on a clone that has never built.

## Docs

`docs/CLAUDE.md` says how docs are written; Vale checks prose against the
Google style guide and those rules, and `/copyedit <path>` fixes a doc.
