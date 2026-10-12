# Contract: the bundle's version keys

What `bundle.sh` writes and `AppVersion` reads. Every target writes all three.

| Key | Value | Example |
| --- | --- | --- |
| `CFBundleShortVersionString` | `apps/macos/VERSION` | `0.1.0` |
| `CFBundleVersion` | commit count of `HEAD` | `412` |
| `StintCommit` | short commit, `-dirty` if tracked changes | `a1b2c3d`, `a1b2c3d-dirty` |

Settings shows `CFBundleShortVersionString (StintCommit)`; with either
missing, `dev build`.
