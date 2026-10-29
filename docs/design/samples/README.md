# Samples

Committed output from the real renderers, so the current look can be reviewed
without running anything.

| File | Source | Regenerate |
|---|---|---|
| `invoice-<template>.pdf`, one per template | `apps/web/src/lib/invoice-templates/` | `pnpm --filter @stint/web sample:invoice` |
| `apps/web/src/components/template-thumbs/<template>.png`, page 1 of each, the template picker's thumbnails | the PDF above, through poppler's `pdftoppm` | the same |

These are generated, never hand-edited. Regenerate after changing a template
so the sample cannot drift from what the product actually produces.

## The invoice fixture

`render-sample-invoice.mjs` deliberately exercises the awkward cases rather
than the easy path:

- **Mixed rates on one invoice** (175, 220, 160) — the line-item builder keeps
  these on separate lines, and the sample proves the column alignment holds
  when the rate column varies.
- **A tax line** at a non-round 8.25%, so the rounding is visible. A US
  contractor invoicing services usually has none — it is here to exercise the
  rendering path, not to imply a default.
- **Multi-line addresses** on both parties.
- **A long description** that approaches the column boundary.
- **Every kind of line**: time, a fixed fee and an expense, which each
  template sets apart its own way.
- **A reference and all three schedules**, long enough that the date table
  continues onto a third page.

A sample that only showed one rate and no tax would hide exactly the layout
problems worth catching.
