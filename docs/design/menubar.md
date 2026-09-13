# The macOS menu bar app — visual spec

Visual reference: **`menubar.html`** beside this file — open it in a browser.
It renders all three states at true size with the real token values. This
document is the implementation spec; where the two disagree, this one wins,
because the HTML is a web mockup and some of it does not survive contact with
AppKit.

**Scope: this is a redesign of the panel, not of the app.** `apps/macos`
exists and works — SwiftPM executable, `LSUIElement` bundling, six-digit-code
sign-in, Keychain-backed session, `Tokens.swift` already vendored. All of that
is settled and documented in `CLAUDE.md` under *The macOS menu bar app*; read
it first. Nothing here changes auth, packaging or storage. What follows is
what the panel should look like and which states it has.

## What it is for

Three jobs, in order of how often they happen:

1. **Stop a timer** without leaving what you are doing.
2. **Start one** on something you just began.
3. **Catch a runaway** — the timer you forgot to stop at 5pm.

The third is the reason this app is worth building at all. A forgotten timer
is the most common way a tracker produces a wrong invoice, and the menu bar is
the only surface that can surface it without the user opening anything. If
only one thing from this spec ships correctly, make it that one.

**It is not a port of the web app.** No calendar, no invoicing, no client
management, no settings beyond what is listed here. Everything else is behind
*Open Stint*.

## Colours

**Use the generated tokens; never type a hex.** `Tokens.swift` is already in
`apps/macos/Sources/Stint/`, generated from `tokens.json` by `pnpm tokens`,
and holds `Tokens.Dark.*` / `Tokens.Light.*` as `Color` values. A literal in a
view is how the Mac app and the web app start disagreeing — and the file says
*do not edit by hand* at the top for the same reason.

The menu bar app is **dark-only for now**, matching the web app's default, so
use `Tokens.Dark`. Light mode is a later decision and needs the same
`data-theme`-style switch the web app has, not `@Environment(\.colorScheme)`
alone — the palette is dark-first and a light OS preference does not flip it.

| Role | Token | Used for |
|---|---|---|
| Popover ground | `bgBase` | The popover's own background |
| Footer ground | `bgRecessed` | The Open Stint / Quit strip |
| Input / picker fill | `bgPrimary` | Task field, project picker |
| Stop button fill | `bgElevated` | The round stop button |
| Hover | `bgHover` | Entry rows under the pointer |
| Running readout, pip, start button | `accentDefault` | **Only these** |
| Text on the start button | `textOnAccent` | Never white — 1.37:1 |
| Stopped readout, stopped pip | `timerIdle` | Never the accent |
| Runaway readout, pip, strip | `timerWarning` | Amber |
| Dividers | `borderSubtle` | |
| Input border | `borderDefault` | |

### The accent rule, in this app

Green means **time is accruing**, and it may appear as many times as that one
idea occurs. In practice: the pip and the readout while running, or the start
button while stopped. Never both — a stopped timer with a green readout is the
regression to watch for.

Never put the accent on: the stop button, a divider, anything in the header,
or a focus ring.

## Typography

The scale lives in `packages/design-tokens/tokens.json` under `type.scale`
and is **not yet generated into Swift** — only colours are. Mirror these by
hand for now, and if the app grows past a handful of roles, extend
`generate.js` to emit them rather than letting the two drift.

| Role | Family | Size | Weight | Notes |
|---|---|---|---|---|
| Readout | IBM Plex Mono | 26pt | Medium | `monospacedDigit()`, tracking −0.02em |
| Task name | IBM Plex Sans | 14pt | Regular | Truncates with tail ellipsis |
| Entry row | IBM Plex Sans | 13pt | Regular | |
| Stat value | IBM Plex Mono | 15pt | Regular | `monospacedDigit()` |
| Client / meta | IBM Plex Mono | 11pt | Regular | |
| Section label | IBM Plex Mono | 10pt | Medium | Uppercase, tracking 0.16em |
| Header wordmark | IBM Plex Mono | 12pt | Semibold | Uppercase, tracking 0.12em |

**Every number is mono with tabular figures.** A readout that reflows as its
digits change is the specific thing this rule exists to prevent — use
`.monospacedDigit()` on every `Text` holding a duration or an amount.

Ship the Plex faces with the app rather than relying on them being installed.

## The status item

```
● 1:47:32
```

**A filled dot and the time. No letterform.**

`Mark.swift` draws a `|S|` today, and the status item should stop using it.
Three reasons, in order of weight:

