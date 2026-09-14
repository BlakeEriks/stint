import type { SupabaseClient } from '@supabase/supabase-js';
import { ApiError } from './errors';
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
import { resolvePaymentProfile, startOfLocalDate } from '@stint/core';
import type { BillableEntry } from '@stint/core';

/** numeric columns arrive from PostgREST as strings. */
const num = (v: string | number | null | undefined): number | null =>
  v == null ? null : typeof v === 'number' ? v : Number(v);

/** The day after `date`, stepped on the calendar rather than in milliseconds. */
function nextDate(date: string): string {
  const [y = 0, m = 1, d = 1] = date.split('-').map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(next.getUTCDate()).padStart(2, '0')}`;
}

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
  const endExclusive = startOfLocalDate(nextDate(opts.periodEnd), opts.tz);

  const { data, error } = await db
    .from('time_entries')
    .select(
      'id, task_name, project_id, started_at, duration_seconds, is_billable, rate_override',
    )
    .in('project_id', [...byId.keys()])
    .is('invoice_id', null)
    .not('ended_at', 'is', null)
    .gte('started_at', startInstant.toISOString())
    .lt('started_at', endExclusive.toISOString())
    .order('started_at', { ascending: true });

  if (error) throw error;

  return (data ?? []).map((row) => {
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

export interface InvoiceSettings {
  defaultHourlyRate: number | null;
  currency: string;
  defaultPaymentTerms: string;
  invoiceNumberPrefix: string;
  businessName: string | null;
  businessAddress: string | null;
  businessEmail: string | null;
  logoUrl: string | null;
  taxId: string | null;
  paymentNotice: string | null;
}

export async function loadSettings(
  db: SupabaseClient,
): Promise<InvoiceSettings> {
  const { data, error } = await db
    .from('user_settings')
    .select(
      'default_hourly_rate, currency, default_payment_terms, invoice_number_prefix, business_name, business_address, business_email, logo_url, tax_id, payment_notice',
    )
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new ApiError('ENTRY_NOT_FOUND', 'Settings not found');

  return {
    defaultHourlyRate: num(data.default_hourly_rate),
    currency: (data.currency as string) ?? 'USD',
    defaultPaymentTerms: (data.default_payment_terms as string) ?? 'Net 30',
    invoiceNumberPrefix: (data.invoice_number_prefix as string) ?? 'INV-',
    businessName: data.business_name ?? null,
    businessAddress: data.business_address ?? null,
    businessEmail: data.business_email ?? null,
    logoUrl: data.logo_url ?? null,
    taxId: data.tax_id ?? null,
    paymentNotice: data.payment_notice ?? null,
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
) {
  const { data, error } = await db
    .from('payment_profiles')
    .select(PAYMENT_PROFILE_COLUMNS)
    .is('archived_at', null);

  if (error) throw error;
  const profiles = (data ?? []).map((r) =>
    toPaymentProfile(r as PaymentProfileRow),
  );
  if (profiles.length === 0) return null;

  const defaultProfile = profiles.find((p) => p.isDefault);
  return resolvePaymentProfile(profiles, {
    clientProfileId,
    defaultProfileId: defaultProfile?.id ?? null,
  });
}

/**
 * Assembles everything the PDF needs from an invoice's FROZEN line items.
 *
 * Never recomputed from time entries: re-downloading an invoice a year later
 * must produce the same document even if rates have since changed.
 */
export async function loadPdfData(db: SupabaseClient, invoiceId: string) {
  const { data: row, error } = await db
    .from('invoices')
    .select(INVOICE_COLUMNS)
    .eq('id', invoiceId)
    .maybeSingle();

  if (error) throw error;
  if (!row) throw new ApiError('ENTRY_NOT_FOUND', 'Invoice not found');

  const invoice = toInvoice(row as InvoiceRow);

  const [items, client, settings] = await Promise.all([
    db
      .from('invoice_line_items')
      .select(LINE_ITEM_COLUMNS)
      .eq('invoice_id', invoiceId)
      .order('sort_order', { ascending: true }),
    loadClient(db, invoice.clientId),
    loadSettings(db),
  ]);

  if (items.error) throw items.error;

  return {
    invoice,
    client,
    settings,
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
      total: invoice.total ?? 0,
      notes: invoice.notes,
      paymentTerms: invoice.paymentTerms,
      business: {
        name: settings.businessName,
        address: settings.businessAddress,
        email: settings.businessEmail,
        logoUrl: settings.logoUrl,
        taxId: settings.taxId,
      },
      client: {
        name: client.name,
        email: client.email,
        address: client.address,
      },
      lineItems: (items.data ?? []).map((r) => toLineItem(r as LineItemRow)),
      // The FROZEN snapshot, never a live profile lookup: a re-downloaded
      // invoice must show the details the client was actually given.
      payment: invoice.paymentDetails ?? null,
      paymentNotice: settings.paymentNotice,
    },
  };
}

/** Which status transitions are allowed, and why the others are not. */
const TRANSITIONS: Record<string, string[]> = {
  draft: ['sent', 'void'],
  sent: ['paid', 'void'],
  paid: ['void'],
  void: [],
};

export function assertTransition(from: string, to: string): void {
  if (from === to) return;
  if (!TRANSITIONS[from]?.includes(to)) {
    throw new ApiError(
      'VALIDATION_FAILED',
      `An invoice cannot move from ${from} to ${to}`,
      { from, to, allowed: TRANSITIONS[from] ?? [] },
    );
  }
}
