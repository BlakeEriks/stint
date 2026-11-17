Closes #759

# Feature Specification: Rename a task name across all its entries in one request

**Feature Branch**: `rename-task`

**Created**: 2026-11-17

**Status**: Draft

**Input**: Issue #759. A contractor's task names drift across weeks of
entries ("Desing review" and "Design review", or a workstream renamed
halfway). Grouped by task, an invoice prints each spelling as its own line,
and today the only fix is renaming entry by entry. One API request renames
every entry with a given task name to another, optionally within one
project. API only: no web, macOS or MCP surface yet. Stacks on #758 (PR
#798), which lets a billed entry's task name rename.

## Clarifications

### Session 2026-11-17

- Q: Before #758 lands, does the request skip billed entries or does the
  feature wait? → A: It waits: this branch stacks on #798 and merges after
  it, so billed entries rename like any other and issued invoices keep the
  names they printed. (the issue's preferred answer)
- Q: Exact match on the old name, or case- and whitespace-insensitive? →
  A: Case-insensitive, nothing else. The task-name suggestions already
  treat "Standup" and "standup" as one name and show only the latest
  spelling, so a user renaming the name they see expects every case variant
  to follow. Whitespace is not collapsed: the suggestions keep it, so a name
  that differs in spaces is shown, and renamed, on its own. (decided
  autonomously)
- Q: May the new name equal one that already exists? → A: Yes. Merging two
  names into one is the point. (the issue's answer)
- Q: What does the response say? → A: How many entries changed. An entry
  that already carries the new name exactly is not counted and not written,
  so a retry changes nothing and answers 0. (decided autonomously)
- Q: May the old or new name be empty? → A: No. The empty name is a timer
  started in a hurry; renaming every one of those at once is a different
  action, and renaming to empty erases names rather than fixing them.
  Either is refused. (decided autonomously)
- Q: Does "within one project" reach entries with no project? → A: No. The
  filter is a project's id or nothing; an entry with no project is renamed
  only when no project is given. The inbox already asks the user to give
  those a project. (decided autonomously)
- Q: Does a running entry rename? → A: Yes, as editing a running timer's
  task does, and its other devices hear about it as they do for that edit.
  (decided autonomously)

## Design

No design review: the feature has no screen. A screen that shows tasks as a
whole is its own design question, left to a later issue. (decided
autonomously)

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Rename a task name everywhere (Priority: P1)

The user sends one request naming the old task name and the new one. Every
one of their entries carrying the old name, in any case, now carries the
new one: unbilled, held by a draft, billed on an issued invoice, or
running. The response says how many changed.

**Why this priority**: It is the whole feature.

**Independent Test**: With entries named "Desing review", "desing review"
and "Design review", rename "Desing review" to "Design review" and list
entries: all three read "Design review", and the response says 2.

**Acceptance Scenarios**:

1. **Given** entries named "Desing review" and "desing review", **When**
   the user renames "Desing review" to "Design review", **Then** both read
   "Design review" and the response counts 2.
2. **Given** an entry already named "Design review", **When** another name
   is merged into it, **Then** that entry is untouched and not counted.
3. **Given** an entry billed on a sent invoice, **When** its task name is
   renamed, **Then** the entry carries the new name and the invoice's lines
   keep the name they were sent with.
4. **Given** a draft holding an entry, **When** its task name is renamed,
   **Then** the draft's lines show the new name.
5. **Given** another user's entry with the same name, **When** the user
   renames it, **Then** the other user's entry is unchanged.
6. **Given** the same request sent twice, **When** the second arrives,
   **Then** it changes nothing and counts 0.

---

### User Story 2 - Rename within one project (Priority: P2)

The user names a project too, and only that project's entries rename. The
same name under another project, or under none, keeps its name.

**Why this priority**: The same words can mean different work for two
clients; renaming one should not rename the other.

**Independent Test**: With "Standup" under projects A and B, rename it to
"Daily sync" within A: A's entries change, B's don't.

**Acceptance Scenarios**:

1. **Given** "Standup" under projects A and B and under no project,
   **When** it is renamed within A, **Then** only A's entries change.

### Edge Cases

- No entry carries the old name: nothing changes and the response counts 0.
- The old or new name is empty: refused, nothing changes.
- The new name is longer than any task name may be: refused, as on any
  entry edit.
- The old name differs from the new one only in case: every variant takes
  the new spelling, and only the entries whose spelling changed count.
- The project named is not the user's: nothing of theirs matches, so it
  counts 0, as listing entries for it returns none.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The API MUST rename, in one request, every one of the
  caller's entries whose task name matches the old name case-insensitively.
- **FR-002**: The request MAY name one project; then only that project's
  entries rename.
- **FR-003**: The response MUST give how many entries changed, counting
  only entries whose name differed from the new name.
- **FR-004**: Billed, draft-held and running entries MUST rename like any
  other; issued invoices MUST keep the names they were sent with.
- **FR-005**: An empty old or new name, or a new name over the task name
  length limit, MUST be refused with nothing changed.
- **FR-006**: The rename MUST be all or nothing: either every matching
  entry renames or none does.
- **FR-007**: A renamed running entry MUST reach the user's other devices
  as a task name edit on the running timer does.

### Key Entities

- **Time entry's task name**: free text on each entry, no table of its
  own; a "task" is every entry sharing a name.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Merging two spellings of a task across any number of entries
  takes one request, where today it takes one per entry.
- **SC-002**: After a merge, an invoice built for the period prints one
  line for the task where it printed two.

## Assumptions

- #758 (PR #798) merges first; without it a billed entry refuses the
  rename and the whole request fails.
- No client calls it yet; Constitution VI's pending state is owed by the
  first screen that does.
- What it removes (Principle VII): nothing. No state, setting or path
  covers renaming many entries at once; per-entry rename stays, since a
  single entry's name is still edited on its own.
