# Quickstart: Invoice templates

From `apps/web` in the worktree, with `pnpm dev` running and signed in as the
seeded account (`docs/local-dev.md`).

1. **Settings**: Invoice template shows four cards, Standard selected. Pick
   Classic; it selects at once and survives a reload.
2. **New invoice**: the Template field shows Classic. Pick Creative; the
   preview redraws in Creative, and Settings now shows Creative.
3. **Draft PDF**: generate a draft with "One summary line" and all three
   schedules attached; Download PDF is in Creative, detail pages included.
4. **Freeze**: Mark sent, switch the setting to Modern, download the sent
   invoice again: still Creative.
5. **Samples**: `pnpm sample:invoice` writes one PDF per template to
   `docs/design/samples/`; each matches `specs/011-invoice-templates/design/invoice.html`.
6. **Suites**: `pnpm test`, `pnpm test:ui`, `pnpm test:stories` pass.
