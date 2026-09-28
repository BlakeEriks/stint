import { HttpResponse } from 'msw';
import { z } from 'zod';
import * as schema from '@stint/schema';

/**
 * Every fake response goes through the API's own schema, so a fixture the
 * real server could never send fails the story instead of drawing a screen
 * the app will never show.
 */
export function ok<S extends z.ZodType>(s: S, body: z.input<S>) {
  const parsed = s.safeParse(body);
  if (!parsed.success) {
    console.error('Fake /api/v1 response fails its schema', parsed.error);
    return fail(500, 'INTERNAL', `Fixture fails its schema: ${parsed.error}`);
  }
  return HttpResponse.json(body as never);
}

/** An error in the API's own shape. Never 401: `api.ts` would navigate away. */
export function fail(status: number, code: string, message = code) {
  return HttpResponse.json({ code, message }, { status });
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
