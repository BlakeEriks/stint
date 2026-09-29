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
- Q: Does archiving a client archive its projects? → A: No write to the projects; a project whose client is archived is treated as archived, so the client shows with all its projects under Archived and All. Pickers follow in #165.

### Session 2026-09-29

- Q: What should the screen show, having shipped a first cut that didn't read well? → A: Chosen in a design review (#180): client cards, as below. The screen manages clients and projects; unbilled figures and hours belong to a reports screen.

## Design

Chosen from four rounds of variations; the pick is `design/clients.html`
(tabs S1 and S3).

- **A card per client**, on the elevated surface, with a 3px spine down its
  left edge in the client's color (the default edge color for a client with
  none). The header holds the client's dot, its name (links to the client),
  its rate — or the default rate, marked as such — and billing email, and
  **Edit**.
- **Project rows inside the card**: the client's dot, the name, the resolved
  rate with its source beneath (`own rate`, `from client`, `from default`),
  or `Non-billable`, and **Edit**. No subheader: the card, spine and dots say
  they are the client's. A client with none says `No projects yet.`
- **`+ Project for <client>`** closes each card and opens the project dialog
  with that client chosen. **No client** is the last card, dashed, with no
  rate, link or Edit, and its own `+ Project`.
- **Add client** is the page's one header action.
- **Edit opens a dialog, never a page**, for a client as for a project, so
  editing reads the same from any screen. Each dialog carries **Archive**, a
  ghost button at the far end of its footer from Save; moving a project to
  another client is its Client field. An archived record's dialog has no
  Archive. Archive is predicted (Constitution VI): the dialog closes and the
  card or row goes on the press; a refusal brings it back with the reason.
- Money keeps its cents everywhere.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See every client and project in one place (Priority: P1)

A contractor opens **Clients** and sees each client as a card with its
rate and billing email, and that client's projects inside it. Projects with no client sit under a **No
client** heading. There is no separate **Projects** item in the nav.

**Why this priority**: This is the merge. Without it nothing else here
matters.

**Independent Test**: Sign in with clients, projects and a client-less
project; open **Clients**; every project appears once, under its client or
under **No client**, and the nav has no **Projects** item.

**Acceptance Scenarios**:

1. **Given** two clients with projects, **When** the contractor opens
   Clients, **Then** each client is a card showing its rate and billing email,
   with its projects inside it at their resolved rates and where each comes
   from.
2. **Given** a project with no client, **When** the contractor opens
   Clients, **Then** it appears under a **No client** heading.
3. **Given** a client with no projects, **When** the contractor opens
   Clients, **Then** the client's card still appears, saying it has no
   projects yet.
4. **Given** no clients and no projects, **When** the contractor opens
   Clients, **Then** they see an empty state offering to add a client.
5. **Given** any page in the app, **When** the contractor looks at the nav,
   **Then** it shows Clients and no Projects item.
6. **Given** a client's card, **When** the contractor selects its name,
   **Then** the client's detail page opens.

---

### User Story 2 - Add and edit from the same screen (Priority: P2)

From the Clients screen the contractor can add a client, add a project to a
client, and edit or archive a client or a project, in dialogs, without going
anywhere else.

**Why this priority**: The merged screen has to do what both old screens
did, or the contractor loses a path.

**Independent Test**: From Clients, add a client, add a project to it, edit
that project's rate, and archive it; each change shows on the screen.

**Acceptance Scenarios**:

1. **Given** the Clients screen, **When** the contractor chooses Add client,
   **Then** the new-client form opens.
2. **Given** a client's card, **When** the contractor chooses `+ Project for
   <client>`, **Then** the project dialog opens with that client chosen, and
   the saved project appears in that card.
3. **Given** a project row, **When** the contractor edits it and saves,
   **Then** the row shows the change.
4. **Given** a client's card, **When** the contractor chooses Edit, **Then**
   a client dialog opens, and a saved change shows on the card.
5. **Given** an edit dialog for an active client or project, **When** the
   contractor chooses Archive, **Then** it leaves the Active view.

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
   clients, each marked Archived with all its projects beneath, and archived
   projects under active clients, beneath that client's heading, which
   carries no Archived badge.
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
- **FR-002**: The Clients screen MUST list each client as a card (see
  Design) with its rate and billing email, and its projects inside it, each
  with its resolved rate and that rate's source.
- **FR-003**: Projects with no client MUST appear under a **No client**
  card that has no rate, detail link or edit action.
- **FR-004**: Each client's name MUST open that client's detail page.
- **FR-005**: The screen MUST offer Add client, a project for each client
  (and for No client), and editing a client or a project in a dialog that can
  also archive it.
- **FR-006**: The Active, Archived and All filter MUST live in the address
  and apply to clients and projects together. A project always sits under
  its own client's heading. A project whose client is archived counts as
  archived: it hides with its client under Active and shows with it under
  Archived and All. Nothing is written to the project.
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

- The client detail page keeps its own project list and edit page; slimming
  it to what a card can't hold is later work.
- The macOS app has no Clients or Projects screen, so it is untouched.
- No data changes: clients and projects stay as they are.
