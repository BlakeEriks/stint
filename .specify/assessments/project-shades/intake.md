# Idea Intake: Projects get shades of their client's color

- **Slug**: project-shades
- **Created**: 2026-09-28
- **Source**: pasted text (chat)
- **Type**: improvement

## Idea (as captured)

> I only have 1 client so i only get 1 color on my home page. Should we add per-project colors which are in the spectrum of the client's color?

## Restated

Give each project its own color, derived from its client's color, so a
contractor with one client can tell projects apart on the home page while
work still reads as grouped by client.

## Origin & Context

- **Raised by**: Blake
- **Trigger**: With one client, every bar, strip segment, and legend entry on
  the home page is the same color. Today color belongs to the client
  (`docs/design/principles.md`), resolved through `useProjectColors()`, and
  internal work gets none.

## First-Glance Unknowns

- [NEEDS CLARIFICATION: Is the home page the only surface where one color hurts, or do the entry list, calendar, project picker, and macOS menu bar need it too?]
- [NEEDS CLARIFICATION: Does a project's shade come from its order, its id, or a user's choice, and does it stay stable when projects are added or archived?]
- [NEEDS CLARIFICATION: How many shades of one hue stay distinguishable in both themes before they blur together, and what happens past that count?]
- [NEEDS CLARIFICATION: Can a shade collide with the accent green, `success`, or another client's color?]
- [NEEDS CLARIFICATION: Does internal work, which has no client, stay uncolored, or do its projects get shades of a neutral?]
- [NEEDS CLARIFICATION: Principle says color belongs to the client. Does a per-project shade change that meaning or only refine it?]
- [NEEDS CLARIFICATION: Does a single-client user have another way to tell projects apart today, such as labels or the legend, and is that enough?]
