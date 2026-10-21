'use client';

import { Input } from '@/components/ui/input';

/**
 * An hourly rate: the field with `$` before the number and the unit after,
 * so the figure reads as money per hour without a label saying so.
 *
 * `large` is the welcome dialog's one field, the only thing on its step.
 */
export function RateInput({
  unit = '/ hr',
  large = false,
  className = '',
  ...props
}: Omit<React.ComponentProps<'input'>, 'type'> & {
  unit?: string;
  large?: boolean;
}) {
  return (
    <div className={`relative ${className}`}>
      <span
        aria-hidden
        className={`pointer-events-none absolute top-1/2 -translate-y-1/2 type-amount text-subtle ${
          large ? 'left-3.5' : 'left-2.5'
        }`}
      >
        $
      </span>
      <Input
        type="number"
        min="0"
        step="0.01"
        inputMode="decimal"
        className={`type-amount text-strong placeholder:text-subtle ${
          large ? 'h-12 pr-16 pl-8' : 'pr-11 pl-6'
        }`}
        {...props}
      />
      <span
        aria-hidden
        className={`pointer-events-none absolute top-1/2 -translate-y-1/2 type-meta text-subtle ${
          large ? 'right-3.5' : 'right-2.5'
        }`}
      >
        {unit}
      </span>
    </div>
  );
}

/**
 * A rate as typed: null when blank, NaN when not a number. A form refuses a
 * negative or NaN rate before any request, so the server never sees one.
 */
export function parseRate(text: string): number | null {
  return text.trim() === '' ? null : Number(text);
}

export const isValidRate = (rate: number | null): rate is number =>
  rate !== null && Number.isFinite(rate) && rate >= 0;
