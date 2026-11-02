# Tasks: A draft changes only when you change it

## Phase 1: Foundation

- [x] T001 Migration `draft_holds_work`: `draft_id` on `time_entries` and `expenses` with the composite key and index; `release_moved_work` trigger; `create_invoice`, `update_draft` without the overlap check and holding work; `hold_draft_work`; `send_draft` clearing `draft_id`
- [x] T002 Migration `backfill_draft_work`: each open draft holds its period's work
- [x] T003 [P] RLS case in `apps/web/test/rls.test.ts`: another user's draft cannot hold your entry

## Phase 2: User Story 1 — a draft holds what you built (P1)

- [x] T004 [US1] Tests first in `apps/web/test/invoices.test.ts`: later work leaves a draft's total unchanged; a held entry's edit shows; a second draft over the same dates takes nothing held; moving an entry to another client releases it
- [x] T005 [US1] `apps/web/src/lib/drafts.ts`: entry and expense scopes (held, build); `deriveDraft` prices held work; `computeInvoice` builds; drop `assignExpenses` from `packages/core/src/billable.ts`
- [x] T006 [US1] `POST /invoices` and `PATCH /invoices/:id` hold what they build; drop `draftOverlaps`, `DRAFT_OVERLAPS`, and New invoice's overlap warning

## Phase 3: User Story 2 — new work offered (P1)

- [x] T007 [US2] Test: a draft's read reports new work; `POST /invoices/:id/work` holds it
- [x] T008 [US2] `newWork` on `GET /invoices/:id`; the `work` route; `api.addDraftWork`
- [x] T009 [US2] Detail notice "N new entries, Xh, in this period" with Add to draft; story `NewWork`

## Phase 4: User Story 3 — Mark sent says what it locks (P1)

- [x] T010 [US3] Remove the download comparison: `snapshotChanged`, `newLines`, `changedSinceDownload`, `isNew`, `DRAFT_CHANGED`, the banners and their stories; `recordDownload` keeps the printed dates
- [x] T011 [US3] A shared `ConfirmDialog`; Mark sent asks in it, confirming with "Mark sent" and saying its N entries and $total stop changing; `entryCount` on the draft's read; stories `MarkSentAsks`, `MarkSentPending`

## Phase 5: User Story 5 — no "Already billed this?" (P3)

- [x] T012 [US5] Remove it from `invoice-new.tsx` with its toast and state; remove `POST /entries/invoiced-elsewhere`, `api.markInvoicedElsewhere`, the fake's handler, its parity row, its route tests and schema

## Phase 6: Polish

- [x] T013 Fake API (`src/mocks`) follows: no overlap refusal, `newWork`, the `work` handler
- [x] T014 Docs: `docs/api.md`, `docs/data-model.md`, `.claude/rules/invoicing.md`
- [x] T015 Verify: doc drift, `pnpm verify:static`, `TT=tt_596` db suites, seen in the app

User Story 4 (#583) is the next PR.
