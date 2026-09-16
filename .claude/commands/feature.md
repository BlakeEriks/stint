---
description: Interview, spec and mock a feature, then build it in a worktree with fresh-context agents
---

Build `$ARGUMENTS` — a line from `docs/tasks.md`, or a description. If none
given, ask which.

You are the decision maker and the interviewer. You hold the spec; subagents
running Opus do the reading, building and reviewing. Spend your own tokens on
judgement and on the interview, not on grunt work.

**The spec is the deliverable of phases 1–4.** It crosses into a fresh context
in phase 5, so anything it does not say is lost. A phase that cannot name the
command proving it is not ready to be built.

## 1. Read before asking

Read `docs/tasks.md` for the entry if there is one — a task line already
records the thinking that is not to be re-litigated. Then `CLAUDE.md`, and the
docs that own the area.

Fan out read-only agents in one message, one per surface the feature touches,
each capped at ~800 words and required to cite `file:line`. Ask each for the
existing pattern to copy, not just the location. Tell each what the others
cover.

Never interview from a blank slate. A question the codebase already answers
spends the user's attention on something you could have read.

## 2. Interview, with a recommendation on every question

Use `AskUserQuestion`. Dig into what you found: the hard parts, the edge
cases, the places two existing patterns disagree and this feature has to pick
one.

**Every question carries your recommendation as the first option, labelled
`(Recommended)`, with the reason in its description.** An unadvised choice
between options the user has not read the code for is not a decision, it is a
guess. If you have no recommendation, you have not read enough — go back.

Ask about: what it does and refuses to do, the states including empty and
failure, what it must never do (this is a billing system), which existing
pattern it follows where two compete, and what is out of scope.

**Ask which surfaces it reaches, and say which ones you think it should.**
`docs/architecture.md` owns the surface table and the scope of each — read it
rather than assuming, and respect that those scopes are ceilings, not
milestones. The macOS app is the timer and nothing else; a feature that does
not serve starting or stopping does not belong there however easy it would be.

The shape of the answer differs by kind:

- **Behind the API** — a rule, a rate, a numbering scheme — lands once and
  every client inherits it. Nothing to decide beyond where in the stack.
- **A token or a contract** — anything in `packages/design-tokens`,
  `packages/schema`, `packages/core` — is generated or imported into every
  client at once, so the question is which generators need an output, not
  which apps need editing. A brand change is this kind.
- **A surface** — a screen, a field, a control — is built per client and is
  the only kind that multiplies. Build web first; it is the primary product.

For a surface, say in the spec which clients get it **now** and which are
deferred, and for the deferred ones name the file that would change. A
deferred client whose integration point is written down is a follow-up; one
that is merely implied is a rediscovery.

Do not add a status column to `architecture.md` — what exists on disk is the
signal, and unbuilt work lives in `tasks.md`.

Do not ask what the codebase answers, what `principles.md` already refused, or
anything with an obvious default — make the call, state it in the spec.

Keep going until the hard parts are covered. Then stop; an interview that
keeps asking after the decisions are made is a tax.

## 3. Draw it, if it has a surface

Anything visual is HTML — `docs/CLAUDE.md` says so, and a screen doc doubles
as the visual reference. Copy `docs/design/screens/_shell.html`, or follow a
sibling screen doc for a component that is not a whole screen.

Then **verify the rendering, not the markup**:

- Every `var(--token)` resolves — grep `_mockup.css` for each. A missing token
  falls back silently and the page renders in browser defaults.
- Load it over `pnpm design` at two widths and look at it.
- Measure what you asserted. Clearance guessed by eye was wrong three times in
  one sitting; `getBoundingClientRect()` was right each time.

A mockup whose stylesheet did not load looks like a broken page, not an error.

## 4. Write the spec, then wait

Write to `docs/tasks.md`'s sibling scratch — `.claude/scratch/<feature>.md`.
Not `docs/`: it is working state, deleted when the feature ships.

The spec names:

- **The shape** — one diagram of what calls what.
- **Each layer**, in dependency order, with the file it lands in and the
  existing pattern it follows.
- **What must not regress**, in this feature's terms.
- **Which surfaces**, per `docs/architecture.md` — shipping now, deferred with
  the integration point named, or out of scope because it is outside that
  surface's ceiling.
- **Out of scope**, explicitly.
- **The verification command for every phase.** Not "tests" — the command.
  `pnpm verify:static` is everything needing no database; `pnpm verify:db`
  is the rest and wants the local stack up. Both mirror a CI job and take no
  arguments — `pnpm db:setup` first if a migration landed, since the test
  databases are built from migrations and do not pick up a new one.
- **Doc changes**, including deleting the `tasks.md` line. A finished task is
  deleted, not ticked.

Then present **decisions with consequences** separately from work you will
just do. A decision earns that list when it changes what a user sees, alters
the schema, costs money, or removes a capability. Recommend one option each.

