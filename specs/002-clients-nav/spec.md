Closes #158

# Feature Specification: One Clients nav item

**Feature Branch**: `f158-clients-nav`

**Created**: 2026-09-28

**Status**: Draft

**Input**: User description: "Merge Clients and Projects into one Clients nav item" (#158)

## Clarifications

### Session 2026-09-28

- Q: Under Active, does an active project under an archived client show? → A: No; it hides with its client and shows under Archived and All.
- Q: Under Archived, does an active client's heading show above its archived projects? → A: Yes, without an Archived badge, above only its archived projects.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See every client and project in one place (Priority: P1)

A contractor opens **Clients** and sees each client as a heading with its
rate and a summary line (project count, unbilled amount, email), and that
client's projects beneath it. Projects with no client sit under a **No
client** heading. There is no separate **Projects** item in the nav.

**Why this priority**: This is the merge. Without it nothing else here
matters.

**Independent Test**: Sign in with clients, projects and a client-less
project; open **Clients**; every project appears once, under its client or
under **No client**, and the nav has no **Projects** item.

**Acceptance Scenarios**:

1. **Given** two clients with projects, **When** the contractor opens
   Clients, **Then** each client is a heading showing its rate and summary
   line, with its projects listed under it.
2. **Given** a project with no client, **When** the contractor opens
   Clients, **Then** it appears under a **No client** heading.
3. **Given** a client with no projects, **When** the contractor opens
   Clients, **Then** the client heading still appears, with no project rows.
4. **Given** no clients and no projects, **When** the contractor opens
   Clients, **Then** they see an empty state offering to add a client.
5. **Given** any page in the app, **When** the contractor looks at the nav,
   **Then** it shows Clients and no Projects item.
6. **Given** a client heading, **When** the contractor selects it, **Then**
   the client's detail page opens.

---

### User Story 2 - Add and edit from the same screen (Priority: P2)

From the Clients screen the contractor can add a client, add a project, and
edit a project, without going anywhere else.

**Why this priority**: The merged screen has to do what both old screens
did, or the contractor loses a path.

**Independent Test**: From Clients, add a client, add a project to it, and
edit that project's rate; each change shows on the screen.

**Acceptance Scenarios**:

1. **Given** the Clients screen, **When** the contractor chooses Add client,
   **Then** the new-client form opens.
2. **Given** the Clients screen, **When** the contractor chooses Add project
   and saves one, **Then** it appears under its client (or under No client).
3. **Given** a project row, **When** the contractor edits it and saves,
   **Then** the row shows the change.

---

### User Story 3 - Filter by active and archived (Priority: P2)

The contractor switches between Active, Archived and All, and the filter is
kept in the address so Back and shared links return to the same view.

**Why this priority**: Both old screens had this filter; losing it hides
archived records.

**Independent Test**: Archive a client and a project, switch filters, and
check what each view shows; reload and confirm the filter holds.

**Acceptance Scenarios**:

1. **Given** Active, **When** the screen loads, **Then** it shows only
   active clients and their active projects.
2. **Given** Archived, **When** the screen loads, **Then** it shows archived
   clients and archived projects, each marked Archived. An archived project
   under an active client sits under that client's heading, which carries no
   Archived badge.
3. **Given** All, **When** the screen loads, **Then** it shows everything,
   with archived items marked.
4. **Given** an active project under an archived client, **When** the filter
   is Active, **Then** it is hidden with its client, and shows under
   Archived and All.

---

### User Story 4 - Old links still land (Priority: P3)

A bookmark or link to the old Projects address takes the contractor to
Clients.

**Why this priority**: Only bookmarks are affected, but a dead link is a
fault.

**Independent Test**: Visit the old Projects address, with and without a
filter, and land on Clients with the same filter.

**Acceptance Scenarios**:

1. **Given** the old Projects address, **When** the contractor visits it,
   **Then** they land on Clients.
2. **Given** the old Projects address with a filter, **When** the contractor
   visits it, **Then** they land on Clients with that filter applied.

### Edge Cases

- Only client-less projects exist: the screen shows the No client group and
  no client headings.
- A client has only archived projects under Active: the client heading shows
  with no project rows.
- Many clients: the screen stays one scrolling list; no pagination.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The nav MUST show one **Clients** item and no **Projects** item.
- **FR-002**: The Clients screen MUST list each client as a heading with its
  rate and summary line (project count, unbilled amount, email), and its
  projects beneath it.
- **FR-003**: Projects with no client MUST appear under a **No client**
  heading that has no rate, detail link or edit action.
- **FR-004**: Each client heading MUST open that client's detail page.
- **FR-005**: The screen MUST offer Add client and Add project, and editing a
  project, from the screen itself.
- **FR-006**: The Active, Archived and All filter MUST live in the address
  and apply to clients and projects together. A project always sits under
  its own client's heading, whatever either one's archived state; under
  Active, an archived client hides with all its projects.
- **FR-007**: The old Projects address MUST redirect to Clients, keeping any
  filter.
- **FR-008**: Each project MUST appear exactly once on the screen.

### Key Entities

- **Client**: name, color, rate, email, archived state; owns projects.
- **Project**: name, rate, archived state; belongs to one client or none.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The nav has one fewer item than today.
- **SC-002**: Every project the contractor has is reachable from Clients in
  one screen, with no clicks.
- **SC-003**: Every link to the old Projects address reaches Clients.

## Assumptions

- The client detail page keeps its own project list; this feature changes
  only the list screen and the nav.
- The macOS app has no Clients or Projects screen, so it is untouched.
- No data changes: clients and projects stay as they are.
