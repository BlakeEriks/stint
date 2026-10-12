# Research: The dock folds on workspace screens

## How the strip appears only on a workspace screen at `xl`

**Decision**: CSS, the way the full dock already hides. `AppShell`'s grid
reads `data-workspace` through `:has()`; at `xl` a workspace screen's third
column becomes 44px instead of disappearing. The full dock hides at `xl` only
(`xl:group-has-[[data-workspace]]/app:hidden`), so below `xl` a workspace
shows the band like every other screen. The strip is
`hidden xl:group-has-[[data-workspace]]/app:flex`.

**Rationale**: The frame never checks a route (`Page`'s `workspace`), and a
screen that becomes a workspace later gets the strip for free.

**Alternatives considered**: Reading the route in the frame (a second source
for which screens are workspaces); hiding the band below `xl` as today
(keeps the Inbox out of reach on a phone for no width gained).

## What an open fold is

**Decision**: A Radix `Popover` per icon (`radix-ui`, already a dependency),
non-modal, `side="left"`, `align="start"`, 286px wide, scrolling inside
`--radix-popover-content-available-height`. Its open region is controlled by
`useDockFold()`.

**Rationale**: A non-modal popover is the ARIA disclosure pattern this is:
the trigger gets `aria-expanded` and `aria-controls`, Escape and an outside
press close it, focus moves in on open and back to the trigger on close, and
focus leaving it closes it, with no trap. Radix's layer stack keeps a modal
dialog opened from inside (the entry editor) from dismissing the popover
under it, because the dialog is a child layer in the React tree.

**Alternatives considered**: A `Dialog` (traps focus and dims the screen,
which spends a modal on a glance); a hand-rolled panel (re-implements
dismissal and focus return that Radix already gives, and gets them wrong).

## Closing on navigation and below `xl`

**Decision**: `useDockFold()` stores the open region with the pathname it
was opened on, and derives "open" as: same pathname, and `XL` matches. No
effect closes it; the state just stops applying.

**Rationale**: Derived state can't be left stale by a missed event, and it
needs no cleanup. A navigation from a row inside the fold (an overdue
invoice) closes it in the same render.

**Alternatives considered**: A `useEffect` on `usePathname()` calling
`setOpen(null)` (a render with the stale fold first).

## The Inbox count

**Decision**: `inboxCount(attention)` in `inbox.tsx`, the sum of the five
attention lists, used by the Inbox's own header and the strip.

**Rationale**: One count for both, so the strip never disagrees with the
Inbox it opens.

## The tooltip

**Decision**: A native `title` on each icon, with an `aria-label` carrying
the name and count.

**Rationale**: The accessible name is the `aria-label`; the tooltip is a
pointer hint, and a `title` gives it without a new component.

**Alternatives considered**: Radix `Tooltip` (a new vendored component for
two buttons).
