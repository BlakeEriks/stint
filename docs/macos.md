# The macOS menu bar app

`apps/macos` is a **SwiftPM executable, not an Xcode project** — it builds and
runs with the Command Line Tools alone (`swift build`), which is what makes it
verifiable from a terminal. `./bundle.sh` wraps the binary in a `.app` with
`LSUIElement`, because AppKit honours "menu bar only, no Dock icon" from a
bundle's Info.plist and not from a bare executable. It self-signs with a local
identity when one exists, which buys a stable designated requirement rather
than an ad-hoc one; distribution still needs a Developer ID and notarisation.

**It is the timer and nothing else** — start, stop, task name, project.
`design/menubar.html` is the spec.

## Building and running it

**Changing its Swift means rebuilding and relaunching it**, because the
running copy is the `.app` in `~/Applications` rather than the build product,
so `swift build` alone leaves the menu bar on the old binary:

```bash
pkill -f 'Stint.app/Contents/MacOS/Stint'
./apps/macos/bundle.sh && open ~/Applications/Stint.app
```

Quit first — `bundle.sh` always overwrites the installed copy.

## Which backend it talks to

`bundle.sh` takes a target. `local` is the default and omits the keys, so
`Config` falls back to the local stack:

```bash
pkill -f 'Stint.app/Contents/MacOS/Stint'
./apps/macos/bundle.sh release prod && open ~/Applications/Stint.app
```

It reads `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
out of `apps/web/.env.local` with `grep` rather than sourcing it, because that
file also holds `SUPABASE_DB_URL` — a superuser string that must never reach a
bundle. `NEXT_PUBLIC_APP_ORIGIN` is empty locally, so the app URL falls back to
the subdomain.

**The values go in the bundle's `LSEnvironment`, not the shell.** An
`LSUIElement` app launched by `open` inherits Finder's environment, so
`STINT_APP_URL=… open Stint.app` is accepted and ignored — the panel runs
against local while appearing to have been told otherwise.

The Keychain account is namespaced by backend host, so both sessions persist
and switching back does not ask for a new code. The panel labels the target
beside the lockup whenever it is not local.

## Sign-in

**An emailed six-digit code, typed into the panel**, verified in-process
against GoTrue's `/verify` with `type: "email"` and the digits in the `token`
field — `"magiclink"` is the type for the hashed token in a link and rejects a
typed code. The request sends no `redirect_to`.

GoTrue generates a code for every magic link whether the email shows it or
not; `supabase/templates/magic_link.html` puts it in front of the user via
`{{ .Token }}`.

`create_user` must be a real bool in an `Encodable` struct — a
`[String: String]` literal sends it quoted and GoTrue answers "cannot
unmarshal string into Go struct field OtpParams.create_user of type bool".

`supabase-swift` is not a dependency; two POSTs do not need an SDK.

**Against a hosted project the email has no code in it** — the template is a
local file path and editing the hosted one needs custom SMTP, so GoTrue sends
its default. `apps/macos/signin.sh` takes the link instead, verifying the
token it carries: the same OTP the digits encode. `docs/setup.md` §4a.

**The session lives in the Keychain**, not `UserDefaults` — a refresh token is
a long-lived credential and a plist in the container is readable by anything
running as the user. `jwt_expiry` is an hour with rotation on, so refresh is
mandatory. One in-flight refresh is shared: two pollers racing would each
spend a rotating token and one would lose.

## The panel

- **Local tick, reconcile at 60s**, skew-corrected from `serverTime`. Today's
  total adds live seconds **from the fetch**, not from `startedAt` — the route
  already folded the running entry in.
- **A 409 from `/timer/start` refreshes rather than reports.** Another device
  won the race and the invariant held, so showing what *is* running is more
  use than the error.
- **The task field follows the server only when unfocused**, so it never
  overwrites itself mid-type.
- **Colours come from `Tokens.swift`, written by `pnpm tokens`** into the
  app's own sources, because SwiftPM cannot read the gitignored `dist/`. The
  Swift names keep the raw prefixes — `borderSubtle`, not `edgeSubtle`.
- **The runaway notice surfaces and stops there.** Adjusting needs a date and
  two times, which this panel has no room for.

**The API models are hand-written and nothing type-checks them against
`packages/schema`**, so a renamed field fails at runtime in Swift and nowhere
else. `architecture.md` wants an OpenAPI spec from the Zod schemas for exactly
this.
