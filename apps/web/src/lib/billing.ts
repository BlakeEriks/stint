import type { SupabaseClient } from '@supabase/supabase-js';
import { captureMessage } from '@sentry/core';
import {
  hasEnded,
  planOf,
  SUBSCRIPTION_STATUSES,
  type SubscriptionStatus,
} from '@stint/core';
import type { Billing } from '@stint/schema';
import { PG } from './errors';
import { SUBSCRIPTION_COLUMNS, toBilling } from './rows';
import { billingConfig, stripe } from './stripe';
import { serviceClient } from './supabase';

/**
 * The caller's plan, read through their own RLS-scoped client. The one
 * answer to "has this user paid". It reads
 * only the stored mirror, so a Stripe outage never decides a user's plan.
 */
export async function entitlement(db: SupabaseClient): Promise<Billing> {
  const { data, error } = await db
    .from('subscriptions')
    .select(SUBSCRIPTION_COLUMNS)
    .maybeSingle();
  if (error) throw error;
  return toBilling(data, billingConfig() !== null);
}

/**
 * Store what Stripe currently says about a customer's subscription.
 *
 * Stripe's events are never applied as they arrive: they come out of order
 * and more than once. Each one is only a cue to re-read the customer from
 * Stripe and write that, so a duplicate or a late, older event changes
 * nothing.
 */
export async function syncCustomer(customerId: string): Promise<void> {
  const { data: subs } = await stripe().subscriptions.list({
    customer: customerId,
    status: 'all',
    limit: 10,
  });
  // Newest first. Prefer one that is paying: a canceled earlier subscription
  // must not hide the current one.
  const paying = subs.filter((s) => planOf(statusOf(s.status)) === 'paid');
  const sub = paying[0] ?? subs[0];
  const userId = sub?.metadata.user_id;
  if (!sub || !userId) return;
  const status = statusOf(sub.status);

  // Two payment pages completed at once make two customers. The one already
  // stored stays while it pays; the extra is refunded by hand.
  const db = serviceClient();
  const { data: stored, error: readError } = await db
    .from('subscriptions')
    .select('stripe_customer_id, status')
    .eq('user_id', userId)
    .maybeSingle();
  if (readError) throw readError;
  if (
    stored &&
    stored.stripe_customer_id !== customerId &&
    planOf(stored.status) === 'paid'
  ) {
    if (paying.length > 0)
      captureMessage(
        `User ${userId} pays through Stripe customers ${stored.stripe_customer_id} and ${customerId}; refund and cancel ${customerId}`,
      );
    return;
  }
  if (paying.length > 1)
    captureMessage(
      `Stripe customer ${customerId} has ${paying.length} paying subscriptions; refund the extra`,
    );

  // A cancel from the Portal may set `cancel_at` rather than the flag; either
  // way the paid tier ends then.
  const item = sub.items.data[0];
  const ends = sub.cancel_at ?? item?.current_period_end;
  if (!ends) throw new Error(`Subscription ${sub.id} has no period end`);

  const { error } = await db.from('subscriptions').upsert(
    {
      user_id: userId,
      stripe_customer_id: customerId,
      stripe_subscription_id: sub.id,
      status,
      current_period_end: new Date(ends * 1000).toISOString(),
      cancel_at_period_end: sub.cancel_at_period_end || sub.cancel_at != null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  );
  // The account was deleted before any sync stored this, so DELETE /account
  // had nothing to cancel. A deleted account is never charged again.
  if (error?.code === PG.FOREIGN_KEY_VIOLATION) {
    if (!hasEnded(status)) await stripe().subscriptions.cancel(sub.id);
    return;
  }
  if (error) throw error;
}

/** Stripe may add a status; an unknown one fails loudly so Stripe retries. */
function statusOf(status: string): SubscriptionStatus {
  if ((SUBSCRIPTION_STATUSES as readonly string[]).includes(status))
    return status as SubscriptionStatus;
  throw new Error(`Unknown Stripe subscription status: ${status}`);
}
