# jsdom UI test audit

This audit covers every test in `apps/web/test/ui`, judged against Principle V
(constitution 8.0.0) and `.claude/rules/testing.md`. It is a proposal: no test
is deleted until Blake approves the list.

Each test gets one of four verdicts:

- **Keep:** it guards client logic or a rule that fails silently.
- **Cut: story:** a named story already reproduces the test's behavior.
- **Cut: change detector:** it asserts markup, class strings or copy, not a rule.
- **Cut: move to story:** it checks how a screen looks or reads, and no story
  reproduces that yet. The named story should take it before the test goes.

A "Cut: story" row whose reason says "pure render" points at a story with no
`play`. Such a story reproduces how the screen looks, which is all
Principle V asks of a story, but it fails only on a crash or an a11y violation.
So that coverage was accepted only for how-it-looks tests. A test that guards a
silent rule or logic stays, even when a story renders the same state. On that
ground, the review overturned eight cuts the first pass proposed: six in
`appearance.test.tsx`, plus the empty-filter test in `invoice-list` and the
row-flagging test in `inbox`.

Line counts run from each test's `it(` line to its closing `})`. Setup
blocks and imports are counted only when a cut would remove them.

## `account-menu.test.tsx` (82 lines)

| Test | Lines | Verdict | Reason | Story |
| --- | --- | --- | --- | --- |
| shows the signed-in email | 7 | Cut: story | Pure render; story mocks `getClaims` with the seeded email | app-shell.stories.tsx `AccountMenu` |
| sign out clears session, replaces, refreshes | 16 | Keep | Sign-in/out logic | — |
| offers sign out and nothing else | 14 | Cut: change detector | Menu item count; markup | — |
| still works when the token carries no email | 15 | Keep | Edge case in claim handling | — |

Helpers (lines 1-24) stay.

## `appearance.test.tsx` (253 lines)

| Test | Lines | Verdict | Reason | Story |
| --- | --- | --- | --- | --- |
| gives the readout the accent while running | 8 | Keep | Named in Principle V/testing.md: the readout's running state fails silently; the story renders it but asserts nothing | — |
| keeps the timer off the Stop button's green | 21 | Keep | Running-state rule testing.md names; a wrong green is invisible in a play-less story | — |
| withholds the accent when stopped | 11 | Keep | Other half of the running-state rule; `IdleDesktop` has no play | — |
| pairs the accent button with text-on-accent | 14 | Keep | Named rule (white on the accent). Uncertain: the stories a11y contrast check may already fail it in Chromium; cut only after confirming that | — |
| sets the readout with the timer role, not ad-hoc sizing | 13 | Keep | Named rule (hand-rolled type). Uncertain: `check:type` bans the same patterns repo-wide; cutting means also editing testing.md's list | — |
| uses only type roles the generator emits | 10 | Keep | Named rule (a `type-*` that is not real). Uncertain: `check:type` checks every role in src; same testing.md edit applies | — |
| sets the readout in a role that carries tabular-nums | 16 | Keep | Silent: reflow shows only while ticking, which no static story catches | — |
| no token in one theme and missing from the other | 7 | Keep | Cross-screen silent rule; `tokens:validate` does not check theme parity | — |
| defines the recessed surface for the nav rail | 7 | Cut: change detector | Restates one token name; parity test covers one-theme absence | — |

Only the recessed-surface test goes; every helper stays.

## `back-link.test.tsx` (80 lines)

| Test | Lines | Verdict | Reason | Story |
| --- | --- | --- | --- | --- |
| goes back to the section the record was opened from | 7 | Keep | Back-trail routing logic | — |
| keeps the filter the list was on | 9 | Keep | Back-trail keeps query | — |
| goes where the record sits when opened from outside the app | 6 | Keep | Fallback logic | — |
| returns to the record a form was opened from | 7 | Keep | Trail logic | — |
| goes back past the form a record was saved through | 7 | Keep | Trail skips the form | — |

## `beat.test.tsx` (169 lines)

| Test | Lines | Verdict | Reason | Story |
| --- | --- | --- | --- | --- |
| reads a stop off the hours axis | 3 | Keep | `cause` classification logic | — |
| reads a raised invoice off awaiting payment | 3 | Keep | Classification logic | — |
| reads a payment off the collected axis | 5 | Keep | Classification logic | — |
| payment as paid even when a larger invoice went out | 5 | Keep | Money-event edge case | — |
| refuses a stop and an invoice in one arrival | 3 | Keep | Prevents invented money | — |
| refuses a stop and a payment in one arrival | 5 | Keep | Prevents invented money | — |
| not an event when only the money moved | 3 | Keep | Classification logic | — |
| nothing to compare on a first arrival | 3 | Keep | Baseline logic | — |
| forgets the previous zone | 21 | Keep | Hook ref reset on a zone change | — |
| ignores object identity, still beats on the stop | 23 | Keep | Hook dependency regression | — |

## `calendar-edit.test.tsx` (416 lines)

| Test | Lines | Verdict | Reason | Story |
| --- | --- | --- | --- | --- |
| opens the editor on the entry that was clicked | 18 | Keep | Checks that the clicked entry's task is pre-filled; `EditEntry` asserts only that the dialog opens | — |
| names a block with its time range | 13 | Keep | Accessible-name content, which axe does not check | — |
| marks a billed entry as billed in its accessible name | 14 | Keep | Accessible-name content, billing state | — |
| click-to-create opens the editor, writes nothing | 22 | Keep | Write guard | — |
| keyboard path to add an entry on each day | 16 | Keep | Keyboard reachability plus write guard | — |
| seeds the clicked time into the form | 24 | Keep | Form pre-fill logic | — |
| drag: no write when the pointer never traveled | 20 | Keep | Drag threshold, a write guard | — |
| drag: patches new times once traveled | 32 | Keep | PATCH payload: a move, not a resize | — |
| drag: does not open the editor after a drag | 18 | Keep | Gesture disambiguation | — |
| drag: refuses an entry on an issued invoice | 23 | Keep | Immutable-invoice write guard | — |
| drag: refuses a running entry | 25 | Keep | Write guard | — |
| reports a rejected drag instead of reverting silently | 56 | Keep | Rejection is surfaced (Principle VI) | — |

## `calendar.test.tsx` (747 lines)

