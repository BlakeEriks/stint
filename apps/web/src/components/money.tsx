'use client';

import { createContext, useContext } from 'react';
import { formatCurrency } from '@stint/core';
import { cn } from '@/lib/cn';
import { useCountUp } from '@/lib/client/use-count-up';

/**
 * True while a press is in flight that the figures on screen don't count yet.
 * Money depends on rate resolution, which the client never repeats, so it is
 * never predicted: it shows that it is about to change instead, until the
 * answer or its refetch lands (Constitution VI).
 */
export const Settling = createContext(false);

/**
 * How a settling figure looks: dimmed, with a slow pulse where motion is on.
 * Only on a figure with contrast to spare: the week's bar heads are already
 * `text-subtle`, and dimmed they fail AA.
 */
const SETTLING = 'motion-safe:animate-pulse motion-reduce:opacity-60';

/**
 * An amount that travels to its new value rather than cutting to it.
 *
 * Every money figure the home panel derives from time entries uses this, so
 * one edit moves the whole panel at one speed: a figure that snaps beside one
 * that travels reads as the stale one.
 *
 * An INVOICE's own total does not use it — a figure that tweens implies the
 * app is recalculating money the user has already sent. A home-panel
 * aggregate that a payment moves does travel: it rolls on arrival and on a
 * value that actually changed, never on a remount holding the same figures.
 *
 * `className` carries the type role and color, because those differ by where
 * the figure sits: a headline is `type-figure`, a row's amount is
 * `type-duration`, a legend's is `type-meta`.
 */
export function Money({
  figure,
  amount,
  currency,
  className,
  sign = false,
}: {
  /** What this figure IS, stable across mounts — `month-earned`, not its
   *  amount. Two figures holding the same number are still two figures, and
   *  the roll is remembered per name. */
  figure: string;
  amount: number;
  currency: string;
  className?: string;
  /** A delta leads with its sign; a standing total does not. */
  sign?: boolean;
}) {
  const { value } = useCountUp(figure, amount);
  const settling = useContext(Settling);
  return (
    <span
      className={cn(className, settling && SETTLING)}
      data-settling={settling || undefined}
    >
      {sign ? '+' : ''}
      {formatCurrency(value, currency)}
    </span>
  );
}
