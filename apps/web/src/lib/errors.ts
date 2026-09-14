import { NextResponse } from 'next/server';
/** Mirrors ErrorCode in @stint/schema. */
export type Code =
  | 'TIMER_ALREADY_RUNNING'
  | 'NO_TIMER_RUNNING'
  | 'ENTRY_LOCKED'
  | 'ENTRY_NOT_FOUND'
  | 'NO_RATE_CONFIGURED'
  | 'INVALID_PERIOD'
  | 'UNAUTHORIZED'
  | 'VALIDATION_FAILED';

const STATUS: Record<Code, number> = {
  TIMER_ALREADY_RUNNING: 409,
  NO_TIMER_RUNNING: 409,
  ENTRY_LOCKED: 409,
  ENTRY_NOT_FOUND: 404,
  NO_RATE_CONFIGURED: 400,
  INVALID_PERIOD: 400,
  UNAUTHORIZED: 401,
  VALIDATION_FAILED: 422,
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

export function errorResponse(code: Code, message: string, details?: unknown) {
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
      console.error('Unhandled API error:', err);
      return NextResponse.json(
        { code: 'INTERNAL', message: 'Internal server error' },
        { status: 500 },
      );
    }
  };
}

/** Postgres error codes surfaced through PostgREST. */
export const PG = {
  UNIQUE_VIOLATION: '23505',
  CHECK_VIOLATION: '23514',
  NOT_FOUND: 'PGRST116',
} as const;

/** The partial unique index that enforces one running timer per user. */
export function isTimerConflict(
  err: { code?: string; message?: string } | null,
): boolean {
  return (
    err?.code === PG.UNIQUE_VIOLATION &&
    (err.message ?? '').includes('one_running_timer_per_user')
  );
}

/** The trigger guarding entries billed on a non-draft invoice. */
export function isBilledLock(
  err: { code?: string; message?: string } | null,
): boolean {
  return (
    err?.code === PG.CHECK_VIOLATION &&
    /billed on a .* invoice/.test(err.message ?? '')
  );
}

// ── drift guard ────────────────────────────────────────────────────
// The union above is hand-written so this module carries no runtime
// dependency on the schema package. These assertions fail to compile if it
// diverges from ErrorCode.
import type { z } from 'zod';
import type { ErrorCode } from '@stint/schema';

type SchemaCode = z.infer<typeof ErrorCode>;
type Assert<_A extends B, B> = true;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CodeMatchesSchema = [Assert<Code, SchemaCode>, Assert<SchemaCode, Code>];
