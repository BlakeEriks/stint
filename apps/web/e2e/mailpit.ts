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
 * `auth.email.max_frequency` is `1s` and already its minimum, so two sign-ins
 * inside the same second collide with "you can only request this after 0
 * seconds" — a test that ploughs on regardless tests the rate limiter.
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
 * Not a cookie injected into the context: the PKCE exchange between the form
 * and the callback is the thing worth covering, and a test that skips the form
 * skips it.
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
 * **Skipped when the data is already pristine**, which in CI it usually is.
 *
 * The check is on the DATA, never on `process.env.CI`: that assumes "CI
 * implies fresh database", which is silently false the moment a stack is
 * reused (a self-hosted runner, a matrix sharing services).
 */

/**
 * Does the database still hold what `seed.sql` put there?
 *
 * Only the invoices the suite WRITES to, never the seed's whole shape.
 * Counting every invoice made this return false the moment the seed grew a
 * year of history — 11 rows where it expected 2 — so the reset ran on every
 * CI job, which is the one case it exists to skip.
 *
 * Reads over `pg` rather than PostgREST: the seeded rows are behind RLS, so an
 * anonymous REST read is a 42501 rather than an answer.
 *
 * A failure to connect returns `false` — pay the reset and let it produce the
 * real error. This must never be the thing that decides a run is fine.
 */
async function seedIsPristine(): Promise<boolean> {
  const { Client } = await import('pg');
  const client = new Client({
    connectionString:
      process.env.E2E_DATABASE_URL ??
      'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
  });
  try {
    await client.connect();
    const { rows } = await client.query(
      `select invoice_number, status from invoices
        where invoice_number in ('STINT-0001', 'STINT-0002', 'STINT-0101')
        order by invoice_number`,
    );
    return (
      rows.length === 3 &&
      rows[0].invoice_number === 'STINT-0001' &&
      rows[0].status === 'sent' &&
      rows[1].invoice_number === 'STINT-0002' &&
      rows[1].status === 'draft' &&
      /* The history's newest invoice, and the only other one still `sent`.
         The suite marks invoices paid, so a run that left this one paid is a
         dirty seed the first two rows alone cannot see. */
      rows[2].invoice_number === 'STINT-0101' &&
      rows[2].status === 'sent'
    );
  } catch {
    return false;
  } finally {
    await client.end().catch(() => {});
  }
}

export async function resetSeed(): Promise<void> {
  if (await seedIsPristine()) return;

  const { readFile } = await import('node:fs/promises');
  const { resolve } = await import('node:path');
  const { Client } = await import('pg');

  /* Restores the SEEDED ACCOUNT, not the database. The suite only ever writes
   * as the seeded user, and `supabase db reset` would take every other account
   * on the stack with it — including one tracking real time against local dev.
   * Deleting that user's rows and replaying `seed.sql` is equivalent here, and
   * faster than rebuilding from migrations.
   *
   * Playwright loads these as CommonJS, so `import.meta` is unavailable; the
   * config sets testDir to apps/web/e2e and the stack lives at the root. */
  const here = resolve(process.cwd(), 'e2e');
  const root = resolve(process.cwd(), '../..');

  const client = new Client({
    connectionString:
      process.env.E2E_DATABASE_URL ??
      'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
  });
  await client.connect();
  try {
    await client.query(await readFile(resolve(here, 'reset-seed.sql'), 'utf8'));
    await client.query(
      await readFile(resolve(root, 'supabase/seed.sql'), 'utf8'),
    );
  } finally {
    await client.end().catch(() => {});
  }
}
