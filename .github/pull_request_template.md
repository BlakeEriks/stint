## Why

<!-- One or two plain sentences: what goes wrong or is missing today, and
     who it hurts. No code names. Readable without opening the issue: if
     the reader stops here, they still know whether they want this. Then
     `Closes #<n>.` -->

## What changes

<!-- Three bullets at most, each an outcome someone notices, not how it's
     built. -->

## Needs you

<!-- Calls you might make differently, anything to do before merging, and
     risks. "Nothing." if none. -->

## Try it

<!-- A web change links its preview. `<branch>` is the branch name
     lowercased, anything else a hyphen; `<n>` is this PR's number, so open
     the PR first and add this with `gh pr edit`. A macOS change opens with
     `pnpm try-mac <n>` instead: "Opens Stint Preview in the menu bar,
     signed in as this PR's seeded account." Every step says what you should
     see, never just what to do. A step that needs an account in another
     state names a seed scenario on its own line, `Preview accounts:
     first-signin`, and links with `&as=first-signin`
     (docs/deploying.md §3d). -->

[Open the preview](https://stint-git-<branch>-blakeeriks-projects.vercel.app/preview/signin?pr=<n>&next=<path>)
— signs in as this PR's seeded account, on the page this changes.

1. <an action> — <what you should see>

Data back to the seed: re-run this PR's **preview-db** check.

## Checks CI cannot make

- [ ] **Rates and line items still freeze** onto issued invoices — nothing
      recomputes a sent invoice.
- [ ] **A screen or state this adds or changes has its story.**
- [ ] **A new macOS write goes through `press`** (Constitution VI) — the web
      has a lint for this; Swift has this box.
- [ ] Verified by running it, not only by the suite passing.

<!-- Delete any line that does not apply. -->

<details><summary>How it works</summary>

<!-- The mechanism, alternatives turned down, edge cases, and how it was
     verified: commands run and what they showed, and what nobody has seen
     yet. -->

</details>
