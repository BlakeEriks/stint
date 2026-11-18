# Research: A draft lists the entries it bills

## An issued entry's amount

- Decision: an issued invoice's list shows hours, not amounts.
- Rationale: `send_draft` freezes the lines, not each entry's rate. An
  entry's override is frozen with it, but its project's, client's and the
  default rate can change after, so an amount worked out today could differ
  from what was billed.
- Alternatives: stamp each entry's rate at send (a migration, for a column
  only this list reads); show today's amount (wrong once a rate changes).

## Where the list comes from

- Decision: the invoice read returns it.
- Rationale: the draft is already priced there, and `GET /entries` has no
  invoice filter; adding one would still leave amounts to the client.
- Alternatives: `GET /entries?invoiceId=` plus client-side pricing, which
  writes rate resolution a second time (Principle II).

## Toggle or section

- Decision: a section below the sheet (spec, Clarifications).
