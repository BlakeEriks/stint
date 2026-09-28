## What and why

<!-- The change, and what it is for. Link an issue if there is one. -->

## Try it

<!-- A web change links its preview. `<branch>` is the branch name
     lowercased, anything else a hyphen; `<n>` is this PR's number, so open
     the PR first and add this with `gh pr edit`. A macOS change opens with
     `pnpm try-mac <n>` instead: "Opens Stint Preview in the menu bar,
     signed in as this PR's seeded account." Every step says what you should
     see, never just what to do. -->

[Open the preview](https://stint-git-<branch>-blakeeriks-projects.vercel.app/preview/signin?pr=<n>&next=<path>)
— signs in as this PR's seeded account, on the page this changes.

1. <an action> — <what you should see>

Data back to the seed: re-run this PR's **preview-db** check.

## Checks CI cannot make

- [ ] **Rates and line items still freeze** onto issued invoices — nothing
      recomputes a sent invoice.
- [ ] **A screen or state this adds or changes has its story.**
- [ ] Verified by running it, not only by the suite passing.

<!-- Delete any line that does not apply. -->
