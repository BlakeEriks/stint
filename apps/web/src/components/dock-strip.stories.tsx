import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { account } from '@/mocks/db';
import { desktop, failing, foldDock, screen, wide } from '@/mocks/screen';
import { AppShell } from './app-shell';
import { Page } from './page';

/** The dock folded by the user: the Inbox's count, and the button that
    unfolds it. */
const meta = {
  title: 'Parts/Dock Strip',
  component: AppShell,
  parameters: screen('/').parameters,
  beforeEach: foldDock,
  args: {
    children: (
      <Page>
        <h1 className="type-title text-strong">A screen</h1>
      </Page>
    ),
  },
} satisfies Meta<typeof AppShell>;

export default meta;
type Story = StoryObj<typeof meta>;

type Screen = ReturnType<typeof within>;
const body = (canvasElement: HTMLElement) =>
  within(canvasElement.ownerDocument.body);
const strip = (page: Screen) =>
  page.findByRole('complementary', { name: 'Inbox and Today' });
const dock = (page: Screen) =>
  page.queryByRole('complementary', { name: 'At a glance' });

/** The strip takes 44px where the dock took 286px, and its button carries
    the Inbox's count. */
export const Strip: Story = {
  ...wide,
  play: async ({ canvasElement }) => {
    const page = body(canvasElement);
    await expect(
      (await strip(page)).getBoundingClientRect().width,
    ).toBeLessThanOrEqual(44);
    await expect(dock(page)).toBeNull();
    await waitFor(() =>
      expect(
        page.getByRole('button', { name: /^Show Inbox and Today/ }),
      ).toHaveAccessibleName(/^Show Inbox and Today, \d+ items$/),
    );
  },
};

/** The strip's button unfolds the dock, and the dock's folds it again;
    focus moves to the button that takes it back. */
export const Toggle: Story = {
  ...desktop,
  play: async ({ canvasElement }) => {
    const page = body(canvasElement);
    await strip(page);
    await userEvent.click(
      page.getByRole('button', { name: /^Show Inbox and Today/ }),
    );
    await expect(
      await page.findByRole('complementary', { name: 'At a glance' }),
    ).toBeVisible();
    // The strip fades out, so it leaves the tree a moment after the click.
    await waitFor(() =>
      expect(
        page.queryByRole('complementary', { name: 'Inbox and Today' }),
      ).toBeNull(),
    );
    // The fold button is in the Inbox's header, which mounts once the dock's
    // data loads, so it is awaited rather than expected at once.
    const hide = await page.findByRole('button', {
      name: 'Hide Inbox and Today',
    });
    await waitFor(() => expect(hide).toHaveFocus());

    await userEvent.click(hide);
    await strip(page);
    await waitFor(() => expect(dock(page)).toBeNull());
    await expect(
      page.getByRole('button', { name: /^Show Inbox and Today/ }),
    ).toHaveFocus();
  },
};

/** Nothing needs the user: no count on the button. */
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
  play: async ({ canvasElement }) => {
    const page = body(canvasElement);
    await strip(page);
    await expect(
      await page.findByRole('button', { name: 'Show Inbox and Today' }),
    ).toBeVisible();
  },
};

/** The stats fail: no count, and the button still unfolds the dock. */
export const StatsFailed: Story = {
  ...desktop,
  parameters: failing('stats'),
  play: async ({ canvasElement }) => {
    const page = body(canvasElement);
    await strip(page);
    await expect(
      page.getByRole('button', { name: 'Show Inbox and Today' }),
    ).toBeVisible();
  },
};
