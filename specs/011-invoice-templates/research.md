# Research: Invoice templates

## Where a sent invoice's template comes from

- **Decision**: `send_draft` writes `invoices.template` from
  `downloaded_snapshot.template` when the draft was downloaded, else the
  current setting. Each download records the template in the snapshot.
- **Rationale**: Mark sent already dates the invoice as the PDF the client was
  given (`downloaded_snapshot.issueDate`). Switching templates between the
  download and Mark sent must not freeze a look the client never received.
- **Alternatives**: freeze the setting at send (can disagree with the client's
  copy); refuse Mark sent as `DRAFT_CHANGED` (a template is not a change in
  what is billed, and would force a pointless re-download).

## Where a template shows before the PDF

- **Decision**: only in the thumbnails, page 1 of each template's sample
  PDF rendered to PNG by `pnpm sample:invoice` and committed. The
  invoice preview stays as it is: what the invoice says, not its look.
- **Rationale**: the real PDF is the paid product; the PDF route refuses free
  accounts. A user's own invoice drawn in a template on screen would give the
  presentation away, and it would be a second full-size copy of each
  template to keep in step with the PDF.
- **Alternatives**: the preview drawn in the template (gives the look away,
  and doubles the drawing at full size, supporting detail included); the PDF
  rendered in the browser (leaks the paid document itself); thumbnails
  drawn in HTML (a second copy of every look, free to drift from the PDF).

## Fonts in the PDF

- **Decision**: TTF files for Outfit (300, 400, 500, 600), EB Garamond (400,
  400 italic), Space Grotesk (400, 500, 700) and IBM Plex Mono (400, 500,
  600), committed under `apps/web/src/fonts/pdf/` with their OFL, registered
  once per process by absolute path and traced into the PDF route with
  `outputFileTracingIncludes`.
- **Rationale**: react-pdf embeds TTF and WOFF reliably; a path read from
  disk is never fetched at render (FR-004). Tracing is what puts files a
  route reads at runtime into its Vercel function.
- **Alternatives**: registering by URL (a network fetch per cold start, and a
  failure mode when it is down); WOFF2 (not supported by react-pdf's font
  loader).

## Small capitals and figures in Classic

- **Decision**: small capitals are set as uppercase at 80% size with 1.4pt
  tracking; figures are EB Garamond's defaults.
- **Rationale**: react-pdf has no `font-variant` or OpenType feature control.
  Synthetic small capitals at that ratio read as the design's; the figure
  style is the face's own and is accepted as rendered.
- **Alternatives**: a separate small-caps font file (EB Garamond SC is not in
  the current family release).

## Rows per supporting-detail page

- **Decision**: each template exports its page geometry, and the shell
  derives that template's rows per page the way `DETAIL_ROWS_PER_PAGE` does
  today, then calls `paginateSchedules` with it.
- **Rationale**: Modern and Classic have taller rows and margins than
  Standard; one global count would overflow their pages.

## The picker's write

- **Decision**: one `useTemplateChoice()` hook over `useOptimisticMutation`,
  patching `invoiceTemplate` and predicting into the settings query; Settings
  and New invoice both use it.
- **Rationale**: one setting, one write path, so the two screens can never
  disagree (FR-006), and Constitution VI's rules come with the mechanism.
