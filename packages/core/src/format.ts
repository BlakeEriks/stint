/**
 * Money and quantities, formatted once.
 *
 * The preview a user approves and the PDF that issues must read identically —
 * `invoice.ts` exists so both are *built* by one function, and formatting is
 * the other half of that promise. A second formatter anywhere renders `US$`
 * against the preview's `$`.
 *
 * `narrowSymbol`: an invoice names its currency in its own right, so
 * `$1,200.00` is unambiguous on the page.
 */

/** `$1,200.00`. Currency is an argument because the data carries one. */
export function formatCurrency(
  amount: number | null,
  currency = 'USD',
): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency || 'USD',
    currencyDisplay: 'narrowSymbol',
  }).format(amount ?? 0);
}

/** `1.50` — a line item's billed hours, at the 2dp the amount was computed from. */
export function formatHours(hours: number): string {
  return hours.toFixed(2);
}

/**
 * One `Intl.DateTimeFormat` per zone rather than one per call — a grid paints
 * a clock for every entry on screen on every drag frame, and constructing the
 * formatter is the expensive part.
 */
const clocks = new Map<string, Intl.DateTimeFormat>();

/**
 * `2:05 PM` — a wall-clock time in the user's zone.
 *
 * US 12-hour everywhere: the dock's list and the grid beside it show the same
 * instants, so a second set of options renders `14:05` against `2:05 PM` in
 * two panels of one screen.
 */
export function formatLocalTime(at: Date | string, tz: string): string {
  let fmt = clocks.get(tz);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: tz,
    });
    clocks.set(tz, fmt);
  }
  return fmt.format(typeof at === 'string' ? new Date(at) : at);
}
