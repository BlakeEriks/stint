---
description: "Tasks for One Clients nav item"
---

# Tasks: One Clients nav item

**Input**: `specs/002-clients-nav/` (plan.md, spec.md, research.md, data-model.md, contracts/routes.md, quickstart.md)

**Tests**: Required (constitution V). A screen's tests are its stories in
`apps/web/src/components/client-list.stories.tsx`, one per acceptance
scenario, plus the existing UI suite `apps/web/test/ui/client-list.test.tsx`.
The redirect is covered in `apps/web/e2e/`. There are no route, RLS or core
tests: no API, table or core change.

**Mock data**: the seeded account (`apps/web/src/mocks/fixtures.ts`) has no
client without projects, no archived project under an active client and no
active project under an archived client. A story that needs one mutates the
db with `account((db) => …)` from `@/mocks/db`; leave `fixtures.ts` alone,
since other screens' stories read it.

## Phase 1: Setup

None. The worktree is built (`pnpm worktree`).

## Phase 2: Foundational

None. No schema, API or shared code changes.

---

## Phase 3: User Story 1 - See every client and project in one place (P1) 🎯 MVP

**Goal**: `/clients` lists clients as headings with projects beneath and **No client** last; the nav has no Projects item.

**Independent Test**: On the seeded account, open Clients: every active project appears once under its client or **No client**, and the nav lacks Projects.

### Tests for User Story 1 ⚠️

- [ ] T001 [P] [US1] Move every test from `apps/web/test/ui/project-list.test.tsx` into `apps/web/test/ui/client-list.test.tsx`, rendering `ClientList` instead of `ProjectList`. The fetch stub must serve `/clients?…withScale=true` with `projectCount`, `unbilledAmount` and `email`, and must drop archived clients unless `includeArchived=true`. Add cases for:
  - a client with no projects keeps its heading
  - each client heading links to `/clients/<id>`
  - a heading shows the client's rate and summary line (`N projects`, `$X unbilled`, email)
  - the "No client" heading has no link and no rate

  Then delete `apps/web/test/ui/project-list.test.tsx`. Run `pnpm --filter @stint/web test:ui` and confirm the new cases fail.
- [ ] T002 [P] [US1] Rewrite `apps/web/src/components/client-list.stories.tsx` (title stays `Screens/Clients`, `screen('/clients')`) with the list-view stories:
  - `Desktop`, `Phone`, `Light`: seeded, grouped, **No client** last
  - `ClientWithoutProjects`: `account((db) => { db.projects = db.projects.filter((p) => p.clientId !== <Byrne id>) })`, where the heading stays and has no rows
  - `OnlyClientless`: all clients removed, leaving only the **No client** group
  - `Empty`: `account('empty')`, with copy offering to add a client
  - `Failed`: `failing('clients')` and `failing('projects')`, whichever the mocks support
  - `NoRate`: carried over from `project-list.stories.tsx`

  Delete `apps/web/src/components/project-list.stories.tsx`.
- [ ] T003 [P] [US1] In `apps/web/test/ui/` find the nav test (grep `LINKS` or `Sections`), or add the assertion to the nearest existing nav test: the Sections nav has `Clients` and no `Projects`.

### Implementation for User Story 1

- [ ] T004 [US1] Rebuild `ClientList` in `apps/web/src/components/client-list.tsx` from `ProjectList` (`apps/web/src/components/project-list.tsx`):
  - query `api.clients({ includeArchived: true, withScale: true })` and `api.projects({ includeArchived: wantArchived })`, plus settings for the user default rate
  - keep `group()`, but include every client in the filter, even with no projects (research.md "Grouping rule"), sorted by name, with **No client** last
  - the heading is Pip, the client name as a `Link` to `/clients/<id>` (replacing "Manage"), the Archived badge, the rate, and the `Detail` summary line moved from today's `client-list.tsx`
  - keep `Row` with `ProjectRate` and Edit
  - the header is titled "Clients", with **Add client** (`Link` to `/clients/new`) and **Add project** (opens `ProjectDialog`)
  - `FilterTabs base="/clients"`
  - empty copy: `'No clients yet. Add one to set a rate and bill against it.'`, and for Archived, `'Nothing archived.'`

  Move over each design comment that still holds, and update any that names `/projects`.
- [ ] T005 [US1] Delete `apps/web/src/components/project-list.tsx` and `apps/web/src/app/(app)/projects/page.tsx`. Check with `grep -rn "project-list\|ProjectList" apps/web` that nothing imports them.
- [ ] T006 [US1] Remove the `/projects` entry, and the `FolderOpen` import if unused, from `LINKS` in `apps/web/src/components/nav.tsx`.

