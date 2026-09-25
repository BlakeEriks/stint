/**
 * `/preview/signin`, against a real Auth server: the link a PR's "Try it"
 * section opens, so a reviewer lands signed in as that PR's seeded account.
 *
 * Needs the same three variables as `auth.test.ts`; `pnpm test:auth` runs both.
 */
import { test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';

const url = process.env.SUPABASE_URL;
const publishable = process.env.SUPABASE_PUBLISHABLE_KEY;
const secret = process.env.SUPABASE_SECRET_KEY;

if (!url || !publishable || !secret) {
  throw new Error(
    'The preview sign-in test needs a running Auth server. Run `pnpm test:auth`.',
  );
}

process.env.NEXT_PUBLIC_SUPABASE_URL = url;
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = publishable;

const PR = '990001';
const EMAIL = `pr-${PR}@preview.test`;

let GET: typeof import('../src/app/preview/signin/route.ts').GET;
let PREVIEW_PASSWORD: string;
let userId: string;

const admin = (path: string, init: RequestInit = {}) =>
  fetch(`${url}/auth/v1${path}`, {
    ...init,
    headers: {
      apikey: secret,
      authorization: `Bearer ${secret}`,
      'content-type': 'application/json',
      ...(init.headers ?? {}),
    },
  });

const signIn = (query: string) =>
  GET(new Request(`https://stint-git-x.vercel.app/preview/signin?${query}`));

before(async () => {
  ({ GET } = await import('../src/app/preview/signin/route.ts'));
  ({ PREVIEW_PASSWORD } = await import('../src/lib/preview.ts'));

  const existing = await admin(
    `/admin/users?filter=${encodeURIComponent(EMAIL)}`,
  ).then((r) => r.json());
  for (const u of existing.users ?? []) {
    await admin(`/admin/users/${u.id}`, { method: 'DELETE' });
  }
  const created = await admin('/admin/users', {
    method: 'POST',
    body: JSON.stringify({
      email: EMAIL,
      password: PREVIEW_PASSWORD,
      email_confirm: true,
    }),
  }).then((r) => r.json());
  userId = created.id;
  assert.ok(
    userId,
    `could not create the test user: ${JSON.stringify(created)}`,
  );
});

after(async () => {
  if (userId) await admin(`/admin/users/${userId}`, { method: 'DELETE' });
});

afterEach(() => {
  delete process.env.VERCEL_ENV;
});

test('outside a Vercel preview, the route does not exist', async () => {
  for (const env of [undefined, 'production', 'development']) {
    if (env) process.env.VERCEL_ENV = env;
    else delete process.env.VERCEL_ENV;
    const res = await signIn(`pr=${PR}`);
    assert.equal(res.status, 404, `VERCEL_ENV=${env}`);
    assert.equal(res.headers.get('set-cookie'), null);
  }
});

test("on a preview, it signs in as the PR's account and lands on next", async () => {
  process.env.VERCEL_ENV = 'preview';
  const res = await signIn(`pr=${PR}&next=/invoices?status=sent`);

  assert.equal(res.status, 303);
  assert.equal(
    res.headers.get('location'),
    'https://stint-git-x.vercel.app/invoices?status=sent',
  );
  const cookies = res.headers.getSetCookie();
  assert.ok(
    cookies.some((c) => /^sb-[^=]+-auth-token(\.\d+)?=/.test(c)),
    `no session cookie in ${JSON.stringify(cookies)}`,
  );
});

test('next never leaves the deployment', async () => {
  process.env.VERCEL_ENV = 'preview';
  for (const next of ['//evil.test/x', 'https://evil.test', '/\\evil.test']) {
    const res = await signIn(`pr=${PR}&next=${encodeURIComponent(next)}`);
    assert.equal(
      res.headers.get('location'),
      'https://stint-git-x.vercel.app/',
      next,
    );
  }
});

test('a PR that is not a number is not an account', async () => {
  process.env.VERCEL_ENV = 'preview';
  for (const pr of ['', 'abc', '1@evil.test', '1234567']) {
    const res = await signIn(`pr=${encodeURIComponent(pr)}`);
    assert.equal(res.status, 404, pr);
  }
});

test('an unseeded PR says to re-run the seed', async () => {
  process.env.VERCEL_ENV = 'preview';
  const res = await signIn('pr=990002');
  assert.equal(res.status, 502);
  assert.match(await res.text(), /preview-db/);
});
