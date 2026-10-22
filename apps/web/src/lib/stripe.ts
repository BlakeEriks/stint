import Stripe from 'stripe';
import { ApiError } from './errors';

export interface BillingConfig {
  secretKey: string;
  priceId: string;
  webhookSecret: string;
}

/**
 * Stripe's settings, or null until all three are set. Null keeps billing
 * dark: every billing write answers 503 and Settings shows no Plan section.
 */
export function billingConfig(): BillingConfig | null {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  const priceId = process.env.STRIPE_PRICE_ID;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  return secretKey && priceId && webhookSecret
    ? { secretKey, priceId, webhookSecret }
    : null;
}

export function requireBillingConfig(): BillingConfig {
  const config = billingConfig();
  if (!config)
    throw new ApiError('BILLING_UNAVAILABLE', 'Billing is not set up yet');
  return config;
}

/**
 * The Stripe client. The route tests set `__TEST_STRIPE__` to an in-memory
 * fake (`test/fake-stripe.ts`), as they set `__TEST_DB__`, so the handlers
 * that run are the ones that ship and nothing reaches Stripe.
 */
export function stripe(): Stripe {
  const injected = (globalThis as { __TEST_STRIPE__?: Stripe }).__TEST_STRIPE__;
  return injected ?? new Stripe(requireBillingConfig().secretKey);
}
