<!--
Sync Impact Report
- Version change: (none) → 1.0.0
- Modified principles: n/a (initial ratification from existing project sources)
- Added sections: all (Core Principles I–V, Doc Ownership, Conventions & Jurisdiction, Governance)
- Removed sections: n/a
- Templates requiring updates: none checked yet — first amendment, no dependent
  spec/plan/tasks exist to audit against this version
- Deferred TODOs: RATIFICATION_DATE set to the date this file was authored, since
  the project's actual governing rules (CLAUDE.md, docs/positioning.md,
  docs/design/principles.md) predate Spec Kit's adoption and carry their own
  git history there. This is a transcription of already-ratified rules into
  Spec Kit's format, not a new decision.
-->

# Stint Constitution

## Core Principles

### I. One running timer, server-authoritative

At most one running entry per user, enforced by a database unique index
(`one_running_timer_per_user`), not application logic. No code path may be
added that could produce overlapping open entries. The server is the source
of timer truth; clients own only responsiveness — a running timer keeps
ticking locally from its known `startedAt`, but starting a timer can never be
offline, because the server is what makes overlap structurally impossible
rather than cleaned up after the fact.

**Rationale**: this is the one invariant the whole data model is built
around. A client-side race here corrupts the record the paid product exists
to bill from.

### II. The app never silently modifies user data

A suspect record — an implausible duration, an overlapping entry, an
unrated line — is surfaced for the user to resolve, never corrected on their
behalf. This applies uniformly: a defect that would auto-correct a value,
round a rate, or guess a missing field is not an optimization, it is a
violation of this principle regardless of how confident the inference is.

**Rationale**: the product's whole thesis (`docs/positioning.md`) is that the
invoice is always right. An invoice built on a silent correction is not
verifiably right, it is merely unquestioned.

### III. Built for one person, priced like it

There is no team, so there is nothing to build for one. Every feature is
evaluated against a single contractor billing their own clients — not an
agency, not a team lead, not a platform freelancer. `docs/positioning.md`
owns the thesis, the competitors, and the price; where any other doc
disagrees with it, `positioning.md` wins. Scope that exists to serve a team
that does not exist (seats, roles, shared workspaces) is out of bounds
without a change to that document first.

**Rationale**: the three structural advantages this product is betting on
(money view not gated behind team pricing, the invoice as the paid artifact,
a price that does not move) all depend on staying a single-user product.
Team scope is the fastest way to lose all three at once.

### IV. Tracking is free and complete; the invoice is the paid artifact

Unlimited clients, projects, entries, history, exports, and the money view
are free, permanently. Downloading an invoice is the only thing that
requires payment. A feature proposal that moves tracking capability behind
the paywall, or that makes the free tier feel deliberately limited, contradicts
this principle and needs positioning.md amended first, not worked around in
code.

**Rationale**: this is the stated bet against every competitor in
`positioning.md` — Toggl, Clockify, Harvest and Everhour all gate the money
view or the export behind a seat price. It is the product's structural
argument, not a pricing preference that can drift feature by feature.

### V. Simplicity is the pillar for all our endeavors

Write and code at the minimum length that fully conveys what's needed. Do
not perform work — tests, example usages, documentation — that is not
explicitly required for the current objective. Do not re-add deleted code,
revert unrequested changes, or add scope beyond what was asked. A rename is
the new desired name; do not treat it as drift to correct back.

**Rationale**: this is a standing instruction from the project owner that
predates and outranks any Spec Kit default toward thoroughness. A plan or
task list generated under this constitution must be held to this bar, not to
a generic "be comprehensive" default.

## Doc Ownership — where a claim belongs

Every claim about the product lives in exactly one place. A spec, plan, or
task file produced under this constitution MUST NOT restate a claim that one
of these already owns — it cites the doc instead. A rationale copied into two
files is a rationale that will drift.

| The claim is | It belongs in |
| --- | --- |
| The thesis, competitors, price | `docs/positioning.md` (always wins on conflict) |
| What we believe about the product | `docs/design/principles.md` |
| One screen or one app | that screen's doc under `docs/design/screens/`, or `docs/macos.md` |
| A shape a screen is assembled from | `docs/design/screens/components.html` |
| How to run, build, or deploy | `docs/local-dev.md`, `docs/deploying.md`, `docs/setup.md` |
| The data model and rate/invoice-numbering chains | `docs/data-model.md` |
| Enforced by a check or config | that script or config, commented at the line someone edits |
| Unbuilt work | `docs/roadmap.md` — the only list of unbuilt work, gated by four questions (whose problem, what happens without it, does it serve the one person, which milestone) |
| A known fault | `docs/defects.md` |
| True only under one path in the tree | `.claude/rules/<topic>.md`, with `paths:` frontmatter |
| What constrains code anywhere in the repo | `CLAUDE.md`, under 200 lines by design |

A Spec Kit `spec.md` for a feature that is not yet a `roadmap.md` line has
not passed the gate. Write the roadmap entry first, or the spec has no
standing to be built from.

## Conventions & Jurisdiction

**No Server Actions** for anything the Expo or Swift clients also need —
everything goes through `/api/v1/*` Route Handlers. **Colours are semantic
tokens only**, generated from `packages/design-tokens/tokens.json` via
`pnpm tokens`; a hand-edited hex fails `tokens:validate`. **Time entry ids
are client-generated UUIDv7** so a retried insert is idempotent. **Rate
resolution is written twice** — TypeScript and SQL — and must agree.
**`0` is a valid rate**; use null-coalescing, never truthiness. **Archive,
don't delete** — invoices reference clients and projects.

**This product is built from a US point of view.** USD, US date and number
formats, US banking rails (ACH routing + account number, checks), US tax
framing (1099, W-9, no VAT, `tax_rate` defaults to 0). International support
is additive, never the baseline, and is never inferred from sample data or a
developer's current location.

**Never point local dev at production.** `pnpm migrate` and
`pnpm verify:schema` reach the hosted project and are never run by hand
against it — a merge deploys, and the release gate migrates and verifies
before aliasing. A new worktree is made with `pnpm worktree <branch>`, never
`git worktree add`.

## Governance

This constitution supersedes ad-hoc practice for anything it states. It does
not supersede `CLAUDE.md`, `docs/positioning.md`, or `docs/design/
principles.md` — it is a transcription of their governing rules into Spec
Kit's format for use by `/speckit-*` workflows, and those documents remain
the canonical source. Where this file and one of them disagree after a later
edit to either, the source document wins and this file is amended to match,
not the reverse.

**Amendments**: propose a change with the specific principle or section
affected and the rationale. Bump `CONSTITUTION_VERSION` by semantic
versioning — MAJOR for a backward-incompatible principle removal or
redefinition, MINOR for a new principle or materially expanded guidance,
PATCH for wording and clarification. Update `LAST_AMENDED_DATE`. If the
change also changes a claim owned by `CLAUDE.md`, `positioning.md`, or
`principles.md`, amend the source document in the same change — this file
never carries a claim those documents don't also carry.

**Compliance**: a `/speckit-plan` or `/speckit-implement` run that conflicts
with a Core Principle above is a defect in the plan, not a judgment call for
the implementing agent — stop and surface it rather than proceeding. A
branch that decides something (a price, a scope cut, a milestone order)
still gets `/dissent` before merge, per the project's existing convention;
Spec Kit's own `/speckit-analyze` is a complement to that, not a replacement.

**Version**: 1.0.0 | **Ratified**: 2026-09-22 | **Last Amended**: 2026-09-22
