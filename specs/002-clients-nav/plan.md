# Implementation Plan: One Clients nav item

**Branch**: `f158-clients-nav` | **Date**: 2026-09-28 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/002-clients-nav/spec.md`

## Summary

`/clients` becomes the grouped view `/projects` has today: each client a
heading with its rate and summary line, its projects beneath, **No client**
last. `/projects` and its nav item go; `next.config.ts` redirects the old
address, query included. Web only, no API or schema change.

## Technical Context

**Language/Version**: TypeScript, Next.js App Router, React

**Primary Dependencies**: TanStack Query, existing `api.clients` / `api.projects`

**Storage**: N/A, no schema change

**Testing**: Vitest UI suite (`apps/web/test/ui`), Storybook stories, Playwright (`apps/web/e2e`)

**Target Platform**: Web

**Project Type**: Web app

**Performance Goals**: Same requests the two screens make today

**Constraints**: No new endpoint; the screen reads what `/api/v1` already returns

**Scale/Scope**: One screen, one nav item, one redirect

## Constitution Check

| Principle (`.specify/memory/constitution.md`) | Applies | How the design meets it |
| --- | --- | --- |
| I. Never silently modifies user data | No | Read-only screen change |
| II. Logic written twice has a parity test | No | Grouping lives once, in the screen |
| III. Every client through `/api/v1`; server owns timer truth | Yes | Reads `GET /clients?withScale` and `GET /projects` as today |
| IV. `packages/core` does no I/O | No | Nothing in core changes |
| V. Tests first, one suite per kind of code | Yes | UI tests and a story per acceptance scenario before the screen; redirect covered in `e2e` |

Additional Constraints: clients and projects stay archived, never deleted;
no new fixed cost. Passes; nothing for Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/002-clients-nav/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/routes.md
└── tasks.md             # /speckit-tasks
```

### Source Code

```text
apps/web/next.config.ts                          # redirect /projects → /clients
apps/web/src/app/(app)/projects/page.tsx         # deleted
apps/web/src/components/nav.tsx                  # drop Projects
apps/web/src/components/client-list.tsx          # the merged screen
apps/web/src/components/client-list.stories.tsx  # one story per scenario
apps/web/src/components/project-list.tsx         # deleted, absorbed
apps/web/src/components/project-list.stories.tsx # deleted, absorbed
apps/web/src/components/client-projects.tsx      # comment names /clients
apps/web/test/ui/client-list.test.tsx            # merged tests
apps/web/test/ui/project-list.test.tsx           # deleted, absorbed
apps/web/e2e/                                    # redirect keeps the query
docs/data-model.md                               # `/projects` → `/clients`
```

**Structure Decision**: `ClientList` keeps its name and route and absorbs
`ProjectList`'s grouping, heading and row; the screen is named for its nav
item.
