import { test, expect } from '@playwright/test';
import { signIn, resetSeed } from './mailpit';

/**
 * The invoice lifecycle, in a real browser.
 *
 * The other flow whose breakage is silent and expensive: an invoice that
 * cannot be marked paid, or a status that does not stick, is wrong about
 * money and says nothing about being wrong.
 *
 * These act on the SEEDED invoices (STINT-0001 sent, STINT-0002 draft) and
 * change their status, so `pnpm dev:reset` restores the starting state.
 */
/* Once for the file, not per test: `db reset` takes seconds, and only the
   mark-paid test writes. Ordering within the file is therefore significant —
   the mutating test is last.

   `resetSeed` now skips when the data is already pristine, which on a fresh
   stack (every CI job) means it does nothing at all. It still fires the
   moment this file has dirtied the database, so a repeated local run is
   unchanged. */
test.beforeAll(async () => {
  await resetSeed();
});

test.beforeEach(async ({ page }) => {
  await signIn(page);
});

/**
 * The page's own content, excluding the frame.
 *
 * The dock's Inbox is present on every route and links to invoices by number,
 * so an unscoped `getByRole('link', { name: /STINT-0002/ })` matches both the
 * list row and the inbox's Download — a strict-mode violation that failed CI
 * the moment the dock stopped being Home-only.
 *
 * That is the test working: these assertions are about the invoice LIST, and
 * a query that reaches the whole frame was never saying so. Scoping to `main`
 * is what they always meant.
 */
const list = (page: import('@playwright/test').Page) => page.locator('main');

test.describe('invoices', () => {
  test('defaults to open, and totals only what is genuinely outstanding', async ({
    page,
  }) => {
    await page.goto('/invoices');

    /* A draft has not been asked for and a paid one has arrived, so neither
       is outstanding. Only `sent` counts — $900.00 of the seed's $1,300.00
       across both open invoices. */
    await expect(list(page).getByText('STINT-0001')).toBeVisible();
    await expect(list(page).getByText('STINT-0002')).toBeVisible();
    await expect(list(page).getByText('$900.00 outstanding')).toBeVisible();
  });

  test('offers no destructive action from the list', async ({ page }) => {
    await page.goto('/invoices');

    /* Voiding stays on the invoice itself, where the whole document is in
       view. A stray click in a list must not destroy a financial record. */
    for (const forbidden of [/void/i, /delete/i]) {
      await expect(
        list(page).getByRole('button', { name: forbidden }),
      ).toHaveCount(0);
    }
  });

  test('a draft is deleted and an issued invoice is voided, never both', async ({
    page,
  }) => {
    await page.goto('/invoices');
    await list(page)
      .getByRole('link', { name: /STINT-0002/ })
      .click();
    await page.waitForURL(/\/invoices\/[0-9a-f-]+$/);

    /* A draft holds no number yet, so deleting it costs nothing. Once issued
       the number is on record and only voiding is offered — that is what
       keeps numbering gapless. The UI shows one and never the other. */
    await expect(page.getByRole('button', { name: /Delete/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Void/ })).toHaveCount(0);
  });

  test('download is offered in every status, since no email is sent', async ({
    page,
  }) => {
    await page.goto('/invoices');
    await list(page)
      .getByRole('link', { name: /STINT-0002/ })
      .click();
    await page.waitForURL(/\/invoices\/[0-9a-f-]+$/);

    // With no mail, the download IS how an invoice reaches a client.
    await expect(
      list(page)
        .getByRole('link', { name: /Download/ })
        .or(list(page).getByRole('button', { name: /Download/ })),
    ).toBeVisible();
  });

  test('marking a sent invoice paid sticks across a reload', async ({
    page,
  }) => {
    await page.goto('/invoices');

    /* Each control names its invoice — a list of identical "Mark paid"
       buttons is unusable with a screen reader, and clicking the wrong one
       misstates which client has paid. */
    await list(page)
      .getByRole('button', { name: 'Mark STINT-0001 paid' })
      .click();

    // The row leaves the open filter because the fact changed, not because
    // the UI hid it.
    await expect(list(page).getByText('STINT-0001')).toBeHidden();

    await page.reload();
    await expect(list(page).getByText('STINT-0001')).toBeHidden();
    await expect(list(page).getByText('$900.00 outstanding')).toBeHidden();

    // And it is genuinely there, under the paid filter rather than gone.
    await list(page).getByRole('link', { name: 'All' }).click();
    await expect(list(page).getByText('STINT-0001')).toBeVisible();
  });
});
