# Set up the Supabase project

The hosted project, from creation to the first invite. Every step was
verified by applying the migrations to a clean Postgres and confirming a new
user gets default settings.

## 1. Create the project

At [supabase.com/dashboard](https://supabase.com/dashboard) → **New project**.

- **Region:** near you, not near your clients — you are the only one hitting
  it interactively.
- **Database password:** generate and store it. The app authenticates as a
  user, not as Postgres, so only the connection string and `psql` need it.
- **Tier:** free. It **pauses after 7 days of inactivity**, and the first
  request after that wakes it with a delay.

**Anything you switch on in the dashboard gets recorded here**, because it is
invisible from a checkout and CI can't reproduce it. A setting missing from
this list breaks tooling that reads the schema: `verify:schema` failed a
release on the RLS event trigger before it was listed.

- **"Automatically expose new tables" — OFF.** `00000000000004_api_grants.sql`
  grants tables explicitly, so a table holding bank details isn't reachable
  the moment it's created.
- **Auto-enable RLS on new tables — ON.** This installs an `rls_auto_enable`
  event trigger in `public`, a backstop only: every table still declares its
  own RLS and policy in its migration (`docs/data-model.md`).
- **Authentication → Sign In / Providers → Allow new users to sign up — OFF.**
  Stint is invite-only (section 6).

## 2. Apply the migrations

Supabase provides the `auth` schema, `auth.users`, and `auth.uid()`, which the
migrations assume.

The connection string is under **Project Settings → Database → Connection
string → Session pooler**, with your database password swapped in:

```
postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres
```

| Connection | Port | Migrations |
| --- | --- | --- |
| Session pooler, `pooler.supabase.com`, user `postgres.<ref>` | 5432 | Run, since Session mode supports DDL |
| Transaction pooler | 6543 | Fail, since Transaction mode has no DDL |
| Direct, `db.<ref>.supabase.co` | 5432 | Fail in CI with `ENETUNREACH`: it's IPv6-only and GitHub runners aren't, though it may work locally |

This string is a **secret**: full database access, bypassing RLS. It lives in
one place, the release gate's `PRODUCTION_DB_URL` (`docs/deploying.md`), and
reaches the two scripts below only as a shell variable, never a file.

With it in `DB` for this shell only:

```bash
pnpm migrate --url "$DB" --dry-run   # show what would run
pnpm migrate --url "$DB"             # apply it
```

Each file runs in its own transaction, so a failure rolls back whole.
`schema_migrations` records applied versions, so re-running is a no-op and a
later migration applies alone.

## 3. Verify the schema

```bash
pnpm verify:schema --url "$DB"
```

It checks what nothing else would: every expected table exists with **RLS
on** and at least one policy, the one-running-timer index is partial, and a
new user gets a settings row. Use the database only once it exits zero: the
publishable key is public, so RLS is the only thing between one user's rows
and everyone else's.

## 4. Point the app at it

Dashboard → **Project Settings** → **API**. Copy the **Project URL** and the
**publishable** key (`sb_publishable_…`) into the Vercel project's
environment variables (`docs/deploying.md`) and `apps/macos/bundle.sh`:

```
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

The publishable key is **meant to be public**: it ships in the browser
bundle, and RLS protects the data. A **secret** key (`sb_secret_…`) bypasses
RLS, so it lives only in the sensitive Vercel variable `SUPABASE_SECRET_KEY`
(`docs/deploying.md` §2).

`signin-form.tsx` sends each magic link back to the origin it was requested
from, so that origin must be on the project's allowlist, or the link is
rejected on return without saying why. `docs/deploying.md` §4 sets it.

## 5. Sign-in email

Supabase's default sender is capped at a few messages an hour and its
template can't be edited, so production sends sign-in and invite mail through
Resend's free tier (100 a day) as `Stint <signin@runstint.com>`.

1. **Resend → Domains**: add `runstint.com` in `us-east-1`, put its DKIM,
   `send` MX and `send` SPF records in Cloudflare DNS, and verify. `_dmarc`
   holds `v=DMARC1; p=none;`.
2. **Resend → API Keys**: a key with sending access to `runstint.com` only.
3. **Supabase → Authentication → Emails → SMTP Settings**: host
   `smtp.resend.com`, port `465`, user `resend`, the API key as password,
   sender `signin@runstint.com`, name `Stint`.
4. **Authentication → Emails → Magic Link**: subject `Sign in to Stint`, body
   `supabase/templates/magic_link.html`.
5. **Authentication → Sign In / Providers → Email**: **Email OTP Length** `6`.
   A hosted project can default to 8, and the template and the panel show
   and take six digits, so a longer code is truncated and always rejected.

The dashboard holds its own copy of the template, because `config.toml`
points GoTrue at a local path a hosted project can't read. An edit to the
file changes local only, until it's pasted again. Keep
`{{ .ConfirmationURL }}` and both `{{ slice .Token }}` calls, because GoTrue mints a
code for every magic link, and those calls show it, so the menu bar app's
panel has a code to take.

## 6. Invite people

Sign-up is off, so an account exists only once it's invited from
**Authentication → Users → Add user → Send invitation**. Each invitee gets
their own account.

**Authentication → Emails → Invite user**: subject `You're invited to Stint`,
body `supabase/templates/invite.html`. Like the magic-link template, the
dashboard's copy doesn't track the file.

The invite button carries `{{ .TokenHash }}` to `/auth/confirm`, which
verifies it on the server and signs the invitee in. The default template
links to `supabase.co` instead, which returns the session in a URL fragment
the app ignores, and which spam filters flag in mail from `runstint.com`.
The link works once: if a mail scanner opens it first, the invitee lands on
`/signin` and signs in with their email.
