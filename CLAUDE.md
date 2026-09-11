# Time Tracking — working notes

A time tracker for solo contractors. The product thesis is **restraint**; Toggl
is the comparison point and it does too much.

Read `docs/decisions/` before changing anything structural. The four ADRs cover
choices that were made deliberately and should not be re-litigated casually.

## Non-negotiables

**One running timer per user, enforced by a database index.** Not by API code.
`POST /timer/start` returns 409 when one is running. Never add a code path that
could produce overlapping entries.

**The app never silently modifies user data.** Runaway timers are surfaced, not
auto-trimmed. Rates freeze onto invoices at generation. This is a billing
system — silent correction destroys trust in every number it reports.

**Server owns timer truth; clients own responsiveness.** A running timer ticks
locally from `startedAt`, but the server decides whether it is running.

**The accent (green `#52FC43`) appears in one place at a time: the running
timer.** Not navigation, not secondary buttons, not links. Green never means
success — success is cyan `#2CCCEB`.

**Never white text on the accent** — 1.37:1. Use `--text-on-accent`. CI guards
this specific regression.

## Conventions

- **No Server Actions** for anything Expo or Swift also needs. Everything goes
  through `/api/v1/*` route handlers.
- Colors come from **semantic** tokens only. Primitives stay in the token
  package. Never hardcode a hex in a component.
- Design tokens are **generated** — edit `packages/design-tokens/tokens.json`,
  then `pnpm tokens`. Never edit files in `dist/`.
- Durations are always mono + `tabular-nums`.
- Time entry ids are **client-generated UUIDv7** (`uuidv7()` in `@tt/core`) so
  offline retries are idempotent.
- Rate resolution exists in SQL (authoritative) and TS (previews). Keep them in
  sync; the database wins.
- `0` is a valid rate. Use null-coalescing, never truthiness.
- Archive, don't delete — invoices reference clients and projects.

## Verifying the schema

No Supabase CLI installed. To test migrations, start a throwaway Postgres
(`/opt/homebrew/opt/postgresql@14/bin`) on a spare port over TCP — the socket
path in the scratchpad exceeds the 103-byte limit — stub `auth.users` and
`auth.uid()`, apply both migrations, then tear it down.
