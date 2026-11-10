import { NextResponse } from 'next/server';
import { ApiError, handle } from '@/lib/errors';
import { requireSession } from '@/lib/auth';
import { parseBody } from '@/lib/validate';
import { entitlement, syncCustomer } from '@/lib/billing';
import { requireBillingConfig, stripe } from '@/lib/stripe';
import { BillingSync } from '@stint/schema';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/billing/sync — back from Checkout, store what Stripe says now
 * rather than wait on the webhook, so Settings shows the paid plan at once.
 * The webhook runs the same sync; whichever lands second changes nothing.
 */
export const POST = handle(async (req: Request) => {
  const { userId, db } = await requireSession(req);
  requireBillingConfig();
  const { sessionId } = await parseBody(req, BillingSync);

  const session = await stripe()
    .checkout.sessions.retrieve(sessionId)
    .catch((err: { statusCode?: number }) => {
      if (err.statusCode === 404) return null;
      throw err;
    });
  // Another user's session is answered as if it did not exist.
  if (!session || session.client_reference_id !== userId)
    throw new ApiError('CHECKOUT_NOT_FOUND', 'No such checkout');

  const customer =
    typeof session.customer === 'string'
      ? session.customer
      : session.customer?.id;
  if (customer) await syncCustomer(customer);

  return NextResponse.json(await entitlement(db));
});
