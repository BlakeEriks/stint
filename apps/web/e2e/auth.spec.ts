import { execSync } from 'node:child_process';
import { test, expect } from '@playwright/test';
import {
  signIn,
  clearInbox,
  magicLink,
  requestLink,
  SEED_EMAIL,
} from './mailpit';

const AUTH = 'http://localhost:54321/auth/v1';

/* The admin API takes the service-role key, which nothing on disk holds:
   read it from the running stack, as CI's setup step reads the public key. */
function serviceHeaders(): Record<string, string> {
  const key = JSON.parse(
    execSync('npx supabase status -o json', { cwd: '../..' }).toString(),
  ).SERVICE_ROLE_KEY;
  return { apikey: key, Authorization: `Bearer ${key}` };
}

/** Sign-in and sign-out, in a real browser. */
test.describe('authentication', () => {
  test('signs in through the emailed link, and /signin then sends home', async ({
    page,
  }) => {
    await signIn(page);
    // The account menu carries the signed-in address, so this is the right
    // user rather than merely a session.
    await expect(page.getByText(SEED_EMAIL)).toBeVisible();

    /* Rendering the form to a signed-in user lets two sign-ins compete for one
       PKCE verifier, which makes valid magic links read as invalid. */
    await page.goto('/signin');
    await page.waitForURL('**/');
    await expect(
      page.getByRole('navigation', { name: 'Sections' }),
    ).toBeVisible();
  });

  test('a new address signs up through the same form', async ({ page }) => {
    const email = `signup-${Date.now()}@localhost.test`;
    const headers = serviceHeaders();
    try {
      await signIn(page, email);
      await expect(page.getByText(email)).toBeVisible();
    } finally {
      const { users = [] } = await fetch(
        `${AUTH}/admin/users?filter=${encodeURIComponent(email)}`,
        { headers },
      ).then((r) => r.json());
      for (const u of users as { id: string }[])
        await fetch(`${AUTH}/admin/users/${u.id}`, {
          method: 'DELETE',
          headers,
        });
    }
  });

  test('signing out clears the session, and Back does not reveal the app', async ({
    page,
  }) => {
    await signIn(page);

    /* Driven by the KEYBOARD: the dropdown animates open, and on a slower
       runner a click on the item times out as "not stable". */
    await page.getByRole('button', { name: /Account/ }).click();
    const signOut = page.getByRole('menuitem', { name: 'Sign out' });
    await expect(signOut).toBeVisible();
    await signOut.focus();
    await page.keyboard.press('Enter');
    await page.waitForURL('**/signin');

    await page.goBack();
    await expect(
      page.getByRole('navigation', { name: 'Sections' }),
    ).toBeHidden();
  });

  test('a second sign-in request supersedes the first link', async ({
    page,
  }) => {
    await clearInbox();

    // Two requests in a row, as happens when the first email is slow.
    const first = Date.now();
    await page.goto('/signin');
    await page.getByLabel('Email').fill(SEED_EMAIL);
    await requestLink(page);
    const firstLink = await magicLink(first);

    const second = Date.now();
    await page.goto('/signin');
    await page.getByLabel('Email').fill(SEED_EMAIL);
    await requestLink(page);
    const secondLink = await magicLink(second);
    expect(secondLink).not.toBe(firstLink);

    /* The superseded link must FAIL VISIBLY rather than silently landing on a
       signed-out app: the callback redirects with a reason and the page says
       what to do next.

       Scoped to `main`: Next renders an always-present empty route-announcer
       with role=alert, so an unscoped query is ambiguous. */
    await page.goto(firstLink);
    await expect(page.locator('main [role="alert"]')).toContainText(
      /Request a new one/,
    );

    // And the current link still works, so the failure was the stale one.
    await page.goto(secondLink);
    await page.waitForURL('**/');
    await expect(
      page.getByRole('navigation', { name: 'Sections' }),
    ).toBeVisible();
  });

  test('an unauthenticated visitor is sent to sign in', async ({ page }) => {
    await page.goto('/clients');
    await page.waitForURL('**/signin');
    await expect(
      page.getByRole('button', { name: /Email me a sign-in link/ }),
    ).toBeVisible();
  });

  /* A bookmark to /projects lands on Clients, filter and all. Checked before
     sign-in: the redirect runs ahead of it. */
  test('the old projects address redirects to clients', async ({ page }) => {
    for (const [from, to] of [
      ['/projects', '/clients'],
      ['/projects?status=all', '/clients?status=all'],
    ] as const) {
      const res = await page.request.get(from, { maxRedirects: 0 });
      expect(res.status()).toBe(308);
      expect(res.headers().location).toBe(to);
    }
  });
});
