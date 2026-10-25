import type { SupabaseClient } from '@supabase/supabase-js';
import { ApiError, dbCode, PG } from './errors';
import {
  CLIENT_COLUMNS,
  INVOICE_COLUMNS,
  LINE_ITEM_COLUMNS,
  PAYMENT_PROFILE_COLUMNS,
  toInvoice,
  toLineItem,
  toPaymentProfile,
  type ClientRow,
  type InvoiceRow,
  type LineItemRow,
  type PaymentProfileRow,
} from './rows';
import { selectAll } from './select-all';
import { entitlement } from './billing';
import {
  addDays,
  assignExpenses,
  attachedSchedules,
  buildLineItems,
  buildSchedules,
  documentOpens,
  draftSnapshot,
  localDateKey,
  newLines,
  paymentTermsText,
  pickSchedules,
  resolvePaymentProfile,
  snapshotChanged,
  startOfLocalDate,
  termsDays,
} from '@stint/core';
import type {
  BillableEntry,
  ExpenseInput,
  GroupingMode,
  LineItem,
  ManualLine,
  OpenDraft,
  ScheduleKind,
} from '@stint/core';

/** numeric columns arrive from PostgREST as strings. */
const num = (v: string | number | null | undefined): number | null =>
  v == null ? null : typeof v === 'number' ? v : Number(v);

export async function loadClient(
  db: SupabaseClient,
  clientId: string,
): Promise<ClientRow> {
  const { data, error } = await db
    .from('clients')
    .select(CLIENT_COLUMNS)
    .eq('id', clientId)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new ApiError('ENTRY_NOT_FOUND', 'Client not found');
  return data as ClientRow;
}

/**
 * Unbilled, completed entries for a client in a period, carrying every rate
 * level so the line-item builder can resolve without further queries.
 *
 * **The period is local dates, so the window is resolved in `tz`.** A user
 * picks "September" on a wall calendar, and `buildLineItems` groups the result
 * by local day — so a UTC window disagrees with its own grouping. West of
 * Greenwich that drops an evening of work at the end of the period and pulls
 * in the evening before it started, in both the preview and the invoice, with
 * nothing to show it happened.
 *
 * Deliberately excludes:
 *  - running entries (`ended_at IS NULL`) — you cannot bill time still accruing
 *  - entries already attached to an invoice
 */
export async function loadBillableEntries(
  db: SupabaseClient,
  opts: {
    clientId: string;
    periodStart: string;
    periodEnd: string;
    tz: string;
    userDefaultRate: number | null;
    clientRate: number | null;
  },
): Promise<BillableEntry[]> {
  const { data: projects, error: projectError } = await db
    .from('projects')
    .select('id, name, hourly_rate')
    .eq('client_id', opts.clientId);

  if (projectError) throw projectError;
  if (!projects || projects.length === 0) return [];

  const byId = new Map(projects.map((p) => [p.id as string, p]));

  /* periodEnd is an inclusive date, so the window ends where the NEXT local
     day begins. Stepping the date on the calendar rather than adding 24h:
     a day containing a DST transition is 23 or 25 hours long. */
  const startInstant = startOfLocalDate(opts.periodStart, opts.tz);
  const endExclusive = startOfLocalDate(addDays(opts.periodEnd, 1), opts.tz);

  const rows = await selectAll(() =>
    db
      .from('time_entries')
      .select(
        'id, task_name, project_id, started_at, duration_seconds, is_billable, rate_override',
      )
      .in('project_id', [...byId.keys()])
      .is('invoice_id', null)
      .eq('invoiced_elsewhere', false)
      .not('ended_at', 'is', null)
      .gte('started_at', startInstant.toISOString())
      .lt('started_at', endExclusive.toISOString())
      .order('started_at', { ascending: true }),
  );

  return rows.map((row) => {
    const project = byId.get(row.project_id as string);
    return {
      id: row.id as string,
      taskName: (row.task_name as string) ?? '',
      projectId: (row.project_id as string) ?? null,
      projectName: (project?.name as string) ?? null,
      startedAt: row.started_at as string,
      durationSeconds: (row.duration_seconds as number) ?? 0,
      isBillable: row.is_billable as boolean,
      rateOverride: num(row.rate_override),
      projectRate: num(project?.hourly_rate),
      clientRate: opts.clientRate,
      userDefaultRate: opts.userDefaultRate,
    };
  });
}

