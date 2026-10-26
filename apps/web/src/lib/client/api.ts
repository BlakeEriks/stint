'use client';

import {
  type ApiError,
  readBody,
  readFailure,
  withInclude,
  type Include,
  type Res,
  type StartTimer,
  type Stats,
  type StoppedTimer,
  type Summary,
  type TaskNameSuggestion,
  type TimeEntry,
  type WrittenEntry,
  type Client,
  type Project,
} from '@stint/client';
import type { z } from 'zod';
import type * as schema from '@stint/schema';
import type { ImportPreview, ImportResult } from '@stint/core';
import { forgetCache } from './query-cache';

export {
  ApiError,
  type Client,
  type Include,
  type Project,
  type Stats,
  type StoppedTimer,
  type Summary,
  type TaskNameSuggestion,
  type TimeEntry,
  type WrittenEntry,
} from '@stint/client';

/**
 * Browser-side API access.
 *
 * The web app authenticates by cookie, so requests carry no bearer token —
 * `requireSession` handles both paths. Errors become `ApiError` so callers
 * can branch on a code (a 409 from the timer is a normal flow, not a crash).
 */

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const form = body instanceof FormData;
  const res = await fetch(`/api/v1${path}`, {
    method,
    headers: body && !form ? { 'content-type': 'application/json' } : undefined,
    body: form ? body : body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) throw await failure(res);
  return readBody<T>(res);
}

/** A failed response as an `ApiError`, which also sends a 401 to sign in. */
async function failure(res: globalThis.Response): Promise<ApiError> {
  const error = await readFailure(res);

  /*
   * An expired or cleared session sends the user to sign in, from wherever
   * they were. Without this a signed-out page renders its shell and then
   * sits on "Loading…" forever — a 401 fails every retry React Query
   * makes, so it never resolves into anything the user can act on.
   * Hitting Back after signing out did exactly that.
   *
   * A hard assignment rather than the router: this is reachable from any
   * component, including ones with no router in scope, and a full load is
   * what guarantees no server-rendered authenticated markup survives.
   */
  if (
    error.isUnauthorized &&
    typeof window !== 'undefined' &&
    window.location.pathname !== '/signin'
  ) {
    forgetCache();
    window.location.assign('/signin');
  }
  return error;
}

// ── shapes the UI consumes ─────────────────────────────────────────
export type ClientWithScale = Res<schema.ClientWithScale>;
export type Settings = Res<schema.Settings>;
export type Account = Res<schema.Account>;
export type Billing = Res<schema.Billing>;
export type PaymentProfile = Res<schema.PaymentProfile>;
export type InvoicePreview = Res<schema.InvoicePreview>;
export type Invoice = Res<schema.Invoice>;
export type Expense = Res<schema.Expense>;
export type ManualLine = schema.ManualLine;

export type CalendarDay = Res<Omit<schema.CalendarDay, 'entries'>> & {
  entries: TimeEntry[];
};

const zone = () =>
  `tz=${encodeURIComponent(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC')}`;

export type GroupingMode = z.infer<typeof schema.GroupingMode>;
export type ScheduleKind = z.infer<typeof schema.ScheduleKind>;
export type InvoiceStatus = z.infer<typeof schema.InvoiceStatus>;
export type ComputedLineItem = Res<schema.ComputedLineItem>;
export type InvoiceLineItem = Res<schema.InvoiceLineItem>;
export type UnratedEntry = Res<schema.UnratedEntry>;
export type DraftChange = Res<schema.DraftChange>;

/** Everything a project is created or edited with. */
export type ProjectInput = Partial<Omit<Project, 'id' | 'archivedAt'>> &
  Pick<Project, 'name'>;

/** Everything a client is created or edited with. `id` is server-defaulted. */
export type ClientInput = Partial<Omit<Client, 'id' | 'archivedAt'>> &
  Pick<Client, 'name'>;

export type SettingsInput = Partial<Settings>;

/** Everything an expense is recorded or edited with. */
export type ExpenseInput = Pick<
  Expense,
  'clientId' | 'recurring' | 'spentOn' | 'description' | 'amount'
> &
  Partial<Pick<Expense, 'note'>>;

export type PaymentProfileInput = Partial<
  Omit<PaymentProfile, 'id' | 'archivedAt'>
> &
  Pick<PaymentProfile, 'name'>;

