'use client';

import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useOptimisticMutation, keys } from '@stint/client';
import { Button } from '@/components/ui/button';
import { Section } from './field';
import { api, type Billing } from '@/lib/client/api';

/* `docs/positioning.md` owns the price; the Stripe price Checkout charges
   must say the same. */
export const PRICE = '$40 a year';

const longDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

/**
 * The paid tier: what the user is on, and the one way to change it.
 *
 * Paying, canceling and card changes all happen on Stripe's own pages; this
 * section only opens them. Both opens are pending presses — the server
 * decides the URL — and stay pending while the browser leaves. Back from
 * Checkout (`?checkout=`), it confirms with Stripe directly rather than wait
 * on the webhook. Not rendered until billing is configured.
 */
export function PlanSection() {
  const router = useRouter();
  const sessionId = useSearchParams().get('checkout');
  const { data } = useQuery({ queryKey: keys.billing(), queryFn: api.billing });

  const leaveFor = (open: () => Promise<{ url: string }>, what: string) => () =>
    open()
      .then(({ url }) => window.location.assign(url))
      .catch((e: Error) => {
        throw new Error(`Couldn’t open ${what}. ${e.message}`);
      });

  const subscribe = useOptimisticMutation({
    queryKey: () => keys.billing(),
    mutationFn: leaveFor(api.checkout, 'checkout'),
  });
  const manage = useOptimisticMutation({
    queryKey: () => keys.billing(),
    mutationFn: leaveFor(api.billingPortal, 'billing'),
  });
  const confirm = useOptimisticMutation({
    queryKey: () => keys.billing(),
    mutationFn: (id: string) =>
      api.syncCheckout(id).catch((e: Error) => {
        throw new Error(`Couldn’t confirm your payment yet. ${e.message}`);
      }),
    // Drop `?checkout=` either way, so a reload doesn't confirm again.
    onSettled: () => router.replace('/settings'),
  });

  // Once per return, however often this renders.
  const confirmed = useRef<string | null>(null);
  useEffect(() => {
    if (!sessionId || confirmed.current === sessionId) return;
    confirmed.current = sessionId;
    confirm.mutate(sessionId);
  }, [sessionId, confirm]);

  // Before the plan is known: the press cancels the plan's first read, and
  // only a Checkout return carries `?checkout=`, so billing is set up.
  if (confirm.isPending)
    return (
      <Section id="plan" title="Plan">
        <p
          role="status"
          className="flex items-center gap-2 type-support text-muted"
        >
          <Loader2 className="size-4 animate-spin" aria-hidden />
          Confirming your payment…
        </p>
      </Section>
    );

  if (!data?.available) return null;

  const leaving =
    subscribe.isPending ||
    subscribe.isSuccess ||
    manage.isPending ||
    manage.isSuccess;

  if (data.plan === 'free')
    return (
      <Section
        id="plan"
        title="Plan"
        description={`Free. Tracking and your records, exporting them included, stay free. Paid adds invoice downloads, for ${PRICE}.`}
      >
        <div>
          <Button disabled={leaving} onClick={() => subscribe.mutate()}>
            {subscribe.isPending || subscribe.isSuccess ? (
              <>
                <Loader2 className="animate-spin" aria-hidden />
                Opening checkout…
              </>
            ) : (
              'Subscribe'
            )}
          </Button>
        </div>
      </Section>
    );

  return (
    <Section id="plan" title="Plan" description={paidLine(data)}>
      <div>
        <Button disabled={leaving} onClick={() => manage.mutate()}>
          {manage.isPending || manage.isSuccess ? (
            <>
              <Loader2 className="animate-spin" aria-hidden />
              Opening billing…
            </>
          ) : data.paymentFailed ? (
            'Update card'
          ) : (
            'Manage billing'
          )}
        </Button>
      </div>
    </Section>
  );
}

function paidLine(b: Billing): string {
  const end = b.periodEnd ? longDate(b.periodEnd) : null;
  if (b.paymentFailed)
    return 'Paid. Your last payment failed, and Stripe will retry it. Update your card to keep invoice downloads.';
  if (b.cancelAtPeriodEnd) return `Paid until ${end}. It won’t renew.`;
  return `Paid. Renews on ${end} at ${PRICE}.`;
}
