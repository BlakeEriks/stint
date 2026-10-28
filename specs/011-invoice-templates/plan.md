# Implementation Plan: Invoice templates, Standard by default

**Branch**: `f461-invoice-templates` | **Date**: 2026-10-27 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/011-invoice-templates/spec.md`

## Summary

Four invoice templates — Standard, Modern, Classic, Creative — chosen by one
account setting, `user_settings.invoice_template`, from Settings or New
invoice. The PDF renderer becomes one document shell plus one module per
template; each template supplies its fonts, page geometry and section
components, and the shell keeps every shared rule (VOID, supporting-detail
pagination, footer). A draft renders in the current setting; `send_draft`
freezes `invoices.template` from the PDF the client was given, else the
setting. The on-screen preview card takes a `template` prop and draws each
template in HTML, which also gives the Settings and New invoice thumbnails.

## Technical Context

**Language/Version**: TypeScript 5.x on Node 22; SQL (Postgres 15)

**Primary Dependencies**: Next.js 16 route handlers, `@react-pdf/renderer` 4.9
(`Font.register` for the new faces), `next/font/local`, Zod in
`@stint/schema`, TanStack Query

**Storage**: Supabase Postgres; two columns, no table

**Testing**: `apps/web/test/routes.test.ts` and `invoices.test.ts` (real
Postgres), `apps/web/test/ui` (vitest + jsdom), `*.stories.tsx` (CI renders
in a browser)

**Target Platform**: Vercel (Node runtime for the PDF route), browsers

**Project Type**: web app with a macOS client; macOS unchanged

**Performance Goals**: a PDF renders no slower than today, plus one-time font
registration per cold start

**Constraints**: fonts ship in the repo under OFL and are never fetched at
render (FR-004); no new fixed cost; the real PDF stays behind the paid tier,
so no screen shows it free

**Scale/Scope**: 4 templates × (page 1 + detail pages); 3 screens touched
(Settings, New invoice, the invoice screen's preview)

## Constitution Check

| Principle (`.specify/memory/constitution.md`) | Applies | How the design meets it |
| --- | --- | --- |
| I. Never silently modifies user data | Yes | Choosing a template changes only the setting. A sent invoice's template is never rewritten; existing sent and void invoices are backfilled to `standard`, the look they already have. |
| II. Logic written twice has a parity test | No | The template is resolved once, in TypeScript (`invoice.template ?? settings.invoiceTemplate`); SQL only stores it. The HTML preview duplicates presentation, not logic. |
| III. Every client through `/api/v1` | Yes | The setting goes through `PATCH /api/v1/settings`; the freeze happens inside the existing Mark sent route. No Server Actions. |
| IV. `packages/core` does no I/O | Yes | Nothing new in core. `paginateSchedules` already takes rows per page; each template passes its own. |
| V. Tests first where a regression is silent | Yes | Route tests for the setting, the freeze and the backfill; a ui test for the picker's prediction and rollback; a story per template and per picker state. |
| VI. Every press answers in the same frame | Yes | The picker writes through `useOptimisticMutation`: selected at once, and a rejection restores the saved template and says why under the picker. |

Additional Constraints: an issued invoice stays immutable (`guard_issued_invoice`
freezes `template` with every column it does not name); no new fixed cost
(font files are static assets); US-first unchanged.

## Project Structure

### Documentation (this feature)

```text
specs/011-invoice-templates/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/api.md
├── design/{invoice,settings,new-invoice}.html
└── tasks.md             # /speckit-tasks
```

### Source Code

```text
supabase/migrations/<ts>_invoice_templates.sql     # columns, check, backfill, send_draft
packages/schema/src/index.ts                       # InvoiceTemplate enum; Settings, Invoice
apps/web/src/lib/invoice-templates/                    # replaces invoice-pdf.tsx
  document.tsx                                     # shell: pages, VOID, detail pagination, footer
  fonts.ts                                         # Font.register, once, from bundled TTFs
  standard.tsx  modern.tsx  classic.tsx  creative.tsx
apps/web/src/fonts/pdf/*.ttf + OFL.txt             # Outfit, EB Garamond, Space Grotesk, IBM Plex Mono
apps/web/src/fonts/*.woff2                         # the same faces for the preview
apps/web/src/app/fonts.ts                          # next/font/local, preload: false
apps/web/next.config.ts                            # outputFileTracingIncludes for the PDF route
apps/web/src/lib/invoicing.ts                      # template in pdfData, snapshot, sendDraft
apps/web/src/app/api/v1/settings/route.ts          # invoice_template read and write
apps/web/src/components/invoice-preview-card.tsx   # template prop; one look per template
apps/web/src/components/template-picker.tsx        # radio group of thumbnails, two sizes
apps/web/src/components/settings-page.tsx          # Invoice template section
apps/web/src/components/invoice-new.tsx            # Template field; preview in the template
apps/web/src/components/invoice-detail.tsx         # preview in the effective template
apps/web/scripts/render-sample-invoice.mjs         # one sample PDF per template
apps/web/test/routes.test.ts, invoices.test.ts, ui/template-picker.test.tsx
```

**Structure Decision**: the web app only. The PDF splits into a directory
because four layouts in one 800-line file would bury the shared rules; the
shell owns those rules so no template can drop one (FR-003).

## Complexity Tracking

None.
