#!/usr/bin/env bash
# Vercel's ignoreCommand: exit 0 skips the build, anything else builds.
# Production only, so a PR always gets its preview. A merge that touches
# nothing below reaches no one, so it would only ask for a release approval
# with nothing to release. Unsure whether a path ships? Leave it out — an
# extra build costs a minute, a skipped one leaves a fix undeployed.
[ "$VERCEL_ENV" = production ] || exit 1
git diff --quiet HEAD^ HEAD -- ':(top)' \
  ':(top,exclude)docs' ':(top,exclude)specs' ':(top,exclude)scripts' \
  ':(top,exclude)apps/macos' ':(top,exclude).claude' ':(top,exclude).specify' \
  ':(top,exclude).github' ':(top,exclude).husky' ':(top,exclude).vscode' \
  ':(top,exclude).vale' ':(top,exclude).vale.ini' ':(top,exclude).gitignore' \
  ':(top,exclude).gitleaks.toml' ':(top,glob,exclude)*.md'
