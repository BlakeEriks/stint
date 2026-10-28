/**
 * What a write refuses, and the words it refuses with. A route throws these
 * and the Storybook fake (`apps/web/src/mocks/handlers.ts`) answers with
 * them, so a story shows the refusal the app would.
 *
 * Some are decided here; the rest are decided by the database (a trigger,
 * an index, a constraint) and only named here, and the fake's copy of that
 * decision is held to the database by `apps/web/test/mocks-parity.test.ts`.
 */

export interface Refusal {
  code:
    | 'VALIDATION_FAILED'
    | 'INVALID_PERIOD'
    | 'NO_RATE_CONFIGURED'
    | 'ENTRY_LOCKED'
    | 'ENTRY_ALREADY_INVOICED'
    | 'EXPENSE_LOCKED'
    | 'TIMER_ALREADY_RUNNING'
    | 'NO_TIMER_RUNNING'
    | 'ENTRY_ALREADY_SAVED';
  message: string;
  details?: unknown;
}

type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'void';

const refusal = (
  code: Refusal['code'],
  message: string,
  details?: unknown,
): Refusal =>
  details === undefined ? { code, message } : { code, message, details };

const after = (a: string, b: string) => new Date(a) > new Date(b);

/* Decided here. */

/** An entry edited to end at or before it starts. */
export function entryOrderRefusal(startedAt: string, endedAt: string | null) {
  return endedAt != null && !after(endedAt, startedAt)
    ? refusal('VALIDATION_FAILED', 'endedAt must be after startedAt', {
        startedAt,
        endedAt,
      })
    : null;
}

/** What a create sends, and what a stored entry holds, to compare them. */
interface CreateFields {
  taskName?: string;
  projectId?: string | null;
  startedAt: string;
  endedAt: string | null;
  isBillable?: boolean;
  rateOverride?: number | null;
}

/**
 * A create replayed onto an id already stored. The same details are a retry
 * and answer with the stored entry; different ones were typed after the
 * first save landed unseen, and answering with the stored row would drop
 * them without a word (Constitution I). A field the replay omits takes the
 * stored value, as the first save did.
 */
export function replayRefusal(sent: CreateFields, stored: CreateFields) {
  const at = (iso: string | null) => (iso == null ? null : Date.parse(iso));
  const same =
    (sent.taskName ?? '') === stored.taskName &&
    (sent.projectId ?? null) === stored.projectId &&
    at(sent.startedAt) === at(stored.startedAt) &&
    at(sent.endedAt) === at(stored.endedAt) &&
    (sent.isBillable === undefined || sent.isBillable === stored.isBillable) &&
    (sent.rateOverride ?? null) === (stored.rateOverride ?? null);
  return same
    ? null
    : refusal(
        'ENTRY_ALREADY_SAVED',
        'This entry was already saved with its earlier details. Close this and edit the entry to change them.',
      );
}

/** A stop backdated to or before the timer's start. */
export function stopOrderRefusal(startedAt: string, endedAt: string) {
  return after(endedAt, startedAt)
    ? null
    : refusal('VALIDATION_FAILED', 'endedAt must be after the entry started', {
        startedAt,
        endedAt,
      });
}

/* A paid date records when money arrived: not before the invoice was sent,
   and not after the request. */
export function paidAtRefusal(
  paidAt: string,
  sentAt: string | null,
  now: Date,
) {
  if (new Date(paidAt) > now)
    return refusal('VALIDATION_FAILED', 'paidAt cannot be in the future', {
      paidAt,
    });
  if (sentAt && after(sentAt, paidAt))
    return refusal(
      'VALIDATION_FAILED',
      'paidAt cannot be earlier than the invoice was sent',
      { paidAt, sentAt },
    );
  return null;
}

/** An invoice asked for before its lines are priced: dates are `YYYY-MM-DD`,
 *  `today` in the request's zone. */
export function invoiceRequestRefusal(
  r: { periodStart: string; periodEnd: string; dueDate?: string },
  today: string,
) {
  if (r.periodEnd < r.periodStart)
    return refusal(
      'INVALID_PERIOD',
      '`periodEnd` must not precede `periodStart`',
    );
  /* The issue date is the send date, so a typed due date is held to today:
     it can only move further behind. */
  if (r.dueDate && r.dueDate < today)
    return refusal(
      'VALIDATION_FAILED',
      "The due date can't be before the issue date.",
      { field: 'dueDate' },
    );
  return null;
}

