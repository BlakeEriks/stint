import Stripe from 'stripe';
import { handle } from '@/lib/errors';
import { syncCustomer } from '@/lib/billing';
import { billingConfig } from '@/lib/stripe';

export const dynamic = 'force-dynamic';

/** Events that can change a subscription. Each is only a cue to re-read. */
const SYNCED = new Set([
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'customer.subscription.paused',
  'customer.subscription.resumed',
  'invoice.paid',
  'invoice.payment_failed',
]);

/**
 * POST /api/v1/billing/webhook — called by Stripe, not a user, so no session.
 * The signature is the authentication: verified against the raw body before
 * anything is read. A failed sync answers 500, and Stripe retries.
 */
export const POST = handle(async (req: Request) => {
  const config = billingConfig();
  if (!config) return new Response('Billing is not set up', { status: 503 });

  const signature = req.headers.get('stripe-signature');
  if (!signature) return new Response('No signature', { status: 400 });

  let event: Stripe.Event;
  try {
    event = await Stripe.webhooks.constructEventAsync(
      await req.text(),
      signature,
      config.webhookSecret,
    );
  } catch (err) {
    if (err instanceof Stripe.errors.StripeSignatureVerificationError)
      return new Response('Invalid signature', { status: 400 });
    throw err;
  }

  if (SYNCED.has(event.type)) {
    const { customer } = event.data.object as {
      customer?: string | { id: string } | null;
    };
    const id = typeof customer === 'string' ? customer : customer?.id;
    if (id) await syncCustomer(id);
  }

  return Response.json({ received: true });
});
