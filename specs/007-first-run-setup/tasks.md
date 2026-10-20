# Tasks: First sign-in asks for your rate, and the invoice asks for the rest

**Input**: `specs/007-first-run-setup/` (spec.md, plan.md, research.md, data-model.md, contracts/api.md, quickstart.md, design/first-run.html)

Tests: Constitution V. Route behavior is tested first in
`apps/web/test/routes.test.ts` against real Postgres; each visible state is a
story, one per acceptance scenario. The look is `design/first-run.html`.

## Phase 1: Foundational

- [X] T001 Add `supabase/migrations/00000000000036_welcomed_at.sql`: `alter table user_settings add column welcomed_at timestamptz;` then `update user_settings set welcomed_at = now();` — "Null until the welcome dialog is finished or skipped. Backfilled to `now()` for every row that exists when the migration runs." The signup trigger is unchanged, so a new account's row is null
- [X] T002 [P] Set `welcomed_at = now()` on the seeded accounts in `supabase/seed.sql` and `apps/web/e2e/reset-seed.sql`, beside their existing `update user_settings`
- [X] T003 Add `welcomedAt: z.string().datetime({ offset: true }).nullable()` to `Settings` (so `UpdateSettings` accepts it) and `noDefaultRate: z.boolean()` to the stats `attention` object in `packages/schema/src/index.ts`
- [X] T004 Map `welcomed_at` ↔ `welcomedAt` in `SETTINGS_COLUMNS`, `toSettings` and `SETTINGS_FIELDS` in `apps/web/src/lib/rows.ts`
- [X] T005 Add `welcomedAt` to the settings fixture in `apps/web/src/mocks/fixtures.ts` (a timestamp for the default account) and `noDefaultRate: false` wherever stats `attention` is built, so `test/mocks-parity.test.ts` passes

## Phase 2: User Story 1 - The Inbox asks for a default rate until one is set (P1)

**Independent test**: Clear the default rate; Home's Inbox shows "Set your default rate"; save one from the row and it leaves at once.

- [X] T006 [US1] Write first in `apps/web/test/routes.test.ts`: `GET /stats` returns `attention.noDefaultRate: true` for an account with no default rate, `false` once `PATCH /settings { defaultHourlyRate: 0 }` (zero counts as set), and `true` again after `PATCH /settings { defaultHourlyRate: null }`
- [X] T007 [US1] In `apps/web/src/app/api/v1/stats/route.ts`, add `default_hourly_rate` to the settings select and return `attention.noDefaultRate: settings.data?.default_hourly_rate == null`; T006 passes
- [X] T008 [US1] In `apps/web/src/components/inbox.tsx`: `inboxCount` adds 1 when `noDefaultRate`; a `rate` row kind (id `rate`) placed after drafts and before entry rows, a neutral `Item` titled "Set your default rate", detail "Home can't show money without one", with an action slot holding a rate input (`$`, placeholder `100.00`, `/ hr`, `inputMode="decimal"`, `aria-label` "Default hourly rate") and a Save button disabled until a non-negative number is entered; Save marks the row leaving and calls `useOptimisticMutation` → `api.updateSettings({ defaultHourlyRate })`, invalidating settings and `invalidateEntryData`; a rejection brings the row back with the server's message under the field; a negative or non-numeric value is refused on the row before any request
- [X] T009 [US1] Fixtures in `apps/web/src/mocks/fixtures.ts`: an account with `defaultHourlyRate: null` whose stats carry `noDefaultRate: true` and money figures marked unrated, reachable from stories the way `account('empty')` is
- [X] T010 [P] [US1] Stories in `apps/web/src/components/home.stories.tsx`: NoRate (the row shows and is counted), RateAmongOthers (after an overdue invoice, before an entry row), SaveRate (type a rate, Save; the row leaves), RateRejected (the server refuses; the row returns with why)
- [X] T011 [P] [US1] Change the default hourly rate placeholder to `100.00` in `apps/web/src/components/settings-form.tsx`

## Phase 3: User Story 2 - A welcome dialog on first sign-in (P2)

**Independent test**: With `welcomed_at` null, Home opens the dialog; a rate and a client save; reload and it doesn't return.

