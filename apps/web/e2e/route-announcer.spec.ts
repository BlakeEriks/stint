import { test, expect } from '@playwright/test';
import { signIn } from './mailpit';

/* The router keeps a section it leaves mounted but hidden, and Next's route
   announcer reads the page's first h1 whenever the title is empty. Every
   section shares one title, so a switch announces nothing. */
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
