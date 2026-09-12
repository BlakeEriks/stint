import { expect, type Page } from '@playwright/test';

const MAILPIT = process.env.E2E_MAILPIT_URL ?? 'http://127.0.0.1:54324';

/** The seeded user, the only one with clients, projects and entries. */
export const SEED_EMAIL = 'dev@localhost.test';

interface Message {
  ID: string;
  Created: string;
}

/** Drop every captured email, so "the newest" is unambiguous. */
export async function clearInbox(): Promise<void> {
  const res = await fetch(`${MAILPIT}/api/v1/messages`, { method: 'DELETE' });
  if (!res.ok) {
    throw new Error(
      `Could not clear Mailpit (${res.status}). Is the local stack up? \`pnpm dev:up\``,
    );
  }
}

/**
 * The sign-in link from the newest captured email.
 *
 * Reads the TEXT part deliberately. The HTML `href` escapes its separators as
 * `&amp;`, and following that string literally makes GoTrue read `amp;type`
 * instead of `type` — a `400 Verify requires a verification type` that looks
 * exactly like an expired link. A browser decodes the entity on click; a test
 * driving the URL directly does not.
 */
export async function magicLink(after: number): Promise<string> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const res = await fetch(`${MAILPIT}/api/v1/messages?limit=10`);
    const { messages = [] } = (await res.json()) as { messages?: Message[] };

    // Only mail that arrived after the request, or a stale token from a
    // previous test would be followed and fail confusingly.
    const fresh = messages.filter((m) => Date.parse(m.Created) >= after);
    for (const message of fresh) {
      const full = await fetch(`${MAILPIT}/api/v1/message/${message.ID}`);
      const body = (await full.json()) as { Text?: string; HTML?: string };
      const link = (body.Text ?? '').match(/http:\/\/\S*verify\S*/)?.[0];
      if (link) return link;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('No sign-in email arrived within 10s.');
}

/**
 * Submit the form, waiting out GoTrue's per-user send interval.
 *
 * `auth.email.max_frequency` is `1s` — already its minimum, so this is a real
 * constraint rather than a misconfiguration, and two sign-ins inside the same
 * second collide. The app surfaces the refusal correctly ("you can only
 * request this after 0 seconds"); a test that ploughs on regardless would be
 * testing the rate limiter.
 */
export async function requestLink(page: Page): Promise<void> {
  const button = page.getByRole('button', { name: /Email me a sign-in link/ });
  const sent = page.getByText('Check your email.');
  /* Scoped to the form. The page carries an empty `alert` node in dev (Next's
     dev tools), so a bare getByRole('alert') matches something that is always
     present and never resolves either way. */
  const refused = page.locator('form [role="alert"]');

  for (let attempt = 0; attempt < 5; attempt++) {
    await button.click();
    await expect(sent.or(refused)).toBeVisible();
    // Success replaces the form, so the button is gone — never loop past
    // this point or the next click waits forever for an absent element.
    if (await sent.isVisible()) return;
    await page.waitForTimeout(1100);
  }
  throw new Error('Sign-in email was refused five times in a row.');
}

/**
 * Sign in the way a person does: the form, the inbox, the link.
 *
 * Not a cookie injected into the context. The bug that cost an afternoon
 * lived in the PKCE exchange between the form and the callback, and a test
 * that skips the form skips exactly the thing worth covering.
 */
export async function signIn(page: Page, email = SEED_EMAIL): Promise<void> {
  await clearInbox();
  const requestedAt = Date.now();

  await page.goto('/signin');
  await page.getByLabel('Email').fill(email);
  await requestLink(page);

  await page.goto(await magicLink(requestedAt));
  await page.waitForURL('**/');
  // The rail only renders for a signed-in user, so this is the session
  // existing rather than a URL that merely looks right.
  await expect(
    page.getByRole('navigation', { name: 'Sections' }),
  ).toBeVisible();
}

/**
 * Restore the seed.
 *
 * A test that marks an invoice paid changes the data the NEXT run starts
 * from, so without this the suite passes once and then fails — the precise
 * flakiness that gets a suite ignored. Resetting is the cheap way to make
 * every run start from the state the assertions describe.
 *
 * It runs `supabase db reset`, which also invalidates any session, so it must
 * happen BEFORE signing in.
 */
export async function resetSeed(): Promise<void> {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const { resolve } = await import('node:path');
  // Playwright loads these as CommonJS, so `import.meta` is unavailable.
  // The config sets testDir to apps/web/e2e; the stack lives at the root.
  await promisify(execFile)('npx', ['supabase', 'db', 'reset'], {
    cwd: resolve(process.cwd(), '../..'),
    timeout: 120_000,
  });
}
