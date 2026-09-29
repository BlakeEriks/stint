# Idea Intake: Every press answers at once

- **Slug**: instant-feedback
- **Created**: 2026-09-28
- **Source**: pasted text (chat), with issue https://github.com/BlakeEriks/stint/issues/11 and closed PR https://github.com/BlakeEriks/stint/pull/118 (allowlisted)
- **Type**: improvement

## Idea (as captured)

> Responsiveness and loading states, across web and macOS. Every user press changes the screen in the same frame, showing the expected result, not an in-between state; the server stays the source of truth and a rejection rolls back visibly with the reason (never silently). One shared mechanism per platform (web: TanStack Query optimistic updates in one shared mutation helper; macOS: one equivalent in the model layer) so new mutations are instant by default, not per-button. Covers timer start/stop/rename including restarting a recent task from the macOS menu bar, plus inbox, invoices, clients, payment profiles, calendar drag. Also covers render lag when switching tabs in the web app (apps/web/src/app has no loading.tsx; add route loading boundaries and prefetch). Adds a constitution principle so responsiveness is policy, not one-off fixes, with a check that enforces it. Supersedes closed PR #118 (per-surface phase/pending state machines that missed the menu-bar recent-task restart path) and folds in issue #11; #118's race tests (rename answering after stop, stale summary refresh landing after a press) become acceptance cases.

Issue #11, "Every loading state was only ever seen at localhost latency" (opened 2026-09-24): start and stop feel clunky in production. `useTimer` has no `onMutate`, so the bar shows the old state for the round trip plus the refetch. `TimerModel.toggle()` on macOS awaits the mutation and then a refresh. The issue says an optimistic start must never claim green before the server confirms, and asks for every mutation, listing and screen transition to be walked at about 1 s and 3 s of added latency.

## Restated

Make every user action in the web and macOS apps change the screen immediately, through one shared mechanism per platform. Make switching tabs in the web app render without waiting on the server. Record this as a constitution principle with a check that enforces it.

## Origin & Context

- **Raised by**: Blake
- **Trigger**: PR #118 fixed the timer with separate hand-built state machines on each platform. It missed restarting a recent task from the macOS menu bar, and it left the app's other mutations unaddressed. Blake closed it in favor of one policy. Tab-switch lag on the web app was noticed separately.

## First-Glance Unknowns

- [NEEDS CLARIFICATION: Principle V says the server owns timer truth, and #11 says the accent must not appear until the server confirms. Does "the expected result, not an in-between state" mean a predicted start shows green, or is the running state an exception?]
- [NEEDS CLARIFICATION: Is `startedAt` stamped by the client (so the clock can run from the press) or by the server?]
- [NEEDS CLARIFICATION: How does a rolled-back change tell the user why, on each platform, and where does that message appear?]
- [NEEDS CLARIFICATION: How much of the tab-switch lag comes from missing loading boundaries, and how much from data fetching or render cost?]
- [NEEDS CLARIFICATION: What check can enforce "every mutation goes through the shared helper" on web and on Swift?]
- [NEEDS CLARIFICATION: What happens to a predicted change when the user navigates away or quits before the server answers?]
- [NEEDS CLARIFICATION: Which mutations exist today on each platform, and does any of them lack an obvious predicted result (for example, generating an invoice)?]
