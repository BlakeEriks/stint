import { z } from 'zod';
import {
  currency,
  ianaZone,
  iso,
  money,
  timeZoneStrict,
  uuid,
} from './primitives.ts';

/** How an invoice looks; what it says is the same in each. */
export const InvoiceTemplate = z.enum([
  'standard',
  'modern',
  'classic',
  'creative',
]);
export type InvoiceTemplate = z.infer<typeof InvoiceTemplate>;

export const GroupingMode = z.enum([
  'summary',
  'entry',
  'task',
  'project',
  'day',
]);

export const InvoicePreviewRequest = z.object({
  clientId: uuid,
  periodStart: z.iso.date(),
  periodEnd: z.iso.date(),
  groupingMode: GroupingMode.default('entry'),
  /** The one line's text with `summary`; the other modes ignore it. Empty
   *  previews the line blank, and generation refuses it. */
  summaryText: z.string().trim().max(200).default(''),
  /**
   * The period is local dates, so the window is resolved in this zone — and
   * it decides which entries land on the invoice. Rejected rather than
   * silently coerced to UTC, which would move the boundary by hours.
   */
  tz: timeZoneStrict,
  /**
   * Flat charges the user typed: a fixed fee, a deposit, a retainer. They are
   * priced by the user rather than resolved from a rate, so they ride on the
   * request instead of being read back from time entries. A cost the client
   * reimburses is an expense, which is stored and read back instead.
   */
  manualLines: z
    .array(
      z.object({
        description: z.string().trim().min(1).max(200),
        amount: money,
      }),
    )
    .max(50)
    .default([]),
  /**
   * Unbilled expenses to leave off this invoice. The server loads every
   * eligible expense and drops these, rather than trusting a list of what to
   * include sent back from a preview. They keep waiting for a later invoice.
   */
  excludedExpenseIds: z.array(uuid).max(200).default([]),
  /** The draft being edited, which is priced as itself among the client's
   *  open drafts, so it keeps the expenses it shows. */
  draftId: uuid.optional(),
});

/** A table of supporting detail: hours by project, by week or by date. */
export const ScheduleKind = z.enum(['project', 'week', 'date']);

const hours = z.number().nonnegative();

/**
 * Supporting detail, in hours only. Every table on a preview; on an invoice,
 * only the ticked ones, frozen when sent.
 */
export const Schedules = z.object({
  project: z.array(z.object({ project: z.string(), hours })).optional(),
  week: z
    .array(z.object({ start: z.iso.date(), end: z.iso.date(), hours }))
    .optional(),
  date: z
    .array(z.object({ date: z.iso.date(), project: z.string(), hours }))
    .optional(),
  totalHours: hours,
});

/** What a line's quantity means: billed hours, a flat charge, or a
 *  reimbursed expense, which sits in its own section below the services. */
export const LineUnit = z.enum(['hour', 'fixed', 'expense']);

export const InvoiceLineItem = z.object({
  description: z.string(),
  unit: LineUnit,
  quantity: z.number().nonnegative(),
  unitPrice: money,
  amount: money,
  /** The day an expense was paid. Set on expense lines and only there. */
  spentOn: z.iso.date().nullable().optional(),
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
  /** Which level of the hierarchy supplied the rate; `manual` if typed. */
  rateSource: z.enum([
    'entry',
    'project',
    'client',
    'default',
    'none',
    'manual',
  ]),
  /** The entries this line merged. */
  entryIds: z.array(uuid),
  /** The expense an expense line bills. */
  expenseId: uuid.optional(),
});

const Change = z.object({ from: z.number(), to: z.number() });

/** How a draft moved since its PDF was last rendered: what Mark sent's
 *  `DRAFT_CHANGED` carries, and the detail's `changedSinceDownload`. */
export const DraftChange = z.object({
  hours: Change,
  total: Change,
  /** What else it printed that was edited since, by name. */
  edited: z.array(z.string()),
});

/** A billable entry on a draft that no rate prices: the draft shows without
 *  it, and its PDF and Mark sent are refused until it has one. */
export const UnratedEntry = z.object({
  id: uuid,
  taskName: z.string(),
  startedAt: iso,
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
  /** Services: time and charges. The base tax is charged on. */
  subtotal: money,
  taxRate: z.number().min(0).max(100),
  taxAmount: money,
  /** Reimbursed expenses, never taxed. */
  expensesSubtotal: money,
  total: money,
  currency,
  entryCount: z.number().int().nonnegative(),
  /** Entries with no resolvable rate — blocks generation until fixed. */
  unratedEntryIds: z.array(uuid),
  /** Entries to bill that share a minute or more with each other or with
   *  billed time. A warning, not a block: the user decides. */
  overlappingEntryIds: z.array(uuid),
  /** With `summary`, every table the invoice could attach; otherwise null. */
  schedules: Schedules.nullable(),
});

/** One charge on a request: what `manualLines` carries. */
export type ManualLine = z.infer<
  typeof InvoicePreviewRequest
