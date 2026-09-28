---
description: Pick the next feature issue to build and pull it down into a worktree with a first spec
argument-hint: "[issue number]"
# Follows the Spec Kit flow in docs/sdlc.md: Feature issue → /speckit-specify.
# Custom because the catalog's GitHub-issue extensions are discovery-only and
# unvetted, and this is a pick plus two commands.
---

Take one `feature` issue on `BlakeEriks/stint` from GitHub to a local spec,
then stop. `/next-feature 48` takes that issue; `/next-feature` picks one.

## 1. Pick

`gh issue list --state open --label feature --json number,title,labels,milestone,createdAt`,
then skip every issue that:

- is labeled `needs-input` or `blocked`
- is already pulled down: a branch matching `f<n>-*` exists
  (`git branch --list 'f<n>-*'`), or an open PR closes it
- is a purchase or a setting, not code (buying the domain, upgrading a plan):
  list these for Blake at the end instead

Order: `urgent` first, then milestone `Alpha`, then `Launch`, then none;
oldest first within each. Name the pick and the runner-up in one line each,
with why, and go on without waiting.

## 2. Pull down

1. `pnpm worktree f<n>-<slug>` from the main checkout. The branch stays under
   30 characters, because it becomes the preview URL (`docs/sdlc.md`).
2. In `../stint-f<n>-<slug>`, run `/speckit-specify` with the issue's title,
   body and comments (`gh issue view <n> --comments`) as the description, and
   `Closes #<n>` at the top of the spec so the PR that builds it closes it.
3. Commit the spec on the branch, unpushed.

## 3. Stop

End with the worktree path, the spec path, the spec's open
`[NEEDS CLARIFICATION]` markers, and the next step: `/speckit-clarify` in
that worktree.
