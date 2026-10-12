Closes #54

# Feature Specification: A version on the macOS app

**Feature Branch**: `f54-mac-version`

**Created**: 2026-10-12

**Status**: Draft

**Input**: Issue #54, "Version the macOS app, and tag `0.1.0` at alpha":
nothing carries a version today, so the first report from a friend's
three-week-old build has no answer to "which one?". The web app can't drift,
because everyone gets the current deploy; a native app on someone else's Mac
is the first thing that can. The version belongs in the app and readable from
it, so a report names it without the user hunting for it.

Design review: skipped in autonomous run; follows docs/design/menubar.html.

## Clarifications

### Session 2026-10-12

- Q: What is the release tag called? → A: `macos-v0.1.0`. The repo also
  holds a web app that deploys on every merge and has no version, so an
  unprefixed `v0.1.0` would read as the whole repo's release. (decided
  autonomously — Blake to review)
- Q: Where is the one version source: a file in the repo, or the latest
  git tag? → A: A file, `apps/macos/VERSION`. A tag-derived version is blank
  on a shallow clone and before the first tag, and a version bump made in a
  PR is reviewed like any other change; the tag then marks the commit whose
  file reads that version. (decided autonomously — Blake to review)
- Q: Where in Settings does the version go? → A: The right of the Settings
  header, opposite the title, in the muted meta style. The header is already
  there, so Settings gains no height and the menubar spec's two rows stay
  two. (decided autonomously — Blake to review)
- Q: What does the line say? → A: `0.1.0 (a1b2c3d)`; a build from
  uncommitted changes adds `-dirty` to the commit, git's own word for it;
  an unbundled run says `dev build`. (decided autonomously — Blake to review)
- Q: Is the version also sent to the server with each request? → A: No. Not
  in this feature: nothing on the server reads it yet, and the macOS
  feedback form, when it comes, is where it gets sent. (decided autonomously
  — Blake to review)

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The app says which build it is (Priority: P1)

A friend on the alpha reports that stopping the timer did nothing. Blake asks
which version they're on. They open the panel's Settings and read it off, one
line, without leaving the panel; the line names the release and the exact
build it came from.

**Why this priority**: A support question with no build to point at can't be
answered. This is the whole issue.

**Independent Test**: Build the app, open Settings, and confirm it shows the
release version and the build's commit, matching what the build was made from.

**Acceptance Scenarios**:

1. **Given** a built app, **When** the user opens Settings, **Then** it shows
   the release version and the commit the build came from, without changing
   the panel's height.
2. **Given** the version shown, **When** the user selects it, **Then** they can
   copy it into a message.
3. **Given** a build made from uncommitted changes, **When** Settings shows its
   version, **Then** it says the build doesn't match its commit.
4. **Given** the app run straight from the build directory for QA, with no
   app bundle around it, **When** Settings opens, **Then** it says it's a
   development build rather than showing a blank or a wrong number.

---

### User Story 2 - The system reads the version without opening the app (Priority: P2)

Finder's Get Info, a crash report and any later updater read the version from
the app bundle, so it has to be there in the standard places, set from one
source every build reads.

**Why this priority**: The panel covers a person asking; the bundle covers
every tool that asks, and a crash report is often the first report.

**Independent Test**: Build the bundle and read its version fields; they match
the version source and the commit.

**Acceptance Scenarios**:

1. **Given** the version source reads `0.1.0`, **When** any target (local,
   prod, preview) is bundled, **Then** the bundle's release version is `0.1.0`
   and its build number and commit identify the commit it was built from.
2. **Given** the version source is changed, **When** the app is rebundled,
   **Then** the new version shows in the bundle and in Settings with no other
   edit.

---

### User Story 3 - Cutting a release is written down (Priority: P3)

At alpha, Blake cuts 0.1.0: he knows where the version is set, how it's
bumped, and the one command that tags the commit it was cut from.

**Why this priority**: The tag is Blake's step and happens once at alpha, but
it has to be findable then, not rediscovered.

**Independent Test**: Follow the macOS doc from a clean checkout and name the
file to edit, the tag to create and the build to ship.

**Acceptance Scenarios**:

1. **Given** the macOS doc, **When** Blake looks for how to release, **Then**
   it says where the version lives, when to bump it, and how to tag it.

---

### Edge Cases

- The version source is missing or isn't a plain `major.minor.patch`: bundling
  fails with a message saying so, rather than shipping a bundle with no or a
  malformed version.
- The build isn't in a git checkout (an exported source tree): bundling fails
  with a message, since a build with no commit is the one that can't be
  traced.
- A preview build from a PR branch: it shows the same release version as
  `main` and its own branch commit, which is what tells two builds apart.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The macOS app's release version MUST be set in exactly one
  place in the repository, and every bundle target MUST read it from there.
- **FR-002**: Every bundle MUST carry the release version, a build number and
  the short commit it was built from, in the fields macOS and its tools read.
- **FR-003**: Settings MUST show the release version and the short commit,
  as `0.1.0 (a1b2c3d)`, at the right of its header, selectable for copying,
  without making Settings taller.
- **FR-004**: A build made from uncommitted changes to the macOS app MUST say
  so by adding `-dirty` to its commit; uncommitted changes elsewhere in the
  repo don't change the app and don't mark it.
- **FR-005**: The app run without a bundle (QA) MUST show `dev build`.
- **FR-006**: Bundling MUST fail with a clear message when the version source
  is missing or malformed, or when there is no commit to record.
- **FR-007**: `docs/macos.md` MUST say where the version is set, when it's
  bumped, and how a release is tagged.
- **FR-008**: The feature MUST NOT create or push a tag; tagging
  `macos-v0.1.0` is Blake's step at alpha.

### Key Entities

- **Release version**: `major.minor.patch`, what a person quotes; starts at
  `0.1.0`.
- **Build**: the commit a bundle was made from, and whether the tree had
  uncommitted changes; what tells two copies of one release apart.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can find and copy the app's version in under 10 seconds
  from the panel, with no instructions beyond "it's in Settings".
- **SC-002**: Every bundled build names the commit it came from, so any report
  maps to exactly one commit.
- **SC-003**: Changing the version takes one edit to one file.
- **SC-004**: Opening Settings never changes the panel's height.

## Assumptions

- Versions follow semantic versioning, starting at `0.1.0` for alpha.
- Automatic updates are out of scope; the build number only has to be valid
  and increase on `main`.
- Distribution signing and notarization stay out of scope (they need the Apple
  developer account).
