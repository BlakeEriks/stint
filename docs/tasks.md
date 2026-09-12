# Tasks

The running list. `docs/roadmap.md` is for work that needs a decision made
before it can start; this is work already decided and not yet done.

Delete a line when it ships. If a line has been sitting here long enough to
feel permanent, it belongs in the roadmap or in the bin.

## Now

- [x] ~~Goals on `user_settings`~~ — `monthly_target` + `monthly_target_unit`,
      both-or-neither enforced by a check constraint. Migration 6.

- [ ] **`GET /stats`** — one call backing the home cards: unbilled by client
      with aging, month-to-date against target, billable ratio, attention
      rows. One request because they render together and a card set that pops
      in piecemeal reads as broken. Aggregate rate resolution belongs in SQL
      as a set-returning rollup, not N calls to `resolve_entry_rate`.
- [ ] **Home cards** — Needs attention, Unbilled, Pace, Activity. Spec is
      written in `docs/design/home.md`, including what was rejected.
- [ ] **`home_cards` JSONB on `user_settings`** — card order + visibility.
      Validated by Zod at the API boundary rather than a check constraint, so
      adding a card is not a migration. Decided; the one place in that table
      where a typed column does not fit.

## Design decisions taken, not yet applied

- [ ] **Projects page.** `/projects` API routes exist with no page; projects
      are only reachable through client dialogs. Everything else in the nav
      has a home.
- [ ] **Icons on the remaining buttons.** Nav and the additive actions have
      them; the lifecycle buttons on an invoice (send, mark paid, void,
      download) and the settings forms do not.
- [ ] **Account menu at the bottom of the rail, absorbing Settings.** The
      rail's sections are places you go; Settings is configuration you visit
      rarely, so it does not belong in the same run of items as Home and
      Calendar. Put the signed-in email at the foot of the rail as a dropdown
      trigger holding **Settings** and **Sign out**.

      **Not a Profile page.** Settings today is entirely business
      configuration — billing defaults, invoice identity, numbering, payment
      profiles — and none of it is "who am I". A profile for a single-user app
      would hold an email, a sign-out and eventually a theme: three items, not
      a page, and inventing one is the scope creep the thesis exists to
      resist. Your email *is* the account; there is no name, avatar or org.

      **This is also where sign-out finally lives — the app currently has
      none at all**, anywhere. That is the real gap this closes.

- [ ] **Collapsible rail.** Icon-only at ~3.5rem, full at 13rem, toggled by
      the user and remembered. The calendar is the screen that wants it: seven
      day columns plus a 13rem rail is tight on a laptop, and the rail is
      pure chrome once you know where things are.

      Collapsed shows icons alone, which is the one case where that is
      defensible — the labels were visible when you chose to collapse it, and
      expanding is one click. Every icon needs a real `aria-label` and a
      tooltip, since the label is no longer on screen. The running timer must
      survive the collapse in some form: dropping it would break "visible from
      every screen", so collapsed probably keeps the pulsing dot and the
      elapsed time without the task name.

      Store the preference per-viewer in `localStorage`, not on the server —
      it is a per-device layout choice, not account state, and a round-trip
      would make the rail flicker on load.

- [ ] **Today's entries wrap on narrow screens.** The row is one line —
      task, project, badge, time range, duration — and on a phone the middle
      fields are already hidden behind `sm:`/`md:` breakpoints to make it fit,
      so a phone silently loses the project and the time range. Two lines
      (task + duration above, project + range + badge below) shows everything
      instead of hiding it.

      Note this argues against the "an entry row is one line" rule in
      CLAUDE.md, which exists because single-line rows make a dense list
      scannable. The resolution is that the rule is about *wide* screens:
      hiding billing-relevant fields is worse than two lines, and a phone list
      is short enough that density is not the constraint. Update the rule
      rather than leaving the contradiction.

- [ ] **Client colour legend on the calendar.** A block's left edge carries
      its client's colour and nothing on the screen says which client that is
      — the mapping only exists in the clients list, on another page. Needs to
      cover the no-client case too, since internal work renders with no edge
      at all rather than a shared grey. Only list clients present in the week
      being viewed; a legend of every client a contractor has ever had is a
      key nobody reads. The same mapping is what the home screen's Activity
      heatmap will need, so whatever this becomes should be reusable.

## Known rough edges

- [ ] **No test covers the bearer-token auth path.** It shipped broken —
      `getClaims()` needs the token passed explicitly — and nothing caught it
      because the route tests inject `__TEST_DB__` and never take that path.
      Worth a test that hits a real server with a real token before the Expo
      or macOS app depends on it.

- [ ] **`type-section` is unused.** Kept because the home cards will want a
      section heading. If they ship without it, delete the role.
- [ ] **Calendar: a block can overlap the day's label.** Visible on Saturday
      in the seeded week — "Untitled" is clipped by the block above it.
- [ ] **Calendar header weight mismatch.** `type-title` at 24px/600 sits next
      to a mono readout and the pairing reads unbalanced.
- [ ] **`api.ts` still hand-writes request validation.** The route handlers
      define their own local Zod schemas and never import `@stint/schema`, so
      requests are validated against a second copy of the truth. Response
      types now derive; requests do not.

## Deferred with a reason

- **Branch protection** — needs GitHub Pro on a private repo. CI runs without
  enforcement by choice.
- **CodeQL** — dormant until the repo is public; Advanced Security is not
  available on private repos.
- **Toggl import** — thought through in `docs/roadmap.md`. Wait until Stint
  has been used for real billing for a couple of weeks: importing two years of
  history into a tracker whose rough edges are undiscovered means finding them
  with real data inside.
- **macOS menu bar app** — `/summary` was built for it. The largest unbuilt
  surface and the one that would most change daily use.
- **Expo app** — last by design; reuses the most.
- **Runaway timer push notifications** — needs APNs/FCM, so effectively gated
  behind the native apps.
- **Calendar editing** (drag-to-adjust, click-to-create) — the largest felt
  gap day to day, since correcting a mistracked block means leaving the view
  where you noticed it.
