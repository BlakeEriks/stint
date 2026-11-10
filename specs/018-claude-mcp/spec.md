Closes #715

# Feature Specification: Claude renames my projects and tasks through a Stint MCP server

**Feature Branch**: `mcp-server`

**Created**: 2026-11-10

**Status**: Draft

**Input**: Issue #715. A contractor who works in Claude all day wants to
tell it "rename these" and have their project and task names fixed, instead
of fixing each by hand. Stint becomes a remote MCP server: the user
connects Claude to it once, approves it on a Stint page, and Claude can
list and rename projects and entries' task names on their behalf. The user
can see what is connected and cut it off.

## Clarifications

### Session 2026-11-10

- Q: Can a connected app's token reach the rest of the API? → A: No. Every
  request refuses a token issued to a connected app, except the MCP tools'
  own calls, which the server marks in memory, never by a header a client
  could send. The tools are the whole surface. (decided autonomously)
- Q: How is the token's audience checked, when Supabase tokens all say
  `authenticated`? → A: It isn't; the MCP spec's audience binding is
  unavailable, and that is accepted. What it guards against, a token meant
  for another resource being replayed here, is covered by the fence: a
  connected app's token reaches nothing but the tools. (decided
  autonomously)
- Q: Does Revoke stop the app at once, or when its token expires? → A: At
  once. Each MCP request checks the token with the Auth server, which
  refuses a session whose grant was revoked. That costs one round trip per
  tool call, which a person waiting on Claude won't notice. (decided
  autonomously)
- Q: Does the free plan get it? → A: Yes. `docs/positioning.md` makes
  downloading an invoice the only paid thing, and these tools touch only
  tracking.
- Q: How does Claude find the client to edit? → A: A `list_clients` tool
  (`GET /clients`), since projects carry only a client's id. (decided
  autonomously)
- Q: Which tools' answers does Claude see? → A: The route's own JSON body,
  as text, and a refusal's code and message as the tool's error. No
  reshaping: one implementation (Principle III). (decided autonomously)
- Q: Where do the approval page and Connected apps get their data? → A:
  The approval page talks to Supabase Auth from the browser, as the sign-in
  form does: approving is a step of signing in, not Stint data. Connected
  apps lists and revokes through `/api/v1/connected-apps`, so the rule that
  every client goes through the API holds. (decided autonomously)

## Design

No design review: the approval page is the sign-in page's layout with the
app's name and two buttons, and Connected apps is a Settings section
listing rows with a button, as Payment details does. Neither has a choice
of layout or hierarchy to review. (decided autonomously)

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Connect Claude and rename a project (Priority: P1)

The user adds Stint's MCP address to Claude Code (or as a custom connector
in claude.ai). Claude opens a Stint page that names the app asking and
offers Approve and Deny. The user approves, goes back to Claude, and asks it
to rename a project. The project's new name shows in Stint.

**Why this priority**: It is the whole feature: without a connection,
nothing else exists.

**Independent Test**: Connect Claude Code to a preview, approve, ask it to
rename a project, and see the new name in Stint.

**Acceptance Scenarios**:

1. **Given** a signed-in user and a pending connection, **When** the
   approval page opens, **Then** it names the app asking for access, says
   what it can do, and offers Approve and Deny.
2. **Given** that page, **When** Approve is pressed, **Then** the button
   shows a pending state and the browser returns to the app that asked.
3. **Given** that page, **When** Deny is pressed, **Then** the browser
   returns to the app that asked, with no access granted.
4. **Given** a signed-out user, **When** the approval page opens, **Then**
   it sends them to sign in, and the sign-in link returns them to the
   approval page.
5. **Given** an app the user has already approved, **When** the approval
   page opens for it, **Then** it returns to the app at once.
6. **Given** an approval link that is unknown or expired, **When** the page
   opens, **Then** it says the link can't be used and to connect again from
   the app.
7. **Given** a connected Claude, **When** it lists projects and renames
   one, **Then** the new name is stored and shown everywhere in Stint.

---

### User Story 2 - Claude renames tasks (Priority: P1)

The user asks Claude to rename a task name across their entries. Claude
lists the task names and the entries that carry one, then renames each
entry's task.

**Why this priority**: Task names drift more than project names; it is
half of what the issue asks for.

**Independent Test**: With Claude connected, ask it to rename a task name
used by several entries, and see each entry renamed in the calendar.

**Acceptance Scenarios**:

1. **Given** a connected Claude, **When** it lists task names, **Then** it
   gets the user's recent task names, as the timer's suggestions do.
