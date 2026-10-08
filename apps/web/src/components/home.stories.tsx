import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { localDateKey } from '@stint/core';
import { account } from '@/mocks/db';
import { entry, ids } from '@/mocks/fixtures';
import { ZONE } from '@/mocks/time.mts';
import { expect, waitFor, within } from 'storybook/test';
import { desktop, light, phone, screen, tablet, wide } from '@/mocks/screen';
import { Home } from './home';

const meta = {
  title: 'Screens/Home',
  component: Home,
  ...screen('/'),
} satisfies Meta<typeof Home>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Mid-month: the week half done, the month on pace, two invoices out. */
export const Desktop: Story = {
  ...desktop,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement);
    // The count, never the worst of them: naming one drops the others.
    await expect(await page.findByText(/2 open invoices/)).toBeVisible();

    // Friday to Sunday are unworked: no bar, and an em-dash holds each caption.
    const week = await page.findByRole('img', { name: /FRI not yet worked/ });
    await expect(week.querySelectorAll('[data-bar]')).toHaveLength(4);
    await expect(within(week).getAllByText('—')).toHaveLength(3);

    // Mid-month, `today` clears both ends of the axis.
    const axis = within(
      (await page.findByText('today')).parentElement as HTMLElement,
    );
    await expect(axis.getByText('Sep 1')).toBeVisible();
    await expect(axis.getByText('Sep 30')).toBeVisible();
  },
};
export const Tablet: Story = { ...tablet };
/** Below `@2xl` the regions stack into one column. */
export const Phone: Story = { ...phone };
export const Light: Story = { ...light };

/** A timer running: its task leads Today, and the timer bar counts it. */
export const Running: Story = { ...desktop, parameters: account('running') };

/** A new account: every figure is zero and nothing is extrapolated. */
export const Empty: Story = {
  ...desktop,
  parameters: account('empty'),
  play: async ({ canvasElement, loaded }) => {
    const page = within(canvasElement);
    await page.findByText('Unbilled');
    // Today's entries load after the stats, into the same placeholder rows.
    await loaded.settle();
    // No `$0.00 awaiting`: a figure standing in for the absence of one.
    await expect(page.queryByText(/open invoice/)).toBeNull();
    // One neutral band would say the month came from nobody.
    await expect(canvasElement.querySelector('[data-strip]')).toBeNull();

    // The day keeps its rows, and no pip: a ring would claim internal work.
    const rows = canvasElement.querySelectorAll('[data-entry-empty]');
    await expect(rows).toHaveLength(3);
    for (const row of rows)
      await expect(row.querySelector('[data-pip]')).toBeNull();
  },
};

/** Tuesday's work has no rate anywhere in its chain: a bar, and no money. */
export const UnratedDay: Story = {
  ...desktop,
  parameters: account((db) => {
    db.settings.defaultHourlyRate = null;
    // Meridian inherits the default, so all of Tuesday is now unrated.
    for (const e of db.entries)
      if (
        e.isBillable &&
        localDateKey(new Date(e.startedAt), ZONE) === '2026-09-15'
      )
        e.projectId = ids.pipeline;
  }),
  play: async ({ canvasElement }) => {
    const week = await within(canvasElement).findByRole('img', {
      name: /TUE \d+h( \d+m)?, WED/,
    });
    const bar = week.querySelector('[data-bar="2026-09-15"]') as HTMLElement;
    await expect(bar.getBoundingClientRect().height).toBeGreaterThan(0);
    await expect(bar.textContent).toBe('');
  },
};

/** Internal work today: a hollow ring where a client's color would be. */
export const InternalToday: Story = {
  ...desktop,
  parameters: account((db) => {
    db.entries.push(
      entry(
        9001,
        localDateKey(db.now, ZONE),
        '14:00',
        30,
        ids.admin,
        'Invoicing and bookkeeping',
      ),
    );
  }),
  play: async ({ canvasElement }) => {
    const ring = (task: string) =>
      [...canvasElement.querySelectorAll('[data-task]')]
        .find((row) => row.textContent?.startsWith(task))
        ?.querySelector('[data-pip="internal"]');
    await waitFor(async () => {
      await expect(ring('Invoicing and bookkeeping')).toBeTruthy();
      await expect(ring('Filter panel and saved views')).toBeNull();
    });
  },
};

/** At `2xl` the panel is a bounded card. */
export const Wide: Story = { ...wide };

/** Below `@2xl` the month stacks under the week rather than dropping out. */
export const PhoneMonth: Story = {
  ...phone,
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByText(/This month/),
    ).toBeInTheDocument();
  },
};

/** The month's second day: `Sep 1` gives way to `today` rather than touching it. */
export const MonthStart: Story = {
  ...desktop,
  parameters: { now: '2026-09-02T19:30:00.000Z' },
  play: async ({ canvasElement }) => {
    const axis = await within(canvasElement).findByText('today');
    await expect(
      within(axis.parentElement as HTMLElement).getByText('Sep 1'),
    ).not.toBeVisible();
  },
};

/** The month's last day: `today` takes `Sep 30`'s place, flush with the axis's end. */
export const MonthEnd: Story = {
  ...desktop,
  parameters: { now: '2026-09-30T19:30:00.000Z' },
  play: async ({ canvasElement }) => {
    const axis = await within(canvasElement).findByText('today');
    await expect(
      within(axis.parentElement as HTMLElement).getByText('Sep 30'),
    ).not.toBeVisible();
  },
};

/** Late in the month: `today` takes `Sep 30`'s place, and `Sep 1` stays. */
export const MonthLate: Story = {
  ...desktop,
  parameters: { now: '2026-09-28T19:30:00.000Z' },
  play: async ({ canvasElement }) => {
    const axis = await within(canvasElement).findByText('today');
    const dates = within(axis.parentElement as HTMLElement);
    await expect(dates.getByText('Sep 1')).toBeVisible();
    await expect(dates.getByText('Sep 30')).not.toBeVisible();
  },
};
