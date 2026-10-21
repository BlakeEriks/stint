# The macOS menu bar app

`apps/macos` is a **SwiftPM executable, not an Xcode project** — it builds and
runs with the Command Line Tools alone (`swift build`), which is what makes it
verifiable from a terminal. `./bundle.sh` wraps the binary in a `.app` with
`LSUIElement`, because AppKit honors "menu bar only, no Dock icon" from a
bundle's Info.plist and not from a bare executable. It self-signs with a local
identity when one exists, which buys a stable designated requirement rather
than an ad-hoc one; distribution still needs a Developer ID and notarization.

**It is the timer and nothing else** — start, stop, task name, project.
`design/menubar.html` is the spec.

## Building and running it

**Changing its Swift means rebuilding and relaunching it**, because the
running copy is the `.app` in `~/Applications` rather than the build product,
so `swift build` alone leaves the menu bar on the old binary:

```bash
pkill -f 'Stint Local.app/Contents/MacOS/Stint'
./apps/macos/bundle.sh && open ~/Applications/'Stint Local.app'
```

Quit first — `bundle.sh` always overwrites the installed copy. The local
build installs as `Stint Local.app` with its own bundle id, beside Stint.app;
only the `prod` target writes Stint.app.

**QA runs it in a window, never in the menu bar.** `./qa.sh` builds the
debug binary and launches it with `STINT_WINDOW` set, which serves the same
panel as an ordinary window against the local stack; a worktree's server
takes `STINT_APP_URL=http://localhost:<port>`. It runs beside the installed
Stint.app and takes no focus. `./qa.sh shot` screenshots it, and `ids`,
`click <id>` and `type <id> <text>` drive it by accessibility, so nothing
moves the mouse. **Every control carries an `.accessibilityIdentifier`**,
which is what those commands address.

## Versions

**`apps/macos/VERSION` is the one source**, a single `major.minor.patch`
line. `bundle.sh` writes it into every target's Info.plist with the commit
count as `CFBundleVersion` and the short commit as `StintCommit`, marked
`-dirty` when the app has uncommitted changes. Settings shows it at the right
of its header, as `0.1.0 (a1b2c3d)`, selectable so a report can paste it; the
`qa.sh` build has no bundle and shows `dev build`.

Bump it in the PR that ships a change someone on an older copy could report
differently. A release is cut from `main`, at the commit whose `VERSION`
reads it:

```bash
git tag -a macos-v0.1.0 -m "macOS 0.1.0"
git push origin macos-v0.1.0
./apps/macos/bundle.sh release prod
```

The `macos-` prefix is because the web app shares the repo and deploys
unversioned on every merge.

## Which backend it talks to

`bundle.sh` takes a target. `local` is the default and omits the keys, so
`Config` falls back to the local stack. `prod` is the one that installs
Stint.app:

```bash
pkill -f 'Stint.app/Contents/MacOS/Stint'
./apps/macos/bundle.sh release prod && open ~/Applications/Stint.app
```

`prod`'s Supabase URL, publishable key and app origin are written in
`bundle.sh` — all three are public, and the app is their only local reader.
`STINT_APP_URL` overrides the origin for one build.

**Only `prod` reports crashes**, to Sentry's `stint-macos` project: it alone
carries the DSN, and it uploads its dSYM when the Keychain holds the token
(`docs/deploying.md` §3c).

**`preview` is one PR's**, built by `pnpm try-mac <pr>`: the branch, checked
out in `../stint-review`, pointed at its Vercel preview, and signed in on
launch as its seeded account (`docs/deploying.md` §3d). It installs as
`Stint Preview.app` with its own bundle id, beside Stint.app rather than over
it, and the panel names the PR. Every request carries Vercel's protection
bypass, which `try-mac` reads from the Keychain; add it once:

```bash
security add-generic-password -s dev.stint.vercel-bypass -a stint -w <secret>
```

**The origin is never guessed, and it is resolved before bundling.** A
hostname that does not exist reaches the panel as "a server with the specified
hostname could not be found" — which reads as a network fault, not as a build
pointed somewhere wrong, so the check happens where the answer is known.

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

The hosted project's copy of that template is pasted into the dashboard,
which needs custom SMTP. `docs/setup.md` §4a.

**The session lives in the Keychain**, not `UserDefaults` — a refresh token is
a long-lived credential and a plist in the container is readable by anything
running as the user. `jwt_expiry` is an hour with rotation on, so refresh is
mandatory. One in-flight refresh is shared: two pollers racing would each
spend a rotating token and one would lose.

**Only GoTrue rejecting the refresh token signs out.** A refresh that fails
any other way — offline, a timeout, a 5xx — keeps the session and shows as a
failed poll. The wake observer fires before the network is back, so a laptop
opened after a night shut would otherwise come back signed out.

## The panel

- **Local tick, reconcile at 60s**, skew-corrected from `serverTime`. Today's
  total adds live seconds **from the fetch**, not from `startedAt` — the route
  already folded the running entry in.
- **Every press shows its result before the server answers** — start, stop,
  rename, project, start again — through `press` in `apps/macos/Sources/Stint/Optimistic.swift`. A
  refusal takes it back and says why in the panel; a 409 from
  `/timer/start` then shows what *is* running. Start and stop ask for
  `?include=summary`, so the refetch after them skips `/summary`.
- **A refresh that began before a press is dropped**, so a poll that was in
  flight can't undo what the press showed.
- **The task field follows the server only when unfocused**, so it never
  overwrites itself mid-type.
- **Colors come from `Tokens.swift`, written by `pnpm tokens`** into the
  app's own sources, because SwiftPM cannot read the gitignored `dist/`. The
  Swift names keep the raw prefixes — `borderSubtle`, not `edgeSubtle`.
- **`Prefs` is the per-device store, `UserDefaults` not the Keychain** — it
  holds display choices, not credentials. What the menu bar shows is per
  device because a laptop and a desktop can reasonably differ, and reading it
  from `user_settings` would make the bar flicker at launch. Launch-at-login
  is read back from `SMAppService`, which owns that state; keeping a second
  copy is how the two disagree.
- **The snapshot (`apps/macos/Sources/Stint/Snapshot.swift`) is the last answer**, kept in the
  user's Caches folder per backend host, so a
  relaunch paints projects, clients, figures and recent tasks at once. Never
  the timer: the server owns it, and the panel shows "Loading" until it
  answers. A snapshot from another app version is discarded, and every
  sign-out deletes it, a 401 included.

**The API models are hand-written and checked against fixtures.** The
route suite saves each response the app reads in
`apps/macos/Tests/StintTests/Fixtures`, and `swift test` decodes each one.
A change to one of those responses fails `pnpm verify:db` once and rewrites
its fixture: commit the fixture, then update the Swift model until
`swift test` passes.
