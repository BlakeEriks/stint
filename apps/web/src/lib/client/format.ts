/**
 * Money and dates, formatted once.
 *
 * `money` takes a currency because the data does: a client, an invoice and a
 * stats rollup each carry their own. Four components had grown a private
 * `usd` formatter that hardcoded USD, so the same client's rate rendered in
 * dollars on `/clients` and correctly on its invoice. The default keeps the
 * US-first posture without making the argument impossible to pass.
 */
export function money(amount: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(
    amount,
  );
}
