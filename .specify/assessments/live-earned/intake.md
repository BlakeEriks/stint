# Idea Intake: Earned includes the running timer, live

- **Slug**: live-earned
- **Created**: 2026-10-02
- **Source**: pasted text (chat), with repo paths `apps/web/src/components/home-today.tsx`, `supabase/migrations/00000000000019_revenue_by_day_seconds.sql`
- **Type**: fix

## Idea (as captured)

> Earned figures should include the running timer, live. Today the Today region's duration and task rows count a running entry from its start (`secondsOf` in `apps/web/src/components/home-today.tsx`), but Earned comes from `/stats` → `revenue_by_day`, which excludes running entries (`ended_at is not null`, `supabase/migrations/00000000000019_revenue_by_day_seconds.sql:59`). So time ticks while money sits still until the timer stops, then jumps. Same gap on the week bars, month Earned + projection, the dock's EntryList (`earnedToday`), and the macOS menu bar.
>
> Leaning approach (Blake's preference): live — Earned = server's closed total + running entry's resolved rate × elapsed, ticking each minute; server supplies the rate (no client `resolveRate`, Principle II); live portion priced with the invoice's printed-hours rounding (#199) so stopping doesn't jump; refetch on stop replaces the prediction (Principle III); no rate → add nothing.
>
> Alternative considered: exclude running entries from every figure until the timer ends (consistent, simpler, but freezes the screen during the session being worked).
>
> Possible side bug: screenshot showed $0.00 for 22m — check whether the rate is resolving.

## Restated

Time and money figures disagree while a timer runs: durations include the running entry, Earned does not. The proposal is to make every Earned figure, on web and macOS, include the running entry and update as it runs.

## Origin & Context

- **Raised by**: Blake
- **Trigger**: The Today region on 2026-10-02 showed `$0.00` beside `22m` with a timer running.

## First-Glance Unknowns

- [NEEDS CLARIFICATION: Which figures are in scope: Today, week bars, month Earned, month projection, dock, macOS menu bar, and anything else that reads `revenue_by_day` or `earnedToday`?]
- [NEEDS CLARIFICATION: Live, or exclude running entries everywhere until stop? Blake leans live.]
- [NEEDS CLARIFICATION: How does the client get the running entry's resolved rate: on `/stats`, on the timer response, or elsewhere?]
- [NEEDS CLARIFICATION: With printed-hours rounding, does the live amount step at each rounding increment rather than every minute, and is that acceptable?]
- [NEEDS CLARIFICATION: How does a running entry that crosses midnight or a week/month boundary split across figures?]
- [NEEDS CLARIFICATION: Is the `$0.00` for 22m a missing rate on that project, or a separate rate-resolution bug?]
