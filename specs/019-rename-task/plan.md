# Implementation Plan: Rename a task name across all its entries in one request

**Branch**: `rename-task` | **Date**: 2026-11-17 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/019-rename-task/spec.md`

## Summary

`POST /api/v1/entries/task-names/rename` takes `{ from, to, projectId? }`
and returns `{ renamed }`. One SQL function, `rename_task_name`, does it in
a single `update`: the caller's entries whose name matches `from`
case-insensitively, within the project if given, and not already exactly
`to`. It returns the count and whether the running entry was among them,
so the route can tell the user's other devices as a timer edit does.
Stacks on #798, which frees a billed entry's task name.

## Technical Context

**Language/Version**: TypeScript, Next.js App Router; SQL

**Primary Dependencies**: none new

**Storage**: one new function, no table change; a migration

**Testing**: `apps/web/test/routes.test.ts` (the route, against real
Postgres), `apps/web/test/rls.test.ts` (the function under RLS)

**Target Platform**: API

**Project Type**: Web app

**Performance Goals**: one statement per request

**Constraints**: merges after #798

**Scale/Scope**: one route, one function, one schema

## Constitution Check

| Principle | Applies | How the design meets it |
| --- | --- | --- |
| I. Never silently modifies user data | Yes | It renames only what the request names, and says how many |
| II. Logic written twice has a parity test | No | The match lives only in SQL |
| III. Every client through `/api/v1` | Yes | A route; no client yet |
| IV. `packages/core` does no I/O | No | Nothing in core changes |
| V. Tests first | Yes | Route and RLS tests before the code |
| VI. Every press answers in the same frame | Later | No client; its first screen shows a pending state |
| VII. A feature names what it removes | Yes | Nothing: no state covers renaming many entries |

Additional Constraints: billed entries' time and money stay locked (#798);
no new fixed cost.

## Project Structure

```text
specs/019-rename-task/
├── plan.md, research.md, data-model.md, quickstart.md, tasks.md
└── contracts/rename.md
```

```text
supabase/migrations/<ts>_rename_task_name.sql      # the function
packages/schema/src/entries.ts                     # RenameTaskName
apps/web/src/app/api/v1/entries/task-names/rename/route.ts
apps/web/test/routes.test.ts, apps/web/test/rls.test.ts
docs/api.md
```

**Structure Decision**: under `/entries/task-names`, the resource it
renames, as `POST .../rename`: it is an action across rows, not one row's
update.

## Complexity Tracking

None.
