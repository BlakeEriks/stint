import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { account, running as runningEntry } from '@/mocks/db';
import { ids } from '@/mocks/fixtures';
import { expect, userEvent, within } from 'storybook/test';
import { desktop, phone, tablet } from '@/mocks/screen';
import { TimerDock } from './timer-dock';

/** The bar under every screen, fed by the shared fake account. */
const meta = {
  title: 'Parts/TimerBar',
  component: TimerDock,
  parameters: { layout: 'fullscreen' },
  // Docked to the bottom of the frame, as the app places it.
  decorators: [
    (Story) => (
      <div className="flex h-screen flex-col justify-end p-3">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof TimerDock>;

export default meta;
type Story = StoryObj<typeof meta>;

const running = { parameters: account('running') };

/** Below `sm` the idle bar wraps: the task field takes its own row. */
export const IdlePhone: Story = { ...phone };
export const IdleTablet: Story = { ...tablet };
export const IdleDesktop: Story = { ...desktop };

/** Below `sm` the project pill is dropped so the running bar never wraps. */
export const RunningPhone: Story = { ...running, ...phone };
export const RunningTablet: Story = { ...running, ...tablet };
/** The running task reads as text: a live field would make a stray click a
    rename of billable work. */
export const RunningDesktop: Story = {
  ...running,
  ...desktop,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole('button', { name: 'Stop timer' });
    await expect(
      // By label, so neither the rename field nor the idle combobox passes.
      canvas.queryByLabelText('Task name'),
    ).toBeNull();
    await expect(
      canvas.getByRole('button', { name: 'Rename task' }),
    ).toBeVisible();
  },
};

/** Its client archived mid-run: the pill still names the project, though no
    picker offers it for new time. */
export const RunningArchivedClient: Story = {
  ...desktop,
  parameters: account((db) => {
    db.entries.push(runningEntry(db, '13:45', ids.brand, 'Homepage hero'));
    for (const c of db.clients)
      if (c.id === ids.byrne) c.archivedAt = '2026-09-01T16:00:00.000Z';
  }),
  play: async ({ canvasElement }) => {
    const bar = await within(canvasElement).findByRole('region', {
      name: 'Timer',
    });
    await expect(
      await within(bar).findByText('Brand site rebuild'),
    ).toBeVisible();
  },
};

/** The pencil is the only way to rename, and it opens the name for editing. */
export const Rename: Story = {
  ...running,
  ...desktop,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      await canvas.findByRole('button', { name: 'Rename task' }),
    );
    const field = canvas.getByRole('textbox', { name: 'Task name' });
    await expect(field).toHaveFocus();
    await expect(field).toHaveValue('Checkout timeout fix');
  },
};

/** Focus alone opens the recent names; nothing is highlighted yet. */
export const Suggestions: Story = {
  ...desktop,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      await canvas.findByRole('combobox', { name: 'Task name' }),
    );
    await expect(await canvas.findByRole('listbox')).toBeVisible();
  },
};

/** Typing filters, the match in bold, the keycap on the highlighted row. */
export const SuggestionsFiltered: Story = {
  ...desktop,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(
      await canvas.findByRole('combobox', { name: 'Task name' }),
      'pa',
    );
    await userEvent.keyboard('{ArrowDown}');
    await expect(await canvas.findByRole('listbox')).toBeVisible();
  },
};
