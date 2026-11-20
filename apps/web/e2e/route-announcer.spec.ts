import { test, expect } from '@playwright/test';
import { signIn } from './mailpit';

test('a section switch never announces the section left behind', async ({
  page,
}) => {
  await signIn(page);
  const rail = page.getByRole('navigation', { name: 'Sections' });
  const announcer = page.locator('#__next-route-announcer__');

  for (const name of ['Invoices', 'Clients', 'Settings']) {
    await rail.getByRole('link', { name, exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
    await expect(announcer).toHaveText('');
  }
});
