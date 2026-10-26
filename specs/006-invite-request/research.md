# Research: Ask for an invite from the landing page

## The form service

- **Decision**: Formspree, free plan.
- **Rationale**: Free at 50 submissions a month, so no new fixed cost. It
  accepts a cross-origin POST from any page and answers JSON (`{ "ok": true
  }`, or `{ "errors": [...] }` with a 4xx) when the request sends
  `Accept: application/json`, so the page stays put and can tell a failure
  from a success. Without that header it answers a plain HTML POST with its
  own thank-you page, which covers a visitor with JavaScript off. It emails
  the owner each submission and lists them with timestamps in its dashboard
  (SC-003). The endpoint is public by design (`https://formspree.io/f/<id>`),
  so it's a `NEXT_PUBLIC_` variable and the owner plugs in their own form id.
- **Alternatives considered**: Web3Forms (free, generous, but its access key
  rides in the form and its stored-submission view is a paid feature).
  Basin (free tier fits, smaller and newer). A table and a route in Stint
  (rejected by the spec: an unauthenticated write needs rate limiting).

## Spam

- **Decision**: Formspree's own filtering, plus its `_gotcha` honeypot
  field, hidden from people and screen readers.
- **Rationale**: The spec accepts the service's protection at alpha volume.
  The honeypot costs one hidden input and no visible step. No CAPTCHA,
  which would slow SC-001.

## The send mechanism

- **Decision**: A real `<form method="post" action={endpoint}>`, enhanced
  with `fetch` on submit. Local state for idle, sending, sent, failed.
- **Rationale**: The real form covers JavaScript off. The landing page has
  no `QueryClientProvider`, so `useOptimisticMutation` isn't available
  without mounting TanStack Query on a static page. The sign-in form sets
  the precedent (plan, Complexity Tracking).
- **Alternatives considered**: `@formspree/react` (a dependency for one
  `fetch`).

## Validation

- **Decision**: The browser's own `type="email" required`.
- **Rationale**: It runs with JavaScript off, it's what the sign-in form
  does, and an invalid submit never fires `submit`, so nothing is sent.

## Where the sign-in refusal links

- **Decision**: `signin/page.tsx` derives the landing URL from the request's
  host, dropping a leading `app.` (`app.runstint.com` → `runstint.com/#invite`),
  and passes it to `SignInForm`.
- **Rationale**: It's the same rule `proxy.ts` uses to split the hosts, so
  previews and local hosts need no new variable. The page is already
  dynamic.
- **Alternatives considered**: A `NEXT_PUBLIC_SITE_ORIGIN` variable (one
  more thing to set per environment).

## Stories without a real endpoint

- **Decision**: `.storybook/vite-mocks.mts` sets `NEXT_PUBLIC_INVITE_FORM_URL` to a
  stand-in Formspree URL that MSW answers per story.
- **Rationale**: A story never reaches a real service, and unhandled
  requests already fail the story.
