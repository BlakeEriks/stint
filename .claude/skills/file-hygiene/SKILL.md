---
name: file-hygiene
description: File one GitHub issue per file in a hygiene scan report. Run by the weekly Hygiene workflow.
argument-hint: "<report.json>"
allowed-tools: Read, Grep, Glob, Write, Bash(gh issue create:*), Bash(gh pr view:*)
# A skill per code.claude.com/docs/en/skills, run in CI by
# anthropics/claude-code-action.
# The Cut section follows Ousterhout (A Philosophy of Software Design,
# ch. 2: complexity is incremental) and Software Engineering at Google
# (ch. 15: code is a liability, its owner retires it). Orphaned tests follow
# scripts/hygiene/tests.mjs, which cites its source.
---

`$ARGUMENTS` is a `pnpm hygiene --json` report: files ranked worst first,
each with its `score`, `debt` in minutes, recent `commits` and `findings`. The scan
already chose these files and dropped any already filed. **File every one,
in order.** Selecting is the scan's job.

For each file, read the file and the lines its findings name, write the
body to `issue-body.md`, then:

    gh issue create --label enhancement --label hygiene --title "<title>" --body-file issue-body.md

A file, not `--body`, because the body is full of backticks the shell would
run. Add a `--label` for the file's platform (`docs/sdlc.md` § Capture):
`web` under `apps/web` save its `api` routes, `macos` under `apps/macos`,
`android` and `ios` under `apps/mobile`, `api` for those routes,
`packages` and `supabase`. A doc or a script gets none.

**Title:** `Redesign <path>` for a file with a `fixes` finding, `Prune
<path>` for a test with an `orphan-test` finding, `Reduce <path>` for
other code, `Copyedit <path>` for a doc.

**Body:**

1. One sentence on what is wrong with the file as a whole, from reading it.
   For example: "`preview.ts` resolves clients, projects and overlaps in one
   180-line function, and each branch nests three deep."
2. The findings as a list, each with its line and what it is. Group repeats:
   eleven `Google.WordListCase` alerts are one line with their line numbers.
3. For each complexity or duplication finding, the reduction you would
   make: which function splits where, or what the two copies share. One line
   each. The fixer decides; this is a head start.
   For a `fixes` finding, read those PRs (`gh pr view <n>`): what the fixes
   have in common, and the design that would have made each unnecessary.
   The reviewer picks the design before it is built.
   For an `orphan-test` finding, read the test and the file it names: the
   cut is both, unless production should use that file again.
   When a state, setting, code path or test could go, a `## Cut` section
   names it and what a user loses without it. It is the issue's scope: the
   builder builds it, and the reviewer judges it on the PR.
4. `Score <score> · debt <debt> min · <commits> commits in 30 days`
5. `Fix with /reduce <path>` or `Fix with /copyedit <path>`; nothing for
   a redesign or a prune.
6. The marker, exactly, as the last line: `<!-- hygiene:<path> -->`

The marker is how next week's scan knows this file is filed. An issue
without it is filed again.

End by listing the issues you created.
