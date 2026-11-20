# Tasks: The month projection counts the days you actually work

**Input**: `specs/020-projection-days/`

**Tests**: Constitution V's suites for each kind of code touched.

## Phase 1: Foundational

- [ ] T001 Add `projection_days` to `user_settings` in `supabase/migrations/<ts>_projection_days.sql` (`pnpm exec supabase migration new projection_days`)
- [ ] T002 Export `PROJECTION_DAYS` and `ProjectionDays` from `packages/core/src/holidays.ts`; add `projectionDays` to `Settings` in `packages/schema/src/settings.ts`
- [ ] T003 Map the column in `apps/web/src/lib/rows.ts` (`SettingsRow`, `SETTINGS_COLUMNS`, `toSettings`, `SETTINGS_FIELDS`, Home settings) and in `apps/web/src/mocks/fixtures.ts`
- [ ] T004 Add `projectionDays` to the round-trip table in `apps/web/test/routes.test.ts`, with one refused value

## Phase 2: User Story 1 and 3 - Every day, and Weekdays unchanged (P1)

**Independent Test**: on the 10th of a 30-day month with 1,000 earned,
Every day projects 3,000 over 30 points; Weekdays reads as before.

- [ ] T005 [US1] Test first in `packages/core/test/stats.test.ts`: under `every_day`, a weekend day has its own point, `total` is the month's days and the projection is earned ÷ calendar days elapsed × days; the existing cases stand for `weekdays`
- [ ] T006 [US1] `businessDayKeysInLocalMonth(now, tz, days = 'weekdays')` in `packages/core/src/stats.ts` filters by the rule; `buildEarnedPace` takes `days`, reads `elapsed` and `total` off those keys; remove `businessDaysInLocalMonth` from `packages/core/src/calendar.ts` with its holiday comment
- [ ] T007 [US1] Pass `settings.projectionDays` in `apps/web/src/lib/stats.ts` and `apps/web/src/mocks/derive.ts`; test in `apps/web/test/routes.test.ts` that `/stats` counts every day of the month under `every_day`
- [ ] T008 [US3] The Settings "Home" section in `apps/web/src/components/settings-form.tsx`, a select autosaved with its own indicator; a story in `apps/web/src/components/settings-page.stories.tsx` that picks Every day and reads it back
- [ ] T009 [US1] A story in `apps/web/src/components/home.stories.tsx`: on Every day, the card reads the month's calendar days

## Phase 3: User Story 2 - Weekdays except holidays (P2)

**Independent Test**: November 2026 counts 19 days.

- [ ] T010 [US2] Test first in `packages/core/test/holidays.test.ts`: every holiday in 2026 and 2027, each Saturday and Sunday shift, and New Year's observed on December 31 of the year before
- [ ] T011 [US2] `observedFederalHolidays(year)` in `packages/core/src/holidays.ts`
- [ ] T012 [US2] `weekdays_except_holidays` in the counted days; a case in `packages/core/test/stats.test.ts` for November 2026 (19 days, holiday money carried to the next counted day)

## Phase 4: Polish

- [ ] T013 Doc drift against `origin/main`; `pnpm verify:static`; `TT=tt_809 pnpm db:setup && TT=tt_809 pnpm verify:db`; see Settings and Home as `builder@localhost.test`

## Dependencies

Phase 1 before all. T005 before T006; T010 before T011; T011 before T012.
Phase 2 and 3 touch `stats.ts` in turn, so run in order.
