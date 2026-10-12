# Quickstart: check the version

From `apps/macos`:

1. `swift test --filter AppVersionTests`: the label for a full, a dirty and
   an unbundled dictionary.
2. `./qa.sh`, sign in, `./qa.sh click settings`, `./qa.sh shot`: the Settings
   header reads `dev build` at its right, and Settings is no taller.
3. Bundle into a throwaway home so the installed apps are untouched:
   `HOME=$(mktemp -d) ./bundle.sh debug local`, then
   `plutil -p .build/'Stint Local.app'/Contents/Info.plist`: the three keys in
   [contracts/info-plist.md](contracts/info-plist.md).
4. `echo 0.1 > VERSION` and bundle again: it fails naming the file; restore it.
