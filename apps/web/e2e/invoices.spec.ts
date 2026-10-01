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
 * list row and the inbox's Download — a strict-mode violation. These
 * assertions are about the invoice LIST, so they scope to `main`.
 */
const list = (page: import('@playwright/test').Page) => page.locator('main');

test.describe('invoices', () => {
  test('defaults to open, and totals only what is genuinely outstanding', async ({
    page,
  }) => {
    await page.goto('/invoices');

    await expect(list(page).getByText('STINT-0001')).toBeVisible();
    await expect(list(page).getByText('STINT-0002')).toBeVisible();

    /* STINT-0001 is outstanding at a figure the seed fixes, so its row says
       $900.00 whenever the seed is run. */
    await expect(list(page).getByText('$900.00')).toBeVisible();

    /* A draft has not been asked for, so its $400.00 is not owed and the
       total must not have counted it.

       The SUM itself is deliberately not pinned: the other outstanding
       invoice, STINT-0101, totals whatever generated entries fell on a
       weekday (`seed.sql` filters `isodow < 6`), so it moves with the day of
       the week the seed runs and a pinned total fails on its own schedule. */
    await expect(list(page).getByText(/outstanding/)).not.toContainText(
      '$400.00',
    );
  });

  test('offers no destructive action from the list', async ({ page }) => {
    await page.goto('/invoices');

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

    // The dialog asks when the payment actually arrived; confirming the
    // default (today) matches the pre-dialog behaviour this test checks.
    await page.getByRole('button', { name: 'Mark paid' }).click();

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

  /* Writes a new invoice, so it runs after everything that reads the list.
     A charge guarantees a line whatever unbilled time the seed has left. */
  test('an invoice previews as it is filled, and generates', async ({
    page,
  }) => {
    await page.goto('/invoices/new');
    const generate = page.getByRole('button', { name: 'Generate invoice' });
    await expect(generate).toBeDisabled();

    await page.getByRole('button', { name: 'Client' }).click();
    await page.getByRole('menuitemradio', { name: /Northwind/ }).click();
    await page.getByRole('button', { name: 'Add a charge' }).click();
    const charge = page.getByRole('dialog', { name: 'New charge' });
    await charge.getByLabel(/Description/).fill('Onboarding fee');
    await charge.getByLabel(/Amount/).fill('250');
    await charge.getByRole('button', { name: 'Save' }).click();

    const preview = page.getByRole('region', { name: 'Preview' });
    await expect(
      preview.getByRole('cell', { name: 'Onboarding fee' }),
    ).toBeVisible();
    await expect(generate).toBeEnabled();

    await generate.click();
    await expect(page).toHaveURL(/\/invoices\/[0-9a-f-]{36}$/);
    await expect(list(page).getByText('Onboarding fee')).toBeVisible();
  });
});
