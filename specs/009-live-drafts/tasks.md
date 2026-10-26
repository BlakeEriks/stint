# Tasks: Drafts collect their period's work until sent

**Input**: `specs/009-live-drafts/` (plan, spec, research, data-model, contracts/invoices.md)

**Tests**: Required by Constitution V (money, a write, a route, a policy). Each
test task goes before the code it covers and must fail first. Invoicing route
tests live in `apps/web/test/invoices.test.ts`.

## Phase 1: Setup

- [X] T001 Build private databases `tt_f433` and `tt_f433_rls` with `PGPORT=54322 bash scripts/ci-db.sh`

## Phase 2: Foundational

- [X] T002 [P] Test `draftSnapshot`, `snapshotChanged` and `lateEntries` in `packages/core/test/live-draft.test.ts`
- [X] T003 Implement them in `packages/core/src/live-draft.ts`, exported from `packages/core/src/index.ts`
- [X] T004 Migration `supabase/migrations/<ts>_live_drafts.sql` per data-model.md: the three columns, `refresh_draft()`, and the existing drafts' `excluded_expense_ids` backfill (R8)
- [X] T005 [P] Schema in `packages/schema/src/index.ts`: `tz` on invoice reads, `DRAFT_CHANGED` and `DRAFT_OVERLAPS` codes, `changedSinceDownload` and line `isNew` on the detail, `attention.lateEntries`; `apps/web/src/lib/errors.ts` maps both to 409
- [X] T006 `refreshDraft(db, invoice, tz, { sentAt? })` in `apps/web/src/lib/invoicing.ts`: loads the choices, recomputes through the same loaders and `buildLineItems` as `POST /invoices`, calls `refresh_draft`; `rows.ts` maps the new columns

## Phase 3: User Story 1 - A draft picks up later work (P1)

- [X] T007 [US1] Route tests: after generating, a logged entry in the period appears on `GET /invoices/:id`, the PDF data and the list total; an edited entry changes its line; a deleted or non-billable one leaves; an expense added for the client appears unless excluded; an entry outside the period doesn't
- [X] T008 [US1] Refresh on `GET /invoices`, `GET /invoices/:id` and the PDF route; `POST /invoices` stores `tz` and `excluded_expense_ids`

## Phase 4: User Story 2 - Marking sent freezes it (P1)

- [X] T009 [US2] Route tests: Mark sent on a draft sends its current lines; entries logged after don't change it; rendering the PDF then logging an entry makes Mark sent answer 409 `DRAFT_CHANGED` with hours and totals, and rendering again lets it through; a draft never rendered sends; `GET /invoices/:id` returns `changedSinceDownload` and `isNew`
- [X] T010 [P] [US2] RLS test in `apps/web/test/rls.test.ts`: `refresh_draft` on another user's draft or on a sent invoice raises
- [X] T011 [US2] Status route sends a draft through `refreshDraft(..., { sentAt })`; the PDF route writes `downloaded_snapshot`; the detail route returns the change

## Phase 5: User Story 3 - Choices survive (P1)

- [X] T012 [US3] Route tests: summary text, reference, a fixed charge and an excluded expense survive two refreshes; the charge appears once
- [X] T013 [US3] Make T012 pass

## Phase 6: Overlap (FR-006)

- [X] T014 Route test: `POST /invoices` over a period overlapping an open draft for the client answers 409 `DRAFT_OVERLAPS`; a sent invoice's period doesn't block
- [X] T015 The check in `apps/web/src/app/api/v1/invoices/route.ts`

## Phase 7: User Story 4 - Late work (P2)

- [X] T016 [US4] Route test: an unbilled billable entry dated inside a sent invoice's period appears in `/stats` `attention.lateEntries`; billed or non-billable it doesn't; a void invoice's period doesn't count
- [X] T017 [US4] `lateEntries` in `apps/web/src/lib/stats.ts`

## Phase 8: Screens

- [X] T018 Mocks: `apps/web/src/mocks/handlers.ts` and `respond.ts` mirror `changedSinceDownload`, `isNew`, `DRAFT_CHANGED`, `DRAFT_OVERLAPS` and `lateEntries`; fixtures gain one late entry and a changed draft
- [X] T019 Stories in `invoice-detail.stories.tsx`: `DraftChanged` (banner, struck total, Mark sent disabled, new line tinted), `DraftChangedPhone`; `invoice-new.stories.tsx`: `OverlapsDraft` (line, link, Generate disabled); `inbox.stories.tsx`: `LateEntry` (row, Not billable, Open entry)
- [X] T020 `invoice-detail.tsx`: banner, disabled Mark sent, tinted lines, hint; `api.ts` sends `tz` on invoice reads and the PDF URL
- [X] T021 `invoice-new.tsx`: the overlap line from the client's drafts, Generate disabled
- [X] T022 `inbox.tsx`: the late entry item

## Phase 9: Polish

- [X] T023 [P] `docs/data-model.md` (drafts refresh; the columns) and `docs/api.md` (contracts/invoices.md)
- [X] T024 Run `pnpm verify:static`, the core, route, RLS and story suites on the private databases, `swift test`; walk quickstart.md signed in locally
