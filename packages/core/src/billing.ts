/** Stripe's subscription statuses, as the `subscriptions` table checks them. */
export const SUBSCRIPTION_STATUSES = [
  'active',
  'trialing',
  'past_due',
  'unpaid',
  'incomplete',
  'incomplete_expired',
  'canceled',
  'paused',
] as const;

export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];
export type Plan = 'free' | 'paid';

/**
 * Whether a subscription in this status buys the paid tier. `past_due` is
 * paid: Stripe is retrying the card, and losing the tier mid-retry is the
 * surprise the product argues against. A cancel set for the period's end
 * stays `active` until it ends, so it needs no case of its own. The clock
 * is not consulted — a renewal whose webhook is late must not read as free.
 */
export function planOf(status: SubscriptionStatus | null): Plan {
  return status === 'active' || status === 'trialing' || status === 'past_due'
    ? 'paid'
    : 'free';
}

/** The last charge failed: Settings asks for a new card. */
export function paymentFailed(status: SubscriptionStatus | null): boolean {
  return status === 'past_due' || status === 'unpaid';
}
