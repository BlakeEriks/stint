# Concept: Money figures include the running timer

- **Slug**: live-earned
- **Created**: 2026-10-02
- **Recommended option**: C — Live, time and money both from the server, refetched each minute

## Options

### Option A — Running time stays out of every figure until stop
- **Sketch**: Durations stop counting the running entry, the same way money already doesn't. The session in progress shows only on the running timer itself, and every figure updates once, when the timer stops.
- **Appetite**: small
- **Trade-offs**: Wins: figures agree, there's one source, and nothing is predicted. Loses: the screen freezes for the session being worked, and every stop still jumps. That misses the goal "stopping changes no figure" and keeps the cost of inaction this assessment exists to remove.
- **Rabbit holes**: Few. The rows would need to point at the running timer so Today doesn't look empty.

### Option B — Live, predicted on the client from a server-given rate
- **Sketch**: The server sends the running entry's resolved rate along with the closed totals. Each client adds the running session's value (its hours rounded the way the invoice rounds, × that rate) to every figure that covers now, and updates it each minute along with the duration it already computes. On stop, the refetch replaces the prediction.
- **Appetite**: medium
- **Trade-offs**: Wins: money moves in the same frame as the client-computed duration, with no polling. Loses: pricing arithmetic in TypeScript, Swift and SQL, needing a parity test (Principle II). Each client splits sessions that cross midnight, a week or a month itself. Web and macOS can drift apart.
- **Rabbit holes**: Splitting sessions that cross midnight, a week or a month, done twice. The month projection taking in a moving value.

### Option C — Live, time and money both from the server, refetched each minute
- **Sketch**: The server counts a running entry up to now in every time and money figure it returns, priced and split across days, weeks and months by the existing SQL. Running time goes into separate fields or display-only paths, so nothing that feeds invoicing counts it. While a timer runs, clients refetch the home figures each minute and show what comes back. Only the running timer's own seconds clock stays on the client.
- **Appetite**: small to medium
- **Trade-offs**: Wins: one implementation, so no parity test. Time and money come from one answer, so they agree, and they stop together if a refetch fails. Sessions that cross a boundary are already handled. Web and macOS can't drift apart. Loses: one request a minute per open client while a timer runs (negligible for one user, no fixed cost). Today's `h:mm` can lag the timer's seconds clock by under a minute.
- **Rabbit holes**: Keeping running time out of every path that feeds invoicing while including it in what's displayed. The entries endpoint returning a running entry's length so far, not null. How many queries a refetch triggers on each client.

## Recommendation

**Option C.** It removes the cause, not the symptom: every figure on a screen comes from one server answer, so none can contradict another. It meets all three goals: figures agree while the timer runs, stopping causes no jump, and web and macOS match. It also adds no logic to the clients, keeping the server as the one source of the time it already owns (Principle III). B's advantage (no polling, money moving in the same frame) only matters while the duration is computed on the client, and C stops doing that.

## Out of Scope (for the recommended option)

- How invoices are priced, and making a running entry billable or invoiceable.
- Fixing a project's missing or wrong rate. The `$0.00` for 22m is checked separately.
- The running timer's own seconds clock, which stays on the client.
- Projection math, beyond taking in the live Earned.
- Refreshing more often than once a minute.

## Assumptions to Validate

- Every rollup that feeds an invoice can keep excluding running time, while what's displayed includes it.
- A refetch each minute of `/stats` and today's entries is cheap enough for Supabase Pro and doesn't cause the screen to flicker or shift.
- Today's `h:mm` lagging the seconds clock by under a minute isn't read as a contradiction.
- Unbilled on the macOS menu bar should go up live too (open question in `problem.md`).
