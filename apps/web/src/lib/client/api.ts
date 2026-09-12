'use client';

import type { z } from 'zod';
import type * as schema from '@stint/schema';

/**
 * Browser-side API access.
 *
 * The web app authenticates by cookie, so requests carry no bearer token —
 * `requireSession` handles both paths. Errors become `ApiError` so callers
 * can branch on a code (a 409 from the timer is a normal flow, not a crash).
 */

/**
 * Deliberately NOT `z.infer<typeof schema.ApiError>`: that types `code` as the
 * `ErrorCode` enum, and a client should not fail to parse an error just
 * because a newer server introduced a code it has not heard of. Widening to
 * `string` is what lets the unknown case fall through to generic handling.
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

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(`/api/v1${path}`, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  const json = text ? JSON.parse(text) : undefined;

  if (!res.ok) {
    throw new ApiError(
      res.status,
      json ?? { code: 'UNKNOWN', message: res.statusText },
    );
  }
  return json as T;
}

// ── shapes the UI consumes ─────────────────────────────────────────
/*
 * These DERIVE from `@stint/schema`. They used to be hand-written copies of
 * it, which drifted in both directions: removing `color` from the schema's
 * Project produced no error here and a component went on reading the dead
 * field, while `paymentProfileId` existed in the database, `rows.ts` and this
 * file but had never been added to the schema at all.
 *
 * `Response<T>` is why a plain `z.infer` is not enough. A schema marks a
 * field `.optional()` to say a REQUEST may omit it, so `z.infer` yields
 * `field?: T | undefined`. Every converter in `rows.ts` sets every field
 * unconditionally — absent values arrive as `null`, never missing — so a
 * response has no optional fields, and typing them as optional would push a
 * pointless `?? null` through the whole UI.
 */
type Response<T> = { [K in keyof T]-?: Exclude<T[K], undefined> };

export type TimeEntry = Response<schema.TimeEntry>;
export type Project = Response<schema.Project>;
export type Client = Response<schema.Client>;
export type Settings = Response<schema.Settings>;
export type PaymentProfile = Response<schema.PaymentProfile>;
export type InvoicePreview = Response<schema.InvoicePreview>;
export type Invoice = Response<schema.Invoice>;

/* Nested objects keep their own optionality, so `Response` is applied only at
   the top level here — every nested field is already required. */
export type Stats = Response<schema.Stats>;
export type Pace = schema.Pace;
export type UnbilledClient = schema.UnbilledClient;

export type CalendarDay = Response<Omit<schema.CalendarDay, 'entries'>> & {
  entries: TimeEntry[];
};

export type Summary = Response<Omit<schema.Summary, 'running'>> & {
  running: TimeEntry | null;
};

export type GroupingMode = z.infer<typeof schema.GroupingMode>;
export type InvoiceStatus = z.infer<typeof schema.InvoiceStatus>;
export type InvoiceLineItem = Response<schema.InvoiceLineItem>;

/** Everything a project is created or edited with. */
export type ProjectInput = Partial<Omit<Project, 'id' | 'archivedAt'>> &
  Pick<Project, 'name'>;

/** Everything a client is created or edited with. `id` is server-defaulted. */
export type ClientInput = Partial<Omit<Client, 'id' | 'archivedAt'>> &
  Pick<Client, 'name'>;

export type SettingsInput = Partial<Omit<Settings, 'nextInvoiceNumber'>>;

export type PaymentProfileInput = Partial<
  Omit<PaymentProfile, 'id' | 'archivedAt'>
> &
  Pick<PaymentProfile, 'name'>;

export const api = {
  summary: (tz: string) =>
    request<Summary>('GET', `/summary?tz=${encodeURIComponent(tz)}`),

  stats: (tz: string) =>
    request<Stats>('GET', `/stats?tz=${encodeURIComponent(tz)}`),

  entries: (params: { from?: string; to?: string } = {}) => {
    const q = new URLSearchParams();
    if (params.from) q.set('from', params.from);
    if (params.to) q.set('to', params.to);
    const s = q.toString();
    return request<{ entries: TimeEntry[] }>(
      'GET',
      `/entries${s ? `?${s}` : ''}`,
    );
  },

  startTimer: (body: { taskName: string; projectId?: string | null }) =>
    request<TimeEntry>('POST', '/timer/start', body),

  stopTimer: () => request<TimeEntry>('POST', '/timer/stop', {}),

  updateRunning: (body: { taskName?: string; projectId?: string | null }) =>
    request<TimeEntry>('PATCH', '/timer/current', body),

  /**
   * A completed manual entry. `id` is a client-generated UUIDv7 (`uuidv7()`
   * in `@stint/core`) so a retried insert lands on the same row rather than
   * duplicating it — the server returns the existing entry with 200.
   */
  createEntry: (body: {
    id: string;
    taskName: string;
    projectId?: string | null;
    startedAt: string;
    endedAt: string;
    isBillable?: boolean;
  }) => request<TimeEntry>('POST', '/entries', body),

  updateEntry: (
    id: string,
    body: Partial<
      Pick<
        TimeEntry,
        'taskName' | 'projectId' | 'startedAt' | 'endedAt' | 'isBillable'
      >
    >,
  ) => request<TimeEntry>('PATCH', `/entries/${id}`, body),

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
    return request<{ invoices: Invoice[] }>(
      'GET',
      `/invoices${s ? `?${s}` : ''}`,
    );
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
