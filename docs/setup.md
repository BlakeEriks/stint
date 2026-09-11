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
→ Session pooler** (IPv4-friendly). Swap in your database password and put it
in `apps/web/.env.local`:

```
SUPABASE_DB_URL=postgresql://postgres.<ref>:<password>@<host>:6543/postgres
```

This one is a **secret** — it is full database access and bypasses RLS. Only
the two scripts below ever read it; the app never does. `.env.local` is
gitignored.

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

It exits non-zero on any failure. Do not use a database it rejects — the anon
key is public, so RLS is the only thing between one user's rows and everyone
else's.

## 3. Point the app at it

Dashboard → **Project Settings** → **API**. Copy the **Project URL** and the
**anon public** key into `apps/web/.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
```

The anon key is **meant to be public** — it is in the browser bundle, and RLS
is what protects the data. The **service_role** key is not: it bypasses RLS
entirely. Never put it in `.env.local` or anything `NEXT_PUBLIC_`.

`.env.local` is gitignored. `.env.example` documents the shape.

## 4. Let magic links come back

Dashboard → **Authentication** → **URL Configuration**.

- **Site URL:** `http://localhost:3100`
- **Redirect URLs:** add `http://localhost:3100/auth/callback`

Without the redirect entry the email link is rejected on return. Add the
production equivalents when you deploy.

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

## 6. Delete the preview harness

`apps/web/src/app/preview/` exists only because there was no live project. It
stubs `fetch` so the real components could be seen without auth. Once sign-in
works it is dead weight that can drift from the real screens:

```bash
rm -rf apps/web/src/app/preview
```

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