Wait for sign-off. Nothing is built, and no worktree exists, before it.

## 5. Build in a worktree, fresh context per phase

Hand the worktree to the first agent, with the branch point named: **branch
from local `HEAD`, not from `origin`.** The default is `origin/<default-branch>`,
which would strand uncommitted work and any local commit not yet pushed — the
mockup from phase 3 among them.

    git worktree add .claude/worktrees/<feature> -b <feature> HEAD

Commit the spec and the mockup as the first commit. A spec only in a working
tree is one checkout from gone.

Then one agent per phase, in dependency order, each with fresh context:
schema and migrations → shared packages → API → web client data layer → web
components → the other clients. Run independent phases in parallel; sequence
what depends.

Shared packages come early and land once: `schema` is what every client's
types derive from, `design-tokens` is generated into all of them, `core` holds
the logic that must not be written twice. A second client is a separate phase
with its own agent — the macOS app is Swift with hand-written models that
nothing type-checks against `@stint/schema`, so it fails at runtime only.

**A new function, index or non-obvious query is proved against a real Postgres
before anything is built on it** — before the migration is final, before the
route exists. A plain `select` needs none of this.

    initdb -D "$S/pg" && pg_ctl -D "$S/pg" -o "-p 55439 -h 127.0.0.1 -k ''" start

`/opt/homebrew/opt/postgresql@14/bin`, over TCP on a spare port — the socket
path in the scratchpad exceeds the 103-byte limit. Create the objects, insert
rows that hit the edges, and read the output. Then `pg_ctl stop` and delete it.

The rows that find bugs are the awkward ones: a NULL in the column being
compared, two casings of one value, an empty string, another user's row.

`coalesce(project_id = p_project_id, false)` is in the task-suggest spec
because of this. Without it the comparison is NULL for an entry with no
project, `ORDER BY ... DESC` sorts NULLs first, and internal work outranked
the selected project's own names — backwards from the spec, invisible in
review, obvious in one `select`.

The route tests would eventually catch it, but only after the migration, the
route and the converter were written on top of it.

Give each agent: the spec path, the files it owns, the files another agent
holds, its verification command, and the instruction to **verify each new test
fails when its rule is reverted**. Require a report under 250 words: what
changed, any user-visible behaviour change, verification result, commit hash.

One commit per phase, so any phase can be dropped.

**A comment says why, never what.** The code says what it does; a comment
restating it is a second copy that goes stale silently. What earns a line:

- a **non-obvious mechanism** — `coalesce` because NULL sorts first under
  `DESC`, a select list kept as one literal because supabase-js parses it
- a **constraint from outside the file** — a 103-byte socket limit, a
  browser's PKCE key, an AppKit popover drawing past its parent
- a **correction that looks like a mistake** — the thing a reader would
  helpfully "fix" back into the bug

What does not: a decision record ("we chose X over Y"), a restatement of a
rule CI enforces, or a narration of what the old version did. Git holds the
history; `principles.md` holds refusals. A comment written in the same breath
as the code carries the reason the code cannot; one written to justify the
choice belongs in the spec, which is deleted when the feature ships.

Tell each agent this explicitly. Written under a spec, prose drifts toward
restating the spec — and `/trim-code` exists for files that accumulated it
over many iterations, not as a cleanup pass on code written an hour ago.

## 6. Review with two agents that did not write it

- **Correctness** — `/code-review`, or a subagent hunting only regressions: a
  field a route used to accept, a default that leaked, a state a screen used
  to render.
- **The spec** — every requirement implemented, every listed edge case tested,
  nothing outside scope changed.

Ask both to prove a finding by breaking the rule and watching a test go red.
That is what separates a review worth reading from a list of suspicions — and
it is why **only one reviewer may mutate the tree at a time.**

Two reviewers editing one worktree in parallel read each other's half-applied
mutations as the code under review. It reported two billing bugs that did not
exist, and the working tree was clean by the time anyone looked. Either:

- **run them in sequence** — one mutates, restores, reports; then the next, or
- **run them in parallel read-only**, each copying to `/tmp` to experiment,
  with mutation saved for a second pass by whichever found something.

Sequence is the cheaper default: a second worktree wants its own
`node_modules`. Whichever you pick, tell each agent which it is, and have any
agent that mutates verify `git status` is clean before it reports.

Tell both to flag only what affects correctness or a stated requirement. A
reviewer asked for gaps will find them; chasing all of them buys abstraction
layers and tests for cases that cannot happen.

Fix what they find, with a test each.

## 7. Land it

Run `pnpm verify:static` and `pnpm verify:db` green before reporting, plus
`pnpm test:e2e` if a screen changed and `swift build` if the Mac app did. Delete the `tasks.md` line and
the scratch spec in the final commit — git holds the history, and the mockup
stays as the screen doc.

Report: the verification table, behaviour a user would notice, what was left
undone and why. A phase skipped is the user's call, not yours to bury.
