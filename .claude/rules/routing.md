---
paths:
  - "apps/web/src/proxy.ts"
  - "apps/web/src/app/landing/**"
  - "apps/web/src/app/(app)/**"
---

## Two sites, one deployment

The marketing page and the product are split by **hostname**, decided in
`apps/web/src/proxy.ts` — `proxy.ts`, not `middleware.ts`, because the
middleware convention is deprecated in Next 16 and renamed.

    trackwithstint.com      -> app/landing/page.tsx   (rewritten, not redirected)
    app.trackwithstint.com  -> app/(app)/**

**The app lives at the root of its own origin, so its URLs carry no segment.**
`/invoices/…`, never `/app/invoices/…`.

The apex `/` is **rewritten**, so the visitor keeps the bare domain in the
address bar and the first impression costs no extra round trip. Any other apex
path **redirects** to the subdomain, so an old link still arrives.

Consequences worth knowing:

- **The landing page is fully static.** The session cookie belongs to the app
  subdomain, so the pitch never reads one and never renders per-request — do
  not add a session check to it.
- **Cross-origin links are plain `<a>`, not `next/link`.** `next/link` would
  try to route a subdomain jump client-side within the current origin. The CTA
  and the Sign in link both point at `NEXT_PUBLIC_APP_ORIGIN`.
- **Locally, bare `localhost` is the app**, so `pnpm dev` is unchanged. Any
  other `*.localhost` is the apex — `http://stint.localhost:3100` previews the
  landing page with no hosts-file entry, because browsers resolve every
  `*.localhost` name on their own.
- `isAppHost()` treats `*.vercel.app` as the app, so a preview deployment lands
  somewhere useful rather than on the pitch.

### The landing page

`app/landing/page.tsx`. The full specification — strategy, verbatim copy, the
banned-words list and the build notes — is `docs/design/landing.html`, written
in the app's own design system so it doubles as the visual reference. Two rules
the page must keep:

**The accent appears on exactly two objects: the hero timer and the CTA.** They
are the same fact (start tracking / time accruing), which is what the scarcity
rule permits. Nothing else on the page is green — the unbilled card, the
invoice and every heading are neutral.

### The hero is the scope

Three ticked lines for what it does, four struck lines for what it refuses,
then the price. `landing.html` carries the verbatim copy, the banned words and
the build rules.

**The struck items are muted and struck, never red.** Red is the danger
channel, and a stack of red marks reads as "this product is broken" for the
half-second before it parses.
