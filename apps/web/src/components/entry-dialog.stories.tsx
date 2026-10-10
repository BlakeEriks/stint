import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { account as scenario } from '@/mocks/db';
import { id, ids, seed } from '@/mocks/fixtures';
import { desktop, phone, stalled } from '@/mocks/screen';
import { NOW, ZONE } from '@/mocks/time.mts';
import { EntryDialog } from './entry-dialog';

/* The same account the handlers serve, so the entry opened is the one the
   server would return. */
const account = seed(new Date(NOW));
const active = account.projects.filter((p) => p.archivedAt === null);
const on = (invoiceSeq: number) =>
  account.entries.find((e) => e.invoiceId === id(300 + invoiceSeq));
const today = account.entries.find(
  (e) => e.taskName === 'Pairing on the ingest job' && !e.invoiceId,
);

/** Every entry is edited here: from the calendar, the dock, the inbox, and
    the timer bar's Adjust. The strip and the time fields are one value. */
const meta = {
  title: 'Parts/EntryDialog',
  component: EntryDialog,
  args: {
    open: true,
    onOpenChange: () => {},
    projects: active,
    tz: ZONE,
    existing: today,
  },
} satisfies Meta<typeof EntryDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Edit: Story = { ...desktop };
export const EditPhone: Story = { ...phone };

/** A new entry: no strip, and the task field suggests. */
export const Add: Story = { ...desktop, args: { existing: undefined } };

/** Opened from a time on the calendar: that hour, prefilled. */
export const AddFromCalendar: Story = {
  ...desktop,
  args: {
    existing: undefined,
    seed: {
      startedAt: '2026-09-17T20:00:00.000Z',
      endedAt: '2026-09-17T21:00:00.000Z',
    },
  },
};

/** On an issued invoice: read-only, the handles gone, and the invoice to
    void named. */
export const Locked: Story = {
  ...desktop,
  args: { existing: on(13) },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(await page.findByText(/billed on STINT-0013/)).toBeVisible();
  },
};

/** On a draft: still editable, with a warning naming the draft that changes. */
export const OnDraft: Story = {
  ...desktop,
  args: { existing: on(15) },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(await page.findByText(/on draft STINT-0015/)).toBeVisible();
  },
};

/** Delete asks once. */
export const ConfirmDelete: Story = {
  ...desktop,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await page.findByRole('button', { name: 'Delete entry' }),
    );
    // Inside a dialog still fading in, so visibility is waited for.
    await waitFor(async () =>
      expect(
        await page.findByRole('button', { name: /Delete for good/ }),
      ).toBeVisible(),
    );
  },
};

/** The delete is waiting on the server: the confirm says so, and nothing
    can be pressed twice. */
export const Deleting: Story = {
  ...desktop,
  parameters: stalled('deleteEntry'),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await page.findByRole('button', { name: 'Delete entry' }),
    );
    await userEvent.click(
      await page.findByRole('button', { name: 'Delete for good' }),
    );
    await expect(
      await page.findByRole('button', { name: 'Deleting…' }),
    ).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Keep' })).toBeDisabled();
  },
};

/** The save is waiting on the server: nothing closes the dialog, so a
    refusal still has a form to land in. */
export const Saving: Story = {
  ...desktop,
  parameters: stalled('updateEntry'),
  args: { onOpenChange: fn() },
  play: async ({ args, canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole('button', { name: 'Save' }));
    await expect(
      await page.findByRole('button', { name: 'Saving…' }),
    ).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    await userEvent.keyboard('{Escape}');
    await expect(args.onOpenChange).not.toHaveBeenCalled();
  },
};

/** An end before the start is the next morning: the strip steps aside. */
export const Overnight: Story = {
  ...desktop,
  args: {
    existing: today && {
      ...today,
      startedAt: '2026-09-17T02:00:00.000Z',
      endedAt: '2026-09-17T06:00:00.000Z',
      durationSeconds: 4 * 3600,
    },
  },
};

/** A new entry's task field suggests, and the list overlays the fields. */
export const Suggestions: Story = {
  ...desktop,
  args: { existing: undefined },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.type(
      await page.findByRole('combobox', { name: /Task/ }),
      'pa',
    );
    await expect(await page.findByRole('listbox')).toBeVisible();
  },
};

/** An entry whose client was archived since: the field still names its
    project, though the menu no longer offers it. */
export const ArchivedClient: Story = {
  ...desktop,
  parameters: scenario((db) => {
    for (const c of db.clients)
      if (c.id === ids.byrne) c.archivedAt = '2026-09-01T16:00:00.000Z';
  }),
  args: {
    projects: active.filter((p) => p.clientId !== ids.byrne),
    existing: account.entries.find((e) => e.taskName === 'Launch day support'),
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await waitFor(() =>
      expect(page.getByRole('button', { name: 'Project' })).toHaveTextContent(
        'Brand site rebuild',
      ),
    );
  },
};
