# Data model: A version on the macOS app

No database change. Two values, both in the bundle's Info.plist:

- **Release version** (`CFBundleShortVersionString`): `major.minor.patch`,
  each part a non-negative integer. Source: `apps/macos/VERSION`. `bundle.sh`
  rejects anything else.
- **Build** (`StintCommit`, `CFBundleVersion`): the 7-character commit, with
  `-dirty` when the tree had uncommitted tracked changes; the commit count.

Shown as `<version> (<commit>)`, or `dev build` when either key is absent.
