# Tasks: A version on the macOS app

**Input**: `specs/006-mac-version/` (plan, spec, research, data-model,
contracts/info-plist.md, quickstart)

**Tests**: Constitution V: the label function is client logic, so its tests
come first and fail before it exists.

## Phase 1: Setup

- [X] T001 Create `apps/macos/VERSION` containing the single line `0.1.0`

## Phase 2: User Story 1 - The app says which build it is (P1) MVP

**Goal**: Settings shows `0.1.0 (a1b2c3d)`, `-dirty` on a dirty build,
`dev build` unbundled, at the right of its header, selectable.

**Independent Test**: `swift test --filter AppVersionTests`; `./qa.sh`, open
Settings, screenshot: `dev build` at the header's right, no height change.

- [X] T002 [US1] Write failing tests in `apps/macos/Tests/StintTests/AppVersionTests.swift`: `CFBundleShortVersionString` `0.1.0` with `StintCommit` `a1b2c3d` gives `0.1.0 (a1b2c3d)`; `a1b2c3d-dirty` passes through; a nil dictionary, or either key missing, gives `dev build`
- [X] T003 [US1] Implement `AppVersion.label(_ info: [String: Any]?) -> String` and `AppVersion.current` (over `Bundle.main.infoDictionary`) in `apps/macos/Sources/Stint/AppVersion.swift` until T002 passes
- [X] T004 [US1] In `PanelHeader` in `apps/macos/Sources/Stint/ContentView.swift`, when `showingSettings`, show `AppVersion.current` after the `Spacer`, `.role(.meta)`, `Tokens.Dark.textMuted`, `.textSelection(.enabled)`, `.accessibilityIdentifier("version")`
- [ ] T005 [US1] Verify with `apps/macos/qa.sh` (build, sign in to local, `click settings`, `shot`, `ids`) that the label shows and the panel height is unchanged. **Blocked 2026-10-12**: the Mac's screen was locked, so the window exposed no accessibility tree and captured blank; left for QA via `pnpm try-mac`

## Phase 3: User Story 2 - The bundle carries the version (P2)

**Goal**: every target's Info.plist has the three keys in
`contracts/info-plist.md`, from `apps/macos/VERSION` and git.

**Independent Test**: bundle into a throwaway `HOME` and `plutil -p` the
Info.plist; a malformed VERSION fails the bundle.

- [X] T006 [US2] In `apps/macos/bundle.sh`, before `swift build`: read `VERSION`, fail with a message unless it matches `^[0-9]+\.[0-9]+\.[0-9]+$`; read `git rev-parse --short=7 HEAD` (fail with a message outside a checkout), append `-dirty` when `git status --porcelain -- .` (the app only, untracked included) lists anything; `BUILD=$(git rev-list --count HEAD)`
- [X] T007 [US2] In `apps/macos/bundle.sh`'s Info.plist, replace the hard-coded `0.1.0` with `$VERSION`, add `CFBundleVersion` `$BUILD` and `StintCommit` `$COMMIT`, and echo the version in the `bundling …` line
- [ ] T008 [US2] Verify per `quickstart.md` step 3 and 4 with `HOME` set to a temp dir; run the built bundle's own binary (`.build/Stint Local.app/Contents/MacOS/Stint`) with `STINT_WINDOW=1`, its pid in `.build/qa.pid`, and `./qa.sh shot` Settings showing `0.1.0 (<commit>)` (US1's real value); then unregister the temp bundle with `lsregister -u` and delete it. **Partly done 2026-10-12**: running `bundle.sh` was refused by the session's permissions (it installs and registers an app), so its version block was run alone: `0.1.0 (8324658) build 717` clean, `-dirty` with app changes, and `0.1` rejected with the message. The written Info.plist and the bundled screenshot are left for QA via `pnpm try-mac`

## Phase 4: User Story 3 - Cutting a release is written down (P3)

- [X] T009 [US3] Add a "Versions" section to `docs/macos.md`: `apps/macos/VERSION` is the one source; what Settings and the bundle show; bump it in the PR that changes behavior a user would report; release by `git tag -a macos-v<version>` on `main` at the commit whose VERSION reads it, then `git push origin macos-v<version>`

## Phase 5: Polish

- [X] T010 Run `swift build` and `swift test` in `apps/macos`

## Dependencies

T001 → T006. T002 → T003 → T004 → T005. T006 → T007 → T008. T009 after T007.
US1 and US2 are independent: US1 falls back to `dev build` without US2.

## Parallel

T002 and T006 touch different files and can run together.

## Strategy

MVP is US1; US2 makes its value real in a bundle; US3 is the doc.
