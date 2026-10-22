# Tasks: Bill each client on its own schedule

**Input**: `specs/008-billing-schedule/` (plan, spec, research, data-model, contracts/clients.md)

**Tests**: Required by Constitution V (a route, client logic, a screen). Each
test task goes before the code it covers and must fail first.

## Phase 1: Setup

- [X] T001 Build private test database `tt_f432` with `PGPORT=54322 bash scripts/ci-db.sh` (never the shared `tt`)

## Phase 2: Foundational

- [X] T002 [P] Test the rule in `packages/core/test/billing-period.test.ts`: `periodContaining` for each kind — monthly month ends incl. Feb 28/29; semimonthly 15th/16th and last day; weekly and biweekly from an anchor before, on and after the date, across a year boundary. `lastEndedPeriod` returns the period before the one holding today, incl. on a period's last day (Oct 15 semimonthly → Sep 16–30). `isPeriod` true for exactly one period, false for a partial or straddling one
- [X] T003 Implement `packages/core/src/billing-period.ts` (`BillingSchedule`, `BILLING_PERIODS`, `periodContaining`, `lastEndedPeriod`, `isPeriod`), exported through `packages/core/src/index.ts`
- [X] T004 Test and change `defaultInvoicePeriod(today, schedule)` in `packages/core/src/invoice.ts` (+ `packages/core/test/invoice.test.ts`): a schedule gives `lastEndedPeriod`; null keeps the nearest-month rule and its existing tests
- [X] T005 Write migration `supabase/migrations/<timestamp>_client_billing_schedule.sql` (name via `date -u +%Y%m%d%H%M%S`) per data-model.md: `billing_period`, `period_anchor`, constraint `billing_period_anchor`
- [X] T006 [P] Add `BillingSchedule` (discriminated union per contracts/clients.md) and `billingSchedule` to `Client` in `packages/schema/src/index.ts`

## Phase 3: User Story 1 - Set a client's billing schedule (P1)

**Independent test**: set each schedule, save, reopen and see it; existing clients read None.

- [X] T007 [US1] Route tests in `apps/web/test/routes.test.ts` per contracts/clients.md: null by default; each kind round-trips on POST, PATCH and list; PATCH without it leaves it; PATCH null clears it; weekly without anchor, monthly with anchor, unknown period → 422
- [X] T008 [US1] Map the columns in `apps/web/src/lib/rows.ts` (`CLIENT_COLUMNS`, `ClientRow`, `toClient`) and write both columns from `billingSchedule` in `apps/web/src/app/api/v1/clients/route.ts` and `[id]/route.ts`
- [X] T009 [P] [US1] Add `billingSchedule: null` to `apps/web/src/mocks/fixtures.ts` and `handlers.ts`; Northwind stays null
- [X] T010 [US1] Stories in `apps/web/src/components/client-list.stories.tsx`: `ClientSchedule` (None by default; set Twice a month, save, reopen shows it; the row shows it); `ClientScheduleWeekly` (Weekly reveals "First period starts", prefilled; saved and shown on reopen)
- [X] T011 [US1] Schedule select and anchor date in `apps/web/src/components/client-form.tsx`; schedule in the row's support line in `apps/web/src/components/client-list.tsx`

## Phase 4: User Story 2 - A new invoice starts on the client's period (P1)

**Independent test**: choose a scheduled client and see its last ended period.

- [X] T012 [US2] Stories in `apps/web/src/components/invoice-new.stories.tsx`: `ScheduledDefaults` (twice a month → the last ended half), `WeeklyDefaults`, `UnscheduledDefaults` (unchanged nearest month), `EditedDatesStay` (edit a date, choose another client, dates stay)
- [X] T013 [US2] Carry over #423's wiring in `apps/web/src/components/invoice-new.tsx`: period dates null until edited, `defaultInvoicePeriod(today, client?.billingSchedule)`, editing either pins both

## Phase 5: User Story 3 - An off-schedule period is pointed out (P2)

- [X] T014 [US3] Stories in `apps/web/src/components/invoice-new.stories.tsx`: `OffSchedule` (hint text, Generate invoice still enabled; none while a date is cleared), `OffSchedulePhone`, `NoScheduleNoHint`
- [X] T015 [US3] The hint in `apps/web/src/components/invoice-new.tsx` per research R4

## Phase 6: Polish

- [X] T016 [P] Document the columns in `docs/data-model.md` and `billingSchedule` in `docs/api.md`
- [X] T017 Run `pnpm verify:static`, core and route suites against `tt_f432`, the client and invoice-new stories; sign in locally and walk quickstart.md
