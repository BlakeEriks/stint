import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { userEvent, within } from 'storybook/test';
import AppError from '@/app/(app)/error';
import {
  desktop,
  light,
  menuOpen,
  phone,
  screen,
  tablet,
  wide,
  expectOpen,
} from '@/mocks/screen';
import { AppShell } from './app-shell';
import { Home } from './home';

/**
 * What every screen renders inside: the header, the rail, the panel, the dock
 * and the timer bar, at each width the layout changes at.
 */
const meta = {
  title: 'Screens/Frame',
  component: AppShell,
  // The frame itself is the subject, so it takes the screen's settings but
  // not its decorator, which would draw a second frame around it.
  parameters: screen('/').parameters,
  args: { children: <Home /> },
} satisfies Meta<typeof AppShell>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Below `lg`: the nav is a strip along the top and scrolls sideways. */
export const Phone: Story = { ...phone };
/** From `sm` the page stops scrolling and the content column scrolls. */
export const Tablet: Story = { ...tablet };
/** At `xl` the dock becomes a third column. */
export const Desktop: Story = { ...desktop };
/** At `2xl` the app is a bounded card on the recessed plane. */
export const Wide: Story = { ...wide };
export const Light: Story = { ...light };

/** A failed screen replaces the content column; the timer keeps running. */
export const ScreenError: Story = {
  ...desktop,
  parameters: { db: 'running' },
  args: {
    children: (
      <AppError
        error={Object.assign(new globalThis.Error('Fixture'), {
          digest: '2718281828',
        })}
        reset={() => {}}
      />
    ),
  },
};

/** The account menu: who is signed in, the theme, and signing out. */
export const AccountMenu: Story = {
  ...desktop,
  parameters: menuOpen,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole('button', { name: 'Account' }));
    await expectOpen(canvasElement, 'menu');
  },
};
