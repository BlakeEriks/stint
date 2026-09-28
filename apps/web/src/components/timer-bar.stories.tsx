import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, userEvent, within } from 'storybook/test';
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

const running = { parameters: { db: 'running' } };
const phone = { globals: { viewport: { value: 'phone' } } };
const tablet = { globals: { viewport: { value: 'tablet' } } };
const desktop = { globals: { viewport: { value: 'desktop' } } };

/** Below `sm` the idle bar wraps: the task field takes its own row. */
export const IdlePhone: Story = { ...phone };
export const IdleTablet: Story = { ...tablet };
export const IdleDesktop: Story = { ...desktop };

/** Below `sm` the project pill is dropped so the running bar never wraps. */
export const RunningPhone: Story = { ...running, ...phone };
export const RunningTablet: Story = { ...running, ...tablet };
export const RunningDesktop: Story = { ...running, ...desktop };

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
