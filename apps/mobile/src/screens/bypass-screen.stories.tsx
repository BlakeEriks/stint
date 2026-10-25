import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { BypassScreen } from './bypass-screen.tsx';

const meta = {
  title: 'Phone/Preview bypass',
  component: BypassScreen,
  args: { label: 'PR 471', error: null, onSave: fn() },
} satisfies Meta<typeof BypassScreen>;
export default meta;
type Story = StoryObj<typeof meta>;

/** US4: a preview asks once for the bypass, for every PR, inert until one is typed. */
export const FirstLaunch: Story = {
  play: async ({ canvasElement, args }) => {
    const screen = within(canvasElement);
    await expect(
      screen.getByText(/every PR you open here finds it/),
    ).toBeVisible();
    const save = screen.getByRole('button', { name: 'Save' });
    await expect(save).toHaveAttribute('aria-disabled', 'true');
    await userEvent.type(screen.getByLabelText('Vercel bypass'), 'abc123');
    await userEvent.click(save);
    await expect(args.onSave).toHaveBeenCalledWith('abc123');
  },
};

/** The phone could not keep it: the screen says so and stays. */
export const CouldNotKeep: Story = {
  args: { error: 'Couldn’t keep it on this phone: Keychain unavailable' },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('alert')).toHaveTextContent(
      /Couldn’t keep it/,
    );
  },
};