export const api = {
  /** A Toggl export, plus the zone its wall-clock times are in. */
  importPreview: (form: FormData) =>
    request<ImportPreview>('POST', '/imports/preview', form),

  importConfirm: (form: FormData) =>
    request<ImportResult>('POST', '/imports/confirm', form),

  summary: (tz: string) =>
    request<Summary>('GET', `/summary?tz=${encodeURIComponent(tz)}`),

  stats: (tz: string) =>
    request<Stats>('GET', `/stats?tz=${encodeURIComponent(tz)}`),

  entries: (
    params: {
      from?: string;
      to?: string;
      /** A project id, or `'none'` for entries with no project. */
      projectId?: string | 'none';
    } = {},
  ) => {
    const q = new URLSearchParams();
    if (params.from) q.set('from', params.from);
    if (params.to) q.set('to', params.to);
    if (params.projectId) q.set('projectId', params.projectId);
    const s = q.toString();
    return request<{ entries: TimeEntry[] }>(
      'GET',
      `/entries${s ? `?${s}` : ''}`,
    );
  },

  startTimer: (body: StartTimer, include: Include) =>
    request<WrittenEntry>('POST', withInclude('/timer/start', include), body),

  stopTimer: (include?: Include) =>
    request<StoppedTimer>('POST', withInclude('/timer/stop', include), {}),

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

  /** One entry by id, for a surface that holds a reference rather than a row. */
  entry: (id: string) => request<TimeEntry>('GET', `/entries/${id}`),

  updateEntry: (
    id: string,
    body: Partial<
      Pick<
        TimeEntry,
        | 'taskName'
        | 'projectId'
        | 'startedAt'
        | 'endedAt'
        | 'isBillable'
        | 'durationOk'
      >
    >,
  ) => request<TimeEntry>('PATCH', `/entries/${id}`, body),

  deleteEntry: (id: string) => request<void>('DELETE', `/entries/${id}`),

  /**
   * Recently used task names, ranked by the server and never re-sorted.
   * `projectId` is a preference rather than a filter: its names rank first
   * and the rest still follow, so omitting it ranks by recency alone.
   */
  taskNames: (opts: { projectId?: string | null; limit?: number } = {}) => {
    const q = new URLSearchParams();
    if (opts.projectId) q.set('projectId', opts.projectId);
    if (opts.limit) q.set('limit', String(opts.limit));
    const query = q.size > 0 ? `?${q}` : '';
    return request<{ taskNames: TaskNameSuggestion[] }>(
      'GET',
      `/entries/task-names${query}`,
    );
  },

  projects: (opts: { includeArchived?: boolean; clientId?: string } = {}) => {
    const q = new URLSearchParams();
    if (opts.includeArchived) q.set('includeArchived', 'true');
    if (opts.clientId) q.set('clientId', opts.clientId);
    const query = q.size > 0 ? `?${q}` : '';
    return request<{ projects: Project[] }>('GET', `/projects${query}`);
  },

  createProject: (body: ProjectInput & { id?: string }) =>
    request<Project>('POST', '/projects', body),

  updateProject: (id: string, body: Partial<ProjectInput>) =>
    request<Project>('PATCH', `/projects/${id}`, body),

  /** Archival, not deletion — entries and invoices reference projects. */
  archiveProject: (id: string) => request<void>('DELETE', `/projects/${id}`),

  restoreProject: (id: string) =>
    request<Project>('PATCH', `/projects/${id}`, { archived: false }),

  /** Archived clients are excluded unless asked for. */
  /* Overloaded so `withScale` narrows the result: without it every caller of
     the plain list would carry fields the server did not send. */
  clients: ((opts: { includeArchived?: boolean; withScale?: boolean } = {}) => {
    const q = new URLSearchParams();
    if (opts.includeArchived) q.set('includeArchived', 'true');
    if (opts.withScale) q.set('withScale', 'true');
    const query = q.size > 0 ? `?${q}` : '';
    return request<{ clients: Client[] | ClientWithScale[] }>(
      'GET',
      `/clients${query}`,
    );
  }) as {
    (opts: {
      includeArchived?: boolean;
      withScale: true;
    }): Promise<{
      clients: ClientWithScale[];
    }>;
    (opts?: {
      includeArchived?: boolean;
      withScale?: false;
    }): Promise<{
      clients: Client[];
    }>;
  },

  createClient: (body: ClientInput) =>
    request<Client>('POST', '/clients', body),

  updateClient: (id: string, body: Partial<ClientInput>) =>
    request<Client>('PATCH', `/clients/${id}`, body),

  /** Archival, not deletion — invoices reference clients. */
  archiveClient: (id: string) => request<void>('DELETE', `/clients/${id}`),

  /** Only the client: its projects keep their own archivedAt, so what was
      active before it was archived comes back, and nothing else. */
  restoreClient: (id: string) =>
    request<Client>('PATCH', `/clients/${id}`, { archived: false }),

  calendar: (params: { from: string; to: string; tz: string }) => {
    const q = new URLSearchParams(params);
    return request<{ days: CalendarDay[] }>('GET', `/calendar?${q}`);
  },

  invoices: (params: { clientId?: string; status?: InvoiceStatus } = {}) => {
    const q = new URLSearchParams(params as Record<string, string>);
    return request<{ invoices: Invoice[] }>('GET', `/invoices?${q}&${zone()}`);
  },

  /* The invoice is FLAT, matching every other detail route (`/clients/:id`,
     `/projects/:id`), with the line items alongside it. */
  invoice: (id: string) =>
    request<
      Invoice & {
        /** `isNew`: on a draft, a line its last PDF didn't have. */
        lineItems: (InvoiceLineItem & { isNew: boolean })[];
        canDownload: boolean;
        changedSinceDownload: DraftChange | null;
        unratedEntries: UnratedEntry[];
        dueBeforeIssue: { download: boolean; send: boolean };
        refuses: { download: boolean; send: boolean };
      }
    >('GET', `/invoices/${id}?${zone()}`),

  /** No side effects — this is what the user approves before generating. */
  previewInvoice: (body: {
    clientId: string;
    periodStart: string;
    periodEnd: string;
    groupingMode?: GroupingMode;
    summaryText?: string;
    tz?: string;
    manualLines?: ManualLine[];
    excludedExpenseIds?: string[];
  }) => request<InvoicePreview>('POST', '/invoices/preview', body),

  /** Allocates the number and creates the draft, which bills its period's
   *  work until it is sent. */
  createInvoice: (body: {
    clientId: string;
    periodStart: string;
    periodEnd: string;
    groupingMode?: GroupingMode;
    summaryText?: string;
    tz?: string;
    manualLines?: ManualLine[];
    excludedExpenseIds?: string[];
    schedules?: ScheduleKind[];
    reference?: string;
    paymentProfileId?: string;
    dueDate?: string;
    notes?: string;
  }) =>
    request<Invoice & { lineItems: ComputedLineItem[]; entryCount: number }>(
      'POST',
      '/invoices',
      body,
    ),

  updateInvoiceStatus: (
    id: string,
    body: { status: InvoiceStatus; sentAt?: string; paidAt?: string },
  ) =>
    request<Invoice>(
      'PATCH',
      // A draft is sent as its period's work stands, read in its zone.
      `/invoices/${id}/status${body.status === 'sent' ? `?${zone()}` : ''}`,
      body,
    ),

  /** Drafts only. An issued invoice must be voided so numbering stays gapless. */
  deleteInvoice: (id: string) => request<void>('DELETE', `/invoices/${id}`),

  /** Recurring first, then oldest first. `open` (the default) is what a
   *  client's card lists; `unbilled` is what an invoice can take. */
  expenses: (
    params: { clientId?: string; status?: 'open' | 'unbilled' } = {},
  ) => {
    const q = new URLSearchParams(params as Record<string, string>);
    return request<{ expenses: Expense[] }>('GET', `/expenses?${q}`);
  },

  /** `id` is a client-generated UUIDv7, made once per recording, so a
   *  retried request lands on the same row rather than recording it twice. */
  createExpense: (body: ExpenseInput & { id: string }) =>
    request<Expense>('POST', '/expenses', body),

  sendFeedback: (body: schema.CreateFeedback) =>
    request<{ id: string }>('POST', '/feedback', body),

  updateExpense: (id: string, body: Partial<ExpenseInput>) =>
    request<Expense>('PATCH', `/expenses/${id}`, body),

  deleteExpense: (id: string) => request<void>('DELETE', `/expenses/${id}`),

  /** A CSV export, and the name the server gave it. */
  exportCsv: async (kind: 'entries' | 'invoices', tz: string) => {
    const res = await fetch(
      `/api/v1/exports/${kind}?tz=${encodeURIComponent(tz)}`,
    );
    if (!res.ok) throw await failure(res);
    const name = /filename="([^"]+)"/.exec(
      res.headers.get('content-disposition') ?? '',
    )?.[1];
    return { blob: await res.blob(), filename: name ?? `stint-${kind}.csv` };
  },

  invoicePdfUrl: (id: string, download = false) =>
    `/api/v1/invoices/${id}/pdf?${zone()}${download ? '&download=1' : ''}`,

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

  account: () => request<Account>('GET', '/account'),

  deleteAccount: () => request<void>('DELETE', '/account'),

  billing: () => request<Billing>('GET', '/billing'),

  /** A Stripe Checkout URL for the yearly price. */
  checkout: () => request<schema.BillingRedirect>('POST', '/billing/checkout'),

  /** A Stripe Customer Portal URL: cancel, resume, card, receipts. */
  billingPortal: () =>
    request<schema.BillingRedirect>('POST', '/billing/portal'),

  /** Back from Checkout: store what Stripe says about that session now. */
  syncCheckout: (sessionId: string) =>
    request<Billing>('POST', '/billing/sync', { sessionId }),
};
