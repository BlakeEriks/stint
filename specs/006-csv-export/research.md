# Research: Export your records

## CSV dialect

- **Decision**: RFC 4180: a header row, comma separators, CRLF line ends, a
  field quoted when it holds a comma, quote, CR or LF, and a quote doubled
  inside one. The file starts with a UTF-8 byte-order mark.
- **Rationale**: Excel opens a BOM-less UTF-8 file as Windows-1252 and
  mangles any name outside ASCII; Numbers, Google Sheets and every CSV
  library accept the BOM.
- **Alternatives considered**: no BOM (breaks Excel on accented names); TSV or
  XLSX (neither issue asks for them, and XLSX needs a dependency).

## Formula cells

- **Decision**: A text cell beginning with `=`, `+`, `-`, `@`, tab or CR gets
  a leading `'`, per OWASP's CSV injection guidance. Numeric cells are never
  touched.
- **Rationale**: Task names arrive from imports as well as typing; a file
  handed to an accountant shouldn't run whatever a cell says.
- **Alternatives considered**: no guard (OWASP flags it); stripping the
  character (alters the record).

## Numbers and dates

- **Decision**: Money, hours and rates as plain two-place decimals with no
  symbol or separator (`1200.00`), beside a Currency column. Dates
  `MM/DD/YYYY` and times `9:05 AM`, in the user's zone.
- **Rationale**: Spreadsheets read `1200.00` as a number in every locale's
  default import and read `$1,200.00` as text in some. US dates and 12-hour
  times are positioning's baseline and read as dates in US spreadsheets.
- **Alternatives considered**: ISO dates (unambiguous, but positioning sets
  US formats as the baseline); `formatCurrency` (adds the symbol and
  separator).

## Delivering the file

- **Decision**: The button fetches the route, holds a pending state on
  itself while it waits, then saves the response through an object URL and a
  `download` link, named by the server's `Content-Disposition`.
- **Rationale**: Constitution VI: an answer the server decides shows pending
  on the control. A plain `<a download>` waits silently until headers
  arrive, and a failed response can save an error body as the file.
- **Alternatives considered**: a plain link, as Download PDF uses (silent
  wait, no failure state); streaming (unnecessary at this scale).

## Rates and amounts

- **Decision**: `resolveRate()` per entry, and the amount from the invoice
  builder's hundredths pricing, exported as `billedAmount(seconds, rate)`.
- **Rationale**: One implementation (Constitution II), and SC-003 holds by
  construction.
- **Alternatives considered**: the SQL `resolve_rate()` in a view (a second
  path, and a migration).
