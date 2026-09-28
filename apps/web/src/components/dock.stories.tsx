import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { account } from '@/mocks/db';
import { expect, userEvent, within } from 'storybook/test';
import { desktop, expectOpen, knownFailures, tablet } from '@/mocks/screen';
import { Dock } from './dock';

/** The inbox over today's entries: what needs the user, and what they did. */
const meta = {
  title: 'Parts/Dock',
  component: Dock,
  parameters: { layout: 'fullscreen', a11y: knownFailures },
  decorators: [
    (Story) => (
      <div className="flex h-screen justify-end bg-surface-base p-3">
        <div className="flex w-[286px] flex-col">
          <Story />
        </div>
      </div>
    ),
  ],
} satisfies Meta<typeof Dock>;

export default meta;
type Story = StoryObj<typeof meta>;

/** One row per thing to resolve: late and stale invoices, work with no
    project, durations too short or long to be real, and overlaps. */
export const Column: Story = {
  ...desktop,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    for (const row of [
      /days late/,
      /Draft, \d+d old/,
      /No project/,
      /unusually long/,
      /unusually short/,
      /overlaps/i,
    ])
      await expect((await page.findAllByText(row))[0]).toBeInTheDocument();
  },
};

/** Below `xl` the dock is a band that sizes to its content, with no split. */
export const Band: Story = { ...tablet };

/** Nothing needs the user. */
export const Clear: Story = {
  ...desktop,
  parameters: account((db) => {
    db.invoices = db.invoices.filter(
      (i) => i.status !== 'draft' && i.status !== 'sent',
    );
    for (const e of db.entries) e.durationOk = true;
    db.entries = db.entries.filter(
      (e) =>
        e.projectId !== null &&
        !['Client call and follow-ups'].includes(e.taskName),
    );
  }),
};

/** A day with nothing logged yet. */
export const EmptyDay: Story = { ...desktop, parameters: account('empty') };

/** Work with no project is assigned in place, one entry at a time. */
export const AssignProject: Story = {
  ...desktop,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const [assign] = await page.findAllByRole('button', {
      name: /Assign a project/,
    });
    await userEvent.click(assign as HTMLElement);
    await expectOpen(canvasElement, 'dialog');
  },
};
