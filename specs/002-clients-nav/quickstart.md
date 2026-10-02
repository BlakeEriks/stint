# Quickstart: One Clients nav item

## Automated

```bash
pnpm --filter @stint/web test:ui
pnpm --filter @stint/web test:stories
pnpm --filter @stint/web test:e2e
```

The Storybook stories are under **Screens/Clients**, one per acceptance scenario.

## By hand

In `apps/web`, with the dev server running (`PORT=3101 pnpm dev`), sign in to the seeded account (`docs/local-dev.md`), then:

1. The nav shows **Clients** and no **Projects**.
2. On `/clients`, each client is a heading with its rate and summary line and its projects beneath. **No client** is last.
3. Archive a client that has an active project. It leaves Active and shows under Archived and All, with the project under it.
4. Archive a project under an active client. Under Archived, it sits beneath that client's heading, which has no Archived badge.
5. Add a client, then a project, then edit the project; each change shows on the screen.
6. Visit `/projects?status=all` and land on `/clients?status=all`.
