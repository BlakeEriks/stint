# Implementation Plan: Ask for an invite from the landing page

**Branch**: `f55-invite-only` | **Date**: 2026-10-12 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/006-invite-request/spec.md`

## Summary

Both landing-page calls to action become one client component,
`InviteRequest`: an email field and a "Request an invite" button. It's a
real `<form method="post">` whose `action` is the Formspree endpoint in
`NEXT_PUBLIC_INVITE_FORM_URL`, so it works with JavaScript off. With
JavaScript, it posts the same `FormData` with `fetch` and
`Accept: application/json`, shows a pending button, then a confirmation in
place of the form, or an error that keeps the address. The landing page
stays static. The sign-in refusal links to the hero form, the copy says
access is by invite, and the privacy page names the form service.

## Technical Context

**Language/Version**: TypeScript 5, React 19, Next.js 16

**Primary Dependencies**: None new. `fetch`, the existing `ui/button`, Formspree (hosted, free plan)

**Storage**: None in Stint. Formspree holds the address and when it was sent.

**Testing**: `apps/web/test/ui/invite-request.test.tsx` for the form's rules, stories in `invite-request.stories.tsx` for each state, `signin-form.stories.tsx` for the refusal

**Target Platform**: The web landing page and sign-in. macOS is out of scope.

**Project Type**: Web client in the existing monorepo

**Performance Goals**: The send button answers in the same frame (Constitution VI)

**Constraints**: Static page (FR-007), no new fixed cost (FR-004), no table or route

**Scale/Scope**: Alpha: tens of requests a month, under Formspree's free 50

## Constitution Check

| Principle (`.specify/memory/constitution.md`) | Applies | How the design meets it |
| --- | --- | --- |
| I. Never silently modifies user data | Yes | The address is sent as typed. A failed send keeps it in the field and says it didn't send. |
| II. Logic written twice has a parity test | No | One implementation; validation is the browser's `type="email"`. |
| III. Every client through `/api/v1`; server owns timer truth | No | Nothing is written to Stint. The spec places the list with a form service, not a route (issue #55). |
| IV. `packages/core` does no I/O | No | Nothing goes into core. |
| V. Tests first where a regression is silent | Yes | The form's rules (pending, sent, failed keeps the address, invalid sends nothing, JSON accept header) go in `test/ui`, before the component. Each visible state gets a story. |
| VI. Every press answers in the same frame | Yes | Send is a pending press: the button is disabled and reads "Sending…" at once, with no time bound. A failure says why in the form that stays open. See Complexity Tracking for the mechanism. |

Additional constraints: no new fixed cost (Formspree's free plan). No
record ids, since nothing is stored in Stint.

The before-plan design-review hook is satisfied by the spec's recorded skip,
so it wasn't run.

## Project Structure

### Documentation (this feature)

```text
specs/006-invite-request/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── contracts/invite-request.md
├── quickstart.md
└── tasks.md             # /speckit-tasks
```

### Source Code

```text
apps/web/src/components/marketing/invite-request.tsx          # the form, client component
apps/web/src/components/marketing/invite-request.stories.tsx  # open, sending, sent, failed, invalid
apps/web/src/app/landing/page.tsx                             # CTAs -> InviteRequest, copy
apps/web/src/components/signin-form.tsx                       # refusal links to the request
apps/web/src/components/signin-form.stories.tsx               # NotInvited asserts the link
apps/web/src/app/signin/page.tsx                              # passes the landing URL
apps/web/src/app/privacy/page.tsx                             # names the form service
apps/web/test/ui/invite-request.test.tsx
apps/web/.storybook/vite-mocks.mts                            # a stand-in endpoint for stories
docs/deploying.md                                             # NEXT_PUBLIC_INVITE_FORM_URL
```

**Structure Decision**: Everything lives in the web app. No route, table,
migration, schema or core change.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| VI names `useOptimisticMutation` as the web's one write mechanism; this form uses local state | The landing page has no `QueryClientProvider` and the write isn't to `/api/v1`. The sign-in form, also outside the app frame, does the same. The form keeps VI's rules that apply: pending on the control, no bound, a failure said in the open form. | Mounting TanStack Query and `MutationNotice` on a static marketing page adds client JavaScript for one form, and the app-wide notice has no frame to live in there. |
