/**
 * Typed fetch wrapper shared by web and Expo.
 *
 * Deliberately thin: it handles auth headers, error shaping and the 409 the
 * timer endpoints return as a normal flow. It does not cache — that is the
 * data layer's job.
 */

import type { ApiError } from '@stint/schema';

export class ApiException extends Error {
  readonly status: number;
  readonly code: ApiError['code'] | 'UNKNOWN';
  readonly details?: unknown;

  constructor(
    status: number,
    code: ApiError['code'] | 'UNKNOWN',
    message: string,
    details?: unknown,
  ) {
    super(message);
    this.name = 'ApiException';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  /** A running timer blocked this start. The entry is in `details`. */
  get isTimerConflict() {
    return this.code === 'TIMER_ALREADY_RUNNING';
  }

  /** Billed on a non-draft invoice; the edit will never succeed. */
  get isLocked() {
    return this.code === 'ENTRY_LOCKED';
  }
}

export interface ApiClientOptions {
  baseUrl: string;
  /** Async so it can refresh an expired Supabase session first. */
  getToken: () => Promise<string | null>;
  fetch?: typeof globalThis.fetch;
}

export function createApiClient(opts: ApiClientOptions) {
  const doFetch = opts.fetch ?? globalThis.fetch;

  async function request<T>(
    method: string,
    path: string,
    body?: unknown,
    signal?: AbortSignal,
  ): Promise<T> {
    const token = await opts.getToken();

    const res = await doFetch(`${opts.baseUrl}/api/v1${path}`, {
      method,
      signal,
      headers: {
        ...(body ? { 'content-type': 'application/json' } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (res.status === 204) return undefined as T;

    const text = await res.text();
    const json = text ? JSON.parse(text) : undefined;

    if (!res.ok) {
      const err = json as ApiError | undefined;
      throw new ApiException(
        res.status,
        err?.code ?? 'UNKNOWN',
        err?.message ?? `${method} ${path} failed with ${res.status}`,
        err?.details,
      );
    }

    return json as T;
  }

  const qs = (params: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `?${s}` : '';
  };

  return {
    request,

    timer: {
      current: (signal?: AbortSignal) =>
        request('GET', '/timer/current', undefined, signal),
      start: (body: {
        id?: string;
        projectId?: string | null;
        taskName: string;
        startedAt?: string;
      }) => request('POST', '/timer/start', body),
      stop: (body?: { endedAt?: string }) =>
        request('POST', '/timer/stop', body ?? {}),
      update: (body: { taskName?: string; projectId?: string | null }) =>
        request('PATCH', '/timer/current', body),
    },

    entries: {
      list: (
        params: {
          from?: string;
          to?: string;
          projectId?: string;
          clientId?: string;
        } = {},
      ) => request('GET', `/entries${qs(params)}`),
      create: (body: unknown) => request('POST', '/entries', body),
      update: (id: string, body: unknown) =>
        request('PATCH', `/entries/${id}`, body),
      remove: (id: string) => request('DELETE', `/entries/${id}`),
    },

    /** The menu bar endpoint — running timer and today's total in one call. */
    summary: (signal?: AbortSignal) =>
      request('GET', '/summary', undefined, signal),
    calendar: (from: string, to: string) =>
      request('GET', `/calendar${qs({ from, to })}`),

    clients: {
      list: () => request('GET', '/clients'),
      create: (body: unknown) => request('POST', '/clients', body),
      update: (id: string, body: unknown) =>
        request('PATCH', `/clients/${id}`, body),
    },

    projects: {
      list: () => request('GET', '/projects'),
      create: (body: unknown) => request('POST', '/projects', body),
      update: (id: string, body: unknown) =>
        request('PATCH', `/projects/${id}`, body),
    },

    settings: {
      get: () => request('GET', '/settings'),
      update: (body: unknown) => request('PATCH', '/settings', body),
    },

    invoices: {
      preview: (body: unknown) => request('POST', '/invoices/preview', body),
      create: (body: unknown) => request('POST', '/invoices', body),
      setStatus: (
        id: string,
        status: string,
        at?: { sentAt?: string; paidAt?: string },
      ) => request('PATCH', `/invoices/${id}/status`, { status, ...at }),
      /** The app sends no mail: this is the URL the user downloads and
       *  emails themselves. */
      pdfUrl: (id: string) => `/api/v1/invoices/${id}/pdf?download=1`,
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
