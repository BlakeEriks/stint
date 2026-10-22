import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ApiError,
  isEntryClaimConflict,
  isExpenseClaimConflict,
} from './errors';
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
  attachedSchedules,
  buildLineItems,
  buildSchedules,
  documentOpens,
  draftSnapshot,
  newLines,
  pickSchedules,
  resolvePaymentProfile,
  snapshotChanged,
  startOfLocalDate,
} from '@stint/core';
import type { BillableEntry, ExpenseInput, LineItem } from '@stint/core';

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
    /** A draft being refreshed: what it already holds is billable to it. */
    heldBy?: string;
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

  const select = (held: string | null) =>
    selectAll(() => {
      const q = db
        .from('time_entries')
        .select(
          'id, task_name, project_id, started_at, duration_seconds, is_billable, rate_override',
        )
        .in('project_id', [...byId.keys()]);
      return (held ? q.eq('invoice_id', held) : q.is('invoice_id', null))
        .eq('invoiced_elsewhere', false)
        .not('ended_at', 'is', null)
        .gte('started_at', startInstant.toISOString())
        .lt('started_at', endExclusive.toISOString())
        .order('started_at', { ascending: true });
    });
  const rows = opts.heldBy
    ? [...(await select(null)), ...(await select(opts.heldBy))].sort((a, b) =>
        (a.started_at as string).localeCompare(b.started_at as string),
      )
    : await select(null);

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
 * What this invoice can bill of the client's expenses: every recurring one,
 * and every unbilled one-off dated on or before the period's end — an earlier
 * month's included, so one missed invoice does not strand a reimbursement —
 * less the ones the user left off.
 *
 * A recurring expense has no date of its own, so its line takes the period's
 * last day: the date the invoice claims to cover. `recurring` tells the
 * caller not to attach it, since it bills again on the next invoice.
 */
export async function loadBillableExpenses(
  db: SupabaseClient,
  opts: {
    clientId: string;
    periodEnd: string;
    excludedIds: string[];
    /** A draft being refreshed: what it already holds is billable to it. */
    heldBy?: string;
  },
): Promise<Array<ExpenseInput & { recurring: boolean }>> {
  const select = (held: string | null) => {
    const q = db
      .from('expenses')
      .select('id, recurring, spent_on, description, amount, created_at')
      .eq('client_id', opts.clientId);
    return held ? q.eq('invoice_id', held) : q.is('invoice_id', null);
  };
  const results = await Promise.all(
    opts.heldBy ? [select(null), select(opts.heldBy)] : [select(null)],
  );
  for (const r of results) if (r.error) throw r.error;
  const data = results
    .flatMap((r) => r.data ?? [])
    .sort(
      (a, b) =>
        String(a.spent_on).localeCompare(String(b.spent_on)) ||
        String(a.created_at).localeCompare(String(b.created_at)),
    );

  const excluded = new Set(opts.excludedIds);
  return data
    .filter(
      (row) =>
        (row.recurring || (row.spent_on as string) <= opts.periodEnd) &&
        !excluded.has(row.id as string),
    )
    .map((row) => ({
      id: row.id as string,
      recurring: row.recurring as boolean,
      spentOn: (row.spent_on as string | null) ?? opts.periodEnd,
      description: row.description as string,
      amount: num(row.amount) ?? 0,
    }));
}

export interface InvoiceSettings {
  defaultHourlyRate: number | null;
  currency: string;
  defaultPaymentTerms: string;
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
      'default_hourly_rate, currency, default_payment_terms, invoice_number_prefix, payment_notice, business_name, business_email',
    )
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new ApiError('ENTRY_NOT_FOUND', 'Settings not found');

  return {
    defaultHourlyRate: num(data.default_hourly_rate),
    currency: (data.currency as string) ?? 'USD',
    defaultPaymentTerms: (data.default_payment_terms as string) ?? 'Net 30',
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
 * Assembles everything the PDF needs from an invoice's stored line items.
 *
 * An issued invoice's are FROZEN: re-downloading it a year later must
 * produce the same document even if rates have since changed. A draft's are
 * refreshed first, since it collects its period's work until it is sent.
 */
export async function loadPdfData(
  db: SupabaseClient,
  invoiceId: string,
  /** `rendering` records what a draft's PDF showed, once it may open. */
  opts: { tz?: string; rendering?: boolean } = {},
) {
  const { data: stored, error } = await db
    .from('invoices')
    .select(INVOICE_COLUMNS)
    .eq('id', invoiceId)
    .maybeSingle();

  if (error) throw error;
  if (!stored) throw new ApiError('ENTRY_NOT_FOUND', 'Invoice not found');

  const [settings, billing] = await Promise.all([
    loadSettings(db),
    entitlement(db),
  ]);
  const canDownload = documentOpens(
    billing.available,
    billing.plan,
    (stored as InvoiceRow).issued_subscription_status,
  );
  // A draft is drawn as its period's work is now.
  const { row, lines } = await refreshDraft(db, stored as InvoiceRow, opts.tz, {
    rendering: opts.rendering && canDownload,
  });
  const invoice = toInvoice(row);
  const items = await selectAll(() =>
    db
      .from('invoice_line_items')
      .select(LINE_ITEM_COLUMNS)
      .eq('invoice_id', invoiceId)
      .order('sort_order', { ascending: true }),
  );

  return {
    invoice,
    canDownload,
    draft: draftChange(row, lines),
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
      lineItems: items.map((r) => toLineItem(r as LineItemRow)),
      payment: invoice.paymentDetails ?? null,
      paymentNotice: settings.paymentNotice,
      supportingDetail: invoice.supportingDetail,
    },
  };
}

