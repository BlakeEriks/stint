# The menu bar panel, in one pass

Five faults in `apps/macos`, built together because they share one height
budget. Spec for `/feature`; delete when it ships.

Branch: `feature/menubar-panel`. Spec mockup: `docs/design/menubar.html`,
served with `PORT=8779 pnpm design` (8778 is usually taken by the other
checkout — check `lsof -p <pid> -a -d cwd` before trusting what you measure).

## The shape

```
StintApp.swift
  MenuBarExtra(.window)
    label  -> model.menuBarTitle ......... reads Prefs.barReadout
    content-> ContentView
                PanelHeader ............... gear pushes Settings
                TimerPanel  ............... running | idle
                  RenameRow ............... Escape cancels, blur commits
                  recentEntries ........... 5 deduped, "Recent"
                SettingsPanel (new) ....... 2 rows + account block

TimerModel
  refresh() -> api.entries(from: now-14d, limit: 200)
            -> recent: dedupe by taskName, newest wins, take 5
  clientNames: [String: String]   <- copy projectColors' two-hop shape

Prefs (new)  -> UserDefaults, the app's first preference store
Tokens.swift <- pnpm tokens now also emits Tokens.Type
```

## Decisions taken in the interview

| Question | Answer |
| --- | --- |
| List bound | Dedupe by task name, newest occurrence wins, **cap 5** |
| Heading | **"Recent"** in both states. No day subheadings, no per-row day marker |
| Settings rows | **Bar readout + launch at login only.** Runaway threshold and shortcut are not drawn |
| Bar readout | Two modes: `Running timer` (today's behaviour) / `Today's total` (always the day total) |
| Client name | **Ships.** Two-hop lookup, not a decode change |
| Type scale | **Absorbed.** `pnpm tokens` emits it, then Plex vendors on top |
| `.transient` | Premise was stale — spec corrected, conclusion kept |

## Phase 3 table — measured, not estimated

Every row read with `getBoundingClientRect()` / `getComputedStyle` off
`localhost:8779`. Swift points map 1:1 to the mockup's CSS px.

| What | Value | Where |
| --- | --- | --- |
| Panel width | 320 | unchanged, `ContentView.swift:17` |
| Panel height, running | **428** (was 361 with 3 rows) | intrinsic; +2 entry rows |
| Panel height, stopped | **425** | intrinsic |
| Panel height, Settings | **173** | intrinsic |
| Fits 13" Air | 428 of 924 usable pt | 956 − 24 menu bar − 8 clearance |
| Entry row | 34 tall, `7px 14px` pad | `.entry` |
| Entry name | sans 13, `#CACED7` | `.entry .nm` |
| Entry duration | mono 12, `#9299A6` | `.entry .tm` |
| Section label | mono 10, w500, 1.6px tracking, `#838A97`, uppercase | `.label` → `TypeRole.label` |
| Task line | sans 14, `#F9FAFD`, `padding-left: 19` | `.task` |
| Client name | mono 11, `#9299A6` | `.meta` → `TypeRole.meta` |
| Client chip | 8×8, `var(--cat-1)`, gap 6 to the name | `.chip` |
| Client row offset | `margin-top: 4`, `padding-left: 19` | indented to text, not dot |
| Settings row | 46 tall, `9px 14px` pad, sans 13 | `.setrow` |
| Settings picker | 28 tall, `5px 8px` pad, radius 7 | `.picker` |
| Settings toggle | 30×18, radius 9, 12px knob, **never accent** | `.toggle` |
| Account block | 38 tall, `10px 14px`, `bg-recessed`, top border | `.acct` |
| Account link | mono 10.5, 0.84px tracking, `#838A97`, uppercase | `.acct-link` |
| Divider | 1px `border-subtle` | `.divider` |
| Header | 43 tall, `8px 12px 8px 14px` | `.head` |

The panel grows **67pt**. That is the whole height budget this task is about,
and it is spent: nothing else gets added without taking a row back.

## Layers, in dependency order

### Phase A — `Tokens.Type` from the generator

`packages/design-tokens/src/generate.js`. Follow `Tokens.Mark` (`:304-311`)
exactly: one nested `public enum` inside `Tokens`, written to both
`dist/Tokens.swift` and `apps/macos/Sources/Stint/Tokens.swift` (`:314`,
`:323-327`) because SwiftPM cannot read gitignored `dist/`.

Source is `tokens.json:519-645` — 20 roles, each
`{family, size, sizeSm?, weight, tracking?, uppercase?, tabular?}`. Emit at
minimum the 9 roles `TypeRole` uses. Conversions: `weight` numeric →
`Font.Weight`; `tracking` is in **em** and SwiftUI `.tracking()` takes
**points**, so emit `em × size` already multiplied — the mockup CSS consumer
at `generate.js:391-408` shows the field handling.

Then `TypeRole` (`ContentView.swift:629-665`) reads the generated values
instead of its hand-mirrored literals. Its nine cases and call sites stay.

Verify: `pnpm tokens && pnpm tokens:validate && cd apps/macos && swift build`.
`git diff` on `Tokens.swift` must show only additions.

### Phase B — IBM Plex vendored

`Package.swift` gains a `.copy` resource; the two family helpers at
`ContentView.swift:659-664` (marked in-file as the landing spot) return the
Plex names; register at launch with `CTFontManagerRegisterFontsForURL`.

**Fallback must be explicit.** If registration fails the app renders in the
system font — acceptable — but it must not render in a font nobody chose.

Verify: `swift build`, then bundle and look at the panel.

### Phase C — `Prefs`, the first preference store

New `Prefs.swift`. There is **no existing pattern** — `UserDefaults` appears
nowhere (`TokenStore.swift:130` is a comment saying why the *session* is not
kept there; that reasoning is about secrets and does not apply to a display
choice).

```swift
enum BarReadout: String, CaseIterable { case runningTimer, todaysTotal }
```

Per-device by design: a laptop and a desktop can differ, and a round trip
would make the bar flicker at launch. Never `user_settings`.

`TimerModel.menuBarTitle` (`:68-70`) becomes:

- `.runningTimer` — `isRunning ? elapsed : todaySeconds` (today's behaviour)
- `.todaysTotal` — always `todaySeconds`

**The pip keeps saying "running" in both modes.** That is why it stays a pip
and is not folded into the text.

Launch at login: `SMAppService.mainApp`. Its state is the system's, not ours —
read it back rather than storing a second copy that can disagree.

Verify: `swift build`; toggle each mode with a timer running and confirm the
bar and the pip.

### Phase D — the recent list

`API.entries` (`API.swift:131-137`) grows `to:` and `limit:`. The server
already accepts them — `ListEntriesQuery`, `packages/schema/src/index.ts:157-167`,
`limit` default 200 / max 500, ordered `started_at` descending
(`apps/web/src/app/api/v1/entries/route.ts:18-19`). **No server change.**

`TimerModel.refresh()` (`:164-167`) fetches `from: now - 14d, limit: 200`,
keeps the `endedAt != nil` filter, then:

1. dedupe by `taskName` — first occurrence wins, which is newest given the
   server's ordering
2. take 5

Keep `startOfDay` reasoning out of it; the 14-day cutoff is a plain
`Date(timeIntervalSinceNow: -14 * 86_400)` and DST does not matter to a
two-week window the way it did to a day boundary.

`today` is renamed `recent` — the name is now wrong in a way that will mislead
someone. The heading (`ContentView.swift:182`) becomes **"Recent"** in both
states, replacing the running/idle ternary.

Everything else about the list holds: still gated off during a runaway
(`:104-107`), still `EntryRow` unchanged, still resume-starts-new-work.

Verify: `swift build`; with seeded multi-day data confirm 5 rows, no repeated
name, and that yesterday's work is resumable at 9am.

### Phase E — the client name

`TimerModel` gains `clientNames: [String: String]` — project id → client name.
Copy `projectColors` (`:93-105`) exactly: same two hops, same
`Dictionary(uniquingKeysWith:)`. `clients` is already fetched and held
(`:159`), so **no new request**.

`TimeEntry` decodes no client and no `clientId` (`API.swift:6-19`) and the
server selects none (`apps/web/src/lib/rows.ts:72-74`) — this is why it is a
lookup and not a decode.

Render under `RenameRow` on the running state only, per the measured table:
chip 8×8 + name in `TypeRole.meta`, `margin-top: 4`, `padding-left: 19`.

A project with no client renders **nothing** — not an empty row, not a
placeholder. Internal work has no client by design (`CLAUDE.md`).

Verify: `swift build`; check a client project, an internal project, and a
running timer with no project at all.

### Phase F — focus, Escape, and the rename trap

Two faults, one cause: nothing handles `onExitCommand` and nothing clears
focus on dismiss. Neither `onExitCommand` nor `onDisappear` exists anywhere in
the app today.

**Settle first, in two lines:** does `.menuBarExtraStyle(.window)` keep the
view alive between openings or rebuild it? That decides whether clearing focus
belongs on appear or on dismiss. Log in both and read it; do not guess.

Escape does the two-step: **clear focus if something has it, close the panel if
nothing does.** That ordering is what makes the key safe — it never closes the
window out from under someone who only wanted out of a field.

**The trap.** `RenameRow` commits on blur (`ContentView.swift:210`):

```swift
.onChange(of: focused) { _, has in if !has { finish() } }
```

Escape clearing focus would therefore *save* a rename the user pressed Escape
to abandon. Agreed fix — a local `cancelled` flag:

```swift
.onExitCommand { cancelled = true; focused = false }
.onChange(of: focused) { _, has in
    if !has { cancelled ? reset() : finish() }   // reset restores pre-edit name
}
```

`finish()` keeps its `guard editing` idempotence (`:238-242`), so
submit-then-blur still commits once.

The idle task field needs **no** equivalent: it is submit-only, with no blur
handler, and binds straight to `model.draftTaskName` (`:115-119`), so leaving
it discards nothing.

Panel opens the same way every time: nothing focused. Note `TimerPanel`
currently sets `.defaultFocus($taskFocused, true)` (`:110`) — that is the line
that makes reopening land on the field, and it is what changes.

Verify: `swift build` + bundle. **Turn macOS Keyboard navigation on first** —
with it off, Tab reaches only text fields and most of this is invisible.
Type a rename, press Escape, confirm the old name survives *and that no PATCH
was sent*.

## What must not regress

- **No silent writes.** Escape cancelling must send no request at all — not a
  PATCH of the unchanged value. This is the billing rule (`CLAUDE.md`).
- **One running timer.** Nothing here touches start/stop arbitration.
- **The accent stays on the pip and the readout only.** The Settings toggle is
  `bg-active` / `border-control`, never accent. Focus rings stay neutral.
- **The list still drops during a runaway** (`ContentView.swift:104-107`).
  When something needs deciding the panel is not also a dashboard.
- **Resume still starts new work** carrying name/project/billable — it does not
  reopen the old record (`:300-306`).
- **Server owns timer truth.** `Prefs` changes what the bar *displays*, never
  what is running.
- **The bar slot stays 57pt** (`StintApp.swift:55`). Today's total is not
  wider than an elapsed timer, so the pip must not start moving.

## Surfaces

- **macOS — ships now.** All six phases. Per `docs/architecture.md:15` the
  scope is "the timer and nothing else", and the surface table already names
  the bar toggling between running timer and today's total, so the readout
  setting is in scope rather than a stretch.
- **Shared packages — ships now.** `design-tokens` only, and only an added
  output. No schema change, no `core` change.
- **Web — untouched.** `GET /entries` already does everything needed. If the
  "Recent" dedupe proves good, `docs/tasks.md`'s task-name-suggestions entry
  may be deletable — a later call, not this feature's.
- **Expo — no directory exists.** Not applicable.

## Out of scope

- Runaway threshold as a setting — server-side (`/summary` decides
  `exceedsThreshold`).
- The global hotkey — Deferred in `tasks.md`, and the Settings row for it is
  deliberately not drawn.
- The two system-drawn `Menu`s (project picker, account gear) — separate
  `tasks.md` line with its own diagnose-first gate.
- The pip shifting with clock width — separate line.
- Loading states under real latency — separate line covering web and macOS.
- Task-name suggestions in the panel — Needs-a-decision, and this may moot it.

## Verification

| Phase | Command |
| --- | --- |
| A | `pnpm tokens && pnpm tokens:validate && (cd apps/macos && swift build)` |
| B–F | `cd apps/macos && swift build`, then bundle and look at it |
| Whole | `pnpm verify:static` |

Nothing here touches the database or a route, so `pnpm verify:db` is not
expected to change — run it once at the end to prove that.

Bundling, per `docs/macos.md` — `swift build` alone leaves the menu bar on the
old binary:

```bash
pkill -f 'Stint.app/Contents/MacOS/Stint'
./apps/macos/bundle.sh && open ~/Applications/Stint.app
```

## Doc changes

- `docs/design/menubar.html` — **done in phase 3**: "Recent" ×2, five rows ×2,
  Settings cut to two rows, `.transient`/`NSPopover` claims corrected to
  `MenuBarExtra(.window)`, heights restated (428/425/276).
- `docs/design/menubar.html:789-803` — the endpoint table still says
  `GET /entries?from=…` "Today's rows". Update to name `from`, `to` and
  `limit`, and say "recent rows, deduped client-side".
- `docs/macos.md` — add `Prefs` as the per-device preference store, one line.
- `docs/tasks.md` — delete **both** the rolled-up panel entry and "Emit the
  type scale into `Tokens.swift`". A finished task is deleted, not ticked.
- Delete this file.
