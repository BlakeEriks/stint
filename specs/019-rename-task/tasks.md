# Tasks: Rename a task name across all its entries in one request

**Input**: [plan.md](plan.md), [spec.md](spec.md), [contracts/](contracts/)

Tests come first where Constitution V asks.

## Phase 1: User Story 1 + 2 — Rename, everywhere or within a project (P1, P2)

- [x] T001 [US1] [US2] Tests in `apps/web/test/routes.test.ts`: case variants rename and count; an exact match is untouched; a billed entry renames and its sent lines keep their name; a running entry renames and the browsers hear of it; a retry counts 0; within a project only its entries rename; blank and overlong names are `422` in the refusal table
- [x] T002 [US1] Test in `apps/web/test/rls.test.ts`: the function, called with another user's id, renames nothing of theirs
- [x] T003 [US1] Migration: `rename_task_name` in `supabase/migrations/`
- [x] T004 [US1] `RenameTaskName` in `packages/schema/src/entries.ts`
- [x] T005 [US1] [US2] `apps/web/src/app/api/v1/entries/task-names/rename/route.ts`

## Phase 2: Polish

- [x] T006 Docs: `docs/api.md`
- [x] T007 Verify: doc drift, `pnpm verify:static`, `verify:db`
