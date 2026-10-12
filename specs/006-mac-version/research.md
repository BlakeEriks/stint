# Research: A version on the macOS app

## Version source

- **Decision**: `apps/macos/VERSION`, one line, `major.minor.patch`.
- **Rationale**: Present on every checkout, shallow or not, before any tag
  exists; a bump is a reviewed diff.
- **Alternatives**: `git describe --tags` (blank on a shallow clone and before
  the first tag); a key in `Package.swift` (SwiftPM has no version field for
  an executable).

## Bundle keys

- **Decision**: `CFBundleShortVersionString` = VERSION;
  `CFBundleVersion` = `git rev-list --count HEAD`; a custom `StintCommit` =
  `git rev-parse --short=7 HEAD`, plus `-dirty` when
  `git diff --quiet HEAD -- apps/macos` fails.
- **Rationale**: Apple documents `CFBundleVersion` as required and as
  period-separated integers, so it can't hold a SHA; a commit count increases
  on `main`, which squash-merges. The SHA is what identifies a build, so it
  gets its own key. Untracked files don't mark a build dirty: they aren't
  compiled unless added under `Sources`, and a new source file is tracked as
  soon as it is staged.
- **Alternatives**: SHA in `CFBundleVersion` (invalid); a timestamp (doesn't
  map to a commit).

## Reading it in the app

- **Decision**: `Bundle.main.infoDictionary`, through a pure function over the
  dictionary so tests pass their own.
- **Rationale**: The standard reader; the QA binary has no Info.plist, which
  the function maps to `dev build`.
- **Alternatives**: embedding an Info.plist into the bare binary with a linker
  section (makes `swift build` depend on a generated file); an env variable
  (Finder ignores the shell's environment, `docs/macos.md`).

## Tag name

- **Decision**: annotated tag `macos-v<version>` on the commit whose VERSION
  reads that version.
- **Rationale**: The repo also holds a web app with no version; a prefix
  scopes the tag to the app it releases.
