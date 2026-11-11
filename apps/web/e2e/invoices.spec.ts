import { test, expect } from '@playwright/test';
import { signIn, resetSeed } from './mailpit';

/**
 * The invoice lifecycle, in a real browser: what each screen offers in each
 * status is the stories' and `test/ui`'s, so this file keeps only the writes
 * that must survive a reload.
 *
 * Both tests write, so `resetSeed` runs once for the file: `db reset` takes
 * seconds. It skips when the data is already pristine, as on every CI job's
 * fresh stack.
 */
test.beforeAll(async () => {
  await resetSeed();
});

test.beforeEach(async ({ page }) => {
  await signIn(page);
});

/* The page's own content: the dock's Inbox links invoices by number on
   every route, so an unscoped query matches twice. */
const list = (page: import('@playwright/test').Page) => page.locator('main');

test.describe('invoices', () => {
  test('marking a sent invoice paid sticks across a reload', async ({
    page,
  }) => {
    await page.goto('/invoices');

    /* Each control names its invoice — a list of identical "Mark paid"
       buttons is unusable with a screen reader, and clicking the wrong one
       misstates which client has paid. */
    await list(page)
      .getByRole('button', { name: 'Mark paid, STINT-0001' })
      .click();

    // The dialog asks when the payment actually arrived; confirming the
    // default (today) matches the pre-dialog behaviour this test checks.
    const written = page.waitForResponse(
      (r) =>
        r.request().method() === 'PATCH' &&
        /\/api\/v1\/invoices\/[^/]+\/status$/.test(r.url()),
    );
    await page.getByRole('button', { name: 'Mark paid', exact: true }).click();

    // The row leaves the open filter because the fact changed, not because
    // the UI hid it.
    await expect(list(page).getByText('STINT-0001')).toBeHidden();

    // The row hides optimistically, so a reload before the write lands
    // would read the invoice still open.
    expect((await written).ok()).toBe(true);
    await page.reload();
    await expect(list(page).getByText('STINT-0001')).toBeHidden();
    await expect(list(page).getByText('$900.00 outstanding')).toBeHidden();

    // And it is genuinely there, under the paid filter rather than gone.
    await list(page).getByRole('link', { name: 'All' }).click();
    await expect(list(page).getByText('STINT-0001')).toBeVisible();
  });

  // A charge guarantees a line whatever unbilled time the seed has left.
  test('an invoice previews as it is filled, and generates', async ({
    page,
  }) => {
    await page.goto('/invoices/new');
    const generate = page.getByRole('button', { name: 'Generate invoice' });
    await expect(generate).toBeDisabled();

    await page.getByRole('button', { name: 'Client', exact: true }).click();
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
