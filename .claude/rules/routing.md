---
paths:
  - "apps/web/src/proxy.ts"
  - "apps/web/src/app/landing/**"
  - "apps/web/src/components/marketing/**"
  - "apps/web/src/app/(app)/**"
---

## Two sites, one deployment

The marketing page and the product are split by **hostname**, decided in
`apps/web/src/proxy.ts` — `proxy.ts`, not `middleware.ts`, because the
middleware convention is deprecated in Next 16 and renamed.

    runstint.com      -> app/landing/page.tsx   (rewritten, not redirected)
    app.runstint.com  -> app/(app)/**

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

`app/landing/page.tsx` is the copy, verbatim; `Screens/Landing` in Storybook
draws it. The strategy is `docs/positioning.md`'s, and the page is quiet
because the reader is trusting it with their rates: the invoice is shown
rather than described, and a competitor's bill is named but never the
competitor. Its current conventions, which a redesign may change:

**Green marks the hero timer and the CTA**, one fact: start tracking, time
accruing. The unbilled card, the invoice and the headings are neutral.

**Banned words**, because each carries no information or the wrong audience:
seamless, effortless, powerful, intuitive; beautiful, well-designed;
revolutionary, reimagined, next-generation; earned or revenue for unbilled
work (it may never be paid); Pro, Premium, Upgrade (one price, no tiers);
teams, collaborate, workspace.

**The hero timer is the only motion.** It ticks from a plausible mid-session
seed, never 0:00:00; the dot pulses on a 2s loop; `prefers-reduced-motion`
stops both and the page is legible at rest. No scroll-triggered reveals —
the first still frame is what a shared link previews. Hero height is its
content, never `100vh`.

**The invoice preview's total is near-black, not the light accent**, so the
page keeps one green meaning; the PDF itself is unchanged. It is billed from
"Your name here": a public page renders bank-detail labels, not a name.

**Designed dark, with no toggle**: the neon is the brand impression, and the
light accent is forest green. It renders light only for someone who chose
light in the app.

**Layout and build.** A static RSC route at `max-w-5xl`, no app shell,
sections separated by space rather than rules. Every grid needs an explicit
`grid-cols-[minmax(0,1fr)]` or the timer card's intrinsic width scrolls a
phone sideways. Nothing on it needs a cookie banner.