1. **A dot means *recording* in a way a letter cannot.** Every camera, every
   DAW, every screen recorder uses a filled circle for "this is live". The
   status item's whole job is to say whether time is accruing, and the dot
   says it without being read.
2. **The green `S` is not in the brand anywhere else.** The landing page, the
   web app and the invoice carry a plain wordmark; a tinted letterform in the
   menu bar would be the only place it exists, which makes it an orphan rather
   than an identity.
3. **Identity moves into the panel** (see below), where there is room for a
   real wordmark. The status item does not have to carry both jobs, and a
   12pt glyph is a bad place to do branding anyway.

Findability is the honest cost. A bare dot is harder to pick out of a crowded
menu bar than a letter, and people will learn its position rather than
recognise its shape — which is how most menu bar apps are actually found.
Accept it; do not re-add a letterform to compensate.

- **The dot is the state:** `accentDefault` running, `timerIdle` stopped,
  `timerWarning` past the threshold. The amber case is the one likely missing
  today, and it matters most — it is how a runaway reaches someone whose panel
  is closed.
- **Running shows elapsed; stopped shows today's total.** Both are worth a
  glance, and the dot's fill says which you are reading.
- **Tabular figures, fixed width.** The item must not resize every second —
  that shoves every icon to its left all day.
- Offer a **dot-only** preference for crowded menu bars.
- Left-click opens the panel. Right-click: Start/Stop, Open Stint, Quit.

`Mark.swift` itself is worth keeping for the panel header and anywhere else
the app needs a mark — this is a change to what the *status item* renders, not
a deletion of the mark.

## The popover

**320pt wide.** Heights are approximate and driven by content:
running ≈ 370pt, stopped ≈ 340pt, runaway ≈ 260pt.

`NSPopover` with `.transient` behaviour, or a borderless `NSWindow` if the
popover's arrow proves fussy — the mockup shows no arrow.

### Layout, shared by every state

```
┌─────────────────────────────┐
│  STINT                 ⚙ ↗  │  ← header, bgRecessed
├─────────────────────────────┤
│  [ state block ]            │  ← differs per state
├─────────────────────────────┤
│  TODAY 6:12:04   UNBILLED $…│  ← same in every state
├─────────────────────────────┤
│  EARLIER TODAY              │
│  Checkout validation…  2:15 │  ← three rows, never scrolls
│  Design review         1:30 │
│  Q4 retainer scoping…  0:39 │
└─────────────────────────────┘
```

Only the state block changes. Keeping the rest identical is what stops the
panel appearing to restructure itself when the user hits start.

### The header

**This is where the brand lives**, now that the status item is a bare dot.

- The wordmark at 12pt, `type-wordmark`'s treatment: mono, 600, uppercase,
  0.12em tracking, `textMuted` — present, not shouting. `Mark.swift` can sit
  beside it if a mark is wanted; this is the one place in the app with room
  for one.
- On the right, two icon buttons: **Open Stint** (arrow-out-of-box) and a
  **menu** (gear or ellipsis) holding Preferences, Sign out and Quit.
- `bgRecessed`, with `borderSubtle` beneath it. Chrome recedes; the timer is
  the content.

This replaces the footer the earlier draft had. A footer row spent on
`OPEN STINT / QUIT` put navigation at the bottom of a panel people open to do
one thing at the top, and left nowhere for identity. Moving both to a header
costs the same height and orders the panel the way it is read.

**Nothing in the header is ever the accent.** It is chrome, and the accent
belongs to the timer.

### State 1 — running

- Pip, readout, and the **round stop button on the same line**, button pushed
  right. It is beside the readout rather than in the top-right corner on
  purpose: the timer and the control that ends it are one fact, and the corner
  is where window chrome lives.
- Task name beneath, indented to the readout's text — not to the pip.
- Client chip and name under that. **Colour belongs to the client, never the
  project** (`useProjectColors()` in the web app resolves project → client →
  colour; internal work gets none).
- The task name is **editable in place.** A pencil affordance on hover, or
  click-to-edit. "What was I doing" gets answered late more often than at
  start, and a menu bar that can only stop is half a tool.

### State 2 — stopped

- **No readout at all.** Not `0:00:00` — nothing is accruing, so there is no
  number. The current prototype gives the largest element on screen to a
  stopped clock, which is the main thing this redesign fixes.
- A text field (`What are you working on?`) takes that space.
- Project picker inline, beside the round **start** button — a full-width
  dropdown row costs a whole line of height for no gain.
