import { NextResponse } from 'next/server';
import { ApiError, handle } from '@/lib/errors';
import { requireSession } from '@/lib/auth';
import { entitlement } from '@/lib/billing';
import { requireBillingConfig, stripe } from '@/lib/stripe';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/billing/checkout — a Stripe Checkout page for the one yearly
 * price (`docs/positioning.md`). The user id rides on the session and the
 * subscription's metadata, which is how `syncCustomer()` finds the user.
 */
export const POST = handle(async (req: Request) => {
  const { userId, db } = await requireSession(req);
  const { priceId } = requireBillingConfig();

  const current = await entitlement(db);
  if (current.plan === 'paid')
    throw new ApiError('ALREADY_SUBSCRIBED', 'You are already subscribed');

  // A returning subscriber keeps their customer, receipts and saved card.
  const { data: row, error } = await db
    .from('subscriptions')
    .select('stripe_customer_id')
    .maybeSingle();
  if (error) throw error;

  const origin = new URL(req.url).origin;
  const session = await stripe().checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    customer: row?.stripe_customer_id,
    client_reference_id: userId,
    subscription_data: { metadata: { user_id: userId } },
    // The automatic-renewal disclosure, beside the pay button, and the terms
    // the user agrees to (`/terms`, set as the account's terms URL in Stripe).
    consent_collection: { terms_of_service: 'required' },
    custom_text: {
      submit: {
        message:
          'Renews every year at this price until you cancel, which you can do any time in Settings.',
      },
    },
    success_url: `${origin}/settings?checkout={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/settings`,
  });
  if (!session.url) throw new Error('Stripe returned a session with no URL');

  return NextResponse.json({ url: session.url });
});