| Test | Lines | Verdict | Reason | Story |
| --- | --- | --- | --- | --- |
| renders a seven-day week with every weekday heading | 9 | Cut: story | Pure render of the week grid | calendar.stories.tsx `Desktop` |
| says so when the week is empty | 8 | Cut: story | Empty-state copy; `account('empty')` renders it | calendar.stories.tsx `Empty` |
| totals the week across days | 14 | Keep | Client-side sum of billable hours | — |
| labels an entry with its task name | 12 | Cut: story | Pure render of seeded blocks | calendar.stories.tsx `Desktop` |
| names an untitled entry | 12 | Cut: move to story | How a block reads; no fixture has an empty task name | calendar.stories.tsx `UntitledEntry` |
| gives overlapping entries their own lanes | 32 | Keep | Lane assignment in `use-calendar.ts`, tested nowhere else | — |
| narrows only the entries that overlap | 39 | Keep | Per-cluster lane count, guards a silent layout regression | — |
| keeps a single entry full width | 16 | Keep | The no-overlap branch of lane logic | — |
| moves to the previous week and back | 13 | Keep | Navigation state; no story `play` steps the week | — |
| legend: one entry per CLIENT | 10 | Keep | Grouping logic | — |
| legend: describes the week in view | 10 | Keep | Filters the legend to clients that have time this week | — |
| legend: ranks by time tracked | 26 | Keep | Sort logic (reads `span.type-support`, a fragile selector) | — |
| legend: internal work only when present, no color | 23 | Keep | Inclusion rule plus the no-color rule | — |
| legend: client with no color, not filed as internal | 12 | Keep | Classification logic | — |
| legend: no strip when the week is empty | 13 | Cut: story | Asserts a class selector; the empty render shows it | calendar.stories.tsx `Empty` |
| narrow: shows only the selected day | 10 | Keep | JS breakpoint picks what data shows | — |
| narrow: names the day in the heading | 10 | Cut: story | Heading copy; the phone render shows it | calendar.stories.tsx `Phone` |
| narrow: steps ONE DAY with the arrows | 14 | Keep | Step-unit logic | — |
| narrow: totals the day on screen | 10 | Keep | Which total is summed | — |
| narrow: says the DAY is empty | 16 | Cut: move to story | Copy only; no phone story has an empty day | calendar.stories.tsx `PhoneEmpty` |
| still steps one week when wide | 11 | Keep | The other branch of step-unit logic | — |
| crop: omits the empty night | 20 | Keep | `workedWindow` crop logic | — |
| crop: pads an hour either side | 29 | Keep | Window padding math, needed for drag room | — |
| crop: ordinary working day when nothing tracked | 12 | Keep | Default window when there is no data | — |
| keeps all 24 hours in the week view | 23 | Cut: story | Desktop render shows 00–21 labels | calendar.stories.tsx `Desktop` |
| line: loading before it arrives | 9 | Cut: move to story | Loading copy; no story covers it | calendar.stories.tsx `Loading` |
| line: failed to load, not empty | 18 | Cut: story | `failing('calendar')` renders the error line instead of empty | calendar.stories.tsx `Failed` |
| line: says nothing once the week has time | 8 | Cut: story | Seeded render has no status line | calendar.stories.tsx `Desktop` |
| opens an hour above the earliest entry | 34 | Keep | Scroll-offset math (`useScrollToFirstEntry`) | — |
| stays at the top when nothing is logged | 7 | Keep | The empty branch of the scroll hook | — |
| marks the running entry with the accent | 30 | Cut: story | Class strings; the running block renders in its story | calendar.stories.tsx `Running` |

Helpers stay, since tests remain. Uncertain: the `Cut: story` rows for `Empty`, `Phone`, `Desktop` and `Running` rely on render args only, because none of those stories has a `play`.

## `client-dialog.test.tsx` (106 lines)

| Test | Lines | Verdict | Reason | Story |
| --- | --- | --- | --- | --- |
| edits with the page's form, and closes | 23 | Keep | PATCH payload and close | — |
| archives the client and closes | 17 | Keep | DELETE write and close | — |
| no archive for an archived client | 13 | Cut: move to story | Render branch; no story opens an archived client's dialog | client-list.stories.tsx `EditArchivedClient` |

Helpers (lines 1-48) stay.

## `client-list.test.tsx` (420 lines)

| Test | Lines | Verdict | Reason | Story |
| --- | --- | --- | --- | --- |
| groups projects by client so same-named projects differ | 14 | Keep | Guards `group()`, the client-side grouping logic | — |
| keeps a client with no projects | 8 | Keep | Grouping and alphabetical order logic; story renders it but asserts nothing | — |
| opens a client from its heading | 7 | Cut: change detector | Asserts an href string | — |
| reaches a project with no client | 10 | Keep | Grouping of null clientId, and no link for it | — |
| never labels no-client work "internal" | 22 | Cut: change detector | Absence of a word; copy, not a rule | — |
| puts "No client" last | 15 | Keep | Group ordering logic | — |
| never drops a project whose client can't resolve | 10 | Keep | A dangling client_id would silently drop a row | — |
| card carries rate and email, no report figures | 20 | Cut: story | Pure render of the card | client-list.stories.tsx `Desktop` |
| marks an inherited client rate as the default | 7 | Keep | Rate-source branch on money display; uncertain, no story asserts it | — |
| gives each project its resolved rate and source | 20 | Keep | `resolveRate`/`resolveRateSource` wiring; a wrong rate is silent | — |
| says when a client has no projects yet | 5 | Cut: story | Pure render of an empty card | client-list.stories.tsx `ClientWithoutProjects` |
| adds a client from the header, and nothing else | 10 | Cut: change detector | Href and absence of a button; markup | — |
| adds a project to the client whose card asked | 16 | Keep | State passed to the dialog (preselected client); story only checks the dialog opens | — |
| shows a new project before the server answers | 16 | Keep | Optimistic prediction (Constitution VI) | — |
| edits a project from its row | 15 | Cut: story | Play clicks the row's Edit and asserts the dialog opens | client-list.stories.tsx `EditProject` |
| edits a client in a dialog | 12 | Cut: story | Play asserts the Edit client dialog opens | client-list.stories.tsx `EditClient` |
| badges a client archived before the server answers | 19 | Keep | Optimistic archive, project stays under its client | — |
| asks for archived clients and projects | 13 | Keep | What is sent to the server | — |
| shows everything, archived badged, no filter | 21 | Keep | Archived client's projects stay under it (not "No client"); `ArchivedShown` archives only a project | — |
| offers to add a client when there is nothing | 8 | Cut: story | Pure render of the empty state | client-list.stories.tsx `Empty` |
| says a failed query failed | 19 | Cut: story | Pure render of the error state; the danger check is a class string | client-list.stories.tsx `Failed` |

Helpers (lines 1-102: mock, wrapper, fixtures, `serve`, `headings`, afterEach) stay; the file keeps tests.

## `client-projects.test.tsx` (309 lines)

| Test | Lines | Verdict | Reason | Story |
| --- | --- | --- | --- | --- |
| asks only for this client's projects | 25 | Keep | What is sent to the server (`clientId=`) | — |
| shows the inherited rate, not the empty column | 11 | Keep | Rate resolution on display; money | — |
| shows a project override in place of inherited | 11 | Keep | Rate resolution; money | — |
| falls through to the user default | 11 | Keep | Rate resolution; money | — |
| warns when no rate resolves | 15 | Keep | Silent until billing refuses | — |
| says non-billable rather than a rate | 11 | Keep | Billable rule; showing a rate would imply it bills | — |
| archives rather than deletes, names the project | 16 | Keep | Write method (DELETE) and per-row accessible name | — |
| leaves archived lists alone when predicting | 20 | Keep | Optimistic cache update scope | — |
| drops the row on the press | 23 | Keep | Optimistic prediction | — |
| brings a refused archive back and names it | 47 | Keep | Rollback and notice (Constitution VI) | — |
| no add to an archived client | 17 | Cut: story | Pure render branch; archived client renders ClientProjects | client-detail.stories.tsx `Archived` |
| offers to add a project, defaulting to this client | 15 | Keep | Preselected client state; `AddProject` only checks the dialog opens | — |

