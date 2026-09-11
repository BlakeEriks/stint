# ADR 0004 — Runaway timers are surfaced, never auto-corrected

**Status:** accepted · **Date:** 2026-09-11

## Context

The most common way a time tracker produces a wrong invoice: you forget to stop
at 5pm and come back at 9am to a 16-hour entry. Toggl handles this with idle
detection and a discard prompt.

## Decision

A configurable threshold (`user_settings.max_timer_hours`, default 8). Past it:

- Clients render the timer in `--timer-warning` instead of the accent —
  computed locally, no server involvement.
- `GET /timer/current` returns `exceedsThreshold: true`.
- The client prompts on open: **keep**, **adjust**, or **discard**.
- A push notification fires at the threshold so it is caught the same day.

**The app never edits the entry automatically.**

## Rationale

Auto-trimming would mean the billing system silently changed a record of
billable work. Even when the guess is right, the user cannot tell what happened
— and in a system whose output is an invoice, that is a trust failure.

Surfacing costs one prompt. Silent correction costs confidence in every number
the app reports.

macOS idle detection was considered and deferred: it is Mac-only and needs a
background watcher, while the threshold rule works identically on all three
platforms with one implementation.

## Consequences

- A forgotten timer still produces a long entry — but a visibly flagged one.
- Push notifications require APNs and FCM setup (deferred; not needed for first
  working software).
