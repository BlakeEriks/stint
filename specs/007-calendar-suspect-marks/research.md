# Research: The calendar marks its own suspect entries

## Where the calendar learns which entries are suspect

**Decision**: From `GET /api/v1/stats`'s `attention.overlaps` and
`attention.strangeDurations`, through the query `keys.stats(tz)` the folded
dock and the Inbox already run.

**Rationale**: It is the Inbox's own answer (FR-003), computed on the server
over every unbilled entry, so a mark and an Inbox row can't disagree. The
query is already on screen for the strip's count, so TanStack Query dedupes
it: no new request. `invalidateEntryData` already refetches it after every
calendar edit.

**Alternatives considered**: Detecting overlaps from the week's calendar
entries on the client (a second implementation that would disagree with the
Inbox on billed pairs and on entries outside the week, and need a parity
test); adding a `suspect` field to `/calendar` (a server change and a second
place the Inbox's judgment is called from, for no gain while `/stats` is
already loaded).

## Wording of the reason

**Decision**: The Inbox's own qualifiers, lowercased to follow the block's
name and times: "overlaps <other task>" (with "on <invoice>" when the other
is billed) and "unusually short" or "unusually long". Several reasons join
with ", ".

**Rationale**: One vocabulary for one fact, and color never carries the
meaning alone.

## How the mark looks

**Decision**: `border-timer-warning` in place of `border-edge-subtle`, and
lucide's `TriangleAlert` at 12px in `text-warning`, absolutely placed in the
block's top-right corner, `aria-hidden`.

**Rationale**: `timer-warning` and `warning` are the tokens the Inbox's
warning rows already use, so the block and its row read as the same fault.
The left edge belongs to the client's color and stays. A glyph gives a
non-color cue at any block height; the name and tooltip give the words.

**Alternatives considered**: A warning fill (no tinted warning token exists,
and a tint would need a new one in `tokens.json`); a left-edge rule like the
Inbox's (the left edge is the client's).

## Failure of `/stats`

**Decision**: No marks, and nothing said on the calendar.

**Rationale**: The folded dock already reports a failed Inbox; a second
notice on the calendar would report one failure twice. The grid stays
correct without the marks (FR-006).
