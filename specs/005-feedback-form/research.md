# Research: Feedback from inside the app

## Where a submission lands

- **Decision**: a `feedback` table in our Postgres, read by Blake in the
  Supabase dashboard with a saved query that joins `auth.users` for the
  email.
- **Rationale**: It costs nothing new, adds no secret and no third party,
  and keeps a user's words with their other data (FR-005, FR-008).
- **Alternatives considered**:
  - A GitHub issue would publish users' words, because the repo is public.
  - A private repo needs a token and sends data to a third party.
  - Email waits on SMTP (#51).
  - Sentry's widget skips `/api/v1`, and Sentry isn't set up yet (#147).

## Showing the sender's email

- **Decision**: store `user_id` only, and join `auth.users` in the
  dashboard's saved query.
- **Rationale**: A view in `public` that reads `auth.users` would be exposed
  through PostgREST and could leak other users' addresses. Copying the email
  onto each row would go stale when the address changes.

## What "the screen" is

- **Decision**: the pathname from `usePathname()`, such as `/invoices/<id>`.
- **Rationale**: It's exact, needs no mapping table, and the id points Blake
  at the record the user was looking at.

## Retries

- **Decision**: the client generates the id with `uuidv7()`. A duplicate-key
  error (`23505`) on the same id returns success, as `POST /expenses` does.
- **Rationale**: A pending press has no timeout, but a network retry must
  still make one row (FR-006, SC-004).

## Who may read and write

- **Decision**: RLS allows inserting and selecting your own rows. There's no
  update or delete policy, so a submission can't change once sent. The row
  is deleted when the account is (`on delete cascade`).
- **Rationale**: Meets FR-007 and keeps the record immutable. Select-own
  lets the retry path confirm the existing row.

## The success toast

- **Decision**: a small toast owned by the feedback component, `role="status"`,
  shown for 4 seconds after the dialog closes.
- **Rationale**: The app has no success notice. `MutationNotice` only shows
  failures, and a general toast system is more than one message needs.
