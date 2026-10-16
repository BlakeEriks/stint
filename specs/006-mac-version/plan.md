# Implementation Plan: A version on the macOS app

**Branch**: `f54-mac-version` | **Date**: 2026-10-12 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/006-mac-version/spec.md`

## Summary

`apps/macos/VERSION` holds the release version. `bundle.sh` validates it and
writes it, with a build number and the short commit, into every bundle's
Info.plist. A pure Swift function turns the bundle's Info dictionary into the
line Settings shows at the right of its header. `docs/macos.md` says how to
bump and tag. No server, schema or web change.

## Technical Context

**Language/Version**: Swift 6 (SwiftPM), Bash

**Primary Dependencies**: SwiftUI, Foundation `Bundle`; git for the commit

**Storage**: N/A (Info.plist in the bundle)

**Testing**: swift-testing in `apps/macos/Tests/StintTests`; `qa.sh` for the
look; `plutil` on a bundle for the Info.plist

**Target Platform**: macOS 14+

**Project Type**: desktop app (menu bar)

**Performance Goals**: N/A

**Constraints**: Settings never taller (menubar spec); every bundle target
(local, prod, preview) reads one source

**Scale/Scope**: one file added, one script, one view, one doc section

## Constitution Check

| Principle (`.specify/memory/constitution.md`) | Applies | How the design meets it |
| --- | --- | --- |
| I. Never silently modifies user data | No | Touches no user data |
| II. Logic written twice has a parity test | No | One implementation: Swift reads what bundle.sh writes |
| III. Every client through `/api/v1`; server owns timer truth | No | No server call |
| IV. `packages/core` does no I/O | No | Not touched |
| V. Tests first where a regression is silent, in one suite per kind of code | Yes | The label function is client logic, so its tests in `apps/macos/Tests/StintTests/AppVersionTests.swift` go first. `bundle.sh` is tooling and fails loudly on bad input |
| VI. Every press answers in the same frame | No | No press added |

Additional Constraints: no new fixed cost, no new service. Passes; post-design
re-check passes.

## Project Structure

### Documentation (this feature)

```text
specs/006-mac-version/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/info-plist.md
└── tasks.md
```

### Source Code (repository root)

```text
apps/macos/VERSION                                 # new: the release version
apps/macos/bundle.sh                               # reads VERSION, writes the keys
apps/macos/Sources/Stint/AppVersion.swift          # new: Info dict -> label
apps/macos/Sources/Stint/ContentView.swift         # label in the Settings header
apps/macos/Tests/StintTests/AppVersionTests.swift  # new
docs/macos.md                                      # Versions and releases
```

**Structure Decision**: All of it lives in `apps/macos` plus its doc; no
other package is touched.
