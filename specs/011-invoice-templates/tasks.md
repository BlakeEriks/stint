# Tasks: Invoice templates, Standard by default

**Input**: `specs/011-invoice-templates/` — plan.md, spec.md, research.md,
data-model.md, contracts/api.md, design/

Tests come first where a regression is silent (Constitution V).

## Phase 1: Setup

- [ ] T001 [P] Add TTF files for Outfit (300, 400, 500, 600), EB Garamond (400, 400 italic), Space Grotesk (400, 500, 700) and IBM Plex Mono (400, 500, 600) with their OFL to `apps/web/src/fonts/pdf/`
- [ ] T002 [P] Add latin woff2 files for the same faces to `apps/web/src/fonts/` and declare them in `apps/web/src/app/fonts.ts` with `next/font/local`, `preload: false`, each exposing a CSS variable
- [ ] T003 Trace `apps/web/src/fonts/pdf/**` into the PDF route with `outputFileTracingIncludes` in `apps/web/next.config.ts`

## Phase 2: Foundational

- [ ] T004 Write the migration `supabase/migrations/<ts>_invoice_templates.sql`: `user_settings.invoice_template text not null default 'standard'` checked "in the four"; `invoices.template text` checked "in the four"; backfill every non-draft invoice to `'standard'`; then `check (status = 'draft' or template is not null)`; `send_draft` sets `template = p_invoice->>'template'`
- [ ] T005 Add `InvoiceTemplate = z.enum(['standard','modern','classic','creative'])`, `Settings.invoiceTemplate`, and `Invoice.template: InvoiceTemplate.nullable()` in `packages/schema/src/index.ts`
- [ ] T006 Map the columns in `apps/web/src/lib/rows.ts` and the settings route `apps/web/src/app/api/v1/settings/route.ts`

## Phase 3: User Story 1 — Choose a template (P1)

**Independent test**: pick Classic on New invoice; Settings shows Classic; a draft's PDF is in Classic.

- [ ] T007 [US1] Route tests in `apps/web/test/routes.test.ts`: settings default to `standard`; PATCH `invoiceTemplate: 'classic'` round-trips; an unknown value is `400 VALIDATION_FAILED`
- [ ] T008 [US1] Split `apps/web/src/lib/invoice-pdf.tsx` into `apps/web/src/lib/invoice-templates/` — `document.tsx` (Document, VOID, detail pages paginated with the template's rows per page, footer), `fonts.ts`, `shared.ts`, and `standard.tsx` holding today's layout unchanged; `renderInvoicePdf(data)` reads `data.template`
- [ ] T009 [P] [US1] `apps/web/src/lib/invoice-templates/modern.tsx` per design/invoice.html
- [ ] T010 [P] [US1] `apps/web/src/lib/invoice-templates/classic.tsx` per design/invoice.html (synthetic small capitals: uppercase at 80% size)
- [ ] T011 [P] [US1] `apps/web/src/lib/invoice-templates/creative.tsx` per design/invoice.html (lines grouped time / fixed fees / expenses; empty kinds omitted)
- [ ] T012 [US1] `loadPdfData` in `apps/web/src/lib/invoicing.ts` resolves `template = invoice.template ?? settings.invoiceTemplate`; `recordDownload` stores it in `downloaded_snapshot`
- [ ] T013 [US1] `apps/web/src/components/invoice-preview-card.tsx` takes `template` and draws each template in HTML per the design; stories per template in `invoice-preview-card.stories.tsx`
- [ ] T014 [US1] ui test `apps/web/test/ui/template-picker.test.tsx`: a press selects at once; a rejection restores the saved template and shows why
- [ ] T015 [US1] `useTemplateChoice()` over `useOptimisticMutation` and `TemplatePicker` (cards and mini sizes) in `apps/web/src/components/template-picker.tsx`, with stories
- [ ] T016 [US1] Invoice template section in `apps/web/src/components/settings-page.tsx` between Business identity and Invoice numbering
- [ ] T017 [US1] Template field, last in the form, and the preview in the chosen template in `apps/web/src/components/invoice-new.tsx`

## Phase 4: User Story 2 — A sent invoice keeps its template (P1)

**Independent test**: send in Standard, switch to Creative, download: Standard.

- [ ] T018 [US2] Tests in `apps/web/test/invoices.test.ts`: Mark sent freezes the downloaded snapshot's template, else the setting's; a later setting change leaves it; a pre-existing sent invoice reads `standard`
- [ ] T019 [US2] `sendDraft` in `apps/web/src/lib/invoicing.ts` passes `template` to `send_draft`
- [ ] T020 [US2] `apps/web/src/components/invoice-detail.tsx` previews in the effective template

## Phase 5: User Story 3 — Every template prints the whole invoice (P2)

- [ ] T021 [US3] Render every template with all sections and all three schedules, and with none of the optional sections, in `apps/web/scripts/render-sample-invoice.mjs`; write one sample per template to `docs/design/samples/`

## Phase 6: Polish

- [ ] T022 Run lint, typecheck, `pnpm test`, `test:ui`, `test:stories`; check each template in the running app
- [ ] T023 `/standards-review`, then open the PR with Try it steps

## Dependencies

Setup → Foundational → US1 → US2 → US3 → Polish. T009–T011 run in parallel
after T008.
