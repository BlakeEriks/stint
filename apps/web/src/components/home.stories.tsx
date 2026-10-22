import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { localDateKey } from '@stint/core';
import { account } from '@/mocks/db';
import { entry, id, ids } from '@/mocks/fixtures';
import { ZONE } from '@/mocks/time.mts';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import {
  desktop,
  failing,
  light,
  phone,
  screen,
  stalled,
  tablet,
  wide,
} from '@/mocks/screen';
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
    const awaiting = await page.findByRole('link', { name: /2 open invoices/ });
    await expect(awaiting).toHaveAttribute('href', '/invoices?status=sent');

    // Unbilled breaks down by client, each against its oldest entry's age.
    const rows = canvasElement.querySelector('[data-unbilled="clients"]');
    await expect(rows).not.toBeNull();
    await expect(
      within(rows as HTMLElement).getByText('Northwind Trading'),
    ).toBeVisible();
    await expect(
      within(rows as HTMLElement).getAllByText(/^oldest \d+d$|^today$/).length,
    ).toBeGreaterThan(0);

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
/** Below `@2xl` the regions stack into one column, and the week's seven
 *  columns still keep each day's hours and money apart from its neighbor's. */
export const Phone: Story = {
  ...phone,
  play: async ({ canvasElement }) => {
    const week = await within(canvasElement).findByRole('img', {
      name: /FRI not yet worked/,
    });
    for (const selector of ['[data-hours]', '[data-money]']) {
      // The text's own box: a label's element is its column's width, and the
      // text overflows it.
      const boxes = [...week.querySelectorAll(selector)].map((el) => {
        const text = document.createRange();
        text.selectNodeContents(el);
        return text.getBoundingClientRect();
      });
      await expect(boxes.length).toBeGreaterThan(1);
      for (const [i, box] of boxes.slice(1).entries())
        await expect(box.left).toBeGreaterThanOrEqual(
          (boxes[i] as DOMRect).right,
        );
    }
  },
};
export const Light: Story = { ...light };

/** A timer running: its task leads Today, and the timer bar counts it.
 *  Earned, the week's bar and the month count the session so far. */
export const Running: Story = { ...desktop, parameters: account('running') };

/** A Today row is a summary line: pressing it starts nothing. */
export const TodayRowInert: Story = {
  ...desktop,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement);
    await page.findByRole('button', { name: 'Start timer' });
    const [row] = await page.findAllByText(/^Filter panel and saved views/);
    await userEvent.click(row as HTMLElement);
    // Past the mock server's answer, so a start would have landed by now.
    await new Promise((r) => setTimeout(r, 1000));
    await expect(page.queryByRole('button', { name: 'Stop timer' })).toBeNull();
  },
};

/** Stop pressed and not yet answered: the bar and the hours have moved, and
 *  the money, which the client never predicts, pulses until the answer
 *  brings it. */
export const StopSettling: Story = {
  ...desktop,
  parameters: { ...account('running'), ...stalled('stopTimer') },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const panel = within(canvasElement);
    await panel.findByText(/^Today · /);
    await expect(canvasElement.querySelector('[data-settling]')).toBeNull();
    await userEvent.click(
      await page.findByRole('button', { name: 'Stop timer' }),
    );
    await page.findByRole('button', { name: 'Start timer' });
    await waitFor(() =>
      expect(
        canvasElement.querySelectorAll('[data-settling]').length,
      ).toBeGreaterThan(0),
    );
    await expect(
      canvasElement.querySelector('[data-money][data-settling]'),
    ).not.toBeNull();
  },
};

/** A timer on unrated work: its time counts, and Earned does not move. */
export const RunningUnrated: Story = {
  ...desktop,
  parameters: account('runningUnrated'),
};

/** On its way: the panel holds one quiet word, and none of its regions,
 *  until everything it draws has arrived. */
export const Loading: Story = {
  ...desktop,
  parameters: stalled('stats'),
  play: async ({ canvasElement }) => {
    const panel = within(canvasElement.querySelector('main') as HTMLElement);
    await expect(await panel.findByRole('status')).toHaveTextContent('Loading');
    await expect(panel.queryByText(/Today ·/)).toBeNull();
    await expect(
      panel.queryByRole('img', { name: /not yet worked/ }),
    ).toBeNull();
  },
};

/** The panel paints once: the first frame that has the week's bars already
 *  has them in their clients' colors, and the legend naming those clients. */
export const OneStep: Story = {
  ...desktop,
  play: async ({ canvasElement }) => {
    const week = await within(canvasElement).findByRole('img', {
      name: /not yet worked/,
    });
    // No waiting from here: what the bars first show is what they show.
    await expect(
      week.querySelectorAll('[data-segment]:not([data-segment="internal"])')
        .length,
    ).toBeGreaterThan(0);
    await expect(
      canvasElement.querySelectorAll(
        '[data-legend-key]:not([data-legend-key="internal"])',
      ).length,
    ).toBeGreaterThan(0);
  },
};

const noRate = account((db) => {
  db.settings.defaultHourlyRate = null;
});

/** No default rate: the Inbox asks for one, after the invoice rows and
 *  before the entry rows, and counts it. */
