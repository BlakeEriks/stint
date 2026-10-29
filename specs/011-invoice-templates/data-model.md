# Data model: Invoice templates

**InvoiceTemplate**: `'standard' | 'modern' | 'classic' | 'creative'`, a Zod
enum in `@stint/schema` and a check in SQL.

| Column | Type | Rule |
| --- | --- | --- |
| `user_settings.invoice_template` | `text not null default 'standard'` | in the four |
| `invoices.template` | `text not null default 'standard'` | in the four |

- **Migration** adds both; the default makes every existing invoice
  `standard`, the look it already has, without touching a row.
- **Draft**: its stored `template` is ignored, and the API returns null; it
  renders in `user_settings.invoice_template`.
- **Sent**: `send_draft` sets `template` from `p_invoice->>'template'`, else
  keeps the stored one;
  `guard_issued_invoice` keeps it fixed from then on, void included.
- **`downloaded_snapshot`** gains `template`, the template that PDF was drawn in.
- **Effective template**: the setting for a draft, else `invoice.template`,
  resolved in `loadPdfData`.
