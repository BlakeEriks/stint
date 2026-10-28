import { z } from 'zod';

/**
 * Every code the API answers with, and its status: the one table.
 * `lib/errors.ts` and the story mocks answer with these statuses, and
 * `scripts/doc-refs.mjs` fails when `docs/api.md`'s table disagrees.
 */
export const ERROR_STATUS = {
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
} as const;

type Code = keyof typeof ERROR_STATUS;
export const ErrorCode = z.enum(Object.keys(ERROR_STATUS) as [Code, ...Code[]]);

export const ApiError = z.object({
  code: ErrorCode,
  message: z.string(),
  details: z.unknown().optional(),
});

export type ApiError = z.infer<typeof ApiError>;