Helpers (lines 1-71) stay.

## `count-up.test.tsx` (375 lines)

| Test | Lines | Verdict | Reason | Story |
| --- | --- | --- | --- | --- |
| renders the settled figure under reduced motion | 20 | Keep | Hook timing plus a11y, money figure | — |
| arrives from near the figure on load, never from zero | 20 | Keep | Tween origin logic, money | — |
| settles on exactly the server value | 21 | Keep | Money accuracy after a tween | — |
| travels through intermediate values | 26 | Keep | Tween actually runs (StrictMode regression) | — |
| travels today's figure | 24 | Keep | The tween is wired to this figure; a regression is silent | — |
| travels the month's earned figure | 21 | Keep | The tween is wired to this figure; a regression is silent | — |

## `dock-split.test.tsx` (293 lines)

| Test | Lines | Verdict | Reason | Story |
| --- | --- | --- | --- | --- |
| starts at half | 6 | Keep | Default state | — |
| moves with the arrow keys and remembers where it landed | 11 | Keep | Keyboard logic plus storage write | — |
| clamps rather than letting either region reach zero | 13 | Keep | Clamp logic | — |
| restores the stored ratio | 7 | Keep | Storage read | — |
| ignores a stored value outside the range | 9 | Keep | Storage validation | — |
| ignores junk in storage | 7 | Keep | Storage validation | — |
| Home recenters and forgets the preference | 12 | Keep | Keyboard reset removes storage | — |
| follows the pointer down the column | 10 | Keep | Pointer-to-ratio math | — |
| ignores a column with no height rather than dividing by zero | 13 | Keep | Zero-height guard | — |
| clamps when the pointer leaves the column | 15 | Keep | Clamp on drag | — |
| writes the ratio on release, not during the drag | 18 | Keep | Write timing | — |
| has no handle below xl | 13 | Keep | Media-query gate. Uncertain: `Band` renders it but no play asserts the slider is absent | — |

## `dock.test.tsx` (185 lines)

| Test | Lines | Verdict | Reason | Story |
| --- | --- | --- | --- | --- |
| renders Today while /stats is still in flight | 10 | Keep | Query independence; a stalled `/stats` blanking Today would go unnoticed in stories | — |
| draws three fields to a row, not the wide list's six | 16 | Cut: move to story | How a compact row reads; seed has no billed non-billable entry today | dock.stories.tsx `CompactRow` |
| still opens the editor from a compact row | 11 | Cut: move to story | Duplicate of today-grid's editor test | dock.stories.tsx `EditFromToday` |

If both cut tests go, `serveFullRow` (lines 61-132, 72 lines) goes too.

## `entry-dialog.test.tsx` (527 lines)

| Test | Lines | Verdict | Reason | Story |
| --- | --- | --- | --- | --- |
| shows the stored instant as local wall-clock time | 13 | Keep | Timezone conversion; wrong hours on an invoice | — |
| sends an edit back as an instant | 18 | Keep | Write payload | — |
| treats an end before the start as overnight | 25 | Keep | Form rule, payload duration | — |
| never offers an edit on an entry billed to an issued invoice | 26 | Keep | Lock logic from invoice status; Locked story has no play | — |
| still allows editing an entry on a DRAFT invoice | 10 | Keep | Status-to-lock rule | — |
| warns that a draft would need previewing again | 8 | Cut: story | Pure render of the draft warning | entry-dialog.stories.tsx `OnDraft` |
| offers no New project inside the dialog | 14 | Keep | Silent dead control (Radix nested dialog); no story guards absence | — |
| asks for no suggestions when editing an entry that exists | 10 | Keep | Request suppression logic | — |
| asks for no suggestions on a locked entry | 10 | Keep | Request suppression logic | — |
| opens on the task by default | 6 | Keep | Initial-focus logic | — |
| does not delete until the confirmation is clicked | 16 | Keep | No DELETE before confirm; ConfirmDelete play checks only the prompt | — |
| creates with a client-generated id | 20 | Keep | Idempotent write payload | — |
| awaits onSaved before invalidating | 44 | Keep | Ordering contract | — |
| rewrites the start field when the start edge is dragged | 11 | Keep | Scrubber logic | — |
| rewrites both fields when the block is moved | 11 | Keep | Scrubber logic | — |
| clamps to the minimum rather than inverting | 11 | Keep | Scrubber clamp rule | — |
| writes nothing to the server until Save | 23 | Keep | Write timing and payload | — |
| redraws from the fields when a time is typed | 18 | Keep | Field-to-strip state sync | — |
| offers no strip on a new entry | 17 | Cut: story | Pure render; Add has no strip | entry-dialog.stories.tsx `Add` |
| offers no strip on an entry billed to an issued invoice | 11 | Cut: story | Pure render; Locked shows strip without handles | entry-dialog.stories.tsx `Locked` |
| hides the strip for an overnight entry it cannot draw | 13 | Cut: story | Overnight renders an end-before-start entry; test reaches it by typing, story by args (same derived state) | entry-dialog.stories.tsx `Overnight` |

Helpers (entry, serve, wrapper, open, scrubber helpers) stay.

## `entry-list.test.tsx` (255 lines)

| Test | Lines | Verdict | Reason | Story |
| --- | --- | --- | --- | --- |
| lists completed entries with their duration | 7 | Cut: story | Pure render of today's seeded entries | dock.stories.tsx `Column` |
| omits the running entry | 15 | Keep | Filter logic; `today-grid.test.tsx` "keeps the running entry out of the list view" may duplicate it | — |
| totals the day at the foot | 9 | Cut: story | Renders the `todaySeconds` prop and an entry count | dock.stories.tsx `Column` |
| shows what the day earned beside the title | 9 | Keep | Money figure; unsure whether the Dock story passes `earnedToday` | — |
| says nothing about money with no figure | 9 | Keep | Null vs `$0.00` logic, a money rule | — |
| names an untitled entry | 6 | Cut: move to story | How a row reads; no untitled fixture | dock.stories.tsx `UntitledEntry` |
| marks a non-billable entry | 6 | Cut: move to story | Today's seeded entries are all billable | dock.stories.tsx `NonBillable` |
| leaves a billable entry unmarked | 7 | Cut: story | Seeded billable rows render with no mark | dock.stories.tsx `Column` |
| shows the project name | 6 | Cut: story | Pure render | dock.stories.tsx `Column` |
| prompts to start a timer when nothing is logged | 8 | Cut: story | Empty-day copy, rendered by `account('empty')` | dock.stories.tsx `EmptyDay` |
| sizes the row by its container | 16 | Cut: story | Class strings; the story renders a 286px dock at desktop viewport, the exact case | dock.stories.tsx `Column` |
| gives the task name the whole first line | 10 | Cut: story | Class strings; same 286px render | dock.stories.tsx `Column` |
| wraps project and time range | 10 | Cut: story | Class strings; same 286px render | dock.stories.tsx `Column` |
| renders without a panel of its own | 8 | Cut: story | Class absence; the render shows it | dock.stories.tsx `Column` |
| draws internal work with the semantic neutral | 12 | Keep | Shared `INTERNAL_SWATCH` token rule; a renamed primitive fails silently and no story shows an internal row today | — |