/**
 * Rebuilds a draft from its client and period as they are now, keeping every
 * choice the user made on New invoice, and writes it through `refresh_draft`
 * in one transaction. A draft keeps collecting its period's work until it is
 * sent, so every read of one goes through here; `sentAt` sends it in the
 * same call, so what freezes is exactly what was computed.
 *
 * A draft made before drafts refreshed has no zone until a read supplies
 * one, and isn't refreshed without it. One with an unrated entry is left as
 * last refreshed, and refused only when it is being sent.
 */
export async function refreshDraft(
  db: SupabaseClient,
  row: InvoiceRow,
  requestTz: string | undefined,
  opts: { sentAt?: string; rendering?: boolean } = {},
): Promise<{ row: InvoiceRow; lines: LineItem[] | null }> {
  const tz = row.tz ?? requestTz;
  if (row.status !== 'draft' || !tz) return { row, lines: null };

  const [client, settings, stored] = await Promise.all([
    loadClient(db, row.client_id),
    loadSettings(db),
    selectAll(() =>
      db
        .from('invoice_line_items')
        .select(LINE_ITEM_COLUMNS)
        .eq('invoice_id', row.id)
        .eq('unit', 'fixed')
        .order('sort_order', { ascending: true }),
    ),
  ]);
  const clientRate =
    client.hourly_rate == null ? null : Number(client.hourly_rate);

  const [entries, expenses] = await Promise.all([
    loadBillableEntries(db, {
      clientId: row.client_id,
      periodStart: row.period_start,
      periodEnd: row.period_end,
      tz,
      userDefaultRate: settings.defaultHourlyRate,
      clientRate,
      heldBy: row.id,
    }),
    loadBillableExpenses(db, {
      clientId: row.client_id,
      periodEnd: row.period_end,
      excludedIds: row.excluded_expense_ids,
      heldBy: row.id,
    }),
  ]);

  const totals = buildLineItems(entries, {
    groupingMode: row.grouping_mode,
    summaryText: row.summary_text ?? undefined,
    taxRate: client.tax_rate == null ? 0 : Number(client.tax_rate),
    tz,
    manualLines: stored.map((r) => {
      const l = toLineItem(r as LineItemRow);
      return { description: l.description, amount: l.amount ?? 0 };
    }),
    expenses,
  });

  if (totals.unratedEntryIds.length > 0) {
    if (!opts.sentAt) return { row, lines: null };
    throw new ApiError(
      'NO_RATE_CONFIGURED',
      'Some billable entries in this period have no rate. Set one before marking it sent.',
      { unratedEntryIds: totals.unratedEntryIds },
    );
  }

  const now = draftSnapshot(totals.lineItems, totals.total);
  const change = snapshotChanged(row.downloaded_snapshot, now);
  if (opts.sentAt && change)
    throw new ApiError(
      'DRAFT_CHANGED',
      'This draft changed since you downloaded it. Download the new PDF, send that one, then mark it sent.',
      change,
    );

  const { data, error } = await db.rpc('refresh_draft', {
    p_invoice_id: row.id,
    p_invoice: {
      subtotal: totals.subtotal,
      tax_rate: totals.taxRate,
      tax_amount: totals.taxAmount,
      expenses_subtotal: totals.expensesSubtotal,
      total: totals.total,
      supporting_detail: pickSchedules(
        buildSchedules(entries, {
          tz,
          periodStart: row.period_start,
          periodEnd: row.period_end,
        }),
        attachedSchedules(row.supporting_detail),
      ),
      tz,
      ...(opts.rendering ? { downloaded_snapshot: now } : {}),
      lines: totals.lineItems.map((li) => ({
        description: li.description,
        unit: li.unit,
        quantity: li.quantity,
        unit_price: li.unitPrice,
        amount: li.amount,
        spent_on: li.spentOn ?? null,
      })),
    },
    p_entry_ids: totals.lineItems.flatMap((li) => li.entryIds),
    p_expense_ids: expenses.filter((e) => !e.recurring).map((e) => e.id),
    p_sent_at: opts.sentAt ?? null,
  });
  if (error) {
    if (isExpenseClaimConflict(error) || isEntryClaimConflict(error))
      throw new ApiError(
        'ENTRY_ALREADY_INVOICED',
        'Work in this period was billed on another invoice at the same moment. Open the draft again.',
      );
    throw error;
  }
  return {
    row: (Array.isArray(data) ? data[0] : data) as InvoiceRow,
    lines: totals.lineItems,
  };
}

/** Which of a draft's lines its last render lacked, and how it moved since;
 *  nothing for an invoice that isn't a draft. */
export function draftChange(row: InvoiceRow, lines: LineItem[] | null) {
  if (row.status !== 'draft' || !lines) return { isNew: null, change: null };
  return {
    isNew: newLines(row.downloaded_snapshot, lines),
    change: snapshotChanged(
      row.downloaded_snapshot,
      draftSnapshot(lines, Number(row.total)),
    ),
  };
}
