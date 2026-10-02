# Decision: Money figures include the running timer

- **Slug**: live-earned
- **Decided**: 2026-10-02
- **Verdict**: go
- **Artifacts reviewed**: intake.md | problem.md | concept.md

## Scorecard

| Criterion | Rating | Justification |
|-----------|--------|---------------|
| Problem validity | strong | Seen in the app (`$0.00` beside `22m`), and traced to `revenue_by_day` excluding running entries while the duration counts them. |
| Evidence strength | adequate | No research stage. The problem was observed directly and pinned to specific lines of code. User demand rests on positioning, not on interviews. |
| Value vs. inaction | strong | Inaction leaves the most-watched figure wrong while the user works, and makes it jump at every stop. That's the distrust positioning names. |
| Feasibility / appetite | strong | Option C is small to medium. It reuses the existing SQL pricing and bucketing, and adds no client logic. |
| Strategic fit | strong | It keeps the server as the one source of the time it already owns (Principle III). There's one implementation, so no parity test (Principle II), and no fixed cost. |
| Risk posture | adequate | The main risk, running time leaking into invoicing, is named and fenced by keeping display separate from billing. Polling cost is not yet measured. |

## Verdict & Rationale

**Go, with Option C.** The problem is real and located in the code. The fix makes every figure on a screen come from one server answer, so it removes the contradiction rather than hiding it. The scores support it, with evidence and risk at adequate: the risks are known and bounded, so they don't block it.

## If go — Handoff to `/speckit-specify`

- **Problem**: While a timer runs, money figures leave out the session in progress while durations include it. Money sits still, then jumps at stop, on web and macOS.
- **Chosen approach**: The server counts a running entry up to now in every time and money figure it returns, priced and bucketed by the existing SQL. Nothing that feeds invoicing counts it. While a timer runs, clients refetch the home figures each minute. Only the running timer's own seconds clock stays on the client.
- **In scope / out of scope**: In scope: Today, week bars, month Earned and projection, the dock, today's entries, and Unbilled if confirmed. Out of scope: invoice pricing, making a running entry billable, fixing a project's rate, the timer's seconds clock, and refreshing more often than once a minute.
- **Success metrics**: No money figure lags its time by more than one refetch while a timer runs. A stop changes no figure. Web and macOS show the same value for a figure at the same moment.
- **Carried-forward open questions**:
  - Does Unbilled (the web per-client figure and the macOS menu bar) go up live too?
  - A session that crosses midnight, a week or a month: confirm the existing SQL bucketing is the behavior wanted.
  - Measure the cost and how much the screen shifts with a refetch each minute of `/stats` and today's entries.
  - The `$0.00` for 22m: a missing rate, or a separate rate-resolution bug? It's out of scope here, and gets its own issue if it's a bug.
