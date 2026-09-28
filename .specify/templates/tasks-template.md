---

description: "Task list template for feature implementation"
---

# Tasks: [FEATURE NAME]

**Input**: Design documents from `/specs/[###-feature-name]/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Required. Each user story gets the suites constitution V names for the code it touches, and a story that changes what a user sees gets a task for its `*.stories.tsx`, one story export per acceptance scenario the user sees.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- The tree is in plan.md's Project Structure. Tests go where constitution V
  names: `apps/web/test/routes.test.ts`, `apps/web/test/rls.test.ts`,
  `packages/core/test/`, a sibling `*.stories.tsx`, `apps/web/e2e/`

<!--
  ============================================================================
  IMPORTANT: The tasks below are SAMPLE TASKS for illustration purposes only.

  The /speckit-tasks command MUST replace these with actual tasks based on:
  - User stories from spec.md (with their priorities P1, P2, P3...)
  - Feature requirements from plan.md
  - Entities from data-model.md
  - Endpoints from contracts/

  Tasks MUST be organized by user story so each story can be:
  - Implemented independently
  - Tested independently
  - Delivered as an MVP increment

  DO NOT keep these sample tasks in the generated tasks.md file.
  ============================================================================
-->

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

- [ ] T001 Create project structure per implementation plan
- [ ] T002 Initialize [language] project with [framework] dependencies
- [ ] T003 [P] Configure linting and formatting tools

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

Examples of foundational tasks (adjust based on your project):

- [ ] T004 Setup database schema and migrations framework
- [ ] T005 [P] Implement authentication/authorization framework
- [ ] T006 [P] Setup API routing and middleware structure
- [ ] T007 Create base models/entities that all stories depend on
- [ ] T008 Configure error handling and logging infrastructure
- [ ] T009 Setup environment configuration management

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - [Title] (Priority: P1) 🎯 MVP

**Goal**: [Brief description of what this story delivers]

**Independent Test**: [How to verify this story works on its own]

### Tests for User Story 1 ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T010 [P] [US1] Route test for [endpoint] in apps/web/test/routes.test.ts
- [ ] T011 [P] [US1] Core test for [rule] in packages/core/test/[name].test.ts
- [ ] T011a [P] [US1] Story per acceptance scenario the user sees in apps/web/src/components/[name].stories.tsx

### Implementation for User Story 1

- [ ] T012 [P] [US1] Add [Entity1] to packages/schema/src/index.ts and a migration in supabase/migrations/
- [ ] T013 [P] [US1] Add [Entity2] to packages/schema/src/index.ts and a migration in supabase/migrations/
- [ ] T014 [US1] Implement [logic] in packages/core/src/[name].ts (depends on T012, T013)
- [ ] T015 [US1] Implement [endpoint] in apps/web/src/app/api/v1/[path]/route.ts
- [ ] T016 [US1] Add validation and error handling
- [ ] T017 [US1] Add logging for user story 1 operations

**Checkpoint**: At this point, User Story 1 should be fully functional and testable independently

---

## Phase 4: User Story 2 - [Title] (Priority: P2)

**Goal**: [Brief description of what this story delivers]

**Independent Test**: [How to verify this story works on its own]

### Tests for User Story 2 ⚠️

- [ ] T018 [P] [US2] Route test for [endpoint] in apps/web/test/routes.test.ts
- [ ] T019 [P] [US2] Core test for [rule] in packages/core/test/[name].test.ts
- [ ] T019a [P] [US2] Story per acceptance scenario the user sees in apps/web/src/components/[name].stories.tsx

### Implementation for User Story 2

- [ ] T020 [P] [US2] Add [Entity] to packages/schema/src/index.ts and a migration in supabase/migrations/
- [ ] T021 [US2] Implement [logic] in packages/core/src/[name].ts
- [ ] T022 [US2] Implement [endpoint] in apps/web/src/app/api/v1/[path]/route.ts
- [ ] T023 [US2] Integrate with User Story 1 components (if needed)

**Checkpoint**: At this point, User Stories 1 AND 2 should both work independently

---

## Phase 5: User Story 3 - [Title] (Priority: P3)

**Goal**: [Brief description of what this story delivers]

**Independent Test**: [How to verify this story works on its own]

### Tests for User Story 3 ⚠️

- [ ] T024 [P] [US3] Route test for [endpoint] in apps/web/test/routes.test.ts
- [ ] T025 [P] [US3] Core test for [rule] in packages/core/test/[name].test.ts
- [ ] T025a [P] [US3] Story per acceptance scenario the user sees in apps/web/src/components/[name].stories.tsx

### Implementation for User Story 3

- [ ] T026 [P] [US3] Add [Entity] to packages/schema/src/index.ts and a migration in supabase/migrations/
- [ ] T027 [US3] Implement [logic] in packages/core/src/[name].ts
- [ ] T028 [US3] Implement [endpoint] in apps/web/src/app/api/v1/[path]/route.ts

**Checkpoint**: All user stories should now be independently functional

---

[Add more user story phases as needed, following the same pattern]

---

## Phase N: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [ ] TXXX [P] Documentation updates in docs/
- [ ] TXXX Code cleanup and refactoring
- [ ] TXXX Performance optimization across all stories
- [ ] TXXX [P] Additional core tests in packages/core/test/
- [ ] TXXX Security hardening
- [ ] TXXX Run quickstart.md validation

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3+)**: All depend on Foundational phase completion
  - User stories can then proceed in parallel (if staffed)
  - Or sequentially in priority order (P1 → P2 → P3)
- **Polish (Final Phase)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 2 (P2)**: Can start after Foundational (Phase 2) - May integrate with US1 but should be independently testable
- **User Story 3 (P3)**: Can start after Foundational (Phase 2) - May integrate with US1/US2 but should be independently testable

### Within Each User Story

- Tests and stories MUST be written and FAIL before implementation
- Models before services
- Services before endpoints
- Core implementation before integration
- Story complete before moving to next priority

### Parallel Opportunities

- All Setup tasks marked [P] can run in parallel
- All Foundational tasks marked [P] can run in parallel (within Phase 2)
- Once Foundational phase completes, all user stories can start in parallel (if team capacity allows)
- All tests for a user story marked [P] can run in parallel
- Models within a story marked [P] can run in parallel
- Different user stories can be worked on in parallel by different team members

---

## Parallel Example: User Story 1

```bash
# Launch all tests for User Story 1 together (if tests requested):
Task: "Route test for [endpoint] in apps/web/test/routes.test.ts"
Task: "Core test for [rule] in packages/core/test/[name].test.ts"

# Launch all models for User Story 1 together:
Task: "Add [Entity1] to packages/schema/src/index.ts and a migration in supabase/migrations/"
Task: "Add [Entity2] to packages/schema/src/index.ts and a migration in supabase/migrations/"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL - blocks all stories)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: Test User Story 1 independently
5. Deploy/demo if ready

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 → Test independently → Deploy/Demo (MVP!)
3. Add User Story 2 → Test independently → Deploy/Demo
4. Add User Story 3 → Test independently → Deploy/Demo
5. Each story adds value without breaking previous stories

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: User Story 1
   - Developer B: User Story 2
   - Developer C: User Story 3
3. Stories complete and integrate independently

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Verify tests fail before implementing
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Avoid: vague tasks, same file conflicts, cross-story dependencies that break independence
