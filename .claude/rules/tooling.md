---
paths:
  - ".husky/**"
  - "package.json"
  - "biome.jsonc"
---

## The pre-commit hook

Husky runs `lint-staged`, which runs `biome check --write` over the **staged
files only** and re-stages what it fixed. Sub-second, because it never walks
the repo.

**Formatting and lint only** — a commit is not the moment to run a test suite.
It is a convenience, not the gate: `pnpm lint` in CI is, since a hook can be
skipped with `--no-verify` and does not exist on a fresh clone until
`pnpm install` runs `prepare`.
