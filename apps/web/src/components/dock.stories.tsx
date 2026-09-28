import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { account } from '@/mocks/db';
import { desktop, knownFailures, tablet } from '@/mocks/screen';
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
export const Column: Story = { ...desktop };

/** Below `xl` the dock is a band that sizes to its content, with no split. */
export const Band: Story = { ...tablet };

/** A timer left running past the limit leads the inbox with the choice. */
export const Runaway: Story = { ...desktop, parameters: { db: 'runaway' } };

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
export const EmptyDay: Story = { ...desktop, parameters: { db: 'empty' } };
