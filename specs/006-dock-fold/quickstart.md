# Quickstart: The dock folds on workspace screens

No data or API change. Run the web app (`docs/local-dev.md`), sign in as the
seeded account.

1. At 1280px or wider, open New invoice. A 44px strip sits right of the
   panel: an Inbox icon with the seeded count, and a Today icon.
2. Choose a client. Press the Inbox icon: the Inbox opens over the panel,
   left of the strip. Press Escape: it closes, focus is on the Inbox icon,
   and the form still has the client.
3. Open Today, press an entry: its editor opens over the fold. Close the
   editor: Today is still open. Press outside: it closes.
4. Open the Inbox, press an overdue invoice: the app goes to the invoice and
   the fold is gone.
5. Narrow below 1280px: the strip is gone and the full dock band shows under
   the content. Home at any width: the full dock, unchanged.

Stories: `Parts/Dock Strip`; `Screens/Frame › Workspace`.
Suite: `pnpm --filter @stint/web test:ui -- dock-fold`.
