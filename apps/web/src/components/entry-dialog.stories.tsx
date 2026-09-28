import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { id, seed } from '@/mocks/fixtures';
import { desktop, knownFailures, phone } from '@/mocks/screen';
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
  parameters: { a11y: knownFailures },
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

/** On an issued invoice: read-only, the handles gone. */
export const Locked: Story = { ...desktop, args: { existing: on(13) } };

/** On a draft: still editable, with a warning that the draft changes. */
export const OnDraft: Story = { ...desktop, args: { existing: on(15) } };

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
