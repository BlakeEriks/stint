---

description: "Tasks for feedback from inside the app"
---

# Tasks: Feedback from inside the app

**Input**: Design documents from `specs/005-feedback-form/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/feedback.md, design/feedback.html

**Tests**: Required (Constitution V). The route goes in `apps/web/test/routes.test.ts`, the table in `apps/web/test/rls.test.ts`, the form's rules in `apps/web/test/ui/feedback.test.tsx`, and each visible state in `apps/web/src/components/feedback.stories.tsx`. Each test is written first and fails before its code.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: The user story it serves (US1, US2)

---

## Phase 1: Setup

None. The feature uses the existing app, packages and suites.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The table and the contract both stories write through.

- [ ] T001 Write the failing RLS cases in `apps/web/test/rls.test.ts`. Seed one `feedback` row each for Alice and Bob and add `'feedback'` to the "every user-scoped table is isolated" loop. Add a test that Alice can't insert a row with Bob's `user_id`, and that an `update` or a `delete` by Alice of her own feedback row changes nothing.
- [ ] T002 Create `supabase/migrations/00000000000034_feedback.sql`. It creates the `feedback` table per `data-model.md`:
  - `id uuid primary key`
  - `user_id uuid not null references auth.users(id) on delete cascade`
  - `message text not null` with `check (char_length(message) between 1 and 2000)`
  - `screen text not null` with `check (char_length(screen) between 1 and 200)`
  - `client text not null check (client in ('web','macos'))`
  - `app_version text not null` with `check (char_length(app_version) between 1 and 64)`
  - `created_at timestamptz not null default now()`
  - an index on `(created_at desc)`

  Then `enable row level security`, an insert policy `with check (user_id = auth.uid())` and a select policy `using (user_id = auth.uid())`, with no update or delete policy. Its header comment says why there's no update or delete policy, and why there's no view over `auth.users` (`research.md`). Run `pnpm test:rls` until T001 passes.
- [ ] T003 [P] Add `CreateFeedback` to `packages/schema/src/index.ts`, beside `CreateExpense`:
  - `id: uuid`
  - `message: z.string().trim().min(1).max(2000)`
  - `screen: z.string().min(1).max(200).startsWith('/')`
  - `client: z.enum(['web','macos'])`
  - `appVersion: z.string().min(1).max(64)`

  Export the inferred type.

**Checkpoint**: The table exists, is isolated per user, and the contract is typed.

---

## Phase 3: User Story 1 - Say what's in the way, from where it happened (Priority: P1) 🎯 MVP

**Goal**: A signed-in user sends a message from any screen without leaving it.

**Independent Test**: Signed in on `/invoices`, press Feedback, type and send. The dialog closes into "Thanks. Feedback sent.", and one row exists.

### Tests for User Story 1

- [ ] T004 [US1] Write the failing route cases for `POST /api/v1/feedback` in `apps/web/test/routes.test.ts`, per `contracts/feedback.md`:
  - a valid body returns `201 { id }` and stores one row
  - an empty or whitespace-only `message` returns 400
  - a 2,001-character `message` returns 400
  - no session returns 401
  - posting the same body twice returns 201 both times and leaves exactly one row
- [ ] T005 [P] [US1] Write the failing form-rule tests in `apps/web/test/ui/feedback.test.tsx`:
  - Send is disabled while the message is empty or whitespace only
  - the count reads `n / 2,000` and the box stops at 2,000 characters
  - while sending, the message box is read-only and Cancel and Send are disabled
  - a rejected send keeps the typed message and shows the error in the dialog, not in the app-wide notice

### Implementation for User Story 1

- [ ] T006 [US1] Create `apps/web/src/app/api/v1/feedback/route.ts` with `POST`, modeled on `apps/web/src/app/api/v1/expenses/route.ts`. It uses `requireSession`, then `parseBody(req, CreateFeedback)`, then inserts `{ id, user_id, message, screen, client, app_version }`. On error code `23505`, it returns `201 { id }` if a row with that `id` is visible to this user, and rethrows otherwise. Wrap it in `handle`, with `export const dynamic = 'force-dynamic'`. Make T004 pass.
- [ ] T007 [P] [US1] Add `sendFeedback(body: CreateFeedback)` to `apps/web/src/lib/client/api.ts`. It posts to `/api/v1/feedback` the same way the other writers in that file do.
- [ ] T008 [P] [US1] Add `feedback: http.post(\`${API}/feedback\`, …)` to `apps/web/src/mocks/handlers.ts`. It validates with `CreateFeedback` and answers `201 { id }`, so stories and `mocks-parity.test.ts` cover it.
- [ ] T009 [US1] Create `apps/web/src/components/feedback.tsx` exporting `Feedback`, per `design/feedback.html` and the spec's Design section:
  - **The trigger**: a ghost header button with the lucide `MessageSquare` icon and the label "Feedback", highlighted while the dialog is open.
  - **The dialog**: `ui/dialog`, titled "Send feedback", with the support line "A fault, a question or something you wish it did. It goes straight to us."
  - **The message box**: a textarea with `maxLength={2000}`, placeholder "What's in your way?", and the meta line `{n} / 2,000 · Sent with this screen and version`.
  - **The buttons**: Cancel and an accent Send.
  - **Sending**: `useOptimisticMutation` in pending mode (no `predict`) with `meta: { inline: true }`, sending `{ id: uuidv7(), message, screen: usePathname(), client: 'web', appVersion: process.env.NEXT_PUBLIC_APP_VERSION }`. Generate the `id` once per open dialog, so a retry after a failure reuses it.
  - **Success**: close the dialog, clear the text and show a `role="status"` toast, "Thanks. Feedback sent.", for 4 seconds.
  - **Error**: keep the dialog open and the text intact, with the line "Couldn't send. Your message is still here. Try again." in `text-danger`.
  - **Phone**: below `sm`, the dialog is a bottom sheet.

  Make T005 pass.
- [ ] T010 [US1] Mount `<Feedback />` in `apps/web/src/components/app-header.tsx`, inside the right-hand group, before `<AccountMenu />`. Update the component's doc comment, which says the header holds the wordmark and the account.
- [ ] T011 [P] [US1] Create `apps/web/src/components/feedback.stories.tsx`, with one export per visible state: `Closed` (header only), `Open`, `Typing`, `Sending` (the handler never resolves), `Sent` (the toast), `Failed` (the handler returns 500) and `Phone` (390px viewport). Use the `mocks/handlers.ts` setup the other stories use.

**Checkpoint**: A user can send feedback from every screen, and every state renders in Storybook.

---

## Phase 4: User Story 2 - We get enough to act without asking back (Priority: P1)

**Goal**: Every submission carries its sender, screen, client, version and time, and Blake can read them in one place.

**Independent Test**: Send from `/invoices` and from `/settings`, then run the saved query. Both rows show the email, path, `web`, version and time.

### Tests for User Story 2

- [ ] T012 [US2] Extend the T004 cases in `apps/web/test/routes.test.ts`. The stored row's `user_id` is the session's user, not anything in the body (a body `userId` is ignored), and `screen`, `client` and `app_version` are stored as sent. A missing `screen` or `appVersion`, or a `client` of `"ios"`, returns 400.

### Implementation for User Story 2

- [ ] T013 [US2] Confirm the context fields are taken from the route (`usePathname()`) and the build (`NEXT_PUBLIC_APP_VERSION`) in `apps/web/src/components/feedback.tsx`, never typed by the user. In `apps/web/test/ui/feedback.test.tsx`, assert that the request body carries the current pathname and the version.
- [ ] T014 [US2] Add the dashboard read to `specs/005-feedback-form/quickstart.md`'s check 2, if it has changed: the query that joins `auth.users` for the email, newest first. After merge, Blake saves it in the production dashboard as "Feedback".

**Checkpoint**: Each submission is complete without anything typed by the user, and readable in one query.

---

## Phase 5: Polish & Cross-Cutting Concerns

- [ ] T015 [P] Add "feedback you send from the app" to the "What you enter" paragraph in `apps/web/src/app/privacy/page.tsx`.
- [ ] T016 Run the suites in `quickstart.md`:
  - `pnpm --filter @stint/web test`
  - `pnpm test:rls`
  - `pnpm test:ui`
  - `pnpm --filter @stint/web test:stories`
  - `node apps/web/scripts/check-mutation-usage.mjs`

  Then sign in to local Stint and walk quickstart checks 1–5.

---

## Dependencies & Execution Order

- **Foundational (T001–T003)** blocks both stories. T001 comes before T002. T003 is independent of both.
- **US1 (T004–T011)**:
  - T004 comes before T006.
  - T005 comes before T009.
  - T007 and T008 can run in parallel once T003 is done.
  - T009 needs T007, and comes before T010 and T011.
- **US2 (T012–T014)** builds on US1's route and component. Its tests extend US1's.
- **Polish (T015–T016)**: T015 can run any time. T016 is last.

## Parallel Example: User Story 1

```text
After T003: T004 (routes test), T005 (ui test), T007 (api client), T008 (mock handler)
After T009: T010 (header mount), T011 (stories)
```

## Implementation Strategy

US1 is the MVP: the table, the route and the dialog. US2 adds assertions on
the context US1 already sends, plus the saved query. Both ship in one PR,
since a submission without its context fails SC-002.
