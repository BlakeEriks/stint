# Problem Definition: Money figures ignore the running timer

- **Slug**: live-earned
- **Created**: 2026-10-02
- **Inputs used**: intake.md (research skipped: the problem is observed in the app and located in code)

## Problem Statement

While a timer runs, the contractor sees time grow but money stand still. Every money figure (Today, the week, the month, the menu bar) leaves out the session in progress, then jumps when the timer stops. So the screen contradicts itself during the very work it is meant to reflect.

## Affected Users & Stakeholders

- **Users**: the US solo contractor billing hourly (`docs/positioning.md`). They look at the app mid-session and see `$0.00` beside `22m`. Positioning says they come to the product to see money and to trust that the number is right.
- **Stakeholders**: Blake, as owner, decides scope.

## Goals

- While a timer runs, each money figure agrees with the time shown beside it.
- Stopping the timer does not change any money figure, other than to correct a prediction.
- Web and macOS behave the same way.

## Non-Goals

- Changing how an invoice is priced or what it bills.
- Making a running entry billable or invoiceable before it stops.
- Fixing a missing or wrong rate on a project. If `$0.00` turns out to be a rate problem, it gets its own issue.
- Projection math beyond what the month figure needs to stay consistent.

## Success Metrics

- With a timer running on a rated project, no visible money figure lags the visible time by more than one tick. Baseline: every money figure lags until stop.
- The change in a money figure at the moment of stop is $0.00 when the prediction was right. Baseline: the whole session's value.
- Web and the macOS menu bar show the same amount for the same figure at the same moment. Qualitative, checked in QA.

## Cost of Inaction

The most-watched number on the home screen is wrong exactly when the user is working. Each stop causes a jump, which reads as the bill moving, the distrust that positioning says brings users here. Users learn to ignore Earned until they stop the timer.

## Open Questions

- [NEEDS CLARIFICATION: Which figures are in scope? Earned (Today, week bars, month, month projection, dock) is clear. The macOS menu bar shows **Unbilled**, not Earned (`apps/macos/Sources/Stint/API.swift:36`), and Unbilled also excludes running entries (`00000000000007_unbilled_rollup.sql:41`). Does Unbilled tick live too, on web and macOS?]
- [NEEDS CLARIFICATION: Is "live" the expectation, or would leaving running entries out of every figure until stop (time included) meet the goals? Blake leans live.]
- [NEEDS CLARIFICATION: Under printed-hours rounding (#199), is a figure that steps at each rounding increment, not every minute, acceptable as "agreeing"?]
- [NEEDS CLARIFICATION: How should a session that crosses midnight, a week boundary or a month boundary count?]
- [NEEDS CLARIFICATION: Is the `$0.00` for 22m a missing rate or a rate-resolution bug?]
