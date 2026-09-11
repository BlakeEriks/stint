# Samples

Committed output from the real renderers, so the current look can be reviewed
without running anything.

| File | Source | Regenerate |
|---|---|---|
| `invoice-default.pdf` | `apps/web/src/lib/invoice-pdf.tsx` | `node --experimental-strip-types apps/web/scripts/render-sample-invoice.mjs` |

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

A sample that only showed one rate and no tax would hide exactly the layout
problems worth catching.

## On multiple templates (not built)

The current design assumes one template. Supporting a gallery later means:

- `invoice-pdf.tsx` becomes one of several documents behind a registry keyed
  by a `template` column on `invoices`, frozen at generation like every other
  presentational choice — a re-downloaded invoice must look the way it looked
  when it was sent.
- The fixture in `render-sample-invoice.mjs` is exported so each template can
  render the same data, making samples directly comparable.
- Anything shared across templates (currency and date formatting, the `Lines`
  helper, the color constants) moves out of the document module first.

Nothing here anticipates that beyond the export, which costs nothing now.