**Checkpoint**: T001–T003 pass, and Storybook `Screens/Clients` shows the grouped screen.

---

## Phase 4: User Story 2 - Add and edit from the same screen (P2)

**Goal**: Add client, Add project and Edit project all work from `/clients`.

**Independent Test**: From Clients, add a project and edit it; the dialog opens each time.

### Tests for User Story 2 ⚠️

- [ ] T007 [US2] In `apps/web/src/components/client-list.stories.tsx`, add stories carried over from the deleted `project-list.stories.tsx`:
  - `NewProject`: a play test that clicks **Add project** and expects the dialog
  - `NewProjectNewClient`: the same, then Client → "Add a client" opens "New client"
  - `EditProject`: a play test that clicks `Edit <project name>` and expects the dialog

  Also add a UI test in `apps/web/test/ui/client-list.test.tsx` that **Add client** links to `/clients/new`.

### Implementation for User Story 2

- [ ] T008 [US2] Confirm that the header and the `ProjectDialog` wiring from T004 make T007 pass; fix `apps/web/src/components/client-list.tsx` if not.

---

## Phase 5: User Story 3 - Filter by active and archived (P2)

**Goal**: Active, Archived and All live in the URL and follow the clarified rules.

**Independent Test**: With an archived client holding an active project, and an active client holding an archived project, each filter shows exactly what the spec says.

### Tests for User Story 3 ⚠️

- [ ] T009 [P] [US3] Add cases to `apps/web/test/ui/client-list.test.tsx`:
  - Active hides an archived client and its active project
  - Archived shows an archived client (badged) with its projects
  - Archived shows an active client's heading, without a badge, above only its archived project
  - Archived leaves out an active client that has no archived projects
  - All shows everything, with archived items badged
- [ ] T010 [P] [US3] Add stories to `apps/web/src/components/client-list.stories.tsx`:
  - `Archived`: `at('/clients', { status: 'archived' })`, with the db mutated so an active client (Northwind) has one archived project
  - `All`: `at('/clients', { status: 'all' })`
  - `ArchivedClientActiveProject`: Active, where the seeded archived client is given an active project and does not appear

### Implementation for User Story 3

- [ ] T011 [US3] Make `group()` and the filtering in `apps/web/src/components/client-list.tsx` pass T009 and T010.

---

## Phase 6: User Story 4 - Old links still land (P3)

**Goal**: `/projects[?status=…]` redirects to `/clients[?status=…]`.

**Independent Test**: Request `/projects?status=all` and get a 308 to `/clients?status=all`.

### Tests for User Story 4 ⚠️

- [ ] T012 [P] [US4] Add a test to `apps/web/e2e/auth.spec.ts`, next to "an unauthenticated visitor is sent to sign in": `page.request.get('/projects?status=all', { maxRedirects: 0 })`, which expects status 308 and a `location` header ending `/clients?status=all`, and the same for bare `/projects` → `/clients`.

### Implementation for User Story 4

- [ ] T013 [US4] Add `async redirects() { return [{ source: '/projects', destination: '/clients', permanent: true }]; }` to `config` in `apps/web/next.config.ts`, with a one-line comment on why (the old nav item's bookmarks).

---

## Phase 7: Polish

- [ ] T014 [P] In `apps/web/src/components/client-projects.tsx`, change the comment "`/projects` lists them across clients" to name `/clients`.
- [ ] T015 [P] In `docs/data-model.md` line 23, change "`ProjectRate` prints the same figure on `/projects`" to `/clients`.
- [ ] T016 Run `pnpm --filter @stint/web test:ui`, `test:stories` and `test:e2e`, plus lint and typecheck. Then run quickstart.md "By hand" against the dev server signed in to the seeded account, and take a screenshot of `/clients`.

---

## Dependencies & Execution Order

- US1 (T001–T006) comes first; every later story edits the same screen.
- US2, US3 and US4 each depend only on US1. US4 touches no screen files, so it can run alongside US2 and US3.
- Within a story, tests come before implementation and must fail first.
- Polish comes last.

## Parallel Example: User Story 1

```text
Task: T001 UI tests in apps/web/test/ui/client-list.test.tsx
Task: T002 stories in apps/web/src/components/client-list.stories.tsx
Task: T003 nav assertion in apps/web/test/ui/
```

## Implementation Strategy

US1 is the MVP: the merged screen and the nav change. US2 and US3 carry over
what both old screens did, and US4 keeps old links working. It ships as one
PR.