Helpers stay, since tests remain.

## `error-boundary.test.tsx` (89 lines)

| Test | Lines | Verdict | Reason | Story |
| --- | --- | --- | --- | --- |
| offers recovery before anything else | 8 | Cut: story | Pure render of both controls; ScreenError renders them (no play, render args only) | app-shell.stories.tsx `ScreenError` |
| calls reset, which re-renders the segment without a reload | 12 | Keep | Wiring to reset() not reload; story passes a no-op and asserts nothing | — |
| says the tracked time is safe | 8 | Cut: story | Copy, rendered by ScreenError | app-shell.stories.tsx `ScreenError` |
| shows the digest | 9 | Cut: story | ScreenError renders with digest `2718281828` | app-shell.stories.tsx `ScreenError` |
| renders nothing about a reference when there is no digest | 7 | Cut: move to story | Render state with no digest; no story covers | app-shell.stories.tsx `ScreenErrorNoDigest` |
| never spends the accent | 11 | Keep | Silent design rule (accent = running timer); a11y check would not catch | — |

`ScreenError` has no `play`, so the "Cut: story" rows rely on its render alone; adding a `play` that asserts Try again / Go home / digest would make that cover explicit. `boom`/`quiet` helpers stay (2 tests kept).

## `home-regions.test.tsx` (852 lines)

| Test | Lines | Verdict | Reason | Story |
| --- | --- | --- | --- | --- |
| renders a figure for each of today, the week and the month | 28 | Keep | Week total ($1,880) is summed on the client in `home-week.tsx`; a money total. Tier-class checks within it are incidental | — |
| marks only the projection endpoint with success, and nothing with the accent | 14 | Cut: change detector | Class-substring match on a visual convention; testing.md says conventions stay untested | — |
| lands a %d endpoint just under the top labeled gridline (it.each, 4 rows) | 52 | Keep | Client scale and tick logic: endpoint position and labels computed in `home-month.tsx` | — |
| renders the empty state when the projection is null, never NaN | 16 | Keep | Null handling in chart math; a NaN would render silently, since `Empty` has no play | — |
| draws a bar with no money for a day of purely unrated work | 21 | Cut: move to story | How an unrated day reads; the seeded account has no unrated day | home.stories.tsx `UnratedDay` |
| prints an em-dash and no bar for a day with no work | 22 | Cut: story | Pure render; mid-week seed leaves the later days empty | home.stories.tsx `Desktop` |
| gives internal work a hollow ring rather than a color | 13 | Cut: move to story | Look of a Today row; the seed has no internal entry today | home.stories.tsx `InternalToday` |
| writes durations as hours and minutes, never as a decimal | 9 | Cut: change detector | Copy check; `formatCompact` is tested in packages/core/test/core.test.ts | — |
| omits the awaiting line when there is nothing to count | 9 | Cut: story | Pure render; the empty account has no open invoices | home.stories.tsx `Empty` |
| counts the open invoices once there are some | 10 | Cut: story | Pure render; seed has "two invoices out" | home.stories.tsx `Desktop` |
| a day with no entries keeps its rows | 12 | Cut: story | Placeholder rows are layout; the empty account renders them | home.stories.tsx `Empty` |
| asks for the day as an ISO range, not a date key | 19 | Keep | What is sent to the server (a 422 renders as an empty day). Overlaps home-today's exact-range test, which may make it redundant | — |
| a placeholder row carries no pip | 16 | Cut: story | Pure render of empty rows | home.stories.tsx `Empty` |
| stacks a bar by client, in the ratio of their seconds | 23 | Keep | Client share computation (seconds, not money) | — |
| sizes a stack by seconds even where the money says otherwise | 21 | Keep | Same computation, money-vs-seconds case | — |
| gives internal work in a bar no hue | 23 | Cut: story | Pure render; seed has admin (internal) entries in the week | home.stories.tsx `Desktop` |
| sizes the month's strip by money, not by seconds | 17 | Keep | Money share computation | — |
| resolves a client to the same hue in the bar and the strip | 28 | Keep | Hue resolution across regions; a mismatch is silent | — |
| names every client of either region once, in one legend | 36 | Keep | Dedup/merge of clients across regions is logic. Uncertain: could become a story play | — |
| keeps an archived client its color | 23 | Keep | Hue lookup must include archived clients; failure is silent (falls into neutral) | — |
| draws no strip on a month that has earned nothing | 9 | Cut: story | Pure render | home.stories.tsx `Empty` |
| on day %d, shows the dates today clears (it.each, 4 rows) | 12 | Cut: move to story | Layout collision under stubbed geometry; days 2/30 already played by `MonthStart`/`MonthEnd`, add day 28 | home.stories.tsx `MonthLate` |
| anchors today inside the axis on the last day | 8 | Cut: story | Class assertion; `MonthEnd` play asserts today takes Sep 30's place in real layout | home.stories.tsx `MonthEnd` |
| does not fire on a remount holding the same figures | 41 | Keep | Arrival-roll state across remounts; a defect that survived a green suite | — |
| rolls both figures when two of them hold the same amount | 27 | Keep | Roll keyed by name, not value | — |
| still rolls a figure whose value actually changed | 22 | Keep | Roll on refetch | — |

If both month-axis tests go, the `layOut`/`through`/`labels` helpers (lines 680-723, 44 lines) go too.

## `home-today.test.tsx` (99 lines)

| Test | Lines | Verdict | Reason | Story |
| --- | --- | --- | --- | --- |
| asks for local midnight to local midnight | 11 | Keep | Query range sent to the server, time-zone logic | — |
| moves to the new day when the tab stays open past midnight | 18 | Keep | Timing: rollover refetches entries and stats | — |
| leaves stats alone while the day is unchanged | 11 | Keep | Timing: no spurious invalidation | — |

## `import-page.test.tsx` (330 lines)