/**
 * What a draft bills of the client's expenses: every recurring one, and the
 * unbilled one-offs `assignExpenses` gives it among the client's open
 * drafts, less the ones the user left off. An earlier month's one-off is
 * included, so one missed invoice does not strand a reimbursement.
 *
 * A recurring expense has no date of its own, so its line takes the period's
 * last day: the date the invoice claims to cover. `recurring` tells the
 * caller not to claim it, since it bills again on the next invoice.
 */
export async function loadBillableExpenses(
  db: SupabaseClient,
  opts: { clientId: string; draft: OpenDraft; openDrafts: OpenDraft[] },
): Promise<Array<ExpenseInput & { recurring: boolean }>> {
  const { data, error } = await db
    .from('expenses')
    .select('id, recurring, spent_on, description, amount, created_at')
    .eq('client_id', opts.clientId)
    .is('invoice_id', null)
    .order('spent_on', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw error;

  const rows = data ?? [];
  const assigned = assignExpenses(
    rows
      .filter((r) => !r.recurring)
      .map((r) => ({ id: r.id as string, spentOn: r.spent_on as string })),
    [...opts.openDrafts.filter((d) => d.id !== opts.draft.id), opts.draft],
  );
  const { periodEnd, excludedExpenseIds } = opts.draft;
  return rows
    .filter((r) =>
      r.recurring
        ? !excludedExpenseIds.includes(r.id as string)
        : assigned.get(r.id as string) === opts.draft.id,
    )
    .map((r) => ({
      id: r.id as string,
      recurring: r.recurring as boolean,
      spentOn: (r.spent_on as string | null) ?? periodEnd,
      description: r.description as string,
      amount: num(r.amount) ?? 0,
    }));
}

export interface InvoiceSettings {
  defaultHourlyRate: number | null;
  currency: string;
  paymentTermsDays: number;
  invoiceNumberPrefix: string;
  paymentNotice: string | null;
  businessName: string | null;
  businessEmail: string | null;
}

/**
 * The invoice's sender is its business name and email. New invoice asks for
 * both before Generate; this is the rule, so no other client can issue an
 * invoice without them.
 */
export function requireSender(s: InvoiceSettings) {
  if (!s.businessName?.trim() || !s.businessEmail?.trim()) {
    throw new ApiError(
      'VALIDATION_FAILED',
      'Add your business name and email before generating an invoice.',
    );
  }
}

export async function loadSettings(
  db: SupabaseClient,
): Promise<InvoiceSettings> {
  const { data, error } = await db
    .from('user_settings')
    .select(
      'default_hourly_rate, currency, payment_terms_days, invoice_number_prefix, payment_notice, business_name, business_email',
    )
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new ApiError('ENTRY_NOT_FOUND', 'Settings not found');

  return {
    defaultHourlyRate: num(data.default_hourly_rate),
    currency: (data.currency as string) ?? 'USD',
    paymentTermsDays: data.payment_terms_days as number,
    invoiceNumberPrefix: (data.invoice_number_prefix as string) ?? 'INV-',
    paymentNotice: data.payment_notice ?? null,
    businessName: data.business_name ?? null,
    businessEmail: data.business_email ?? null,
  };
}

/**
 * The payment profile that applies to a client: their explicit choice, else
 * the user's default. Returns null when no profile is configured at all —
 * an invoice without payment details is valid, just less useful.
 */
export async function loadPaymentProfile(
  db: SupabaseClient,
  clientProfileId: string | null,
  /** Picked on the form. It must exist and be live, never quietly swapped
      for another. */
  chosenId?: string,
) {
  const { data, error } = await db
    .from('payment_profiles')
    .select(PAYMENT_PROFILE_COLUMNS)
    .is('archived_at', null);

  if (error) throw error;
  const profiles = (data ?? []).map((r) =>
    toPaymentProfile(r as PaymentProfileRow),
  );
  if (chosenId) {
    const chosen = profiles.find((p) => p.id === chosenId);
    if (!chosen)
      throw new ApiError(
        'VALIDATION_FAILED',
        'Those payment details are archived or gone. Choose others.',
      );
    return chosen;
  }
  if (profiles.length === 0) return null;

  const defaultProfile = profiles.find((p) => p.isDefault);
  return resolvePaymentProfile(profiles, {
    clientProfileId,
    defaultProfileId: defaultProfile?.id ?? null,
  });
}

/**
 * Assembles everything the detail and the PDF show. An issued invoice's
 * lines are FROZEN: re-downloading it a year later must produce the same
 * document even if rates have since changed. A draft's are derived from its
 * period's work as it is now.
 */
export async function loadPdfData(
  db: SupabaseClient,
  invoiceId: string,
  requestTz?: string,
) {
  const { data: stored, error } = await db
    .from('invoices')
    .select(INVOICE_COLUMNS)
    .eq('id', invoiceId)
    .maybeSingle();

  if (error) throw error;
  if (!stored) throw new ApiError('ENTRY_NOT_FOUND', 'Invoice not found');
  const row = stored as InvoiceRow;

  const [settings, billing, draft] = await Promise.all([
    loadSettings(db),
    entitlement(db),
    deriveDraft(db, row, requestTz),
  ]);
  const canDownload = documentOpens(
    billing.available,
    billing.plan,
    row.issued_subscription_status,
  );
  const invoice = toInvoice(draft?.row ?? row);
  const lineItems = draft
    ? draft.lines.map(
        ({ description, unit, quantity, unitPrice, amount, spentOn }) => ({
          description,
          unit,
          quantity,
          unitPrice,
          amount,
          spentOn: spentOn ?? null,
        }),
      )
    : (
        await selectAll(() =>
          db
            .from('invoice_line_items')
            .select(LINE_ITEM_COLUMNS)
            .eq('invoice_id', invoiceId)
            .order('sort_order', { ascending: true }),
        )
      ).map((r) => {
        const { id: _, sortOrder: __, ...line } = toLineItem(r as LineItemRow);
        return line;
      });

  return {
    invoice,
    canDownload,
    draft,
    pdfData: {
      invoiceNumber: invoice.invoiceNumber,
      status: invoice.status,
      issueDate: invoice.issueDate,
      dueDate: invoice.dueDate,
      periodStart: invoice.periodStart,
      periodEnd: invoice.periodEnd,
      currency: invoice.currency,
      subtotal: invoice.subtotal ?? 0,
      taxRate: invoice.taxRate ?? 0,
      taxAmount: invoice.taxAmount ?? 0,
      expensesSubtotal: invoice.expensesSubtotal ?? 0,
      total: invoice.total ?? 0,
      notes: invoice.notes,
      paymentTerms: invoice.paymentTerms,
      reference: invoice.reference,
      // The FROZEN snapshots, never a live lookup: a re-downloaded invoice
      // must show the details the client was actually given.
      business: invoice.business,
      client: invoice.billTo,
      lineItems,
      payment: invoice.paymentDetails ?? null,
      paymentNotice: settings.paymentNotice,
      supportingDetail: invoice.supportingDetail,
    },
  };
}

/** What an unrated entry costs: the invoice can't be priced, so it isn't
 *  generated, rendered or sent. */
export function unratedError(ids: string[]) {
  return new ApiError(
    'NO_RATE_CONFIGURED',
    `${ids.length} billable entr${ids.length === 1 ? 'y has' : 'ies have'} no rate. Set a rate on the entry, project, client, or in settings.`,
    { unratedEntryIds: ids },
  );
}

/**
 * Refuses a draft whose typed due date its issue date, the day it is sent,
 * has passed: printed, it would read `Net -N`. The user picks the fix.
 */
export function refuseDueBeforeIssue(issueDate: string, dueDate: string) {
  if (dueDate < issueDate)
    throw new ApiError(
      'VALIDATION_FAILED',
      `The due date typed for this draft, ${dueDate}, is before its issue date, ${issueDate}. Delete the draft and generate it again with a later one.`,
      { field: 'dueDate' },
    );
}

/** The id a draft not yet generated takes among the open drafts. */
const NEW_DRAFT = 'new';

/**
 * What an invoice for a client and period bills now, priced from
 * database-resolved rates and the stored expenses, never a preview the
 * client cached: the preview, generation, every read of a draft and its
 * send all compute it here.
 */
export async function computeInvoice(
  db: SupabaseClient,
  opts: {
    clientId: string;
    periodStart: string;
    periodEnd: string;
    tz: string;
    groupingMode: GroupingMode;
    summaryText?: string;
    manualLines: ManualLine[];
    excludedExpenseIds: string[];
    schedules: ScheduleKind[];
    /** The draft computed; absent for one not yet generated. */
    draftId?: string;
  },
) {
  const [client, settings, open] = await Promise.all([
    loadClient(db, opts.clientId),
    loadSettings(db),
    db
      .from('invoices')
      .select('id, period_end, excluded_expense_ids')
      .eq('client_id', opts.clientId)
      .eq('status', 'draft'),
  ]);
  if (open.error) throw open.error;
  const [entries, expenses] = await Promise.all([
    loadBillableEntries(db, {
      clientId: opts.clientId,
      periodStart: opts.periodStart,
      periodEnd: opts.periodEnd,
      tz: opts.tz,
      userDefaultRate: settings.defaultHourlyRate,
      clientRate:
        client.hourly_rate == null ? null : Number(client.hourly_rate),
    }),
    loadBillableExpenses(db, {
      clientId: opts.clientId,
      draft: {
        id: opts.draftId ?? NEW_DRAFT,
        periodEnd: opts.periodEnd,
        excludedExpenseIds: opts.excludedExpenseIds,
      },
      openDrafts: (open.data ?? []).map((d) => ({
        id: d.id as string,
        periodEnd: d.period_end as string,
        excludedExpenseIds: d.excluded_expense_ids as string[],
      })),
    }),
  ]);

  const totals = buildLineItems(entries, {
    groupingMode: opts.groupingMode,
    summaryText: opts.summaryText,
    taxRate: client.tax_rate == null ? 0 : Number(client.tax_rate),
    tz: opts.tz,
    manualLines: opts.manualLines,
    expenses,
  });

  return {
    client,
    settings,
    entries,
    totals,
    // Bucketed now, so a project renamed or an invoice voided later cannot
    // change what the client was sent.
    supportingDetail: pickSchedules(
      buildSchedules(entries, {
        tz: opts.tz,
        periodStart: opts.periodStart,
        periodEnd: opts.periodEnd,
      }),
      opts.schedules,
    ),
    lines: totals.lineItems.map((li) => ({
      description: li.description,
      unit: li.unit,
      quantity: li.quantity,
      unit_price: li.unitPrice,
      amount: li.amount,
      spent_on: li.spentOn ?? null,
    })),
    entryIds: totals.lineItems.flatMap((li) => li.entryIds),
    // One-offs only: a recurring expense is billed on every invoice and
    // stays unclaimed, to bill again on the next.
    expenseIds: expenses.filter((e) => !e.recurring).map((e) => e.id),
  };
}

/**
 * A draft as its client and period stand now, keeping every choice the user
 * made on New invoice; null for an invoice that isn't a draft. Writes
 * nothing. A draft is dated as if sent today: sending dates it.
 *
 * A draft with no zone of its own is read in the request's, else UTC.
 */
export async function deriveDraft(
  db: SupabaseClient,
  row: InvoiceRow,
  requestTz: string | undefined,
  issueDate?: string,
) {
  if (row.status !== 'draft') return null;
  const tz = row.tz ?? requestTz ?? 'UTC';

  const charges = await selectAll(() =>
    db
      .from('invoice_line_items')
      .select(LINE_ITEM_COLUMNS)
      .eq('invoice_id', row.id)
      .eq('unit', 'fixed')
      .order('sort_order', { ascending: true }),
  );
  const computed = await computeInvoice(db, {
    clientId: row.client_id,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    tz,
    groupingMode: row.grouping_mode,
    summaryText: row.summary_text ?? undefined,
    manualLines: charges.map((r) => {
      const l = toLineItem(r as LineItemRow);
      return { description: l.description, amount: l.amount ?? 0 };
    }),
    excludedExpenseIds: row.excluded_expense_ids,
    schedules: attachedSchedules(row.supporting_detail),
    draftId: row.id,
  });
  const { totals } = computed;
  const issued = issueDate ?? localDateKey(new Date(), tz);
  const due =
    row.due_date ??
    addDays(
      issued,
      termsDays(row.payment_terms) ?? computed.settings.paymentTermsDays,
    );
  const unrated = new Set(totals.unratedEntryIds);

  return {
    tz,
    computed,
    lines: totals.lineItems,
    row: {
      ...row,
      subtotal: totals.subtotal,
      tax_rate: totals.taxRate,
      tax_amount: totals.taxAmount,
      expenses_subtotal: totals.expensesSubtotal,
      total: totals.total,
      supporting_detail: computed.supportingDetail,
      issue_date: issued,
      due_date: due,
      payment_terms: paymentTermsText(issued, due),
    } satisfies InvoiceRow,
    unratedEntries: computed.entries
      .filter((e) => unrated.has(e.id))
      .map((e) => ({ id: e.id, taskName: e.taskName, startedAt: e.startedAt })),
    /** For each line, whether its last PDF lacked it. */
    isNew: newLines(row.downloaded_snapshot, totals.lineItems),
    /** How it moved since its last PDF; null when it hasn't, or never had
     *  one. */
    change: snapshotChanged(
      row.downloaded_snapshot,
      draftSnapshot(totals.lineItems, totals.total),
    ),
  };
}

/**
 * Records what a draft's PDF showed, so Mark sent can tell when the client
 * was given a copy the draft has since moved past, and dates the invoice as
 * that copy does. A draft sent meanwhile keeps the snapshot it was sent with.
 */
export async function recordDownload(
  db: SupabaseClient,
  invoiceId: string,
  lines: LineItem[],
  printed: { total: number; issueDate: string; dueDate: string | null },
) {
  const { error } = await db
    .from('invoices')
    .update({
      downloaded_snapshot: {
        ...draftSnapshot(lines, printed.total),
        issueDate: printed.issueDate,
        dueDate: printed.dueDate,
      },
    })
    .eq('id', invoiceId)
    .eq('status', 'draft');
  if (error) throw error;
}

/**
 * Mark sent: the draft as it stands at `sentAt`, written, claimed, dated and
 * sent by `send_draft` in one transaction. It is dated as the PDF the client
 * was given, else on the send date. Refused when there is nothing to
 * send, no zone to read its dates in, an entry it can't price, or a change
 * since the PDF the client was given.
 */
export async function sendDraft(
  db: SupabaseClient,
  row: InvoiceRow,
  requestTz: string | undefined,
  sentAt: string,
): Promise<InvoiceRow> {
  const tz = row.tz ?? requestTz;
  if (!tz)
    throw new ApiError(
      'VALIDATION_FAILED',
      'Sending a draft needs the time zone its dates are read in (`tz`).',
    );
  const printed = row.downloaded_snapshot;
  const draft = (await deriveDraft(
    db,
    row,
    tz,
    printed?.issueDate ?? localDateKey(new Date(sentAt), tz),
  ))!;
  const { totals } = draft.computed;

  // Unpriced work first: a draft of nothing but it isn't empty.
  if (totals.unratedEntryIds.length > 0)
    throw unratedError(totals.unratedEntryIds);
  if (draft.lines.length === 0)
    throw new ApiError(
      'VALIDATION_FAILED',
      'Nothing to send: no unbilled, billable time in this period, no unbilled expenses, and no charges added',
    );
  if (draft.change)
    throw new ApiError(
      'DRAFT_CHANGED',
      'This draft changed since you downloaded it. Download the new PDF, send that one, then mark it sent.',
      draft.change,
    );

  const due = printed?.dueDate ?? draft.row.due_date!;
  refuseDueBeforeIssue(draft.row.issue_date, due);
  const { data, error } = await db.rpc('send_draft', {
    p_invoice_id: row.id,
    p_invoice: {
      subtotal: totals.subtotal,
      tax_rate: totals.taxRate,
      tax_amount: totals.taxAmount,
      expenses_subtotal: totals.expensesSubtotal,
      total: totals.total,
      supporting_detail: draft.computed.supportingDetail,
      issue_date: draft.row.issue_date,
      due_date: due,
      payment_terms: paymentTermsText(draft.row.issue_date, due),
      tz,
      lines: draft.computed.lines,
    },
    p_entry_ids: draft.computed.entryIds,
    p_expense_ids: draft.computed.expenseIds,
    p_sent_at: sentAt,
  });
  if (!error) return (Array.isArray(data) ? data[0] : data) as InvoiceRow;

  const code = dbCode(error);
  // Sent, voided or deleted by another request since this one read it.
  if (code === 'INVOICE_STATUS_CHANGED' || error.code === PG.NO_DATA_FOUND)
    throw new ApiError(
      'INVOICE_STATUS_CHANGED',
      'The invoice changed status since it was read',
      { from: row.status },
    );
  if (code === 'EXPENSE_ALREADY_INVOICED' || code === 'ENTRY_ALREADY_INVOICED')
    throw new ApiError(
      'ENTRY_ALREADY_INVOICED',
      'Work in this period was billed on another invoice at the same moment. Open the draft again.',
    );
  throw error;
}
