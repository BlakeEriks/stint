# Research: Leaving New invoice with changes

## Holding a navigation in the App Router

- **Decision**: A capture-phase `click` listener on `document`, added only
  while the form has changes. It holds a plain left click on a same-origin
  `<a href>` that leaves the current path and query, and opens the dialog
  with that href. Discard then calls `router.push(href)`.
- **Rationale**: Every in-app navigation away from the form is a
  `next/link` anchor (the sidebar, the back link, Inbox rows). A listener on
  `document` in the capture phase runs before React's root listener, so
  stopping it there keeps `Link` from navigating.
- **Alternatives considered**: Wrapping `Link` everywhere (every screen
  changes for one form). Patching `history.pushState` (Next.js internals,
  and it would also catch Generate's own redirect). `next/navigation` has no
  blocking API.

## Refresh and closing the tab

- **Decision**: `beforeunload` with `preventDefault()`, only while the form
  has changes. Browsers show their own text; it can't be changed.
- **Alternatives considered**: Keeping a copy in `localStorage`, rejected by
  the issue: nothing is kept unasked.

## Back and Forward

- **Decision**: Not held. A Back press fires `popstate` after the URL has
  changed; holding it means pushing a dummy history entry, which breaks
  Forward and confuses the router's own state.

## An empty draft

- **Decision**: `pricedInvoiceRefusal` keeps only the unrated-work case.
  `send_draft`'s "Nothing to send" (`nothingToSend` in `lib/drafts.ts`) is
  already the refusal at Mark sent, shown in its dialog. The invoice page
  already shows an empty draft, whose held work was all deleted, as
  "Nothing to bill in this period".
- **Alternatives considered**: Allowing empty only from the dialog's Save
  draft. Two rules for one press.
