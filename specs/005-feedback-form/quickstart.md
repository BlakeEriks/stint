# Quickstart: Feedback from inside the app

## Prerequisites

The worktree from `pnpm worktree f205-feedback-form`, with `pnpm dev:up:studio` (Studio is needed for check 2) and
the migration applied locally (`docs/local-dev.md`), and signed in as the
seeded account (Mailpit link).

## Checks

1. **Send.** On `/invoices`, press **Feedback** in the header, type a
   message and press **Send**. The button shows "Sending", the dialog
   closes, and "Thanks. Feedback sent." appears.
2. **It landed with its context.** In local Studio's SQL editor (http://127.0.0.1:54323), run:

   ```sql
   select f.created_at, u.email, f.screen, f.client, f.app_version, f.message
   from feedback f join auth.users u on u.id = f.user_id
   order by f.created_at desc;
   ```

   The row shows the seeded email, `/invoices`, `web`, the nav's version
   and the message. Save this query in the production dashboard as
   "Feedback".
3. **Empty.** Open the form: Send is disabled until there's text.
4. **Failure keeps the text.** Stop the dev server's database (or block the
   request in devtools) and send. The dialog stays open with the message and
   says it couldn't send.
5. **Phone.** At 390px wide, the button is in the header and the form fits
   the width.

## Suites

```bash
pnpm --filter @stint/web test
```

```bash
pnpm test:rls
```

```bash
pnpm test:ui
```

```bash
pnpm --filter @stint/web test:stories
```
