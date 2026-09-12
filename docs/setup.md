# Setting up Supabase

Everything below was verified by applying the migrations to a clean Postgres
and confirming a new user gets default settings.

## 1. Create the project

At [supabase.com/dashboard](https://supabase.com/dashboard) → **New project**.

- **Region:** pick one near you, not near your clients — you are the only one
  hitting it interactively.
- **Database password:** generate and store it. You will not need it for the
  app (the app authenticates as a user, not as Postgres), but you need it for
  the SQL editor's connection string and for `psql`.
- The free tier is fine. Note it **pauses after 7 days of inactivity**; the
  first request after that wakes it with a delay.

## 2. Apply the migrations

Supabase already provides the `auth` schema, `auth.users`, and `auth.uid()` —
the migrations assume all three, so nothing needs stubbing.

Get the connection string: **Project Settings → Database → Connection string
→ Session pooler**. Swap in your database password and put it in
`apps/web/.env.local`:

```
SUPABASE_DB_URL=postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres
```

The **pooler**, not the direct connection. `db.<ref>.supabase.co:5432` is
IPv6-only, and GitHub runners have no IPv6 — the release gate fails there
with `ENETUNREACH`. It may work locally if your ISP has IPv6, which makes
this easy to miss until CI hits it.

Two pooler ports, and only one is right: **5432 is Session mode**, which
supports DDL; 6543 is Transaction mode, which does not, so migrations fail.
The host to look for is `pooler.supabase.com` with `postgres.<ref>` as the
username.

This is a **secret** — full database access, bypassing RLS. Only the two
scripts below ever read it; the app never does. `.env.local` is gitignored.

Then:

```bash
pnpm migrate --dry-run   # show what would run
pnpm migrate             # apply it
```

Each file runs in its own transaction, so a failure rolls back whole rather
than leaving the database half-migrated. Applied versions are recorded in
`schema_migrations`, so re-running is a no-op and adding a migration later
applies only the new one.

## 2a. Verify it

```bash
pnpm verify:schema
```

This asserts the things nothing else would catch: all seven tables exist with
**RLS on**, each has at least one policy (RLS with no policies denies
everything), the partial unique index enforcing one running timer is present
and actually partial, and new users get a settings row.

It exits non-zero on any failure. Do not use a database it rejects — the publishable
key is public, so RLS is the only thing between one user's rows and everyone
else's.

## 3. Point the app at it

Dashboard → **Project Settings** → **API**. Copy the **Project URL** and the
**publishable** key (`sb_publishable_…`) into `apps/web/.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

The publishable key is **meant to be public** — it ships in the browser
bundle, and RLS is what protects the data. A **secret** key
(`sb_secret_…`) is not: it bypasses RLS entirely. Never put one in
`.env.local` or anything `NEXT_PUBLIC_`.

If the dashboard still shows legacy `anon` / `service_role` JWTs, those are
the old key pair and are **deprecated at the end of 2026**. Publishable and
secret keys work alongside them, so there is no reason to start on the old
names. Two things the new keys fix: a secret key sent from a browser is
rejected with a 401 (the `service_role` JWT leaked silently), and secret keys
can be minted and revoked individually rather than requiring a JWT-secret
rotation that invalidates every session.

`.env.local` is gitignored. `.env.example` documents the shape.

## 4. Let magic links come back

Dashboard → **Authentication** → **URL Configuration**.

There is **one Site URL but many Redirect URLs**, and they do different jobs:

- **Site URL** — a single fallback, used when a link carries no explicit
  redirect, and in email templates. Set it to production.
- **Redirect URLs** — an allowlist. Add as many origins as you need.

`signin/page.tsx` passes `emailRedirectTo` built from
`window.location.origin`, so a link always returns to wherever you signed in
from. Local and production work at the same time; each origin just has to be
on the allowlist.

```
Site URL:       https://<your-app>.vercel.app

Redirect URLs:  http://localhost:3100/**
                https://<your-app>.vercel.app/**
```

Without the matching entry the link is rejected on return, and the error does
not say why.

Vercel also gives each branch a preview URL. Add
`https://<project>-*-<scope>.vercel.app/**` if you want sign-in on previews —
though on a private project those URLs sit behind Vercel SSO anyway.

The default email provider is rate-limited (a few per hour) and adequate for
one developer. It is only for sign-in links — **the app never emails
invoices**, by design.

## 5. Sign in

```bash
pnpm --filter @stint/web dev
```

Open `http://localhost:3100`, enter your email, click the link. First sign-in
creates the `auth.users` row, and a trigger creates your `user_settings`
with USD, an 8-hour runaway threshold, and `INV-1` — verified.

Then: **Settings** (rate and business identity, since everything falls back
to them) → **Clients** → a project from the timer's picker.

## Adding Apple and Google later

Both are Supabase providers, enabled per-provider under **Authentication →
Providers**, and both need their redirect pointed at the same
`/auth/callback`. Accounts sharing a verified email link to one user
automatically, so magic link keeps working alongside them — no migration, and
no orphaned second account.

## Deploying

Vercel: import the repo, set the same two env vars, and add the deployed
origin to **Site URL** and **Redirect URLs**. The build needs no database
access — route handlers are all `force-dynamic`.
