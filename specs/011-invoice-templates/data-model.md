# Data model: Invoice templates

**InvoiceTemplate**: `'standard' | 'modern' | 'classic' | 'creative'`, a Zod
enum in `@stint/schema` and a check in SQL.

| Column | Type | Rule |
| --- | --- | --- |
| `user_settings.invoice_template` | `text not null default 'standard'` | in the four |
| `invoices.template` | `text` | in the four; null only while `status = 'draft'` |

- **Migration** adds both, backfills every non-draft invoice to `standard`,
  then adds `check (status = 'draft' or template is not null)`.
- **Draft**: `template` is null; it renders in `user_settings.invoice_template`.
- **Sent**: `send_draft` sets `template` from `p_invoice->>'template'`;
  `guard_issued_invoice` keeps it fixed from then on, void included.
- **`downloaded_snapshot`** gains `template`, the template that PDF was drawn in.
- **Effective template**: `invoice.template ?? settings.invoiceTemplate`,
  resolved in `loadPdfData` and on the client.
