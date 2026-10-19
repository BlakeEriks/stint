# Implementation Plan: The dock folds on workspace screens

**Branch**: `f207-dock-fold` | **Date**: 2026-10-12 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/006-dock-fold/spec.md`

## Summary

On a workspace screen at `xl`, the frame's third column becomes a 44px strip
with an Inbox icon (and its count) and a Today icon, instead of nothing. Each
opens a non-modal popover over the panel holding the dock's own `Inbox` or
`EntryList`. Below `xl`, workspace screens show the full dock band like every
other screen. Web only; no data, API or macOS change.

## Technical Context

**Language/Version**: TypeScript, React 19, Next.js App Router

**Primary Dependencies**: `radix-ui` (`Popover`), TanStack Query, Tailwind 4, lucide-react

**Storage**: N/A

**Testing**: Vitest `apps/web/test/ui` (the hook), Storybook stories rendered in a real browser (each visible state)

**Target Platform**: The web app, desktop and phone widths

**Project Type**: Web application

**Performance Goals**: Opening and closing a fold answers in the same frame (Constitution VI)

**Constraints**: The strip is at most 44px; the panel keeps the rest of the dock's room

**Scale/Scope**: Two components touched (`AppShell`, `Dock`), one new part, one new hook

## Constitution Check

| Principle (`.specify/memory/constitution.md`) | Applies | How the design meets it |
| --- | --- | --- |
| I. Never silently modifies user data | No | Nothing is written; the fold shows the existing Inbox, whose actions are unchanged. |
| II. Logic written twice has a parity test | No | The count is one function, `inboxCount`, used by both the Inbox and the strip. |
| III. Every client through `/api/v1`; server owns timer truth | Yes | The strip reads the same `/stats` and `/entries` queries the dock does. No Server Action. |
| IV. `packages/core` does no I/O | No | Nothing goes into core. |
| V. Tests first where a regression is silent | Yes | `useDockFold` (closes on navigation and below `xl`) is client logic, tested first in `apps/web/test/ui/use-dock-fold.test.tsx`. Each visible state is a story: strip, count, none, Inbox open, Today open, editor over a fold, and the band below `xl`. |
| VI. Every press answers in the same frame | Yes | Open and close are local state, with no server round trip. Writes inside the fold already go through `useOptimisticMutation`. |

Additional Constraints: no new fixed cost; online-only, US-first unaffected.

Post-design re-check: passes; nothing in Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/006-dock-fold/
├── plan.md
├── research.md
├── quickstart.md
└── tasks.md
```

No `data-model.md` or `contracts/`: the feature has no data and no API.

### Source Code (repository root)

```text
apps/web/src/components/
├── app-shell.tsx            # grid: 44px third column on a workspace at xl; mounts DockStrip
├── app-shell.stories.tsx    # Workspace story: the strip at wide, the band at phone
├── dock.tsx                 # full dock hides on a workspace at xl only
├── dock-strip.tsx           # NEW: the strip and its two popovers
├── dock-strip.stories.tsx   # NEW: one story per visible state
└── inbox.tsx                # exports inboxCount(), used by its header and the strip
apps/web/src/lib/client/
└── use-dock-fold.ts         # NEW: which region is open, derived from pathname and XL
apps/web/test/ui/
└── use-dock-fold.test.tsx   # NEW
.claude/rules/web-ui.md      # the strip as a third icon-only exception; workspace line
```

**Structure Decision**: The strip is its own part because it is a different
arrangement of the dock's regions, not a state of the dock's column; the
regions themselves (`Inbox`, `EntryList`) are reused unchanged.

## Complexity Tracking

None.
