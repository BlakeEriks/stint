# Tasks: Ask for an invite from the landing page

**Input**: `specs/006-invite-request/` (plan.md, spec.md, research.md, data-model.md, contracts/invite-request.md)

**Tests**: Required by Constitution V: client logic in `apps/web/test/ui`, one story per visible state.

## Phase 1: Setup

- [X] T001 Set `NEXT_PUBLIC_INVITE_FORM_URL` to a stand-in `https://formspree.io/f/storybook` for stories in `apps/web/.storybook/vite-mocks.mts` (where the stories' other swaps live), so a story never reaches a real form

## Phase 2: Foundational

None: the stories are independent.

## Phase 3: User Story 1 - A stranger asks for an invite (P1) MVP

**Goal**: Both calls to action are an on-page email form that sends to Formspree.

**Independent Test**: On the landing page, send an address to a stub endpoint and see the confirmation; stop the stub and see the address kept with an error.

- [X] T002 [US1] Write failing tests in `apps/web/test/ui/invite-request.test.tsx`: posts `FormData` with `email` to `NEXT_PUBLIC_INVITE_FORM_URL` with `Accept: application/json`; the button reads "Sending…" and is disabled while pending; a 2xx shows "You're on the list." in place of the form; a non-2xx answer and a network error each keep the address and show an alert that it didn't send and to try again; an invalid address (`type="email" required`) sends nothing; the form has `method="post"` and `action` set to the endpoint for JavaScript off
- [X] T003 [US1] Build `InviteRequest` in `apps/web/src/components/marketing/invite-request.tsx` per contracts/invite-request.md: a real form, a screen-reader label "Email", placeholder "you@example.com", a hidden `_gotcha` honeypot, a `Button variant="accent"` "Request an invite", states idle → sending → sent | failed
- [X] T004 [P] [US1] Stories in `apps/web/src/components/marketing/invite-request.stories.tsx`: Open, Sending (stalled), Sent, Failed, Invalid, Phone, each with MSW answering the stand-in endpoint
- [X] T005 [US1] Replace both `CallToAction` uses in `apps/web/src/app/landing/page.tsx` with `InviteRequest`, the hero's wrapped in `id="invite"`, and change copy that promises instant access to say access is by invite during alpha, keeping "Free" (FR-009)
- [X] T006 [P] [US1] Add a clause to `apps/web/src/app/privacy/page.tsx`: an invite request's address goes to Formspree and is used only to send the invite (FR-010), and move its `updated` date to October 2026
- [X] T007 [P] [US1] Document `NEXT_PUBLIC_INVITE_FORM_URL` and creating the Formspree form in `docs/deploying.md`

## Phase 4: User Story 2 - An invited user still signs in (P2)

**Goal**: The header Sign in link is untouched.

- [X] T008 [US2] Confirm the header's Sign in link in `apps/web/src/app/landing/page.tsx` still points at `SIGN_IN_URL`, and assert it in the landing story's play in `apps/web/src/components/marketing/landing.stories.tsx`

## Phase 5: User Story 3 - A turned-away sign-in points to the request (P3)

**Goal**: The `otp_disabled` refusal links to the landing form.

- [X] T009 [US3] Update the `NotInvited` story in `apps/web/src/components/signin-form.stories.tsx` to expect "Stint is invite-only during alpha." and a "Request an invite" link to `#invite` (failing first)
- [X] T010 [US3] In `apps/web/src/app/signin/page.tsx`, derive the landing URL from the request host with a leading `app.` dropped, and pass it as `inviteUrl` to `SignInForm`; render the refusal with that link in `apps/web/src/components/signin-form.tsx`

## Phase 6: Polish

- [X] T011 Run `test:ui`, `test:stories`, typecheck, lint, `check:type`, and `next build`, confirming `/landing` is still prerendered static (FR-007); verify on `stint.localhost` against a local stub endpoint per quickstart.md

## Dependencies

T001 before T004. T002 before T003. T003 before T004 and T005. US2 and US3 are independent of US1 except that US3's link targets the `#invite` anchor from T005.

## Parallel

T004, T006 and T007 touch different files once T003 lands.

## Strategy

US1 is the MVP; US2 is a regression check; US3 closes the side door.