- The start button is the only accent object on screen.
- Starting with an empty task name is allowed. It is a real thing people do,
  and the entry can be named later from here or in the app.

### State 3 — runaway

Past the user's `max_timer_hours` (default 8, from `user_settings`):

- Readout, pip and **status item strip** all turn `timerWarning`. The strip
  mattering is the point — the warning has to reach someone whose popover is
  closed.
- A warning strip appears under the timer block with **Keep · Adjust ·
  Discard**.
- **Keep does not stop the timer.** It dismisses the notice and leaves it
  running, because a long timer is often correct and stopping it would be the
  app editing billable work. This is tested on the web side and the test fails
  if Keep also stops.
- **Adjust** stops the timer, then opens the entry editor in the web app
  (`Open Stint` deep link). A running entry has no end yet, so there is nothing
  to adjust until it is stopped.
- **Discard** stops and deletes, and **asks once** — discarding sixteen hours
  you actually worked is not recoverable.
- The entry list drops in this state. When something needs deciding, the
  popover should not also be a dashboard.
- The notice returns on a fresh overrun: the dismissed flag resets when the
  timer stops being over the threshold.

## The stats row

**Today** and **Unbilled**, in every state.

Unbilled is the number no other tracker can show, and it is what makes this
Stint in the menu bar rather than a generic timer widget. It comes from
`GET /api/v1/stats` — the same `unbilled_by_client` rollup the web home screen
uses, grouped by **(client, rate)**.

- Show `unbilled.total` only. The per-client breakdown is a web-app surface.
- If `unratedCount > 0`, the total is incomplete — the web app shows an
  em-dash rather than `$0.00` for unrated work, and this should not contradict
  it. Showing the total with a subtle marker is fine; showing a confidently
  wrong number is not.
- **Never label it "earned" or "revenue".** It is work done and not yet
  invoiced — money the user might still never see.

## Global shortcut

A user-configurable global hotkey that **toggles start/stop without opening
the popover**. The fastest possible start is never opening anything, and this
is the one thing the menu bar app can do that the web app cannot.

- Default: none. Make the user choose, so it cannot collide silently.
- Toggling start with no task name starts an unnamed entry.
- Give feedback the user can see without the popover — the status item pip
  changing is probably enough.

## Talking to the server

Everything goes through `/api/v1/*`. **There is no Swift-specific endpoint and
there should not be one** — the API is the shared contract, and an OpenAPI
spec generated from the Zod schemas keeps the models honest.

- `GET /timer/current` — running entry, plus `exceedsThreshold`
- `POST /timer/start` — **409 when one is already running.** Do not pre-check;
  attempt the insert and translate the conflict. A pre-check is a race, the
  index is not.
- `POST /timer/stop`
- `GET /summary` — today's total, `exceedsThreshold`, `serverTime`
- `GET /stats?tz=…` — unbilled total
- `GET /entries?from=…` — today's rows
- `PATCH /entries/:id` — rename
- `GET /projects`, `GET /clients` — for the picker and client colours

Auth is a **bearer token**, already handled by `TokenStore.swift` and the
Keychain — see `CLAUDE.md` for why sign-in is a typed six-digit code rather
than a link. Nothing in this spec changes it.

### Timer truth

**The server owns whether a timer is running; the client owns
responsiveness.** Tick locally from `startedAt` so the readout moves with no
network, and reconcile with `/summary` every 60s and on popover open.

Correct for clock skew using `serverTime` from the summary response. A Mac
with a wrong clock would otherwise show a wrong elapsed time, which in this
app is a wrong number on an invoice.

**Today's total subtracts the running timer's elapsed-at-fetch before adding
the live count**, or the running time is counted twice.

### Offline

The timer keeps ticking with no network. A start or stop made while offline
retries; time entry ids are **client-generated UUIDv7** (`uuidv7()` in
`@stint/core`, mirror it in Swift) so a retried insert is idempotent — the
same id lands on the same row, and a duplicate-key insert returns the existing
row with 200 rather than an error.

## Open questions

- **Light mode.** Deferred. Needs the same explicit-choice model as the web
  app, not a bare `colorScheme` read.
- **Idle detection.** Considered and deferred on the web side because it is
  Mac-only and needs a background watcher, while the threshold rule works
  identically on all three platforms. If it ever ships, it belongs here — but
  it must **surface, never auto-trim**, like everything else that touches
  recorded time.
- **Notifications.** A push at the runaway threshold needs APNs and is
  deferred. The amber status item is the interim answer and may be enough.
- **Launch at login.** Probably yes, as a preference, off by default.
