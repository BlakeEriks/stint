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