export const NoRate: Story = {
  ...desktop,
  parameters: noRate,
  play: async ({ canvasElement }) => {
    const inbox = within(
      await within(canvasElement).findByRole('region', { name: 'Inbox' }),
    );
    const row = (await inbox.findByText('Set your default rate')).closest('li');
    const rows = [...(row?.parentElement?.children ?? [])];
    const at = rows.indexOf(row as Element);
    await expect(
      rows[at - 1]?.querySelector('a[href^="/invoices/"]'),
    ).not.toBeNull();
    await expect(
      rows[at + 1]?.querySelector('a[href^="/invoices/"]'),
    ).toBeNull();
    await expect(inbox.getByRole('button', { name: 'Save' })).toBeDisabled();
  },
};

/** Saving a rate takes the row away at once, and Home prices its work. */
export const SaveRate: Story = {
  ...desktop,
  parameters: noRate,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement);
    const field = await page.findByRole('spinbutton', {
      name: 'Default hourly rate',
    });
    await userEvent.type(field, '125');
    await userEvent.click(page.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(page.queryByText('Set your default rate')).toBeNull(),
    );
  },
};

/** A negative rate is refused on the row, before any request. */
export const RateInvalid: Story = {
  ...desktop,
  parameters: noRate,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement);
    await userEvent.type(
      await page.findByRole('spinbutton', { name: 'Default hourly rate' }),
      '-5',
    );
    await expect(
      await page.findByText('A rate is a number, zero or more.'),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled();
  },
};

/** The server refuses the rate: the row comes back holding it, and says why. */
export const RateRejected: Story = {
  ...desktop,
  parameters: { ...noRate, ...failing('updateSettings') },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement);
    await userEvent.type(
      await page.findByRole('spinbutton', { name: 'Default hourly rate' }),
      '125',
    );
    await userEvent.click(page.getByRole('button', { name: 'Save' }));
    await expect(await page.findByText('Internal server error')).toBeVisible();
    await expect(
      page.getByRole('spinbutton', { name: 'Default hourly rate' }),
    ).toHaveValue(125);
  },
};

/** A new account: every figure is zero and nothing is extrapolated. */
export const Empty: Story = {
  ...desktop,
  parameters: account('empty'),
  play: async ({ canvasElement, loaded }) => {
    const page = within(canvasElement);
    await page.findByText('Unbilled');
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

/** The figures failed to load: the panel says so, never blank. */
export const Failed: Story = {
  ...desktop,
  parameters: failing('stats'),
  play: async ({ canvasElement }) => {
    // The panel's; the dock, which reads the same stats, says so too.
    const panel = within(canvasElement.querySelector('main') as HTMLElement);
    await expect(
      await panel.findByText('Could not load this. Try again.'),
    ).toBeVisible();
  },
};

/** Past `2xl` the frame is capped, and Home fits it whole, legend included. */
export const Wide: Story = {
  ...wide,
  play: async ({ canvasElement }) => {
    const legend = await waitFor(() => {
      const found = canvasElement.querySelector('[data-legend="clients"]');
      if (!found) throw new Error('No legend yet');
      return found;
    });
    let panel = legend.parentElement;
    while (panel && getComputedStyle(panel).overflowY !== 'auto') {
      panel = panel.parentElement;
    }
    if (!panel) throw new Error('Home sits in no scrolling panel');
    await waitFor(() => {
      expect(panel.scrollHeight).toBeLessThanOrEqual(panel.clientHeight);
      expect(legend.getBoundingClientRect().bottom).toBeLessThanOrEqual(
        panel.getBoundingClientRect().bottom,
      );
    });
  },
};

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

/** The month's first day: no projection yet, so a dash holds On track for's place. */
export const MonthFirst: Story = {
  ...desktop,
  parameters: { now: '2026-10-01T19:30:00.000Z' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement);
    await expect(
      await page.findByLabelText('Not projected yet'),
    ).toHaveTextContent('—');
    await expect(page.queryByText(/business days/)).toBeNull();
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

/** More unbilled clients than the rows hold: the rest are counted. */
export const UnbilledMore: Story = {
  ...desktop,
  parameters: account((db) => {
    const today = localDateKey(db.now, ZONE);
    const base = db.clients[0] as (typeof db.clients)[number];
    const work = db.projects[0] as (typeof db.projects)[number];
    for (let i = 0; i < 6; i++) {
      const client = id(700 + i);
      const project = id(800 + i);
      db.clients.push({ ...base, id: client, name: `Client ${i + 1}` });
      db.projects.push({ ...work, id: project, clientId: client });
      db.entries.push(entry(900 + i, today, '08:00', 30, project, 'Review'));
    }
  }),
  play: async ({ canvasElement }) => {
    const rows = await waitFor(() => {
      const el = canvasElement.querySelector('[data-unbilled="clients"]');
      if (!el) throw new Error('no unbilled rows');
      return el as HTMLElement;
    });
    await expect(rows.querySelectorAll('li')).toHaveLength(6);
    await expect(within(rows).getByText(/^\+\d+ more$/)).toBeVisible();
  },
};