2. **Given** a connected Claude, **When** it lists entries in a date range
   or for one project, **Then** it gets each entry's id, task name,
   project, times and whether it is billed.
3. **Given** an entry not on an issued invoice, **When** Claude renames its
   task, **Then** the new task name is stored.
4. **Given** an entry on an issued invoice, **When** Claude renames its
   task, **Then** the rename is refused with the reason, and Claude is
   told it failed; nothing is skipped silently.

---

### User Story 3 - See and revoke connected apps (Priority: P2)

Settings lists each app the user has approved, with when it was approved.
Revoke cuts that app off.

**Why this priority**: Without it, the user can connect Claude but never
disconnect it.

**Independent Test**: Approve an app, open Settings, see it listed, press
Revoke, and see Claude's next request refused.

**Acceptance Scenarios**:

1. **Given** no approved apps, **When** Settings opens, **Then** Connected
   apps says none are connected and how to connect Claude.
2. **Given** one approved app, **When** Settings opens, **Then** it is
   listed by name with the date it was approved and a Revoke button.
3. **Given** that list, **When** Revoke is pressed, **Then** the app leaves
   the list at once, and its next request to Stint is refused.
4. **Given** the server refuses the revoke, **Then** the app comes back to
   the list and the app-wide notice says why.

### User Story 4 - Claude adds and edits clients and projects (Priority: P2)

The owner asked for it at review: "I also want to be able to add a new
client and edit data for a client", and to add projects.

**Acceptance Scenarios**:

1. **Given** a connected Claude, **When** it adds a client or a project,
   **Then** it shows in Stint as if added there.
2. **Given** a client, **When** Claude edits its details (rate, email,
   address, payment terms, billing schedule), **Then** they are stored.
3. **Given** a client, **When** Claude tries to archive it, **Then** it is
   refused; archiving stays the user's.

### Edge Cases

- A connected app's access is the tools, and only the tools: any other
  Stint route refuses its token, and the database lets it only read
  clients, projects and entries, add clients and projects, edit a client
  but not archive it, and rename a project or an entry's task, so
  it can't delete the account, send an invoice or start a timer through
  the API or the Data API. (decided autonomously)
- Supabase's own Auth API still accepts its token for the user's account,
  such as `PUT /auth/v1/user`; Stint can't fence that. The owner accepted
  the gap for now; #724 tracks it.
- A request to the MCP address with no token, or an expired one, is refused
  with the pointer an MCP client follows to sign in.
- A rename to an empty name is refused with the reason.
- A project or entry id that doesn't exist, or is another user's, is
  refused as not found.
- An archived project can be listed and renamed; archiving is not changed.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Stint MUST serve an MCP endpoint that a client connects to
  with one address, signed in by OAuth with Stint's sign-in.
- **FR-002**: A request to it without a valid token MUST be refused with
  the metadata an MCP client follows to find the authorization server.
- **FR-003**: Stint MUST publish protected-resource metadata naming its
  authorization server.
- **FR-004**: Stint MUST offer these tools: list projects, rename a
  project, list task names, list entries, rename an entry's task, list
  clients, add a client, edit a client, add a project. Each MUST
  give the same answer, and refuse for the same reason, as the app's own
  request for it.
- **FR-005**: A refused tool call MUST come back to the client as an error
  with the reason.
- **FR-006**: The approval page MUST name the app, say what it can do, and
  offer Approve and Deny; a signed-out user MUST sign in first and return
  to it.
- **FR-007**: A token issued to a connected app MUST be refused by every
  Stint request except the MCP tools.
- **FR-008**: Settings MUST list approved apps and revoke one; a revoked
  app's next request MUST be refused.
- **FR-009**: The setup to enable the authorization server MUST be
  written as steps, and local development and previews MUST have it on.

### Removes (Constitution VII)

Nothing. It adds a surface no existing state covers.

### Key Entities

- **Connected app**: an OAuth client the user approved. Name, when
  approved. Held by Supabase Auth, not a Stint table.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user connects Claude with one command and one approval.
- **SC-002**: A rename Claude makes shows in Stint on the next load.
- **SC-003**: A revoked app is refused on its next request.
- **SC-004**: No Stint request outside the tools accepts a connected app's
  token.

## Assumptions

- Supabase Auth's OAuth 2.1 server (public beta, every plan, no charge) is
  the authorization server. It issues ordinary Supabase tokens, so row
  level security applies unchanged.
- Claude registers itself by dynamic client registration.
- Only the web hosts the approval page and Connected apps; the Mac and
  phone apps don't change.
