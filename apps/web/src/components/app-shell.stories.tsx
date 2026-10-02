import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { account } from '@/mocks/db';
import { expect, userEvent, within } from 'storybook/test';
import AppError from '@/app/(app)/error';
import {
  desktop,
  laptop,
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
import { Page } from './page';

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

/* One mount of the timer bar serves every arrangement: grid placement moves
   it, so there is never a second Start button in the accessibility tree. */
const oneTimer: Story['play'] = async ({ canvasElement }) => {
  const page = within(canvasElement.ownerDocument.body);
  await expect(
    await page.findAllByRole('button', { name: 'Start timer' }),
  ).toHaveLength(1);
};

/** Below `lg`: the nav is a strip along the top and scrolls sideways. */
export const Phone: Story = { ...phone, play: oneTimer };
/** From `sm` the page stops scrolling and the content column scrolls. */
export const Tablet: Story = { ...tablet, play: oneTimer };
/** From `lg` the rail sits beside the content; the dock is still a band. */
export const Laptop: Story = { ...laptop, play: oneTimer };
/** At `xl` the dock becomes a third column. */
export const Desktop: Story = { ...desktop, play: oneTimer };
/** At `2xl` the app is a bounded card on the recessed plane. */
export const Wide: Story = { ...wide, play: oneTimer };
export const Light: Story = { ...light };

/* Each section's focus ring is drawn whole: the rail is a scroller, which
   clips whatever crosses its edge, the first and last items' rings included. */
const ringsFit: Story['play'] = async ({ canvasElement }) => {
  const page = within(canvasElement.ownerDocument.body);
  const nav = await page.findByRole('navigation', { name: 'Sections' });
  for (const link of within(nav).getAllByRole('link')) {
    link.focus({ focusVisible: true } as FocusOptions);
    const style = getComputedStyle(link);
    const ring =
      Number.parseFloat(style.outlineWidth) +
      Number.parseFloat(style.outlineOffset);
    const scroller = link.parentElement as HTMLElement;
    const box = scroller.getBoundingClientRect();
    const at = link.getBoundingClientRect();
    await expect(at.top - ring).toBeGreaterThanOrEqual(box.top);
    await expect(at.bottom + ring).toBeLessThanOrEqual(box.bottom);
    if (scroller.scrollWidth <= scroller.clientWidth) {
      await expect(at.left - ring).toBeGreaterThanOrEqual(box.left);
      await expect(at.right + ring).toBeLessThanOrEqual(box.right);
    }
  }
};

/** The rail with a section focused: its ring is not clipped. */
export const RailFocus: Story = { ...light, play: ringsFit };
/** The strip with a section focused, on a phone. */
export const StripFocus: Story = { ...phone, play: ringsFit };

/** A workspace screen takes the dock's room; the card stays as it is. */
export const Workspace: Story = {
  ...wide,
  args: {
    children: (
      <Page workspace>
        <h1 className="type-title text-strong">A workspace</h1>
      </Page>
    ),
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await page.findByRole('heading', { name: 'A workspace' });
    await expect(
      page.queryByRole('complementary', { name: 'At a glance' }),
    ).toBeNull();
  },
};

/** A failed screen replaces the content column; the timer keeps running. */
export const ScreenError: Story = {
  ...desktop,
  parameters: account('running'),
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
