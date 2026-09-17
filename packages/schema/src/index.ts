/**
 * The API contract. Single source of truth.
 *
 * Web and Expo import these directly. The macOS Swift client can't; the plan
 * is to generate an OpenAPI spec from these schemas to keep hand-written
 * Swift models honest, but that generator is not written yet.
 */

import { isValidTimeZone } from '@stint/core';
import { z } from 'zod';

export const uuid = z.uuid();
export const iso = z.iso.datetime({ offset: true });
export const money = z.number().nonnegative().multipleOf(0.01);
export const currency = z.string().length(3);
const hexColor = z.string().regex(/^#[0-9A-Fa-f]{6}$/);

/**
 * An IANA zone. "Today" and "September" are local-calendar questions the
 * server cannot infer, so the client states the zone.
 *
 * `catch` rather than a hard failure on the read endpoints: a view that
 * renders in UTC beats a view that does not render. The write endpoints use
 * `timeZoneStrict`, because a zone that silently becomes UTC decides which
 * entries land on an invoice.
 */
export const timeZone = z.string().refine(isValidTimeZone).catch('UTC');
export const timeZoneStrict = z
  .string()
  .refine(isValidTimeZone, { message: 'not an IANA time zone' })
  .default('UTC');

/** Query parameters arrive as strings; a flag is spelled out either way. */
const boolParam = z
  .enum(['true', 'false'])
  .default('false')
  .transform((v) => v === 'true');

// ── client ─────────────────────────────────────────────────────────
export const Client = z.object({
  id: uuid,
  name: z.string().trim().min(1).max(200),
  email: z.email().nullable().optional(),
  address: z.string().max(1000).nullable().optional(),
  hourlyRate: money.nullable().optional(),
  taxRate: z.number().min(0).max(100).nullable().optional(),
  currency: currency.nullable().optional(),
  color: hexColor.nullable().optional(),
  /** Overrides the user's default payment profile on this client's invoices;
   *  a dangling reference falls back rather than rendering nothing. */
  paymentProfileId: uuid.nullable().optional(),
  archivedAt: iso.nullable().optional(),
});
export const CreateClient = Client.omit({ id: true, archivedAt: true }).extend({
  id: uuid.optional(), // client-generated UUIDv7 for idempotent retries
});

/**
 * A client plus how much work sits under it — `?withScale=true` only.
 *
 * Separate from `Client` because these are derived, response-only figures: on
 * `Client` they would flow into `CreateClient` and imply they are writable.
 */
export const ClientWithScale = Client.extend({
  projectCount: z.number().int().nonnegative(),
  /** Unbilled work at resolved rates. `0` is a real answer, not a missing
   *  one — the list must not render it as "unknown". */
  unbilledAmount: money,
});
export const UpdateClient = CreateClient.partial()
  .omit({ id: true })
  .extend({ archived: z.boolean().optional() });

export const ListClientsQuery = z.object({
  includeArchived: boolParam,
  /** Project count and unbilled total per client. Opt-in: the plain list is
   *  one cheap query and most callers (pickers, dialogs) want only that. */
  withScale: boolParam,
});

// ── project ────────────────────────────────────────────────────────
/**
 * No `color` — colour identifies a client. The database column still exists:
 * retiring one is two releases, and this is the release that stops writing
 * it.
 */
export const Project = z.object({
  id: uuid,
  clientId: uuid.nullable(), // null = internal / unbilled work
  name: z.string().trim().min(1).max(200),
  hourlyRate: money.nullable().optional(),
  isBillableDefault: z.boolean().default(true),
  archivedAt: iso.nullable().optional(),
});
export const CreateProject = Project.omit({
  id: true,
  archivedAt: true,
}).extend({
  id: uuid.optional(),
  clientId: uuid.nullable().optional(), // omitted == internal work
});
export const UpdateProject = CreateProject.partial()
  .omit({ id: true })
  .extend({ archived: z.boolean().optional() });

export const ListProjectsQuery = z.object({
  clientId: uuid.optional(),
  includeArchived: boolParam,
});

// ── time entry ─────────────────────────────────────────────────────
export const TimeEntry = z.object({
  id: uuid,
  projectId: uuid.nullable(),
  taskName: z.string().max(500).default(''),
  startedAt: iso,
  endedAt: iso.nullable(), // null == running
  isBillable: z.boolean().default(true),
  rateOverride: money.nullable().optional(),
  invoiceId: uuid.nullable().optional(),
  durationSeconds: z.number().int().nonnegative().nullable(),
  /**
   * The user's answer to "is this length correct?". A trigger clears it
   * whenever the times change, so the answer cannot outlive the length it was
   * given about.
   */
  durationOk: z.boolean().default(false),
});

/** Manual entry creation. The id is client-supplied so replay is safe. */
export const CreateTimeEntry = z
  .object({
    id: uuid,
    projectId: uuid.nullable().optional(),
    taskName: z.string().max(500).default(''),
    startedAt: iso,
    endedAt: iso, // manual entries are always complete
    isBillable: z.boolean().optional(),
    rateOverride: money.nullable().optional(),
  })
  .refine((e) => new Date(e.endedAt) > new Date(e.startedAt), {
    message: 'endedAt must be after startedAt',
    path: ['endedAt'],
  });

export const UpdateTimeEntry = z.object({
  projectId: uuid.nullable().optional(),
  taskName: z.string().max(500).optional(),
  startedAt: iso.optional(),
  endedAt: iso.nullable().optional(),
  isBillable: z.boolean().optional(),
  rateOverride: money.nullable().optional(),
  /** How the inbox's "It's correct" answers the strange-duration row. */
  durationOk: z.boolean().optional(),
});

export const ListEntriesQuery = z.object({
  from: iso.optional(),
  to: iso.optional(),
  /* A uuid, or the literal `none` for entries with no project at all.
     Those cannot resolve a rate beyond the user default, so they are the
     ones the inbox surfaces — and `projectId=` (empty) cannot express it,
     since an absent param already means "no filter". */
  projectId: z.union([uuid, z.literal('none')]).optional(),
  clientId: uuid.optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});

export const TaskNamesQuery = z.object({
  /* A preference, not a filter: names used with this project rank first and
     every other name still follows. Omitting it ranks by recency alone, which
     is also what the picker's "No project" state wants. */
  projectId: uuid.optional(),
  limit: z.coerce.number().int().min(1).max(20).default(8),
});

/** One row of `recent_task_names`; ranked by the server and never re-sorted. */
export const TaskNameSuggestion = z.object({
  taskName: z.string(),
  projectId: z.uuid().nullable(),
  lastUsedAt: z.iso.datetime(),
});

// ── timer ──────────────────────────────────────────────────────────
export const StartTimer = z.object({
  id: uuid.optional(),
  projectId: uuid.nullable().optional(),
  taskName: z.string().max(500).default(''),
  startedAt: iso.optional(), // allows backdating a forgotten start
  /**
   * Omitted, the column's `true` default applies. Sent, it carries a source
   * entry's own answer — resuming non-billable work must not silently
   * produce a billable entry.
   */
  isBillable: z.boolean().optional(),
});

export const StopTimer = z.object({
  endedAt: iso.optional(), // defaults to server now()
});

/** Retitle or reassign a running timer. */
export const UpdateRunningTimer = z.object({
  taskName: z.string().max(500).optional(),
  projectId: uuid.nullable().optional(),
});

// ── summary (the menu bar endpoint) ────────────────────────────────
export const Summary = z.object({
  running: TimeEntry.nullable(),
  todaySeconds: z.number().int().nonnegative(),
  weekSeconds: z.number().int().nonnegative(),
  exceedsThreshold: z.boolean(),
  maxTimerHours: z.number().positive(),
  serverTime: iso,
});

export const SummaryQuery = z.object({ tz: timeZone });
export const StatsQuery = z.object({ tz: timeZone });

export const CalendarQuery = z.object({
  from: iso,
  to: iso,
  tz: timeZone,
  /**
   * `day` returns totals only — `{ date, totalSeconds, byClient }` and no
   * entries. The activity strip draws one rectangle per day, and twelve weeks
   * of full entries is a heavy payload to build one.
   */
  granularity: z.enum(['entry', 'day']).default('entry'),
});

// ── settings ───────────────────────────────────────────────────────
export const Settings = z.object({
  defaultHourlyRate: money.nullable(),
  currency,
  weekStartsOn: z.number().int().min(0).max(6),
  timeFormat: z.enum(['12h', '24h']),
  maxTimerHours: z.number().positive().max(24),

  /**
   * Thresholds for the inbox's strange-duration row. Null switches off that
   * side; null on both retires the row, which is the default.
   *
   * Seconds on the short side, not minutes: an entry under a minute was
   * started and stopped without work between it.
   */
  minEntrySeconds: z.number().int().positive().nullable(),
  maxEntryHours: z.number().positive().max(24).nullable(),
  businessName: z.string().max(200).nullable(),
  businessAddress: z.string().max(1000).nullable(),
  businessEmail: z.email().nullable(),
  logoUrl: z.url().nullable(),
  taxId: z.string().max(100).nullable(),
  defaultPaymentTerms: z.string().max(200),
  invoiceNumberPrefix: z.string().max(20),
  nextInvoiceNumber: z.number().int().positive(),
  /** Standing anti-fraud line printed under the invoice payment block. */
  paymentNotice: z.string().max(500).nullable(),

  /**
   * Monthly target for the Pace card. Both null means no target and the card
   * hides; the database enforces that they are both set or both null.
   */
  /** Positive, matching the database check — `0` is not a target, and
   *  sending it would 500 rather than fail validation. */
  monthlyTarget: money.positive().nullable(),
  monthlyTargetUnit: z.enum(['hours', 'revenue']).nullable(),
});
/**
 * `nextInvoiceNumber` is not client-settable: gapless numbering depends on
 * allocate_invoice_number() holding the row lock.
 *
 * A target without a unit cannot be rendered, and a unit without a target
 * means nothing. The database enforces this too — the check constraint is
 * authoritative — but catching it here returns a 422 naming the problem
 * instead of a 500 carrying a constraint name. Only when both appear in the
 * same patch: setting one while the other already holds a value is
 * legitimate, and the database still guards the result.
 */
export const UpdateSettings = Settings.partial()
  .omit({ nextInvoiceNumber: true })
  .refine(
    (p) =>
      !('monthlyTarget' in p && 'monthlyTargetUnit' in p) ||
      (p.monthlyTarget === null) === (p.monthlyTargetUnit === null),
    {
      message:
        'monthlyTarget and monthlyTargetUnit must be set or cleared together',
      path: ['monthlyTarget'],
    },
  );

// ── invoicing ──────────────────────────────────────────────────────
export const GroupingMode = z.enum(['entry', 'task', 'project', 'day']);

export const InvoicePreviewRequest = z.object({
  clientId: uuid,
  periodStart: z.iso.date(),
  periodEnd: z.iso.date(),
  groupingMode: GroupingMode.default('entry'),
  /**
   * The period is local dates, so the window is resolved in this zone — and
   * it decides which entries land on the invoice. Rejected rather than
   * silently coerced to UTC, which would move the boundary by hours.
   */
  tz: timeZoneStrict,
});

/** What every line item states, however it was produced. */
export const InvoiceLineItem = z.object({
  description: z.string(),
  quantitySeconds: z.number().int().nonnegative(),
  quantityHours: z.number().nonnegative(),
  resolvedRate: money,
  amount: money,
});

/**
 * A line item as `buildLineItems` computes it — what `/invoices/preview` and
 * `POST /invoices` return.
 *
 * `rateSource` and `entryIds` are deliberately not persisted: the rate is
 * what the client is owed, and how it was derived is a fact about
 * configuration at generation time that would be a second thing to keep true
 * forever. So neither can appear on a line read back from the database.
 */
export const ComputedLineItem = InvoiceLineItem.extend({
  /** Which level of the hierarchy supplied the rate. */
  rateSource: z.enum(['entry', 'project', 'client', 'default', 'none']),
  /** The entries this line merged. Internal ids; see `docs/tasks.md`. */
  entryIds: z.array(uuid),
});

/**
 * A line item frozen onto an issued invoice and read back — what
 * `GET /invoices/:id` returns. `sortOrder` is the stored order that keeps a
 * re-downloaded PDF identical to the one first issued.
 */
export const StoredLineItem = InvoiceLineItem.extend({
  id: uuid,
  sortOrder: z.number().int().nonnegative(),
});

export const InvoicePreview = z.object({
  clientId: uuid,
  /** Echoed back so the approval screen names the client it priced, rather
   *  than trusting the caller's own copy to still match. */
  clientName: z.string(),
  periodStart: z.iso.date(),
  periodEnd: z.iso.date(),
  groupingMode: GroupingMode,
  lineItems: z.array(ComputedLineItem),
  subtotal: money,
  taxRate: z.number().min(0).max(100),
  taxAmount: money,
  total: money,
  currency,
  entryCount: z.number().int().nonnegative(),
  /** Entries with no resolvable rate — blocks generation until fixed. */
  unratedEntryIds: z.array(uuid),
});

export const CreateInvoice = InvoicePreviewRequest.extend({
  issueDate: z.iso.date().optional(),
  dueDate: z.iso.date().optional(),
  notes: z.string().max(2000).optional(),
  paymentTerms: z.string().max(200).optional(),
});

/** The frozen snapshot stored on an invoice. */
const PaymentDetailsSnapshot = z.object({
  title: z.string().nullable(),
  fields: z.array(z.object({ label: z.string(), value: z.string() })),
  intermediary: z.array(z.object({ label: z.string(), value: z.string() })),
  link: z.object({ label: z.string(), url: z.string() }).nullable(),
  notes: z.string().nullable(),
});

export const InvoiceStatus = z.enum(['draft', 'sent', 'paid', 'void']);

/**
 * An issued invoice, as the API returns it.
 *
 * Line items are NOT part of this shape: they are frozen at generation and
 * fetched with the detail view, and re-deriving them from time entries is the
 * thing that must never happen — re-downloading a year later has to produce
 * the same document.
 */
export const Invoice = z.object({
  id: uuid,
  clientId: uuid,
  invoiceNumber: z.string(),
  sequenceNo: z.number().int().positive(),
  status: InvoiceStatus,
  issueDate: z.iso.date(),
  dueDate: z.iso.date().nullable(),
  periodStart: z.iso.date(),
  periodEnd: z.iso.date(),
  subtotal: money,
  taxRate: z.number().min(0).max(100),
  taxAmount: money,
  total: money,
  currency,
  notes: z.string().nullable(),
  paymentTerms: z.string().nullable(),
  groupingMode: GroupingMode,
  /** The payment block as rendered at generation. Editing a profile later
   *  never alters an issued invoice, so this is a snapshot, not a reference. */
  paymentDetails: PaymentDetailsSnapshot.nullable(),
  sentAt: iso.nullable(),
  paidAt: iso.nullable(),
  createdAt: iso,
});

export const ListInvoicesQuery = z.object({
  clientId: uuid.optional(),
  status: InvoiceStatus.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

/** What both granularities share: a local day and its total. Grouped
 *  server-side so every client agrees which day an entry belongs to. */
const CalendarDayBase = z.object({
  date: z.iso.date(),
  totalSeconds: z.number().int().nonnegative(),
});

/** `granularity=entry` — the day with the entries that make it up. */
export const CalendarDay = CalendarDayBase.extend({
  entries: z.array(TimeEntry),
});

/**
 * `granularity=day` — totals only, for the activity strip.
 *
 * `byClient` keys by client id, with `''` for internal work: a day spent
 * unbilled is not an empty day. Running entries contribute nothing.
 */
export const CalendarTotalsDay = CalendarDayBase.extend({
  byClient: z.record(z.string(), z.number().int().nonnegative()),
});

export const UpdateInvoiceStatus = z.object({
  status: InvoiceStatus,
  /** Record that the invoice went out earlier than now. */
  sentAt: iso.optional(),
  /** Record a payment that arrived earlier than now. */
  paidAt: iso.optional(),
});

// ── home screen stats ──────────────────────────────────────────────
// One response for the whole card set: the cards render together, and a set
// that pops in piecemeal reads as broken.

export const UnbilledClient = z.object({
  /** Null for internal work — a project with no client. */
  clientId: uuid.nullable(),
  clientName: z.string(),
  currency,
  seconds: z.number().int().nonnegative(),
  amount: money,
  /** Entries with no resolvable rate: the total is incomplete, not low. */
  unratedCount: z.number().int().nonnegative(),
  /** Age of the oldest unbilled entry. A total is a fact; this is a prompt. */
  oldestDays: z.number().int().nonnegative(),
});

export const PacePoint = z.object({
  /** A business day, `YYYY-MM-DD` in the caller's zone. */
  date: z.string(),
  /** Cumulative to this day, in the target's unit. Null beyond today. */
  actual: z.number().nullable(),
  /** The goal ray. It steps on business days ONLY — a ray sloping through
   *  the weekend shows the user behind every Saturday and recovered every
   *  Monday, which is the noise the business-day rule exists to kill. */
  expected: z.number(),
});

export const Pace = z.object({
  unit: z.enum(['hours', 'revenue']),
  target: money,
  /** Null when the unit cannot be computed from time entries alone. */
  actual: z.number().nullable(),
  expected: z.number().nullable(),
  /** Positive is ahead. Spelled out rather than left to a bar to imply. */
  delta: z.number().nullable(),
  businessDaysElapsed: z.number().int().nonnegative(),
  businessDaysTotal: z.number().int().nonnegative(),
  /** One point per business day of the month, for the cumulative line. */
  series: z.array(PacePoint),
});

export const VelocityClient = z.object({
  /** Null for internal work — a project with no client. */
  clientId: uuid.nullable(),
  clientName: z.string(),
  currency,
  seconds: z.number().int().nonnegative(),
  invoiced: money,
  unbilled: money,
  /** Entries with no resolvable rate: the total is incomplete, not low. */
  unratedCount: z.number().int().nonnegative(),
});

export const Stats = z.object({
  currency,
  unbilled: z.object({
    /** Work done and not yet invoiced. Never "earned" and never "revenue". */
    total: money,
    seconds: z.number().int().nonnegative(),
    byClient: z.array(UnbilledClient),
    moreClients: z.number().int().nonnegative(),
  }),
  /**
   * Trailing-window gross, split by where the work stands now.
   *
   * Work DONE over the window, not money collected. `invoiced + unbilled`
   * is `total`; the split moves as invoices are raised while the total does
   * not. NOT comparable with `awaitingPayment`, which spans every period.
   */
  velocity: z.object({
    months: z.number().int().positive(),
    total: money,
    /** `total / months`, rounded to cents here so the figure the screen
     *  leads with reconciles with the split printed beneath it. */
    perMonth: money,
    invoiced: money,
    unbilled: money,
    seconds: z.number().int().nonnegative(),
    byClient: z.array(VelocityClient),
    moreClients: z.number().int().nonnegative(),
  }),
  /** Invoiced and not yet collected. Never summed with `unbilled` — that
   *  would double-count the same hours. */
  awaitingPayment: money,
  /** Null when no monthly target is set; the card hides rather than nagging. */
  pace: Pace.nullable(),
  /** Null when nothing was tracked this month — 0/0 is not 0%. */
  billableRatio: z.number().min(0).max(1).nullable(),
  attention: z.object({
    overdueInvoices: z.array(
      z.object({
        invoiceId: uuid,
        invoiceNumber: z.string(),
        clientId: uuid,
        clientName: z.string().nullable(),
        amount: money,
        currency,
        daysLate: z.number().int(),
      }),
    ),
    staleDrafts: z.array(
      z.object({
        invoiceId: uuid,
        invoiceNumber: z.string(),
        clientId: uuid,
        clientName: z.string().nullable(),
        amount: money,
        currency,
        ageDays: z.number().int(),
      }),
    ),
    /** One row per entry, oldest first. Empty array, never null. */
    unprojected: z.array(
      z.object({
        entryId: uuid,
        taskName: z.string(),
        startedAt: z.iso.datetime(),
        seconds: z.number().int().nonnegative(),
      }),
    ),
    /**
     * Entries whose length is implausible — under `minEntrySeconds` or over
     * `maxEntryHours`, and not yet answered with `durationOk`.
     */
    strangeDurations: z.array(
      z.object({
        entryId: uuid,
        kind: z.enum(['short', 'long']),
        taskName: z.string(),
        projectName: z.string().nullable(),
        clientName: z.string().nullable(),
        startedAt: z.iso.datetime(),
        seconds: z.number().int().nonnegative(),
      }),
    ),
  }),
});

// ── payment profiles ───────────────────────────────────────────────
// US-first: account + ACH routing is the default path, everything else
// is additive and renders only when populated.
export const PaymentProfile = z.object({
  id: uuid,
  name: z.string().trim().min(1).max(100),
  isDefault: z.boolean(),

  accountHolderName: z.string().max(200).nullable().optional(),
  accountHolderAddress: z.string().max(1000).nullable().optional(),
  bankName: z.string().max(200).nullable().optional(),
  bankAddress: z.string().max(1000).nullable().optional(),
  accountNumber: z.string().max(64).nullable().optional(),
  routingNumber: z.string().max(64).nullable().optional(),
  accountType: z.enum(['checking', 'savings']).nullable().optional(),

  iban: z.string().max(64).nullable().optional(),
  swiftBic: z.string().max(16).nullable().optional(),
  localCodeLabel: z.string().max(64).nullable().optional(),
  localCode: z.string().max(64).nullable().optional(),

  intermediaryBankName: z.string().max(200).nullable().optional(),
  intermediarySwiftBic: z.string().max(16).nullable().optional(),
  intermediaryAccountNumber: z.string().max(64).nullable().optional(),

  paymentLinkLabel: z.string().max(64).nullable().optional(),
  paymentLinkUrl: z.url().nullable().optional(),

  currency: currency.nullable().optional(),
  feeAllocation: z.enum(['OUR', 'SHA', 'BEN']).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
  archivedAt: iso.nullable().optional(),
});

export const CreatePaymentProfile = PaymentProfile.omit({
  id: true,
  isDefault: true,
  archivedAt: true,
}).extend({
  id: uuid.optional(),
  isDefault: z.boolean().default(false),
});

/* `isDefault` is re-declared rather than inherited: `.partial()` keeps the
   create schema's `.default(false)`, so a PATCH of any other field would parse
   as a demotion and silently strip the user's default. */
export const UpdatePaymentProfile = CreatePaymentProfile.partial()
  .omit({ id: true })
  .extend({
    isDefault: z.boolean().optional(),
    archived: z.boolean().optional(),
  });

export const ListPaymentProfilesQuery = z.object({
  includeArchived: boolParam,
});

// ── errors ─────────────────────────────────────────────────────────
export const ErrorCode = z.enum([
  'TIMER_ALREADY_RUNNING',
  'NO_TIMER_RUNNING',
  'ENTRY_LOCKED',
  'ENTRY_NOT_FOUND',
  'NO_RATE_CONFIGURED',
  'INVALID_PERIOD',
  'UNAUTHORIZED',
  'VALIDATION_FAILED',
]);

export const ApiError = z.object({
  code: ErrorCode,
  message: z.string(),
  details: z.unknown().optional(),
});

export type Client = z.infer<typeof Client>;
export type Project = z.infer<typeof Project>;
export type TimeEntry = z.infer<typeof TimeEntry>;
export type Summary = z.infer<typeof Summary>;
export type TaskNameSuggestion = z.infer<typeof TaskNameSuggestion>;
export type Settings = z.infer<typeof Settings>;
export type InvoicePreview = z.infer<typeof InvoicePreview>;
export type PaymentProfile = z.infer<typeof PaymentProfile>;
export type Stats = z.infer<typeof Stats>;
export type Pace = z.infer<typeof Pace>;
export type UnbilledClient = z.infer<typeof UnbilledClient>;
export type ClientWithScale = z.infer<typeof ClientWithScale>;
export type Invoice = z.infer<typeof Invoice>;
export type CalendarDay = z.infer<typeof CalendarDay>;
export type CalendarTotalsDay = z.infer<typeof CalendarTotalsDay>;
export type InvoiceLineItem = z.infer<typeof InvoiceLineItem>;
export type ComputedLineItem = z.infer<typeof ComputedLineItem>;
export type StoredLineItem = z.infer<typeof StoredLineItem>;
export type ApiError = z.infer<typeof ApiError>;
