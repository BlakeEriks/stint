# Quickstart: The calendar marks its own suspect entries

No data or API change. Run the web app (`docs/local-dev.md`), sign in as the
seeded account.

1. Open Calendar at 1280px or wider. Drag a block so it runs into the next
   one, and let go. Once it saves, the later of the two shows a warning
   border and a triangle in its corner; hover it and the tooltip ends
   "overlaps <the other task>". The strip's Inbox count goes up by one.
2. Drag it back. Once it saves, the mark goes and the count drops.
3. Drag a block's end past the long threshold in Settings (12h by default).
   Its block is marked "unusually long".
4. Press a marked block: its editor opens, nothing changed.
5. At phone width, the day view marks the same blocks.

Stories: `Screens/Calendar › Suspect Overlap`, `Suspect Long`,
`Suspect Both`, `Stats Failed`.
Suite: `pnpm --filter @stint/web test:ui -- suspects`.