| Test | Lines | Verdict | Reason | Story |
| --- | --- | --- | --- | --- |
| says in one line what confirming adds, ends with Import | 22 | Cut: story | Copy and layout order of the preview | import-page.stories.tsx `Preview` |
| names where each overlap sits | 13 | Cut: move to story | Copy; story fixture has only an in-Stint overlap, add an in-file one | import-page.stories.tsx `Preview` (extend fixture) |
| re-reads with an exclusion, Undo offers it back | 24 | Keep | What is sent (`excluded`) and state | — |
| Exclude all sends every overlap still open | 10 | Keep | What is sent | — |
| shows five overlaps, then Show more | 16 | Keep | List cap logic | — |
| new client's rate re-reads on blur; existing only shown | 20 | Keep | Payload and blur timing | — |
| marks the rate field with no default | 10 | Keep | Form rule (`aria-invalid`); `NoDefaultRate` does not assert it | — |
| invoiced-through date re-reads | 16 | Keep | Payload | — |
| new client's color sent with confirm, no re-read | 19 | Keep | Payload and request count | — |
| failed re-read blocks Import | 26 | Keep | Prevents writing choices the screen never showed | — |
| existing client with no rate shows default or No rate | 22 | Keep | Rate fallback on money display; uncertain, no story asserts it | — |

Helpers (lines 1-120) stay.

## `inbox.test.tsx` (648 lines)

| Test | Lines | Verdict | Reason | Story |
| --- | --- | --- | --- | --- |
| is still here when there is nothing in it | 12 | Cut: story | Empty-inbox render; Clear's account removes every attention row (overdue, drafts, unprojected, durations, the overlap pair) | dock.stories.tsx `Clear` |
| leaves the count empty rather than saying "clear" | 5 | Cut: change detector | Asserts absent copy | — |
| says how many things want a decision | 16 | Cut: story | Count is a pure render of the rows; Column renders every row kind | dock.stories.tsx `Column` |
| names the invoice in every action | 17 | Keep | Accessible name differs from visible label; axe does not flag a column of identical names | — |
| keeps the actions in the document when not hovered | 13 | Cut: story | Duplicates "draws the actions without hovering"; jsdom toBeVisible only proves presence, Column renders actions at rest | dock.stories.tsx `Column` |
| offers nothing destructive | 12 | Keep | Silent product rule (no void/delete in dock); no play guards absence | — |
| never spends the accent | 13 | Cut: change detector | Scans class strings for "accent"; a screen convention, not an appearance.test rule | — |
| flags the overdue invoice and the odd length, and nothing else | 49 | Keep | Which rows get flagged is selection logic, silent if wrong. Uncertain: asserted via `before:bg-*` classes; rewrite to a role or data attribute rather than cut | — |
| draws the actions without hovering | 7 | Cut: story | Pure render at rest; Column renders the overdue row's actions | dock.stories.tsx `Column` |
| gives every entry its own row rather than a count | 22 | Cut: story | Seed has two unprojected entries; Column renders both rows, AssignProject finds all "Assign a project" buttons | dock.stories.tsx `Column` |
| acts in place rather than linking somewhere | 7 | Cut: story | AssignProject clicks the row action and asserts the dialog opens in place | dock.stories.tsx `AssignProject` |
| says why when the entry cannot be opened | 30 | Keep | Failed fetch surfaces in MutationNotice (Principles I/VI) | — |
| opens the editor on the entry | 14 | Cut: story | AssignProject play asserts the dialog opens | dock.stories.tsx `AssignProject` |
| lands the cursor on the project | 15 | Keep | Initial-focus logic | — |
| is never a create form | 23 | Keep | Guards edit vs create mode, i.e. PATCH vs a duplicate POST; uncertain, could move to AssignProject play | — |
| says which threshold it tripped, in words | 10 | Cut: story | Column play asserts /unusually long/ | dock.stories.tsx `Column` |
| gives a short entry its own row, never a group | 24 | Cut: story | Column play asserts /unusually short/ alongside the long row | dock.stories.tsx `Column` |
| answers with durationOk and edits nothing else | 21 | Keep | Write payload; touching times would edit billable work | — |
| sends the row out on the press, before the server answers | 24 | Keep | Optimistic exit (Principle VI) | — |
| brings the row back and says why when the server refuses | 31 | Keep | Rollback and notice on rejection | — |
| the check mark belongs to "It's correct" alone | 21 | Cut: change detector | Compares svg class/innerHTML | — |
| names both entries and how long they share | 6 | Cut: story | Column renders the seeded overlap pair; play asserts /overlaps/ | dock.stories.tsx `Column` |
| is resolved by editing, and offers no "it's correct" | 12 | Keep | Offering durationOk on an overlap would let it be dismissed unresolved (Principle I); fetch on edit | — |

Helpers (stats, wrapper, fixtures, ~80 lines) stay; kept tests use them.

## `invoice-detail.test.tsx` (391 lines)

| Test | Lines | Verdict | Reason | Story |
| --- | --- | --- | --- | --- |
| names the supporting detail, in print order | 18 | Keep | Orders keys (date given before project); `WithSupportingDetail` fixture is already in print order so cannot catch a sort regression | — |
| shows the reference the invoice was issued with | 5 | Cut: move to story | Display only; no detail story has a reference | invoice-detail.stories.tsx `WithReference` |
| says nothing of supporting detail when none | 6 | Cut: story | Pure render; `Draft` has no supporting detail | invoice-detail.stories.tsx `Draft` |
| shows the frozen line items and total | 7 | Cut: story | Pure render of server data | invoice-detail.stories.tsx `Draft` |
| offers a download in every status | 11 | Keep | Asserts the PDF route `href`; stories render the link but not where it points | — |
| lets a draft be deleted but not voided | 11 | Keep | Status-to-action rule behind gapless numbering; stories render it unasserted | — |
| lets an issued invoice be voided, never deleted | 11 | Keep | Same rule, issued side | — |
| offers the next step in the lifecycle, only that | 21 | Keep | Lifecycle state machine | — |
| offers no transitions once void | 11 | Keep | Void is terminal | — |
| explains that voiding keeps the number | 6 | Cut: story | Copy; `Void` renders it | invoice-detail.stories.tsx `Void` |
| asks when the payment arrived before marking paid | 27 | Keep | Write payload: `paidAt` as local midnight | — |
| sends no paidAt when the default is unchanged | 14 | Keep | Write payload omission the server depends on | — |
| sends sentAt when backdated to the sent day | 24 | Keep | Write payload edge case, time math | — |
| shortDate: dash on a missing date | 11 | Keep | Pure client function, crash guard | — |
| shortDate: dash on a malformed date | 8 | Keep | Pure client function | — |
| shortDate: still formats a real date | 4 | Keep | Pure client function | — |
| shows expenses in own dated section with subtotal | 43 | Cut: story | Layout of server data; `WithExpenses` asserts the expense and section | invoice-detail.stories.tsx `WithExpenses` |

Helpers stay; most tests are kept.

## `invoice-list.test.tsx` (248 lines)

