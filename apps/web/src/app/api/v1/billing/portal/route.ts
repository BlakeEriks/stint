import { NextResponse } from 'next/server';
import { ApiError, handle } from '@/lib/errors';
import { requireSession } from '@/lib/auth';
import { requireBillingConfig, stripe } from '@/lib/stripe';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/billing/portal — Stripe's Customer Portal, where a subscriber
 * cancels, resumes, updates a card and finds receipts.
 */
export const POST = handle(async (req: Request) => {
  const { db } = await requireSession(req);
  requireBillingConfig();

  const { data: row, error } = await db
    .from('subscriptions')
    .select('stripe_customer_id')
    .maybeSingle();
  if (error) throw error;
  if (!row)
    throw new ApiError('NOT_SUBSCRIBED', 'There is no subscription to manage');

  const session = await stripe().billingPortal.sessions.create({
    customer: row.stripe_customer_id,
    return_url: `${new URL(req.url).origin}/settings`,
  });

  return NextResponse.json({ url: session.url });
});
