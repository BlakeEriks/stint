'use client';

import { formatCurrency } from '@stint/core';
import { useCountUp } from '@/lib/client/use-count-up';

/**
 * An amount that travels to its new value rather than cutting to it.
 *
 * Every money figure the home panel derives from time entries uses this, so
 * one edit moves the whole panel at one speed: a figure that snaps beside one
 * that travels reads as the stale one.
 *
 * An INVOICE's own total does not use it — a figure that tweens implies the
 * app is recalculating money the user has already sent. A home-panel
 * aggregate that a payment moves does travel, which
 * `docs/design/screens/home.html` specifies: it rolls on arrival and on a
 * value that actually changed, never on a remount holding the same figures.
 *
 * `className` carries the type role and colour, because those differ by where
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
  return (
    <span className={className}>
      {sign ? '+' : ''}
      {formatCurrency(value, currency)}
    </span>
  );
}
