# Roadmap

Work that is wanted but not built. Everything here has been measured against
the thesis in `docs/design/principles.md`: *does this help a solo contractor
track time and get paid?* Ideas that failed that test are recorded in
`principles.md` as refusals, not here.

A line in this file is not a commitment to ship. It is a commitment to have
already thought about the hard part, so the decision is not re-litigated from
scratch later.

## Import from Toggl

**Why it matters:** Toggl is the comparison point for this product, so it is
also where a new user's history already lives. A contractor with two years of
tracked time in Toggl cannot adopt Stint if adopting it means abandoning that
history — the invoices, the annual totals, and the "what did I bill this
client last spring" lookups all live in the old data. Without an import, the
switching cost is the product's real competitor, not Toggl's feature set.

The goal is a **seamless transfer**: run the import, and the calendar, client
list and reports read as though the work had been tracked in Stint all along.

### What comes across

Toggl's model maps onto ours more cleanly than it might look, because ours is
a subset:

| Toggl | Stint | Note |
|---|---|---|
| Client | `clients` | Name carries over; rates need resolution (below). |
| Project | `projects` | Toggl projects without a client map to `client_id = null`, which is already how unbilled work is modeled. |
| Time entry | `time_entries` | `description` → `task_name`, `billable` → `is_billable`. |
| Tags | — | **Dropped.** There is no tag concept here and adding one to serve an import would import Toggl's scope along with its data. |
| Tasks (sub-project) | — | Flattened into `task_name`. |
| Workspace | — | Single-user product; one workspace. |

### The parts that are actually hard

**Overlapping entries violate the timer invariant.** Toggl permits overlapping
time entries. Our `one_running_timer_per_user` index makes concurrent *running*
entries impossible, and the product promise is that entries do not overlap at
all — that is what makes the invoice trustworthy. A real Toggl export will
contain overlaps.

This is the decision the import hinges on, and it must not be resolved by
silently adjusting timestamps. Per `principles.md`, the app does not quietly
change a record of billable work. The import **surfaces** overlaps and makes
the user choose, the same way a runaway timer does. Preferred shape: import
everything that is unambiguous, then present the conflicting set as a review
step. Import is a once-per-lifetime operation, so a review step is cheap;
a wrong hour inside a past invoice is not.

**Rates are not in the export, and `0` is a real rate.** Toggl's CSV carries
an amount per entry, not the rate hierarchy that produced it. Back-computing a
rate from amount ÷ duration will produce rounding noise and will be wrong for
anything billed at a flat fee. Imported entries should resolve through the
normal hierarchy against whatever the user configures, and entries that cannot
resolve to a rate surface as unrated — the same state invoicing already refuses
to generate from. Never infer a rate and never write a guessed one to
`rate_override`.

**Idempotency.** Entry ids are client-generated UUIDv7 precisely so a retried
insert lands on the same row. An import should derive a stable id per source
entry so that re-running a partial or interrupted import cannot duplicate
anything. Re-importing the same file must be a no-op, not a second copy of the
year.

**Timestamps and DST.** Toggl exports wall-clock local time plus a separate
timezone field. Reconstructing instants from that across a DST boundary is the
same trap documented for the calendar: never do fixed-millisecond arithmetic.
Parse to an absolute instant and store UTC.

**Durations are derived here.** `duration_seconds` is a generated column, so
the import writes `started_at`/`ended_at` and never a duration. Where Toggl's
own reported duration disagrees with its start/end pair, that disagreement is
worth surfacing rather than picking a winner.

### Explicitly out of scope

- **No live Toggl sync.** A one-time migration, not an ongoing integration.
  Two systems of record for the same hours is how you get two different
  invoices for the same week. The user is leaving Toggl, not running both.
- **No invoice import.** Issued invoices are immutable financial records with
  frozen rates and gapless numbering owned by `allocate_invoice_number()`.
  Injecting foreign invoices into that sequence corrupts the one guarantee
  numbering provides. Historical invoices stay where they were issued; the
  time entries come across, and entries that were already billed in Toggl
  import as non-billable or pre-marked so they cannot be billed twice.

### Shape, when it is built

A file upload, not an API integration — Toggl's CSV/JSON export is stable,
needs no OAuth app, no stored third-party credential, and keeps working if
their API changes. Parsing belongs in `packages/core` as pure functions over
the parsed rows, so the preview a user reviews and the rows that get written
are produced by identical code — the same reason invoice line-item
construction lives there.
