# From idea to production

Every piece of work, from the moment it is noticed to the moment it is live,
with the command that moves it at each step.

1. **Capture**, by the rules in the next section. `pnpm hygiene` and
   Dependabot also file work weekly, and each Sentry alert is triaged into a
   `bug` + `urgent` issue for `/work-issues` (`docs/deploying.md` §3c).
2. **Build.** A feature built by hand: a linked session from `/conduct`, in
   its own `pnpm worktree`, runs `/speckit-specify` from the issue, then
   `/speckit-clarify` → `/design-review` → `/speckit-plan` →
   `/speckit-tasks` → `/speckit-analyze` → `/speckit-implement`.
   `/design-review` is offered to every feature that adds or changes UI,
   never assumed. The reviewer settles the look from a draft of each screen
   before anything is built, or skips it when the change has no visible UI
   or a trivial one. Planning waits for the spec to record either.
   `/conduct` makes one session the only one the owner talks to: it runs
   `/work-issues` and hands out hands-on work to linked sessions, each labeling
   its issue `building` so no one else picks it.
   `/work-issues` builds issues in a worktree each, and features too, by
   running that same chain unattended. Its builder decides each question itself,
   listing the decisions in the PR, and starts a design review only when a
   screen has a real choice of layout: the draft is posted to the issue as
   a link, and the reviewer replies there. It ships the feature as one PR; one
   built by hand merges one user story at a time, and a story that can't
   stand alone stays unlinked in the UI until the rest lands.
3. **Review.** A PR runs CI and the Docs checks (Vale, `/doc-drift`), then
   goes to QA on its Vercel preview, `pnpm try-mac`, or its phone update
   (`docs/mobile.md`). A green Dependabot PR
   outside the framework group merges itself; a red one goes to
   `/work-issues`.
4. **Ship.** Merging is the deploy. The release gate plans, waits for approval and a
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

**Every issue also carries each platform it touches:** `web`, `macos`,
`android`, `ios`, or `api` for `/api/v1`, the database and anything shared.
Phone work that hits both platforms carries both. Tooling, docs and CI carry
none. The form asks, and `issue-platforms.yml` applies the answer.

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
- **The body follows the template**, opening with a Why a reader can follow
  without the issue. Its Try it links the preview signed in as
  `pr-<n>@preview.test`, which `preview-db` seeds from the branch.
- **`migration` labels a PR that adds one.** The previews share one schema,
  so only one PR whose diff touches `supabase/migrations`, labeled or not,
  is `ready-for-qa` at a time; it holds the preview database.
- **`ready-for-qa` goes on once CI is green and nothing is unanswered**: no
  feedback, doc drift or conflict with `main` left open. The next migration
  PR to hold the preview database is the exception: it gets the label once
  `main` is merged in, before CI finishes (`docs/deploying.md` §3d).
