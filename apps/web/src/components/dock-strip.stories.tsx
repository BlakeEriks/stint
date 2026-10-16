import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { account } from '@/mocks/db';
import {
  desktop,
  expectOpen,
  failing,
  menuOpen,
  screen,
  wide,
} from '@/mocks/screen';
import { AppShell } from './app-shell';
import { Page } from './page';

/** The dock folded beside a workspace screen: Inbox, with its count, and
    Today, each opening over the panel. */
const meta = {
  title: 'Parts/Dock Strip',
  component: AppShell,
  parameters: screen('/invoices/new').parameters,
  args: {
    children: (
      <Page workspace>
        <h1 className="type-title text-strong">A workspace</h1>
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
const inboxIcon = (page: Screen) =>
  page.findByRole('button', { name: /^Inbox/ });

/** The strip takes 44px where the dock took 286px, and the Inbox icon
    carries the count (US1 scenarios 1 and 2). */
export const Strip: Story = {
  ...wide,
  play: async ({ canvasElement }) => {
    const page = body(canvasElement);
    await expect(
      (await strip(page)).getBoundingClientRect().width,
    ).toBeLessThanOrEqual(44);
    await expect(
      page.queryByRole('complementary', { name: 'At a glance' }),
    ).toBeNull();
    await waitFor(async () =>
      expect(await inboxIcon(page)).toHaveAccessibleName(/^Inbox, \d+ items$/),
    );
    await expect(page.getByRole('button', { name: 'Today' })).toBeVisible();
  },
};

/** Nothing needs the user: no count on the icon. */
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
    await userEvent.click(await inboxIcon(page));
    await expect(
      await within(
        await page.findByRole('dialog', { name: 'Inbox' }),
      ).findByText('Nothing needs you.'),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Inbox' })).toBeVisible();
  },
};

/** The Inbox opens over the panel; Escape and a press outside close it, and
    focus returns to the icon (US1 scenarios 3 and 4). */
export const InboxOpen: Story = {
  ...desktop,
  play: async ({ canvasElement }) => {
    const page = body(canvasElement);
    const icon = await inboxIcon(page);

    await userEvent.click(icon);
    await expect(
      await page.findByRole('dialog', { name: 'Inbox' }),
    ).toBeVisible();
    await expect(icon).toHaveAttribute('aria-expanded', 'true');
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(page.queryByRole('dialog')).toBeNull());
    await expect(icon).toHaveFocus();

    await userEvent.click(icon);
    await page.findByRole('dialog', { name: 'Inbox' });
    await userEvent.click(page.getByRole('heading', { name: 'A workspace' }));
    await waitFor(() => expect(page.queryByRole('dialog')).toBeNull());

    await userEvent.click(icon);
    const fold = await page.findByRole('dialog', { name: 'Inbox' });
    await expect(
      await within(fold).findAllByText(/days late/),
    ).not.toHaveLength(0);
  },
};

/** The stats fail: no count, and the open Inbox says so, neutrally. */
export const StatsFailed: Story = {
  ...desktop,
  parameters: failing('stats'),
  play: async ({ canvasElement }) => {
    const page = body(canvasElement);
    await userEvent.click(await page.findByRole('button', { name: 'Inbox' }));
    const fold = await page.findByRole('dialog', { name: 'Inbox' });
    await expect(
      await within(fold).findByText('Could not load this. Try again.'),
    ).toBeVisible();
  },
};

/** Today opens over the panel with the day's entries (US2 scenario 1). */
export const TodayOpen: Story = {
  ...desktop,
  play: async ({ canvasElement }) => {
    const page = body(canvasElement);
    await userEvent.click(await page.findByRole('button', { name: 'Today' }));
    const fold = await page.findByRole('dialog', { name: 'Today' });
    await expect(
      await within(fold).findAllByRole('button', { name: /^Edit Pairing/ }),
    ).not.toHaveLength(0);
  },
};

/** An entry's editor opens over the fold, and closing it leaves Today open
    (US2 scenario 2). */
export const EditFromToday: Story = {
  ...desktop,
  parameters: menuOpen,
  play: async ({ canvasElement }) => {
    const page = body(canvasElement);
    await userEvent.click(await page.findByRole('button', { name: 'Today' }));
    const fold = await page.findByRole('dialog', { name: 'Today' });
    const [edit] = await within(fold).findAllByRole('button', {
      name: /^Edit Pairing/,
    });

    await userEvent.click(edit as HTMLElement);
    await expect(
      await page.findByRole('dialog', { name: 'Edit entry' }),
    ).toBeVisible();
    await userEvent.keyboard('{Escape}');
    await waitFor(() =>
      expect(page.queryByRole('dialog', { name: 'Edit entry' })).toBeNull(),
    );
    await expect(page.getByRole('dialog', { name: 'Today' })).toBeVisible();

    await userEvent.click(edit as HTMLElement);
    await expectOpen(canvasElement, 'dialog', 'Edit entry');
  },
};
