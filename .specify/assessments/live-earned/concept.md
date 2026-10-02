# Concept: Money figures include the running timer

- **Slug**: live-earned
- **Created**: 2026-10-02
- **Recommended option**: B — Live, predicted on the client from a server-given rate

## Options

### Option A — Running time stays out of every figure until stop
- **Sketch**: Durations stop counting the running entry, the same way money already doesn't. The session in progress shows only on the running timer itself, and every figure updates once, when the timer stops.
- **Appetite**: small
- **Trade-offs**: Wins: figures agree, there's one source, and nothing is predicted. Loses: the screen freezes for the session being worked, and every stop still jumps. That misses the goal "stopping changes no figure" and keeps the cost of inaction this assessment exists to remove.
- **Rabbit holes**: Few. The rows would need to point at the running timer so Today doesn't look empty.

### Option B — Live, predicted on the client from a server-given rate
- **Sketch**: The server sends the running entry's resolved rate along with the closed totals. Each client adds the running session's value (its hours, rounded the way the invoice rounds, × that rate) to every money figure that covers now, and updates it with the duration each minute. On stop, the refetch replaces the prediction (Principle III). With no rate, nothing is added.
- **Appetite**: medium
- **Trade-offs**: Wins: every goal is met. Figures move every minute, stopping causes no jump, and web and macOS match. It fits the existing "show the prediction at once, the server wins" model. Loses: a small amount of pricing arithmetic (round hours to two decimals, × rate) is written in TypeScript, in Swift and in SQL. That needs a parity test (Principle II).
- **Rabbit holes**: A session that crosses midnight, a week or a month boundary. Splitting the live value across buckets. The month projection taking in a moving value. Unbilled per client on web.

### Option C — Live, computed by the server, refetched each minute
- **Sketch**: The rollups count a running entry up to now, priced by the existing SQL. Clients refetch `/stats` each minute while a timer runs.
- **Appetite**: small to medium
- **Trade-offs**: Wins: one implementation, so no parity test, and the boundary splitting is already handled by the rollups' bucketing. Loses: a full `/stats` request every minute from every open client; the figure updates when the request returns, not with the duration; and the rollups, which also feed billing, treat running time as earned. Unbilled including a running entry is then one change away from an invoice billing it.
- **Rabbit holes**: Keeping running time out of every rollup that feeds invoicing while including it in display. Cost of polling on Supabase Pro ("No new fixed cost").

## Recommendation

**Option B.** It's the only option that meets all three goals without changing what the billing rollups count. The arithmetic it duplicates is small, and the server's answer still replaces it at stop. Option C is the strongest alternative: if the boundary rabbit holes are too costly, C's server-side bucketing beats re-creating it on two clients.

## Out of Scope (for the recommended option)

- How invoices are priced, and making a running entry billable or invoiceable.
- Fixing a project's missing or wrong rate. The `$0.00` for 22m is checked separately.
- Projection math, beyond taking in the live Earned.
- Ticking more often than once a minute.

## Assumptions to Validate

- The running entry's resolved rate can come from the server without a per-entry rate lookup that `/stats` was built to avoid.
- Rounding a single running entry's hours to two decimals and × rate reproduces, to the cent, what the rollup charges once the entry stops.
- A session that crosses a boundary is rare enough to handle simply (for example, counted where it started), or splitting it is cheap.
- Unbilled on the macOS menu bar should go up live too (open question in `problem.md`).