/** A priced invoice that can't be generated: work it can't price, or no
 *  lines. A fee or an expense alone is a line, so a deposit before any work
 *  is an invoice. */
export function pricedInvoiceRefusal(
  totals: { unratedEntryIds: string[]; lineItems: unknown[] },
  period: { periodStart: string; periodEnd: string },
) {
  if (totals.unratedEntryIds.length > 0)
    return unratedRefusal(totals.unratedEntryIds);
  if (totals.lineItems.length === 0)
    return refusal(
      'INVALID_PERIOD',
      'Nothing to invoice: no unbilled, billable time in this period, no unbilled expenses, and no charges added',
      { periodStart: period.periodStart, periodEnd: period.periodEnd },
    );
  return null;
}

/** Work no rate prices: the invoice can't be priced, so it isn't
 *  generated, rendered or sent. */
export function unratedRefusal(ids: string[]) {
  return refusal(
    'NO_RATE_CONFIGURED',
    `${ids.length} billable entr${ids.length === 1 ? 'y has' : 'ies have'} no rate. Set a rate on the entry, project, client, or in settings.`,
    { unratedEntryIds: ids },
  );
}

/** A draft sent with no lines. */
export const nothingToSend = refusal(
  'VALIDATION_FAILED',
  'Nothing to send: no unbilled, billable time in this period, no unbilled expenses, and no charges added',
);

/** A `nextInvoiceNumber` above `max`, or at or below the highest number
 *  an invoice holds, drafts included: the counter would step into it. Names
 *  the field and the number it stays at so the form can show it again. */
export function nextNumberRefusal(
  next: number,
  current: number,
  max: number,
  highest: { sequenceNo: number; invoiceNumber: string } | null,
) {
  const refused = (message: string) =>
    refusal('VALIDATION_FAILED', message, {
      field: 'nextInvoiceNumber',
      current,
    });
  if (next > max) return refused(`The next number can't go above ${max}.`);
  if (highest && next <= highest.sequenceNo)
    return refused(
      `Must be higher than ${highest.invoiceNumber}, your latest invoice.`,
    );
  return null;
}

/* Decided by the database, named here. */

export const refusals = {
  /** `guard_issued_invoice`'s. */
  transition: (from: InvoiceStatus, to: InvoiceStatus) =>
    refusal(
      'VALIDATION_FAILED',
      `An invoice cannot move from ${from} to ${to}`,
      { from, to },
    ),
  entryLocked: (verb: 'modified' | 'deleted') =>
    refusal(
      'ENTRY_LOCKED',
      `This entry is billed on an issued invoice and cannot be ${verb}`,
    ),
  expenseLocked: (verb: 'modified' | 'deleted') =>
    refusal(
      'EXPENSE_LOCKED',
      `This expense is billed on an issued invoice and cannot be ${verb}`,
    ),
  timerRunning: (running: unknown) =>
    refusal(
      'TIMER_ALREADY_RUNNING',
      'A timer is already running. Stop it before starting another.',
      { running },
    ),
  noTimer: refusal('NO_TIMER_RUNNING', 'No timer is running'),
  markInvoiced: refusal(
    'ENTRY_ALREADY_INVOICED',
    'This entry is on an invoice, so it can’t be marked billed elsewhere',
  ),
  markRunning: refusal(
    'TIMER_ALREADY_RUNNING',
    'Stop this timer before marking it billed elsewhere',
  ),
  noSuchClient: refusal('VALIDATION_FAILED', 'No such client'),
  undatedOneOff: refusal(
    'VALIDATION_FAILED',
    'A one-off expense needs the date it was paid',
  ),
  billedRecurring: refusal(
    'VALIDATION_FAILED',
    'An expense on an invoice cannot become recurring',
  ),
  issuedDelete: refusal(
    'VALIDATION_FAILED',
    'An issued invoice cannot be deleted — void it instead, so the number stays on record',
  ),
};
