# Tasks: The account has a billing time zone

**Input**: [plan.md](plan.md), [spec.md](spec.md), [data-model.md](data-model.md), [contracts/api.md](contracts/api.md)

Tests come first in each phase (Constitution V).

## Phase 1: Setup

- [x] T001 Build private test DBs with `TT=tt_568 pnpm db:setup` after the migrations exist (T004–T005)

## Phase 2: Foundational

- [x] T002 [P] Core test first in packages/core/test/billable.test.ts: `billingZone()` takes the account's, else the device's; `billingWindow` across a DST change in `America/Los_Angeles` runs midnight to midnight in each day's offset
- [x] T003 [P] `billingZone()` in packages/core/src/billable.ts, exported from the package
- [x] T004 Migration `billing_time_zone`: `user_settings.billing_time_zone text` in supabase/migrations/
- [x] T005 Migration backfill: each account's zone from its newest invoice's `tz` in supabase/migrations/
- [x] T006 Schema: `Settings.billingTimeZone: ianaZone.nullable()` in packages/schema/src/
- [x] T007 Row mapping in apps/web/src/lib/rows.ts; `loadSettings` reads the zone in apps/web/src/lib/drafts.ts

## Phase 3: User Story 1 — An invoice covers the same days wherever it is made (P1)

- [x] T008 [US1] Route tests first in apps/web/test/invoices.test.ts: generated from `Europe/Lisbon` and from `America/Los_Angeles` with the account on Los Angeles, both bill the 11:30 PM Sep 30 entry; the issue date is read in the billing zone; the draft stores the resolved zone; the preview reads the same zone (a draft keeping its zone is `deriveDraft`'s unchanged path, so no test of its own; the DST window is `billingWindow`'s core test)
- [x] T009 [US1] `computeInvoice` resolves the zone with `billingZone()` and returns it; `POST /invoices` and `POST /invoices/preview` use it in apps/web/src/lib/drafts.ts and apps/web/src/app/api/v1/invoices/
- [x] T010 [US1] UI test first in apps/web/test/ui/invoice-new.test.tsx: New invoice's issue date is today in the account's billing zone
- [x] T011 [US1] apps/web/src/components/invoice-new.tsx: today, the issue date and the suggested period in `billingZone(settings, device)`
- [x] T012 [US1] Mocks: preview and create resolve the zone the same way in apps/web/src/mocks/handlers.ts
- [x] T013 [US1] Route test first, then `lateEntries` reads each sent invoice's own `tz` in packages/core/src/live-draft.ts and apps/web/src/lib/stats.ts

## Phase 4: User Story 2 — The account sets a default billing zone (P2)

- [x] T014 [US2] Route tests first in apps/web/test/routes.test.ts: settings `billingTimeZone` round-trips, null clears, a bad zone is 422
- [x] T015 [US2] apps/web/src/components/zone-select.tsx: the zone picker with a "Not set" item, over `Combobox` (apps/web/src/components/ui/combobox.tsx, shadcn's Popover + Command), whose stories assert search, no match, the 18rem cap, the checked option and a keyboard pick
- [x] T016 [US2] apps/web/src/components/settings-form.tsx: Billing time zone in Billing defaults
- [x] T017 [US2] apps/web/src/components/welcome-dialog.tsx: every way out sets an unset zone to the device's
- [x] T018 [US2] Stories: Settings with a zone and with none set; welcome dialog's stamp

## Phase 5: The cut at review

- [x] T019 Remove the per-client zone: `clients.billing_time_zone` from the migration, `Client.billingTimeZone`, the clients route, the client dialog field and story, the macOS fixture key, the client step of `billingZone`, and their tests
- [x] T020 `PATCH /invoices/:id` (#571) resolves the zone with `billingZone()`, in the route and the mock; route test first: an edit from another zone keeps the draft in the billing zone

- [x] T021 The Inbox's ready-to-invoice row (#548) reads today and its entries in `billingZone()`, in apps/web/src/lib/stats.ts and the fake's apps/web/src/mocks/derive.ts; route test first in apps/web/test/invoices.test.ts

## Phase 6: Polish

- [x] T022 docs/api.md and docs/data-model.md: the field and how an invoice's zone is picked
- [ ] T023 Doc drift, `pnpm verify:static`, `TT=tt_568 pnpm verify:db`, the change seen in the running app
