import { test, expect } from '@playwright/test';
import {
  signIn,
  clearInbox,
  magicLink,
  requestLink,
  SEED_EMAIL,
} from './mailpit';

/** Sign-in and sign-out, in a real browser. */
test.describe('authentication', () => {
  test('signs in through the emailed link', async ({ page }) => {
    await signIn(page);
    // The account menu carries the signed-in address, so this is the right
    // user rather than merely a session.
    await expect(page.getByText(SEED_EMAIL)).toBeVisible();
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

  test('a signed-in visitor to /signin is sent home', async ({ page }) => {
    await signIn(page);

    /* Rendering the form to a signed-in user lets two sign-ins compete for one
       PKCE verifier, which makes valid magic links read as invalid. */
    await page.goto('/signin');
    await page.waitForURL('**/');
    await expect(
      page.getByRole('navigation', { name: 'Sections' }),
    ).toBeVisible();
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
});
