import type { SupabaseClient } from '@supabase/supabase-js';
import { captureMessage } from '@sentry/core';
import {
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
 * answer to "has this user paid"; #61's invoice gate asks it too. It reads
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
 * nothing. Returns the user it wrote, or null when there is nothing to
 * write: no subscription, one Checkout did not make, or an account since
 * deleted.
 */
export async function syncCustomer(customerId: string): Promise<string | null> {
  const { data: subs } = await stripe().subscriptions.list({
    customer: customerId,
    status: 'all',
    limit: 10,
  });
  // Newest first. Prefer one that is paying: a canceled earlier subscription
  // must not hide the current one.
  const paying = subs.filter((s) => planOf(statusOf(s.status)) === 'paid');
  if (paying.length > 1)
    // Two payment pages completed at once. Rare enough to refund by hand.
    captureMessage(
      `Stripe customer ${customerId} has ${paying.length} paying subscriptions; refund the extra`,
    );
  const sub = paying[0] ?? subs[0];
  const userId = sub?.metadata.user_id;
  if (!sub || !userId) return null;

  // A cancel from the Portal may set `cancel_at` rather than the flag; either
  // way the paid tier ends then.
  const item = sub.items.data[0];
  const ends = sub.cancel_at ?? item?.current_period_end;
  if (!ends) throw new Error(`Subscription ${sub.id} has no period end`);

  const { error } = await serviceClient()
    .from('subscriptions')
    .upsert(
      {
        user_id: userId,
        stripe_customer_id: customerId,
        stripe_subscription_id: sub.id,
        status: statusOf(sub.status),
        current_period_end: new Date(ends * 1000).toISOString(),
        cancel_at_period_end: sub.cancel_at_period_end || sub.cancel_at != null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    );
  // The account was deleted after Stripe sent this: nothing left to mirror.
  if (error?.code === PG.FOREIGN_KEY_VIOLATION) return null;
  if (error) throw error;
  return userId;
}

/** Stripe may add a status; an unknown one fails loudly so Stripe retries. */
function statusOf(status: string): SubscriptionStatus {
  if ((SUBSCRIPTION_STATUSES as readonly string[]).includes(status))
    return status as SubscriptionStatus;
  throw new Error(`Unknown Stripe subscription status: ${status}`);
}
