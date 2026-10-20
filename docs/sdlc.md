# From idea to production

Every piece of work, from the moment it is noticed to the moment it is live,
with the command that moves it at each step.

1. **Capture**, by the rules in the next section. `pnpm hygiene` and
   Dependabot also file work weekly, and Blake files each Sentry alert as a
   `bug` + `urgent` issue for `/work-issues`.
2. **Build.** A feature: `/next-feature`, then `/speckit-clarify` →
   `/design-review` → `/speckit-plan` → `/speckit-tasks` →
   `/speckit-analyze`, then `/speckit-implement` in a `pnpm worktree`.
   `/design-review` is offered to every feature that adds or changes UI,
   never assumed. Blake settles the look from a draft of each screen
   before anything is built, or skips it when the change has no visible UI
   or a trivial one. Planning waits for the spec to record either.
   `/work-issues` builds issues in `../stint-issues`, and features too, by
   running that same chain unattended. Its builder decides each question itself,
   listing the decisions in the PR, and starts a design review only when a
   screen has a real choice of layout: the draft is posted to the issue as
   a link, and Blake replies there. It ships the feature as one PR; one
   built by hand merges one user story at a time, and a story that can't
   stand alone stays unlinked in the UI until the rest lands.
3. **Review.** A PR runs CI and the Docs checks (Vale, `/doc-drift`), then
   goes to QA on its Vercel preview or `pnpm try-mac`. A green Dependabot PR
   outside the framework group merges itself; a red one goes to
   `/work-issues`.
4. **Ship.** Blake merges. The release gate plans, waits for approval and a
   backup if a migration is pending, then migrates, verifies, and asks the new
   build for `/api/v1/health` before promoting it. Then the worktree is
   removed and the branch deleted.

## Capture

**Unbuilt work splits on one question: does it need a spec?** A new
capability or an expansion does. It is assessed with `/speckit-assess-*`,
filed through the **Feature** issue form, whose four questions are the gate,
and built through Spec Kit. Everything smaller is a GitHub issue: a fault
labeled `bug` plus its cost (`wrong data`, `misleading`, `looks wrong`, worst
first), or an improvement to something that exists, labeled `enhancement`.
One filed with `gh` answers the form's fields under the same labels. The PR
that does it closes it.

**Two milestones, and they are gates:** `Alpha`, a handful of friends using
it for real, and `Launch`, a stranger paying. An issue in neither is wanted
and not committed to. `urgent` orders within one.

## Review

Every PR reaches QA the same way, whether `/work-issues` built it or not:

- **`/standards-review` has reviewed its commits** before it opens:
  `/work-issues` runs it each round, and Spec Kit after `/speckit-implement`.

- **The branch name is under 30 characters.** It becomes the preview's URL,
  and Vercel hashes a longer one.
- **The body fills the template's Try it**, linking the preview signed in as
  `pr-<n>@preview.test`, which `preview-db` seeds from the branch.
- **`migration` labels a PR that adds one.** The previews share one schema,
  so one such PR is open at a time.
- **`ready-for-qa` goes on once CI is green and nothing is unanswered**: no
  feedback, doc drift or conflict with `main` left open.