>['manualLines'][number];

/** What editing a draft opens with that the draft as read doesn't say. */
export const DraftChoices = z.object({
  /** The due date typed; null follows the terms. */
  dueDate: z.iso.date().nullable(),
  excludedExpenseIds: z.array(uuid),
  /** Its charges. */
  manualLines: z.array(z.object({ description: z.string(), amount: money })),
});

/** One flag each for a draft's PDF and its Mark sent. */
export const DraftActions = z.object({
  download: z.boolean(),
  send: z.boolean(),
});

/** What Generate sends, and what an edit of a draft sends again: the same
 *  choices, with the draft's own client. */
export const CreateInvoice = InvoicePreviewRequest.omit({
  draftId: true,
})
  .extend({
    /** Typed by the user. Absent, it follows the terms from the day the draft
     *  is sent, which is also its issue date. */
    dueDate: z.iso.date().optional(),
    notes: z.string().max(2000).optional(),
    /** The PO, contract or SOW the client matches the invoice to. */
    reference: z
      .string()
      .trim()
      .max(200)
      .optional()
      .transform((r) => r || undefined),
    /** The payment details to freeze; absent is the client's, else the
     *  default. */
    paymentProfileId: uuid.optional(),
    /** The supporting detail to attach, with `summary` only. */
    schedules: z
      .array(ScheduleKind)
      .refine((k) => new Set(k).size === k.length, 'Each schedule once')
      .default([]),
  })
  .refine((b) => b.groupingMode !== 'summary' || b.summaryText !== '', {
    message: 'A summary line needs its text',
    path: ['summaryText'],
  })
  .refine((b) => b.groupingMode === 'summary' || b.schedules.length === 0, {
    message: 'Supporting detail comes with a summary line only',
    path: ['schedules'],
  });

/** The frozen snapshot stored on an invoice. */
const PaymentDetailsSnapshot = z.object({
  fields: z.array(z.object({ label: z.string(), value: z.string() })),
  intermediary: z.array(z.object({ label: z.string(), value: z.string() })),
  link: z.object({ label: z.string(), url: z.string() }).nullable(),
  notes: z.string().nullable(),
});

export const InvoiceStatus = z.enum(['draft', 'sent', 'paid', 'void']);

/**
 * An issued invoice, as the API returns it.
 *
 * Line items are NOT part of this shape: they are fetched with the detail
 * view. A draft's, its totals and its dates are derived from its period's
 * work on every read, as if sent today; once sent they are frozen, and
 * re-deriving them is the thing that must never happen — re-downloading a
 * year later has to produce the same document.
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
  expensesSubtotal: money,
  total: money,
  currency,
  notes: z.string().nullable(),
  paymentTerms: z.string().nullable(),
  groupingMode: GroupingMode,
  /** The summary line's text; set exactly when `groupingMode` is `summary`. */
  summaryText: z.string().nullable(),
  /** The PO, contract or SOW, printed under the service period. */
  reference: z.string().nullable(),
  /** Frozen when sent; null while a draft, which follows the setting. */
  template: InvoiceTemplate.nullable(),
  /** The ticked schedules, frozen when sent like the lines. */
  supportingDetail: Schedules.nullable(),
  /** The payment block as rendered at generation. Editing a profile later
   *  never alters an issued invoice, so this is a snapshot, not a reference. */
  paymentDetails: PaymentDetailsSnapshot.nullable(),
  /** The From block as generated: editing settings later never reprints it. */
  business: z.object({
    name: z.string().nullable(),
    address: z.string().nullable(),
    email: z.string().nullable(),
    logoUrl: z.string().nullable(),
  }),
  /** The Bill to block as generated: editing the client never reprints it. */
  billTo: z.object({
    name: z.string(),
    email: z.string().nullable(),
    address: z.string().nullable(),
  }),
  sentAt: iso.nullable(),
  paidAt: iso.nullable(),
  createdAt: iso,
});

/** A draft is derived on every read, in the zone its period's dates are
 *  read in; a draft with no zone of its own takes the read's, else UTC. */
export const InvoiceReadQuery = z.object({ tz: ianaZone.optional() });

export const ListInvoicesQuery = InvoiceReadQuery.extend({
  clientId: uuid.optional(),
  status: InvoiceStatus.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const UpdateInvoiceStatus = z.object({
  status: InvoiceStatus,
  /** Record that the invoice went out earlier than now. */
  sentAt: iso.optional(),
  /** Record a payment that arrived earlier than now. */
  paidAt: iso.optional(),
});

export type InvoicePreview = z.infer<typeof InvoicePreview>;
export type Invoice = z.infer<typeof Invoice>;
export type InvoiceLineItem = z.infer<typeof InvoiceLineItem>;
export type ComputedLineItem = z.infer<typeof ComputedLineItem>;
export type DraftChange = z.infer<typeof DraftChange>;
export type DraftChoices = z.infer<typeof DraftChoices>;
export type UnratedEntry = z.infer<typeof UnratedEntry>;
