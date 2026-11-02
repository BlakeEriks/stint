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
  ...props
}: Omit<React.ComponentProps<'input'>, 'type'> & {
  unit?: string;
  large?: boolean;
}) {
  return (
    <UnitInput
      prefix="$"
      unit={unit}
      type="number"
      min="0"
      step="0.01"
      inputMode="decimal"
      {...props}
    />
  );
}

/** A number with its unit printed inside the field, after it. */
export function UnitInput({
  unit,
  prefix,
  large = false,
  className = '',
  ...props
}: React.ComponentProps<'input'> & {
  unit: string;
  prefix?: string;
  large?: boolean;
}) {
  const inset = large ? 'left-3.5' : 'left-2.5';
  return (
    <div className={`relative ${className}`}>
      {prefix ? (
        <span
          aria-hidden
          className={`pointer-events-none absolute top-1/2 -translate-y-1/2 type-amount text-subtle ${inset}`}
        >
          {prefix}
        </span>
      ) : null}
      <Input
        className={`type-amount text-strong placeholder:text-placeholder ${
          large ? 'h-12 pr-16' : 'pr-14'
        } ${prefix ? (large ? 'pl-8' : 'pl-6') : ''}`}
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
 * rate `isValidRate` rejects before any request, so the server never sees one.
 */
export function parseRate(text: string): number | null {
  return text.trim() === '' ? null : Number(text);
}

/** Zero or more, in whole cents: what the server's `money` accepts. The
    tolerance absorbs float error, as in 1.15 * 100. */
export const isValidRate = (rate: number | null): rate is number =>
  rate !== null &&
  Number.isFinite(rate) &&
  rate >= 0 &&
  Math.abs(rate * 100 - Math.round(rate * 100)) < 1e-6;

/** For `useMissing`: an optional rate field's message, if what's typed
    isn't blank or a valid rate. */
export const missingRate = (text: string) => {
  const rate = parseRate(text);
  return rate === null || isValidRate(rate)
    ? undefined
    : 'Enter a rate of zero or more, to the cent, or leave it blank.';
};
