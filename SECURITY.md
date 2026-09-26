# Security

## Reporting a vulnerability

**Use [private vulnerability reporting](https://github.com/BlakeEriks/stint/security/advisories/new)** — the Security tab, "Report a vulnerability". It opens a
discussion visible only to you and the maintainer, so a fix can ship before
the details are public.

Please do not open a public issue for anything exploitable.

Expect an acknowledgment within a week. This is a single-maintainer project,
so that is a realistic figure rather than an SLA.

## What is most worth looking at

This is a billing application, so the interesting classes are the ones that
let one user read another's money, or change a figure that has already been
issued.

- **Row Level Security.** The publishable Supabase key ships in the browser
  bundle by design; RLS is the only thing separating one user's rows from
  another's. A policy gap is the highest-severity finding here. `pnpm
  test:rls` runs as a non-superuser `authenticated` role for this reason.
- **Invoice immutability.** Line items are frozen at generation and a billed
  time entry is locked by a database trigger. A path that edits either after
  issue is a real bug.
- **The timer invariant.** One running timer per user, enforced by a partial
  unique index rather than by application code.
- **Anything that renders user-supplied text**, particularly the PDF
  generator.

## What is not a vulnerability

- **`sb_publishable_...` keys in the repo or the bundle.** They are public by
  design and RLS is the control; see `docs/setup.md`.
- **The Supabase local development key in `docs/local-dev.md`.** It is the
  CLI's fixed value, identical on every machine, published in Supabase's own
  documentation, and only ever addresses `127.0.0.1`.
- Findings from an automated scanner with no demonstrated impact.
