# API: Invoices can come from more than one business

`GET|POST /business-profiles`, `GET|PATCH|DELETE /business-profiles/:id`, as `/payment-profiles`:

- `GET` lists live businesses, the default first, then by name; `includeArchived=true` adds archived ones.
- `POST { id?, name, email, address?, logoUrl?, isDefault? }`: the first is the default; a replayed id answers 200 with the stored row.
- `PATCH` any field, `isDefault`, `archived`. Un-defaulting the last live business leaves it the default.
- `DELETE` archives; archiving the default moves it to another live business.

`POST /invoices` takes `businessProfileId?`. Absent: the client's last invoice's business while live, else the default. An archived or unknown id is 422; no business, or one without an email, is 422.

`Invoice` gains `businessProfileId` (null before this feature). `Settings` loses `businessName`, `businessAddress`, `businessEmail`, `logoUrl`.
