import { test, expect } from '@playwright/test';
import { signIn } from './mailpit';

/**
 * A screen fails; the app does not — and the running timer keeps counting.
 *
 * Where the boundary renders belongs to Next's routing rather than the
 * component, so jsdom cannot check it; `test/ui/error-boundary.test.tsx`
 * covers what the boundary renders.
 */
test.beforeEach(async ({ page }) => {
  await signIn(page);
});

test('a failed screen keeps the frame, and the timer inside it', async ({
  page,
}) => {
  // Start a timer, so there is something running to lose.
  await page.getByPlaceholder('What are you working on?').fill('Boundary test');
  await page.getByRole('button', { name: 'Start timer' }).click();
  await expect(page.getByRole('button', { name: 'Stop timer' })).toBeVisible();

  await page.goto('/throw');

  // The boundary rendered.
  await expect(page.getByText(/didn't load/i)).toBeVisible();

  /* And the frame did NOT go with it. The rail is the cheapest proof that
     the layout is still mounted, and the stop button proves the timer
     component specifically survived — which is the whole reason the boundary
     is nested inside `(app)` rather than at the root. */
  await expect(
    page.getByRole('navigation', { name: 'Sections' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Stop timer' })).toBeVisible();

  // Clean up: the timer must not outlive the test.
  await page.getByRole('button', { name: 'Stop timer' }).click();
  await expect(page.getByRole('button', { name: 'Start timer' })).toBeVisible();
});

test('the boundary offers a way out that is not a dead end', async ({
  page,
}) => {
  await page.goto('/throw');
  await expect(page.getByText(/didn't load/i)).toBeVisible();

  /* "Try again" cannot recover /throw — it throws every time, by design — so
     the test that matters here is the OTHER exit. A boundary whose only
     action re-runs the thing that just failed is a trap. */
  await page.getByRole('link', { name: /go home/i }).click();

  await page.waitForURL('**/');
  await expect(page.getByText(/didn't load/i)).toHaveCount(0);
});
