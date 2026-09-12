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

## Known rough edges

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
