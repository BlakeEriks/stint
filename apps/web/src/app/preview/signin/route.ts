import {
  createServerClient,
  parseCookieHeader,
  serializeCookieHeader,
} from '@supabase/ssr';
import { PREVIEW_PASSWORD, previewAccount, samePath } from '@/lib/preview';

/**
 * `/preview/signin?pr=24&next=/invoices` — signs in as PR 24's seeded
 * account and lands on `next`. A PR's "Try it" link, so reviewing a preview
 * takes one click rather than a magic link.
 *
 * 404 everywhere but a Vercel preview deployment (`lib/preview.ts`).
 *
 * Cookies go on this response rather than through `cookieClient()`, so the
 * session and the redirect that needs it leave together.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const email = previewAccount(
    url.searchParams.get('pr'),
    process.env.VERCEL_ENV,
  );
  if (!email) return new Response('Not found', { status: 404 });

  const res = new Response(null, {
    status: 303,
    headers: {
      location: new URL(
        samePath(url.searchParams.get('next'), url.origin),
        url.origin,
      ).href,
    },
  });

  const db = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '',
    {
      cookies: {
        getAll: () => parseCookieHeader(req.headers.get('cookie') ?? ''),
        setAll: (list) => {
          for (const { name, value, options } of list)
            res.headers.append(
              'set-cookie',
              serializeCookieHeader(name, value, options),
            );
        },
      },
    },
  );

  const { error } = await db.auth.signInWithPassword({
    email,
    password: PREVIEW_PASSWORD,
  });
  if (error) {
    return new Response(
      `Could not sign in as ${email}: ${error.message}\n\nRe-run this PR's preview-db check, which seeds the account.`,
      { status: 502 },
    );
  }
  return res;
}
