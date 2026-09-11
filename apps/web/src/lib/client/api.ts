'use client';

/**
 * Browser-side API access.
 *
 * The web app authenticates by cookie, so requests carry no bearer token —
 * `requireSession` handles both paths. Errors become `ApiError` so callers
 * can branch on a code (a 409 from the timer is a normal flow, not a crash).
 */

export interface ApiErrorBody {
  code: string;
  message: string;
  details?: unknown;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, body: ApiErrorBody) {
    super(body.message);
    this.name = 'ApiError';
    this.status = status;
    this.code = body.code;
    this.details = body.details;
  }

  /** A timer is already running; `details.running` carries it. */
  get isTimerConflict() {
    return this.code === 'TIMER_ALREADY_RUNNING';
  }

  get isUnauthorized() {
    return this.code === 'UNAUTHORIZED';
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api/v1${path}`, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  const json = text ? JSON.parse(text) : undefined;

  if (!res.ok) {
    throw new ApiError(res.status, json ?? { code: 'UNKNOWN', message: res.statusText });
  }
  return json as T;
}

// ── shapes the UI consumes ─────────────────────────────────────────
export interface TimeEntry {
  id: string;
  projectId: string | null;
  taskName: string;
  startedAt: string;
  endedAt: string | null;
  isBillable: boolean;
  rateOverride: number | null;
  invoiceId: string | null;
  durationSeconds: number | null;
}

export interface Summary {
  running: TimeEntry | null;
  todaySeconds: number;
  weekSeconds: number;
  exceedsThreshold: boolean;
  maxTimerHours: number;
  serverTime: string;
}

export interface Project {
  id: string;
  clientId: string | null;
  name: string;
  hourlyRate: number | null;
  color: string | null;
  isBillableDefault: boolean;
  archivedAt: string | null;
}

/** Everything a project is created or edited with. */
export type ProjectInput = Partial<Omit<Project, 'id' | 'archivedAt'>> &
  Pick<Project, 'name'>;

export interface Client {
  id: string;
  name: string;
  email: string | null;
  address: string | null;
  hourlyRate: number | null;
  taxRate: number | null;
  currency: string | null;
  color: string | null;
  paymentProfileId: string | null;
  archivedAt: string | null;
}

/** Everything a client is created or edited with. `id` is server-defaulted. */
export type ClientInput = Partial<Omit<Client, 'id' | 'archivedAt'>> &
  Pick<Client, 'name'>;

export type GroupingMode = 'entry' | 'task' | 'project' | 'day';
export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'void';

export interface InvoiceLineItem {
  description: string;
  quantitySeconds: number;
  quantityHours: number;
  resolvedRate: number;
  rateSource: 'entry' | 'project' | 'client' | 'default' | 'none';
  amount: number;
}

export interface InvoicePreview {
  clientId: string;
  clientName: string;
  periodStart: string;
  periodEnd: string;
  groupingMode: GroupingMode;
  currency: string;
  lineItems: InvoiceLineItem[];
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  entryCount: number;
  /** Entries with no resolvable rate. Generation is blocked until fixed. */
  unratedEntryIds: string[];
}

export interface Invoice {
  id: string;
  clientId: string;
  invoiceNumber: string;
  sequenceNo: number;
  status: InvoiceStatus;
  issueDate: string;
  dueDate: string | null;
  periodStart: string;
  periodEnd: string;
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  currency: string;
  notes: string | null;
  paymentTerms: string | null;
  groupingMode: GroupingMode;
  paymentDetails: unknown;
  sentAt: string | null;
  paidAt: string | null;
  createdAt: string;
}

export interface CalendarDay {
  date: string;
  totalSeconds: number;
  entries: TimeEntry[];
}

export interface Settings {
  defaultHourlyRate: number | null;
  currency: string;
  weekStartsOn: number;
  timeFormat: '12h' | '24h';
  maxTimerHours: number;
  businessName: string | null;
  businessAddress: string | null;
  businessEmail: string | null;
  logoUrl: string | null;
  taxId: string | null;
  defaultPaymentTerms: string;
  invoiceNumberPrefix: string;
  /** Server-owned: gapless numbering depends on the row lock. Not settable. */
  nextInvoiceNumber: number;
  paymentNotice: string | null;
}

export type SettingsInput = Partial<Omit<Settings, 'nextInvoiceNumber'>>;

export interface PaymentProfile {
  id: string;
  name: string;
  isDefault: boolean;
  accountHolderName: string | null;
  accountHolderAddress: string | null;
  bankName: string | null;
  bankAddress: string | null;
  accountNumber: string | null;
  routingNumber: string | null;
  accountType: 'checking' | 'savings' | null;
  iban: string | null;
  swiftBic: string | null;
  localCodeLabel: string | null;
  localCode: string | null;
  intermediaryBankName: string | null;
  intermediarySwiftBic: string | null;
  intermediaryAccountNumber: string | null;
  paymentLinkLabel: string | null;
  paymentLinkUrl: string | null;
  currency: string | null;
  feeAllocation: 'OUR' | 'SHA' | 'BEN' | null;
  notes: string | null;
  archivedAt: string | null;
}

export type PaymentProfileInput = Partial<
  Omit<PaymentProfile, 'id' | 'archivedAt'>
> &
  Pick<PaymentProfile, 'name'>;

export const api = {
  summary: (tz: string) =>
    request<Summary>('GET', `/summary?tz=${encodeURIComponent(tz)}`),

  entries: (params: { from?: string; to?: string } = {}) => {
    const q = new URLSearchParams();
    if (params.from) q.set('from', params.from);
    if (params.to) q.set('to', params.to);
    const s = q.toString();
    return request<{ entries: TimeEntry[] }>('GET', `/entries${s ? `?${s}` : ''}`);
  },

  startTimer: (body: { taskName: string; projectId?: string | null }) =>
    request<TimeEntry>('POST', '/timer/start', body),

  stopTimer: () => request<TimeEntry>('POST', '/timer/stop', {}),

  updateRunning: (body: { taskName?: string; projectId?: string | null }) =>
    request<TimeEntry>('PATCH', '/timer/current', body),

  updateEntry: (id: string, body: Partial<Pick<TimeEntry,
    'taskName' | 'projectId' | 'startedAt' | 'endedAt' | 'isBillable'>>) =>
    request<TimeEntry>('PATCH', `/entries/${id}`, body),

  deleteEntry: (id: string) => request<void>('DELETE', `/entries/${id}`),

  projects: (opts: { includeArchived?: boolean } = {}) =>
    request<{ projects: Project[] }>(
      'GET',
      `/projects${opts.includeArchived ? '?includeArchived=true' : ''}`,
    ),

  createProject: (body: ProjectInput) =>
    request<Project>('POST', '/projects', body),

  updateProject: (id: string, body: Partial<ProjectInput>) =>
    request<Project>('PATCH', `/projects/${id}`, body),

  /** Archival, not deletion — entries and invoices reference projects. */
  archiveProject: (id: string) => request<void>('DELETE', `/projects/${id}`),

  /** Archived clients are excluded unless asked for. */
  clients: (opts: { includeArchived?: boolean } = {}) =>
    request<{ clients: Client[] }>(
      'GET',
      `/clients${opts.includeArchived ? '?includeArchived=true' : ''}`,
    ),

  client: (id: string) => request<Client>('GET', `/clients/${id}`),

  createClient: (body: ClientInput) =>
    request<Client>('POST', '/clients', body),

  updateClient: (id: string, body: Partial<ClientInput>) =>
    request<Client>('PATCH', `/clients/${id}`, body),

  /** Archival, not deletion — invoices reference clients. */
  archiveClient: (id: string) => request<void>('DELETE', `/clients/${id}`),

  calendar: (params: { from: string; to: string; tz: string }) => {
    const q = new URLSearchParams(params);
    return request<{ days: CalendarDay[] }>('GET', `/calendar?${q}`);
  },

  invoices: (params: { clientId?: string; status?: InvoiceStatus } = {}) => {
    const q = new URLSearchParams(params as Record<string, string>);
    const s = q.toString();
    return request<{ invoices: Invoice[] }>('GET', `/invoices${s ? `?${s}` : ''}`);
  },

  invoice: (id: string) =>
    request<{ invoice: Invoice; lineItems: InvoiceLineItem[]; client: Client }>(
      'GET',
      `/invoices/${id}`,
    ),

  /** No side effects — this is what the user approves before generating. */
  previewInvoice: (body: {
    clientId: string;
    periodStart: string;
    periodEnd: string;
    groupingMode?: GroupingMode;
    tz?: string;
  }) => request<InvoicePreview>('POST', '/invoices/preview', body),

  /** Allocates the number, freezes line items and rates, locks the entries. */
  createInvoice: (body: {
    clientId: string;
    periodStart: string;
    periodEnd: string;
    groupingMode?: GroupingMode;
    tz?: string;
    issueDate?: string;
    dueDate?: string;
    notes?: string;
    paymentTerms?: string;
  }) => request<Invoice>('POST', '/invoices', body),

  updateInvoiceStatus: (
    id: string,
    body: { status: InvoiceStatus; sentAt?: string; paidAt?: string },
  ) => request<Invoice>('PATCH', `/invoices/${id}/status`, body),

  /** Drafts only. An issued invoice must be voided so numbering stays gapless. */
  deleteInvoice: (id: string) => request<void>('DELETE', `/invoices/${id}`),

  invoicePdfUrl: (id: string, download = false) =>
    `/api/v1/invoices/${id}/pdf${download ? '?download=1' : ''}`,

  settings: () => request<Settings>('GET', '/settings'),

  updateSettings: (body: SettingsInput) =>
    request<Settings>('PATCH', '/settings', body),

  paymentProfiles: () =>
    request<{ paymentProfiles: PaymentProfile[] }>('GET', '/payment-profiles'),

  createPaymentProfile: (body: PaymentProfileInput) =>
    request<PaymentProfile>('POST', '/payment-profiles', body),

  updatePaymentProfile: (id: string, body: Partial<PaymentProfileInput>) =>
    request<PaymentProfile>('PATCH', `/payment-profiles/${id}`, body),

  archivePaymentProfile: (id: string) =>
    request<void>('DELETE', `/payment-profiles/${id}`),
};
