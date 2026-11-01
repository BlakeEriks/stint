# Research: billing time zone

## Where the zone is resolved

- **Decision**: `billingZone(account, device)` in `@stint/core`, called by `computeInvoice` on the server and by New invoice.
- **Rationale**: One rule both sides and the Inbox's ready-to-invoice row (#548) import, so none can drift. `computeInvoice` already loads settings, so the server costs no query.
- **Alternatives considered**: Resolving in each route (three copies); a SQL function (the zone is never needed in SQL).

## One zone, on the account

- **Decision**: The account has one billing zone; a client has none of its own (the owner's call at review, PR #580).
- **Alternatives considered**: A per-client zone overriding the account's, which the first build had; cut, see the spec's Removes.

## The account default for existing and new accounts

- **Decision**: Backfill from the newest invoice's `tz`; the welcome dialog sets an unset zone to the device's. Unset otherwise, falling back to the device's.
- **Rationale**: The zone the account was created in is known only to the browser that created it. The newest invoice is the zone the user last billed in, which is what the next invoice must match to leave no gap.
- **Alternatives considered**: A fixed default such as `America/New_York` (a guess that moves work between invoices unseen); writing the zone on the first request that carries one (a silent write from any device).

## The picker

- **Decision**: The app's `Select`, listing `Intl.supportedValuesOf('timeZone')` by IANA name, with a first item for the fallback.
- **Rationale**: Typeahead on the select finds a city; no new dependency.
- **Alternatives considered**: A searchable combobox (a new component for one field).

## Late entries

- **Decision**: `lateEntries` reads an entry's date in each sent invoice's own `tz`, else the request's.
- **Rationale**: Whether an entry falls in a sent invoice's period is that invoice's question, answered as it was billed.
