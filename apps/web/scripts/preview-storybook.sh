#!/usr/bin/env bash
# Run by `prebuild`. On a Vercel preview only, builds Storybook into
# public/storybook/ so each PR's preview serves its stories at
# /storybook/index.html — the link Try it gives for each changed story.
# Production never ships it. #176 tracks what it costs per build.
set -euo pipefail
[ "${VERCEL_ENV:-}" = preview ] || exit 0
storybook build --quiet --output-dir public/storybook
