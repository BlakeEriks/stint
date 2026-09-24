import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Two sites, one deployment, split by hostname.
 *
 *   runstint.com      -> the landing page
 *   app.runstint.com  -> the product
 *
 * Only `/` needs deciding. Every other path belongs to the app; a marketing
 * page that is not `/` adds its path to `MARKETING_PATHS` below.
 *
 * `rewrite`, not `redirect`: the visitor keeps the apex URL in the address
 * bar while `app/landing/page.tsx` renders, so the first impression costs no
 * extra round trip.
 *
 * `proxy.ts`, not `middleware.ts` — the middleware convention is deprecated
 * in Next 16 and renamed. Same semantics.
 */

/** Public marketing pages that live on the apex alongside `/`. */
const MARKETING_PATHS = new Set(['/privacy', '/terms']);

/** Hostnames that serve the product rather than the pitch. */
function isAppHost(hostname: string): boolean {
  // `app.` wins everywhere, including `app.localhost`.
  if (hostname.startsWith('app.')) return true;

  /* Bare localhost is the app, so `pnpm dev` opens the product and the
     existing workflow is unchanged. Any OTHER *.localhost — `stint.localhost`,
     say — is treated as the apex, which is how the landing page is previewed
     locally: browsers resolve every *.localhost name without a hosts entry. */
  if (hostname === 'localhost' || hostname === '127.0.0.1') return true;
  if (hostname.endsWith('.localhost')) return false;

  // Vercel preview deployments are a single host with no subdomain; treat
  // them as the app so a preview link lands somewhere useful.
  if (hostname.endsWith('.vercel.app')) return true;

  return false;
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  /* The `host` header, not `nextUrl.hostname`: in development `nextUrl`
     reflects the server's own bound address, so every request would look
     like `localhost` and the split could never be exercised locally. The
     header is also what a proxy in front of the app rewrites, which is how
     Vercel presents the real hostname. */
  const hostname = (request.headers.get('host') ?? '')
    .toLowerCase()
    .replace(/:\d+$/, '');

  // The app subdomain never serves marketing: `/landing` there would be a
  // duplicate of the apex page and a second URL for one document, which is
  // the canonicalisation problem search engines punish.
  if (isAppHost(hostname)) {
    if (pathname === '/landing') {
      return NextResponse.redirect(new URL('/', request.url));
    }
    return NextResponse.next();
  }

  // Apex: `/` is the landing page.
  if (pathname === '/') {
    return NextResponse.rewrite(new URL('/landing', request.url));
  }

  /* Linked from the landing footer, so they must resolve on the apex rather
     than bouncing a reader into a signed-out app screen. */
  if (MARKETING_PATHS.has(pathname)) return NextResponse.next();

  /* Anything else on the apex belongs to the app. Send it to the subdomain
     rather than 404ing, so an old link or a typed path still arrives.

     Skipped for a local preview host, where there is no real subdomain to
     send anyone to — there the request simply falls through to the app. */
  if (hostname.endsWith('.localhost')) return NextResponse.next();

  const target = request.nextUrl.clone();
  target.host = `app.${hostname}`;
  return NextResponse.redirect(target);
}

export const config = {
  /* Everything except API routes, Next's own assets and static files. Without
     a matcher the proxy runs on every request including `_next/static`, which
     would put a hostname branch in front of every CSS and JS file. */
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)'],
};
