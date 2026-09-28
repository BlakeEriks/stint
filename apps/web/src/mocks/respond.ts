import { HttpResponse } from 'msw';
import { z } from 'zod';
import * as schema from '@stint/schema';

/**
 * What went wrong in the fake server during the current story: a response
 * that fails its schema, a request nothing handles, a handler that threw.
 * `.storybook/preview.tsx` empties it before a story and fails the story if
 * anything is in it after — otherwise the screen would draw its error state
 * and pass.
 */
export const problems: string[] = [];

/**
 * Every fake response goes through the API's own schema, so a fixture the
 * real server could never send fails the story instead of drawing a screen
 * the app will never show.
 */
export function ok<S extends z.ZodType>(s: S, body: z.input<S>) {
  const parsed = s.safeParse(body);
  if (!parsed.success) {
    problems.push(`A fake response fails its schema: ${parsed.error}`);
    return fail('INTERNAL');
  }
  // The parsed value, so a misspelled key never reaches the component.
  return HttpResponse.json(parsed.data as never);
}

type Code = z.infer<typeof schema.ErrorCode> | 'INTERNAL';

/* `src/lib/errors.ts`'s statuses: the code decides the status, as it does
   there. `UNAUTHORIZED` is left out because `api.ts` answers a 401 by
   navigating away, which would take the story with it. */
const STATUS: Record<Exclude<Code, 'UNAUTHORIZED'>, number> = {
  TIMER_ALREADY_RUNNING: 409,
  NO_TIMER_RUNNING: 409,
  ENTRY_LOCKED: 409,
  ENTRY_NOT_FOUND: 404,
  NO_RATE_CONFIGURED: 400,
  INVALID_PERIOD: 400,
  IMPORT_FILE_UNRECOGNIZED: 422,
  VALIDATION_FAILED: 422,
  INTERNAL: 500,
};

/** An error in the API's own shape, code and status. */
export function fail(
  code: keyof typeof STATUS,
  message = code === 'INTERNAL' ? 'Internal server error' : code,
) {
  return HttpResponse.json({ code, message }, { status: STATUS[code] });
}

export const noContent = () => new HttpResponse(null, { status: 204 });

/* The list routes wrap their rows; `@stint/schema` has the rows only. */
const list = <K extends string, S extends z.ZodType>(key: K, row: S) =>
  z.object({ [key]: z.array(row) } as Record<K, z.ZodArray<S>>);

export const envelopes = {
  entries: list('entries', schema.TimeEntry),
  projects: list('projects', schema.Project),
  clients: list('clients', schema.Client),
  clientsWithScale: list('clients', schema.ClientWithScale),
  invoices: list('invoices', schema.Invoice),
  taskNames: list('taskNames', schema.TaskNameSuggestion),
  paymentProfiles: list('paymentProfiles', schema.PaymentProfile),
  calendar: list('days', schema.CalendarDay),
  activity: list('days', schema.CalendarTotalsDay),
};

export const invoiceDetail = schema.Invoice.extend({
  lineItems: z.array(schema.StoredLineItem),
  client: schema.Client.pick({
    id: true,
    name: true,
    email: true,
    address: true,
  }),
});

export const createdInvoice = schema.Invoice.extend({
  lineItems: z.array(schema.ComputedLineItem),
  entryCount: z.number().int().nonnegative(),
});

export { schema };