| Test | Lines | Verdict | Reason | Story |
| --- | --- | --- | --- | --- |
| shows open invoices by default, not finished ones | 15 | Keep | Client-side status filter (invoice-list.tsx:55) | — |
| totals only what is actually owed | 27 | Keep | Money total, sent only | — |
| offers mark-paid only on a sent invoice | 17 | Keep | Status-to-action rule; `Desktop` renders it unasserted | — |
| names the invoice in the action | 20 | Keep | Write goes to the right invoice id | — |
| sends no paidAt when the default is unchanged | 16 | Keep | Write payload omission | — |
| asks when payment arrived, sends that date | 29 | Keep | Write payload `paidAt` time math | — |
| offers no destructive action in the list | 13 | Cut: move to story | A screen's composition, not logic; add a play asserting no Void/Delete | invoice-list.stories.tsx `Desktop` (add play) |
| distinguishes an empty account from an empty filter | 11 | Keep | A wrong branch says "No invoices yet" beside a paid invoice and invites a duplicate; `NothingOpen` has no play, so it would render the wrong copy green | — |

Helpers stay.

## `invoice-new.test.tsx` (688 lines)

| Test | Lines | Verdict | Reason | Story |
| --- | --- | --- | --- | --- |
| holds Generate until a client is chosen | 10 | Keep | Form gating rule; `Blank` has no play asserting Generate disabled | — |
| previews as the form fills, no Preview button | 10 | Keep | `ClientChosen` covers the look, but not that exactly one preview request is sent (uncertain value) | — |
| shows the invoice as the PDF prints it | 19 | Cut: story | Card labels and copy; `ClientChosen` renders the card and asserts it; number format is `formatInvoiceNumber` in core | invoice-new.stories.tsx `ClientChosen` |
| says Updating and holds Generate while recomputing | 20 | Keep | `Updating` never settles; release re-enables Generate and `groupingMode` payload are uncovered | — |
| shows a ticked schedule at once, with no request | 21 | Keep | Asserts no server round trip (client-side compute); `AttachDetail` checks only the look | — |
| blocks generation when any entry has no rate | 11 | Keep | Money gate; `Unrated` asserts the message but not Generate disabled | — |
| blocks generation when nothing billable | 9 | Keep | Gate on Generate; no story | — |
| generates only when pressed, dated today | 13 | Keep | Write payload: `issueDate` in the user's time zone | — |
| asks for no notes | 6 | Cut: change detector | Asserts a field's absence, no rule | — |
| refreshes everything derived from billed entries | 14 | Keep | Cache invalidation after a write; silent stale views | — |
| lists waiting expenses up to the period end | 12 | Keep | Client filters `/expenses` by period end; no story asserts the exclusion | — |
| shows expenses in own section with subtotal | 13 | Cut: story | Card layout; total is the stub's number; `WithExpenses` renders and asserts the section | invoice-new.stories.tsx `WithExpenses` |
| leaving an expense off asks the server again | 14 | Cut: story | `UntickExpense` unticks and the mock honors `excludedExpenseIds` (mocks/derive.ts), so the row vanishes only if the payload is sent | invoice-new.stories.tsx `UntickExpense` |
| offers One summary line first under "Show time as" | 12 | Cut: change detector | Menu order and count | — |
| asks for the line text, empty, blocks generation | 18 | Keep | `NoSummaryLine` covers error + disabled, not `aria-invalid`/`role=alert`, which the a11y check would not require | — |
| sends the text with the preview and the invoice | 23 | Keep | Write payload `groupingMode`/`summaryText` | — |
| offers Attach only with One summary line, all unticked | 12 | Cut: story | `NoAttachWithoutSummary` asserts no Attach; `AttachDetail` asserts all three unticked | invoice-new.stories.tsx `NoAttachWithoutSummary`, `AttachDetail` |
| sends the ticked schedules in print order | 19 | Keep | Write payload order | — |
| shows the reference at once, and sends it | 21 | Keep | No request on type + `reference` in the write; `WithReference` covers only display | — |
| opens an expense from its row, and a new one from Add | 19 | Cut: story | `EditingExpense` and `AddExpenseHere` open both dialogs | invoice-new.stories.tsx `EditingExpense`, `AddExpenseHere` |
| adds a charge through its dialog, and removes it | 36 | Keep | `manualLines` payload and removal; `WithCharge` covers only adding | — |
| holds a charge back until description and amount | 11 | Keep | Form rule with one field filled; `NewCharge` checks only the empty dialog | — |
| prints the default payment details, sends the chosen | 15 | Keep | Write payload `paymentProfileId` | — |
| selects new payment details once saved | 22 | Keep | Selection state after save; fully contained in the next test, so a candidate to fold in | — |
| generates with new payment details before refetch | 29 | Keep | Race: payload uses the saved id before the list refetches | — |

Helpers (lines 1-238) stay; most tests are kept.

## `listing.test.tsx` (45 lines)

| Test | Lines | Verdict | Reason | Story |
| --- | --- | --- | --- | --- |
| reports a failure that left it with nothing to show | 8 | Cut: story | `Failed` renders the Listing's error state through a 500 | invoice-list.stories.tsx `Failed` |
| stays on loading through the 401 redirect | 9 | Keep | Auth branch; no story fails with a 401 | — |
| keeps showing data when a refetch fails | 9 | Keep | Error-with-data branch; silent if broken | — |

## `mutations.test.tsx` (278 lines)

| Test | Lines | Verdict | Reason | Story |
| --- | --- | --- | --- | --- |
| shows the prediction before the server answers, then refetches | 15 | Keep | Optimistic prediction + refetch timing (Principle VI core) | — |
| puts the snapshot back when the server rejects | 11 | Keep | Rollback on rejection | — |
| fails after 10s of silence, and refetches if the answer lands late | 19 | Keep | Timeout + late-answer refetch timing | — |
| lets the latest press win | 18 | Keep | Overlapping-press ordering; silent if broken | — |
| drops a refetch that was in flight when the press landed | 15 | Keep | Cache race guard | — |
| pending mode writes nothing and reports isPending | 14 | Keep | Pending-mode contract | — |
| gives a pending press no timeout | 14 | Keep | Prevents double write via "try again" | — |
| predicts each cached query under the key with its own key | 21 | Keep | Per-query prediction logic | — |
| sends a serial lane in press order while predicting at once | 22 | Keep | Serial lane ordering of writes | — |
| runs onSettled once, after the last overlapping press | 17 | Keep | Callback timing | — |
| MutationNotice: explains a rollback after the screen has gone | 15 | Keep | Notice outlives unmounted presser + dismiss; story only shows a refusal with presser mounted | — |
| MutationNotice: clears a failure once the same press succeeds | 19 | Keep | Clear-on-success logic; no story covers | — |

`deferred`/`setup`/`rejection`/`cached` helpers (~40 lines) stay; all tests kept.

## `nav.test.tsx` (39 lines)

| Test | Lines | Verdict | Reason | Story |
| --- | --- | --- | --- | --- |
| reaches projects through Clients, with no Projects section | 16 | Cut: story | Pure render of the rail's sections, drawn in every frame story | app-shell.stories.tsx `Desktop` |

The whole file goes, including its router mock and wrapper (lines 1-21).

## `payment-profiles.test.tsx` (198 lines)

