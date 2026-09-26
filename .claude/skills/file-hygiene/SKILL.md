---
name: file-hygiene
description: File one GitHub issue per file in a hygiene scan report. Run by the weekly Hygiene workflow.
argument-hint: "<report.json>"
allowed-tools: Read, Grep, Glob, Bash(gh issue create:*)
---

`$ARGUMENTS` is a `pnpm hygiene --json` report: files ranked worst first,
each with its `score`, `debt` in minutes, recent `commits` and `findings`. The scan
already chose these files and dropped any already filed. **File every one,
in order.** Selecting is the scan's job.

For each file, read the file and the lines its findings name, then:

    gh issue create --label enhancement --label hygiene --title "<title>" --body "<body>"

**Title:** `Reduce <path>` for code, `Copyedit <path>` for a doc.

**Body:**

1. One sentence on what is wrong with the file as a whole, from reading it.
   For example: "`preview.ts` resolves clients, projects and overlaps in one
   180-line function, and each branch nests three deep."
2. The findings as a list, each with its line and what it is. Group repeats:
   eleven `Google.WordListCase` alerts are one line with their line numbers.
3. For each complexity or duplication finding, the reduction you would
   make: which function splits where, or what the two copies share. One line
   each. The fixer decides; this is a head start.
4. `Score <score> · debt <debt> min · <commits> commits in 30 days`
5. `Fix with /reduce <path>` or `Fix with /copyedit <path>`.
6. The marker, exactly, as the last line: `<!-- hygiene:<path> -->`

The marker is how next week's scan knows this file is filed. An issue
without it is filed again.

End by listing the issues you created.
