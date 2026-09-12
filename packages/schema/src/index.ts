/**
 * The API contract. Single source of truth.
 *
 * Web and Expo import these directly. The macOS Swift client can't; the plan
 * is to generate an OpenAPI spec from these schemas to keep hand-written
 * Swift models honest, but that generator is not written yet.
 */

import { z } from 'zod';

export const uuid = z.uuid();
export const iso = z.iso.datetime({ offset: true });
export const money = z.number().nonnegative().multipleOf(0.01);
export const currency = z.string().length(3);
export const hexColor = z.string().regex(/^#[0-9A-Fa-f]{6}$/);

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
export const UpdateClient = CreateClient.partial().omit({ id: true });

// ── project ────────────────────────────────────────────────────────
/**
 * No `color`. Colour identifies a CLIENT, and a project is a subdivision of
 * one that is already identified — its name does that work. Two surfaces had
 * already drifted apart on this (the calendar keyed blocks to the project
 * colour while the home-screen spec keyed the heatmap to the client's), which
 * is one visual channel carrying two meanings.
 *
 * Derived per-project variants were considered and rejected: project colours
 * are pinned to L 0.70 / C 0.11 so a chip can never out-bright the accent, and
 * varying hue within a client's own hue lands under the dichromacy
 * discrimination threshold documented in `docs/design/color.md`.
 *
 * The column still exists in the database — retiring one is two releases, and
 * this is the release that stops writing it.
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
});
export const UpdateProject = CreateProject.partial().omit({ id: true });

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
});

// ── timer ──────────────────────────────────────────────────────────
export const StartTimer = z.object({
  id: uuid.optional(),
  projectId: uuid.nullable().optional(),
  taskName: z.string().max(500).default(''),
  startedAt: iso.optional(), // allows backdating a forgotten start
});

export const StopTimer = z.object({
  endedAt: iso.optional(), // defaults to server now()
});

/** GET /timer/current */
export const CurrentTimer = z.object({
  entry: TimeEntry.nullable(),
  /** Server-computed against user_settings.max_timer_hours. */
  exceedsThreshold: z.boolean(),
  maxTimerHours: z.number().positive(),
  serverTime: iso, // lets clients correct for clock skew
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

// ── settings ───────────────────────────────────────────────────────
export const Settings = z.object({
  defaultHourlyRate: money.nullable(),
  currency,
  weekStartsOn: z.number().int().min(0).max(6),
  timeFormat: z.enum(['12h', '24h']),
  maxTimerHours: z.number().positive().max(24),
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
   * Monthly target for the Pace card. Both null means no target, and the card
   * hides rather than rendering an empty bar that asks to be configured.
   *
   * `revenue` means work DONE — invoiced plus unbilled at its resolved rate —
   * never money collected. A bar at 40% because a client has not paid yet is
   * noise about someone else's behaviour.
   *
   * The database enforces that these are both set or both null.
   */
  monthlyTarget: money.nullable(),
  monthlyTargetUnit: z.enum(['hours', 'revenue']).nullable(),
});
/** `nextInvoiceNumber` is not client-settable: gapless numbering depends on
 *  allocate_invoice_number() holding the row lock. */
export const UpdateSettings = Settings.partial().omit({
  nextInvoiceNumber: true,
});

// ── invoicing ──────────────────────────────────────────────────────
export const GroupingMode = z.enum(['entry', 'task', 'project', 'day']);

export const InvoicePreviewRequest = z.object({
  clientId: uuid,
  periodStart: z.iso.date(),
  periodEnd: z.iso.date(),
  groupingMode: GroupingMode.default('entry'),
  /** IANA zone; only affects `day` grouping. */
  tz: z.string().default('UTC'),
});

export const InvoiceLineItem = z.object({
  description: z.string(),
  quantitySeconds: z.number().int().nonnegative(),
  quantityHours: z.number().nonnegative(),
  resolvedRate: money,
  rateSource: z.enum(['entry', 'project', 'client', 'default', 'none']),
  amount: money,
});

export const InvoicePreview = z.object({
  clientId: uuid,
  /** Echoed back so the approval screen names the client it priced, rather
   *  than trusting the caller's own copy to still match. */
  clientName: z.string(),
  periodStart: z.iso.date(),
  periodEnd: z.iso.date(),
  groupingMode: GroupingMode,
  lineItems: z.array(InvoiceLineItem),
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
export const PaymentDetailsSnapshot = z.object({
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

/** A day of tracked time, grouped server-side so every client agrees on
 *  which local day an entry belongs to. */
export const CalendarDay = z.object({
  date: z.iso.date(),
  totalSeconds: z.number().int().nonnegative(),
  entries: z.array(TimeEntry),
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
   * Invoiced and not yet collected.
   *
   * NOT part of `unbilled` and never summed with it: unbilled is work not
   * yet invoiced, this is money already asked for, and adding them
   * double-counts the same hours.
   */
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
    /** Null rather than a zero row, so the UI renders nothing at all. */
    unprojected: z
      .object({
        count: z.number().int().positive(),
        seconds: z.number().int().nonnegative(),
      })
      .nullable(),
  }),
});

// ── payment profiles ───────────────────────────────────────────────
// Bank details render on the invoice PDF, never in an email body.
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

export const UpdatePaymentProfile = CreatePaymentProfile.partial()
  .omit({ id: true })
  .extend({ archived: z.boolean().optional() });

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

/** What `handle()` emits for an unhandled error. Separate from ErrorCode
 *  because it is never something a client can act on. */
export const INTERNAL_ERROR_CODE = 'INTERNAL' as const;

export const ApiError = z.object({
  code: ErrorCode,
  message: z.string(),
  details: z.unknown().optional(),
});

export type Client = z.infer<typeof Client>;
export type Project = z.infer<typeof Project>;
export type TimeEntry = z.infer<typeof TimeEntry>;
export type CurrentTimer = z.infer<typeof CurrentTimer>;
export type Summary = z.infer<typeof Summary>;
export type Settings = z.infer<typeof Settings>;
export type InvoicePreview = z.infer<typeof InvoicePreview>;
export type PaymentProfile = z.infer<typeof PaymentProfile>;
export type Stats = z.infer<typeof Stats>;
export type Pace = z.infer<typeof Pace>;
export type UnbilledClient = z.infer<typeof UnbilledClient>;
export type ClientWithScale = z.infer<typeof ClientWithScale>;
export type Invoice = z.infer<typeof Invoice>;
export type CalendarDay = z.infer<typeof CalendarDay>;
export type InvoiceLineItem = z.infer<typeof InvoiceLineItem>;
export type PaymentDetailsSnapshot = z.infer<typeof PaymentDetailsSnapshot>;
export type ApiError = z.infer<typeof ApiError>;