| Test | Lines | Verdict | Reason | Story |
| --- | --- | --- | --- | --- |
| never renders a full account number in the list | 8 | Keep | Masking is a silent privacy rule; a render looks fine with the full number | — |
| marks which profile is the default | 7 | Cut: story | Pure render; `Desktop` fixture has one default of two | settings-page.stories.tsx `Desktop` |
| offers "make default" only on non-default | 9 | Cut: story | Pure render of the same fixture | settings-page.stories.tsx `Desktop` |
| says invoices render without a payment block | 8 | Cut: story | Empty-state copy | settings-page.stories.tsx `NoPaymentProfiles` |
| moves "Default" on the press, before the server | 33 | Keep | Optimistic update (Principle VI) | — |
| says a refused make-default by name after Settings closes | 49 | Keep | `MakeDefaultRefused` covers the named notice, not that it outlives the unmounted screen | — |
| hides an archived profile | 14 | Keep | Client-side filter (payment-profiles.tsx:27); no fixture is archived | — |

Helpers stay.

## `project-dialog.test.tsx` (188 lines)

| Test | Lines | Verdict | Reason | Story |
| --- | --- | --- | --- | --- |
| offers to create a client when the account has none | 21 | Cut: move to story | What the menu offers; `NewProjectNewClient` runs with clients present, not none | client-list.stories.tsx `NewProjectNoClients` |
| creates a client inline and selects it | 39 | Keep | POST payload, selection on first render, project fields survive | — |
| keeps the project when a client is abandoned | 21 | Keep | State survives cancel; nothing sent | — |
| archives an active project and closes | 17 | Keep | DELETE write and close | — |
| no archive for a new project | 6 | Cut: move to story | Render branch; extend the play of the existing story | client-list.stories.tsx `NewProjectForClient` |
| no archive for one already archived | 13 | Cut: move to story | Render branch; no story covers it | client-list.stories.tsx `EditArchivedProject` |

Helpers (lines 1-51) stay.

## `project-picker.test.tsx` (181 lines)

| Test | Lines | Verdict | Reason | Story |
| --- | --- | --- | --- | --- |
| lists every project plus an explicit "No project" choice | 12 | Cut: story | Open menu pure render | project-picker.stories.tsx `Open` |
| names itself by its purpose | 14 | Keep | Pinned accessible name; axe would not flag a value-derived name | — |
| marks the selected project checked | 14 | Keep | aria-checked semantics axe does not verify | — |
| moves between items with the arrow keys | 15 | Keep | Keyboard behavior | — |
| jumps to a project by typing its first letter | 10 | Keep | Keyboard typeahead | — |
| reports the project id on select and null for "No project" | 19 | Keep | Value sent upward; sentinel vs null | — |
| returns focus to the trigger after choosing | 10 | Keep | Focus logic | — |
| closes on Escape without selecting anything | 12 | Keep | Keyboard, no stray change | — |
| offers a way to create a project, including when there are none | 15 | Cut: move to story | Empty-state render; no story has zero projects | project-picker.stories.tsx `OpenEmpty` (new) |
| says so when there are no projects | 8 | Cut: move to story | Empty-state copy | project-picker.stories.tsx `OpenEmpty` (new) |

Helpers (wrapper, open) stay.

## `setup.ts` (63 lines)

Shared jsdom harness (cleanup, env stubs, ResizeObserver/DOMRect/matchMedia/pointer polyfills) that every UI test needs. Not a test, so no verdict; stays as long as any file in `test/ui` remains.

## `signin-form.test.tsx` (82 lines)

| Test | Lines | Verdict | Reason | Story |
| --- | --- | --- | --- | --- |
| clears stale auth BEFORE requesting a link | 11 | Keep | Sign-in call order | — |
| signs out locally only | 12 | Keep | Sign-out scope sent | — |
| says why the last link failed | 6 | Cut: move to story | Copy for one error code; `LinkFailed` uses `auth` | signin-form.stories.tsx `InvalidLink` |
| explains an unrecognized reason | 4 | Keep | Fallback branch; a story would not fail if it rendered nothing | — |
| no error banner on a normal visit | 4 | Cut: story | Pure render | signin-form.stories.tsx `Desktop` |
| replaces the error with confirmation once sent | 14 | Keep | State transition | — |

Helpers (lines 1-23) stay.

## `task-suggest.test.tsx` (307 lines)

| Test | Lines | Verdict | Reason | Story |
| --- | --- | --- | --- | --- |
| filters the list as characters arrive | 15 | Keep | Filter and 4-row cap logic | — |
| leaves Enter to the caller when nothing highlighted | 16 | Keep | Keyboard logic | — |
| fills field and reports project on Down then Enter | 16 | Keep | Keyboard logic and onChange payload | — |
| keeps focus in the field on row click | 11 | Keep | Focus logic | — |
| closes on Escape and keeps what was typed | 11 | Keep | Keyboard logic | — |
| keycap on the highlighted row only | 17 | Keep | `aria-selected` state; keycap part alone would be a story | — |
| active descendant only when highlighted | 16 | Keep | Keyboard/a11y state Chromium's a11y check would not catch | — |
| renders nothing when no name matches | 8 | Keep | Filter logic | — |
| entered with Up when it opens above | 19 | Keep | Keyboard logic | — |
| leaves Enter to caller when highlight came from hover | 15 | Keep | Keyboard logic | — |
| labels a row by client/project, internal, archived | 11 | Keep | Lookup logic; a billable row mislabeled "Internal" is silent | — |
| stops at the far row when Down is held | 13 | Keep | Keyboard logic | — |
| reopens on Down after Escape | 15 | Keep | Keyboard logic | — |
| closes on Tab | 8 | Keep | Keyboard logic | — |
| archived project row not called internal | 11 | Keep | Largely duplicates the labels test above; could fold into it | — |

Helpers (lines 1-84) stay.

## `timer-bar.test.tsx` (483 lines)

| Test | Lines | Verdict | Reason | Story |
| --- | --- | --- | --- | --- |
| offers a start control and an empty task field | 7 | Cut: story | Idle pure render | timer-bar.stories.tsx `IdleDesktop` |
| gives back the typed task when the server refuses the start | 32 | Keep | Rollback restores user input | — |
| starts with the typed task and chosen project | 23 | Keep | Write payload | — |
| starts on Enter from the task field | 12 | Keep | Keyboard-triggered write | — |
| trims the typed task before starting | 21 | Keep | Payload rule | — |
| does not patch anything when a project is picked while idle | 11 | Keep | No stray write | — |
| fills the field with a chosen name | 10 | Keep | Suggestion wiring into state | — |
| takes the row's project when none is chosen | 21 | Keep | Payload rule | — |
| leaves an already-chosen project alone | 24 | Keep | Silent re-bill guard | — |
| starts the timer on Enter with nothing highlighted | 17 | Keep | Keyboard logic and payload | — |
| offers no list while renaming a running timer | 12 | Cut: story | Rename play gets the field by role `textbox`, which fails if it becomes a combobox | timer-bar.stories.tsx `Rename` |
| shows the server's task name and a stop control | 9 | Keep | Elapsed readout from startedAt (0:25:00) is time math no story asserts | — |
| shows the running task as text, not an editable field | 12 | Cut: move to story | Affordance render; add a play asserting no Task name textbox before the pencil | timer-bar.stories.tsx `RunningDesktop` |
| offers the rename control without needing hover | 11 | Cut: story | jsdom toBeVisible only proves presence; RunningDesktop renders it, Rename finds and clicks it | timer-bar.stories.tsx `Rename` |
| stops on click | 11 | Keep | Write | — |
| patches the running entry when renamed and blurred | 19 | Keep | Write payload | — |
| does not patch when the task name ends up unchanged | 16 | Keep | No pointless write | — |
| reverts an in-progress rename on Escape | 16 | Keep | Keyboard revert, no write | — |
| offers no project control while running | 10 | Keep | Silent re-bill guard | — |
| drops the project below sm rather than wrapping | 10 | Cut: story | Class strings; RunningPhone reproduces it | timer-bar.stories.tsx `RunningPhone` |

