# Quickstart: Ask for an invite

## Suites

```sh
pnpm --filter @stint/web test:ui -- invite-request signin-form
pnpm --filter @stint/web test:stories -- invite-request signin-form landing
```

## By hand, locally

Never point the form at a real Formspree form while testing. Run a stub that
answers JSON, and start dev with the variable pointed at it:

```sh
NEXT_PUBLIC_INVITE_FORM_URL=http://localhost:4599/f/local pnpm dev
```

1. Open `http://stint.localhost:3100`. Both calls to action are an email
   field and "Request an invite".
2. Type `not-an-email` and send: the browser says it isn't an email, and the
   stub gets nothing.
3. Send a valid address with the stub answering 200: the button reads
   "Sending…", then "You're on the list." replaces the form.
4. Stop the stub and send again: the address stays, and the form says it
   didn't send.
5. Header **Sign in** opens the sign-in form. An address with no account
   gets "Stint is invite-only during alpha." and a link back to `#invite`.
