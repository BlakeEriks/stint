import { NextResponse } from 'next/server';
/* `@sentry/core`, not `@sentry/nextjs`: the same function, but Node's ESM
   loader cannot see the named exports `@sentry/nextjs` re-exports from
   CommonJS, so the route tests would import `undefined`. */
import { captureException } from '@sentry/core';
import type { z } from 'zod';
import type { Refusal } from '@stint/core';
import type { ErrorCode } from '@stint/schema';

/* A type-only import: the schema's codes cost nothing at run time, and
   STATUS below fails to compile when a code is missing from it. */
export type Code = z.infer<typeof ErrorCode>;

const STATUS: Record<Code, number> = {
  TIMER_ALREADY_RUNNING: 409,
  NO_TIMER_RUNNING: 409,
  ENTRY_LOCKED: 409,
  EXPENSE_LOCKED: 409,
  EXPENSE_ALREADY_INVOICED: 409,
  ENTRY_ALREADY_INVOICED: 409,
  INVOICE_STATUS_CHANGED: 409,
  DRAFT_CHANGED: 409,
  DRAFT_OVERLAPS: 409,
  ENTRY_NOT_FOUND: 404,
  NO_RATE_CONFIGURED: 400,
  INVALID_PERIOD: 400,
  UNAUTHORIZED: 401,
  IMPORT_FILE_UNRECOGNIZED: 422,
  VALIDATION_FAILED: 422,
  ALREADY_SUBSCRIBED: 409,
  NOT_SUBSCRIBED: 409,
  CHECKOUT_NOT_FOUND: 404,
  BILLING_UNAVAILABLE: 503,
  PAYMENT_REQUIRED: 402,
};

/** A failure the client is expected to handle — not a bug. */
export class ApiError extends Error {
  readonly code: Code;
  readonly details?: unknown;

  constructor(code: Code, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.details = details;
  }
}

/** A refusal `@stint/core` decided or named, thrown. */
export const refused = (r: Refusal) =>
  new ApiError(r.code, r.message, r.details);

function errorResponse(code: Code, message: string, details?: unknown) {
  return NextResponse.json(
    { code, message, details },
    { status: STATUS[code] },
  );
}

/**
 * Wraps a handler so thrown ApiErrors become their documented status, and
 * anything else becomes a 500 without leaking internals to the client.
 */
export function handle<T extends unknown[]>(
  fn: (...args: T) => Promise<Response>,
): (...args: T) => Promise<Response> {
  return async (...args: T) => {
    try {
      return await fn(...args);
    } catch (err) {
      if (err instanceof ApiError) {
        return errorResponse(err.code, err.message, err.details);
      }
      /* A check constraint is the database restating a rule the request
         broke, so it is the caller's error however it got there — a partial
         patch can break a pairing no single-body Zod refinement can see. */
      if (isCheckViolation(err)) {
        return errorResponse(
          'VALIDATION_FAILED',
          'The database rejected this change as invalid',
          { constraint: (err as { message?: string }).message },
        );
      }
      if (dbCode(err as { message?: string }) === 'VALIDATION_FAILED') {
        return errorResponse(
          'VALIDATION_FAILED',
          'This refers to a record that does not exist',
          { constraint: (err as { message?: string }).message },
        );
      }
      /* Postgres refuses a malformed uuid with an error, not an empty
         result: an id typed into the URL is still a record that isn't
         there. */
      if ((err as { code?: string } | null)?.code === PG.INVALID_TEXT) {
        return errorResponse('ENTRY_NOT_FOUND', 'Not found');
      }
      console.error('Unhandled API error:', err);
      report(err);
      return NextResponse.json(
        { code: 'INTERNAL', message: 'Internal server error' },
        { status: 500 },
      );
    }
  };
}

/* A route rethrows a Supabase `error`, a plain `{ message, code, ... }`.
   Sentry titles a non-Error by its top frame's function, a minified letter,
   so it goes up as an Error with the original beside it. That Error's stack
   is this function's whichever route failed, so the message joins the
   fingerprint: without it every database failure groups as one issue. */
export function report(err: unknown) {
  if (err instanceof Error) {
    captureException(err);
    return;
  }
  const message = String((err as { message?: unknown } | null)?.message ?? err);
  captureException(new Error(message), {
    extra: { thrown: err },
    fingerprint: ['{{ default }}', message],
  });
}

/** Postgres error codes surfaced through PostgREST. */
export const PG = {
  UNIQUE_VIOLATION: '23505',
  CHECK_VIOLATION: '23514',
  FOREIGN_KEY_VIOLATION: '23503',
  NOT_FOUND: 'PGRST116',
  INVALID_TEXT: '22P02',
  NO_DATA_FOUND: 'P0002',
} as const;

/* The constraints whose violation the API names. A trigger or function has no
   constraint to name, so it raises its code in HINT instead (`dbCode`). */
const CONSTRAINT_CODES: Record<string, Code> = {
  one_running_timer_per_user: 'TIMER_ALREADY_RUNNING',
  // An invoice attaching work marked billed elsewhere since it was read.
  entry_billed_once: 'ENTRY_ALREADY_INVOICED',
  // A same-owner key fails as a missing reference: the caller named a record
  // that is not theirs, or not there.
  entry_project_same_owner: 'VALIDATION_FAILED',
  expense_client_same_owner: 'VALIDATION_FAILED',
  invoice_client_same_owner: 'VALIDATION_FAILED',
  project_client_same_owner: 'VALIDATION_FAILED',
};

/** The API code a database refusal carries, if it is one the API names; the
 *  route that meets it chooses the message. */
export function dbCode(
  err: { message?: string; hint?: string } | null,
): Code | undefined {
  if (err?.hint && Object.hasOwn(STATUS, err.hint)) return err.hint as Code;
  const constraint = /constraint "([^"]+)"/.exec(err?.message ?? '')?.[1];
  return constraint ? CONSTRAINT_CODES[constraint] : undefined;
}

/** Postgres rejected the row against a CHECK — a rule the request broke. */
export function isCheckViolation(err: unknown): boolean {
  return (err as { code?: string } | null)?.code === PG.CHECK_VIOLATION;
}
