#!/usr/bin/env bash
# Seed one PR's preview accounts: pr-<n>@preview.test, then one
# pr-<n>-<name>@preview.test for each name on its body's
# `Preview accounts: a, b` line, seeded with `--scenario <name>`.
#
#   preview-seed.sh <pr> [seed script]
#
# The seed script defaults to this checkout's; preview-db passes each other
# open PR's own, since a scenario lives in the branch that asks for it. An
# unknown name fails the seed, so a typo in the body shows on the PR.
set -euo pipefail

PR=$1
SEED=${2:-scripts/seed-account.mjs}

node "$SEED" "pr-$PR@preview.test"

body=$(gh pr view "$PR" --json body -q .body)
names=$(grep -i '^Preview accounts:' <<<"$body" | sed 's/^[^:]*: *//' | tr ',\r' '  ' || true)
# Names stay literal: a `*` in the body must not expand to file names.
set -f
for name in $names; do
  node "$SEED" "pr-$PR-$name@preview.test" --scenario "$name" || {
    echo "::error::PR #$PR asks for '$name', which its seed-account.mjs does not have. Check the name; a branch from before #408 needs main merged in."
    exit 1
  }
done