- [X] T012 [US2] Write first in `apps/web/test/routes.test.ts`: a newly created account's `GET /settings` has `welcomedAt: null`; `PATCH /settings { welcomedAt }` round-trips the value
- [X] T013 [US2] Create `apps/web/src/components/step-dialog.tsx` on `components/ui/dialog.tsx`: props `step`, `steps`, `onBack?`, children; draws the step bars (filled through the current step, `text-strong` on, `border-default` off) and `type-meta` "Step n of m"; no close button; Escape and a press outside do nothing (`onEscapeKeyDown`/`onPointerDownOutside` prevent default)
- [X] T014 [US2] Create `apps/web/src/components/welcome-dialog.tsx` per the Design section. Step 1: "Welcome to Stint", "What do you charge by the hour?", the large rate field (`$`, `100.00`, `/ hour`), hint "A client or project can set its own rate later.", "Skip for now" (PATCH `welcomedAt`, close) and "Next" (disabled until a non-negative rate; PATCH `defaultHourlyRate` through `useOptimisticMutation` and move to step 2 at once). Step 2: "Who are you working for?", "Add your first client now, or later from Clients.", client name, "Rate" (placeholder is the rate from step 1, hint "Blank uses your default"), `ColorPicker` starting at null, "Coming from Toggl? Import your history instead." (PATCH `welcomedAt`, then go to `/settings/import`), Back, "Skip this step" while the name is empty, and "Start tracking" (POST the client with a `uuidv7()` id, then PATCH `welcomedAt`; "Saving" while pending; a failure keeps the dialog open with the fields and the reason)
- [X] T015 [US2] Mount `WelcomeDialog` in `apps/web/src/components/home.tsx`, open while the settings query has loaded with `welcomedAt === null`
- [X] T016 [US2] Fixture in `apps/web/src/mocks/fixtures.ts`: a new account with `welcomedAt: null`, no rate, no clients, no entries
- [X] T017 [P] [US2] `apps/web/src/components/welcome-dialog.stories.tsx`, one per design state: RateEmpty (Next disabled), RateFilled, ClientEmpty, ClientFilled, Saving, Failed, NextSavesRate (Next PATCHes the rate and shows step 2 at once), TogglImport (the link PATCHes `welcomedAt` and goes to `/settings/import`), SkipForNow (closes, nothing saved), Welcomed (Home with `welcomedAt` set shows no dialog)

## Phase 4: User Story 3 - The first invoice asks for business details (P3)

**Independent test**: With business name empty, New invoice shows the notice and a disabled Generate; Add details, Save; Generate enables.

- [X] T018 [US3] Write first in `apps/web/test/routes.test.ts`: `POST /invoices` with an empty or blank business name, or email, returns `422 VALIDATION_FAILED` and writes nothing; with both set it succeeds as before
- [X] T019 [US3] In `apps/web/src/app/api/v1/invoices/route.ts`, read `business_name, business_email` and throw `ApiError('VALIDATION_FAILED', 'Add your business name and email before generating an invoice.')` before any write when either is empty or blank; T018 passes
- [X] T020 [US3] Create `apps/web/src/components/business-dialog.tsx`: "Who is this invoice from?", "Your name and email go at the top of every invoice. Saved to Settings, so you're asked once.", business name and email (required) and address, seeded from settings; Cancel; Save disabled until name and email are non-blank, PATCHes all three through `useOptimisticMutation` with "Saving" while pending, closes on success, shows the reason on failure
- [X] T021 [US3] In `apps/web/src/components/invoice-new.tsx`: while `businessName` or `businessEmail` is blank, show the notice at the top of the form ("Your business details are missing" / "Name and email are needed to generate." / "Add details", opening `BusinessDialog`) and add both to `canGenerate`
- [X] T021a [US3] In `apps/web/src/components/invoice-preview-card.tsx`, draw a dashed `border-control` box reading "Your business name and email go here" where the "from" block goes while business name or email is blank
- [X] T022 [US3] Fixture in `apps/web/src/mocks/fixtures.ts`: an account with `businessName` and `businessEmail` null
- [X] T023 [P] [US3] Stories in `apps/web/src/components/invoice-new.stories.tsx`: DetailsMissing (notice, Generate disabled, the preview's dashed placeholder), AddDetails (opens the dialog, fill and Save, the notice goes and Generate enables), DetailsSaveFails

## Phase 5: Polish

- [X] T024 Run `pnpm --filter @stint/web test`, `test:stories` and `test:ui` against a private database (`ci-db.sh`), and walk `quickstart.md` in the running app signed in as the seeded account

## Dependencies

Phase 1 blocks every story. The stories are independent of each other: US1
touches the Inbox and stats, US2 Home and settings, US3 New invoice and the
invoices route. Within a story, its route test comes before its route change.

## Parallel examples

- Phase 1: T002 beside T003–T005.
- US1: T010 and T011 once T008–T009 land.
- US2: T013 (the dialog shell) beside T012.
- US3: T020 beside T018–T019.

## Implementation strategy

US1 alone closes the gap the issue names, so it is the MVP. US2 and US3 each
merge on their own after it.