Helpers (entry, summary, serve, wrapper, startRename, timers) stay.

## `today-grid.test.tsx` (235 lines)

| Test | Lines | Verdict | Reason | Story |
| --- | --- | --- | --- | --- |
| opens the editor from a block | 12 | Cut: move to story | Click-to-dialog wiring; visible if broken. No story clicks a dock block | dock.stories.tsx `EditFromToday` |
| carries the times in the accessible name | 17 | Keep | A11y name content that axe would not catch | — |
| draws the running entry but does not make it clickable | 33 | Keep | Running entry must not be a button (dialog refuses it); a11y-relevant. Its class checks (lines 138-142) are a change detector and could be dropped | — |
| keeps the running entry out of the list view | 14 | Keep | Filter logic. But `EntryList` list mode (`grid=false`) has no caller in src; if removed, cut this | — |
| puts the now-line where the clock is | 24 | Keep | Time-to-position math | — |
| scrolls Today rather than the dock | 15 | Cut: move to story | Layout via class string; a real-layout play can check the grid box scrolls | dock.stories.tsx `TodayScrolls` |
| keeps the now-line inside the grid when the day stopped hours ago | 22 | Keep | Regression for a clamp bug in window math | — |
| is the only accent on the column | 11 | Cut: change detector | Counts a class for a visual convention | — |

## `use-autosave.test.tsx` (184 lines)

| Test | Lines | Verdict | Reason | Story |
| --- | --- | --- | --- | --- |
| starts idle and does not save on its own | 10 | Keep | Hook initial state | — |
| is pending the moment a value is scheduled | 9 | Keep | Pending set on edit, not request | — |
| saves once the pause elapses, then reports saved | 12 | Keep | Debounce timing + payload | — |
| collapses rapid edits into one save with the last value | 15 | Keep | Debounce payload | — |
| queues an edit made during a save instead of racing it | 30 | Keep | Write ordering; server could keep stale value | — |
| stays pending while an edit is still queued behind a save | 36 | Keep | Never shows saved for unacknowledged value | — |
| reports an error and does not claim to be saved | 14 | Keep | Error state | — |
| recovers to saved after a failure is followed by a good save | 22 | Keep | Recovery state | — |

All tests kept.

## `use-exit.test.tsx` (273 lines)

| Test | Lines | Verdict | Reason | Story |
| --- | --- | --- | --- | --- |
| marks the row, then resolves | 15 | Keep | Hook state + promise resolution | — |
| waits on the row's own animations | 18 | Keep | Waits on getAnimations promise; timing logic | — |
| lets style resolve before it looks for animations | 37 | Keep | Regression guard for one-frame bug; silent in browser | — |
| short-circuits under prefers-reduced-motion | 23 | Keep | Reduced-motion branch (a11y logic Chromium's a11y check would not catch) | — |
| an inbox row leaving: plays the exit before the refetch that removes it | 48 | Keep | Ordering of write, exit, refetch; not observable in a story | — |

`animating`/`Harness`/`stats` fixtures stay; all tests kept.

## `use-timer.test.tsx` (262 lines)

| Test | Lines | Verdict | Reason | Story |
| --- | --- | --- | --- | --- |
| is idle with no running entry | 8 | Keep | Hook initial state | — |
| counts elapsed time from startedAt | 16 | Keep | Time math | — |
| does not double-count the running timer in today total | 17 | Keep | Regression guard on a total | — |
| advances both the timer and today total as the clock ticks | 21 | Keep | Tick logic | — |
| corrects for a skewed device clock | 17 | Keep | Server-time skew correction (Principle III) | — |
| refreshes every entry-derived view when the timer stops | 30 | Keep | Invalidation set after a write | — |
| shows a start as running before the server answers | 22 | Keep | Optimistic start | — |
| keeps a stopped timer stopped when a rename answers after the stop | 21 | Keep | Serial lane ordering; silent race | — |

All tests kept; `slowServer`/`entry`/`summary` helpers stay.

## Totals

| | Tests | Lines |
| --- | --- | --- |
| Keep | 283 | 4,857 |
| Cut: story | 72 | 894 |
| Cut: change detector | 13 | 151 |
| Cut: move to story | 24 | 281 |
| Setup removed by the cuts | | 139 |
| **Cut, all** | **109** | **1,465** |

The suite has 10,380 lines. The cuts remove 14% of them and 28% of the tests.
Only `nav.test.tsx` goes as a whole file.

Most of what stays is logic: the hooks (`mutations`, `use-timer`, `use-exit`,
`use-autosave`), the editing math (`calendar-edit`, `dock-split`), the motion
gates (`beat`, `count-up`) and the invoice-builder rules.

### Kept, but uncertain

- `appearance.test.tsx`'s two type-role tests duplicate `check:type`, which
  checks the whole repo. Cutting them also means editing the rule list in
  `testing.md`, so they stay until that is decided.
- `appearance.test.tsx`, "pairs the accent button with text-on-accent": the
  stories a11y contrast check may already fail white on the accent. Cut it only
  after a deliberate break proves the check catches it.
- `inbox.test.tsx`, "flags the overdue invoice and the odd length": the rule is
  real but the test asserts `before:bg-*` classes. Rewrite it to assert a role
  or a data attribute rather than cutting it.

## Proposed PRs

1. **Change detectors** (13 tests, 151 lines). These are deletions only, with
   no story work.
2. **Covered by a story** (72 tests, about 920 lines with `nav.test.tsx`'s
   setup). These are also deletions only. Review the "pure render" rows
   first, since their stories have no `play`. Adding a `play` to
   `ScreenError`, `home.stories.tsx` `Empty` and `calendar.stories.tsx`
   `Desktop` would make that coverage explicit.
3. **Move to stories: tracking screens** (15 tests, 184 lines, plus 116 lines of
   setup). This covers the home, dock, calendar, timer bar and project picker.
   Add each named story with its `play`, check that the `play` fails when the
   behavior breaks, then delete the test.
4. **Move to stories: everything else** (9 tests, 97 lines). This covers
   invoices, clients, projects, import, sign-in and the error boundary, with
   the same steps as PR 3.
