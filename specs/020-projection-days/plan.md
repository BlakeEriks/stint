# Implementation Plan: The month projection counts the days you actually work

**Branch**: `pace-day-rule` | **Date**: 2026-11-20 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/020-projection-days/spec.md`

## Summary

A `projection_days` column on `user_settings` (`every_day`, `weekdays`,
`weekdays_except_holidays`; default `weekdays`) picks which days Home's
month counts. `packages/core` computes the observed US federal holidays and
lists the month's counted days in one function; `buildEarnedPace` reads
both the series and its elapsed and total figures off that list, so they
can't disagree. `/stats` passes the user's rule in. Settings gains a Home
section with one select.

## Technical Context

**Language/Version**: TypeScript (Node 24), SQL (Postgres 17)

**Primary Dependencies**: Next.js route handlers, Zod (`packages/schema`),
Radix Select

**Storage**: Supabase Postgres, one new column on `user_settings`

**Testing**: `node --test` in `packages/core/test` and `apps/web/test`,
Storybook play functions

**Target Platform**: web, `/api/v1`; the macOS app reads `/stats` unchanged

**Project Type**: web service and web app

**Performance Goals**: none new; the holiday math is a few date operations
per request

**Constraints**: `packages/core` does no I/O, so holidays are computed

**Scale/Scope**: one setting, one screen section

## Constitution Check

| Principle (`.specify/memory/constitution.md`) | Applies | How the design meets it |
| --- | --- | --- |
| I. Never silently modifies user data | No | The setting changes a projection, never a record. |
| II. Logic written twice has a parity test | No | Counted days live in `packages/core` only; SQL doesn't count days. |
| III. Every client through `/api/v1`; server owns timer truth | Yes | The setting is read and written through `/settings`; `/stats` computes the projection under it. |
| IV. `packages/core` does no I/O | Yes | Holidays are date arithmetic in `packages/core/src/holidays.ts`. |
| V. Tests first where a regression is silent | Yes | Each holiday rule and shift in `packages/core/test/holidays.test.ts`; each rule's counted days and pace in `stats.test.ts`; the field's round trip and its reach into `/stats` in `routes.test.ts`; the Settings control and the Every day chart in stories. |
| VI. Every press answers in the same frame | Yes | The select autosaves like the fields around it, through `useAutosave`, with its section's save indicator. |
| VII. A feature names what it removes | Yes | Removes `businessDaysInLocalMonth` and its second weekday loop: elapsed and total are read off the one list of counted days. Removes the "Holidays are not modeled" rationale. The setting is new state; one fixed rule is wrong for anyone who doesn't work Monday to Friday, and no existing state covers them. |

Additional Constraints: none touched. No new fixed cost.

## Project Structure

### Documentation (this feature)

```text
specs/020-projection-days/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/settings.md
└── tasks.md
```

### Source Code (repository root)

```text
supabase/migrations/<ts>_projection_days.sql   # the column
packages/core/src/holidays.ts                  # observed federal holidays (new)
packages/core/src/stats.ts                     # counted days take the rule; buildEarnedPace too
packages/core/src/calendar.ts                  # businessDaysInLocalMonth removed
packages/core/test/holidays.test.ts            # new
packages/core/test/stats.test.ts               # rule cases
packages/schema/src/settings.ts                # projectionDays
apps/web/src/lib/rows.ts                       # column mapping, Home settings
apps/web/src/lib/stats.ts                      # passes the rule
apps/web/src/mocks/{fixtures,derive}.ts        # the mock follows the API
apps/web/src/components/settings-form.tsx      # Home section
apps/web/src/components/settings-page.stories.tsx
apps/web/src/components/home.stories.tsx       # Every day chart
apps/web/test/routes.test.ts                   # round trip, /stats under the rule
```

**Structure Decision**: The existing web, schema and core packages; no new
package.

## Complexity Tracking

None.
