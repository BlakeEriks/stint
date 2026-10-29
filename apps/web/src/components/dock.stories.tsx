import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { localDateKey } from '@stint/core';
import { account } from '@/mocks/db';
import { entry, ids, type Db } from '@/mocks/fixtures';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { desktop, expectOpen, stalled, tablet } from '@/mocks/screen';
import { ZONE } from '@/mocks/time.mts';
import { Dock } from './dock';

/** The inbox over today's entries: what needs the user, and what they did. */
const meta = {
  title: 'Parts/Dock',
  component: Dock,
  parameters: { layout: 'fullscreen' },
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
export const Column: Story = {
  ...desktop,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    for (const row of [
      /days late/,
      /Draft, \d+d old/,
      /No project/,
      /unusually long/,
      /unusually short/,
      /overlaps/i,
    ])
      await expect((await page.findAllByText(row))[0]).toBeInTheDocument();

    // An overlap names both entries and how long they share.
    const overlap = within(
      (await page.findByText(/Overlaps Checkout timeout fix/)).closest(
        '[data-tone]',
      ) as HTMLElement,
    );
    await expect(overlap.getByText('Client call and follow-ups')).toBeVisible();
    await expect(overlap.getByText('53m')).toBeVisible();
  },
};

/** The invoice PDF is the paid tier: a paying account's invoice rows offer
    Download; the seeded account, free with billing set up, gets none. */
export const InvoiceDownloads: Story = {
  ...desktop,
  parameters: account((db) => {
    db.billing = { ...db.billing, plan: 'paid', status: 'active' };
  }),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(
      (await page.findAllByRole('link', { name: /^Download, / }))[0],
    ).toBeVisible();
  },
};

export const InvoiceDownloadsFree: Story = {
  ...desktop,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await page.findAllByText(/days late/);
    await waitFor(() =>
      expect(page.queryAllByRole('link', { name: /^Download, / })).toEqual([]),
    );
  },
};

/** An overlap with billed time opens the unbilled entry and names the
    invoice holding the other, which can't be edited. */
export const BilledOverlap: Story = {
  ...desktop,
  parameters: account((db) => {
    const sent = db.invoices.find((i) => i.status === 'sent');
    const billed = db.entries.find(
      (e) =>
        e.taskName === 'Checkout timeout fix' &&
        db.entries.some(
          (o) =>
            o.taskName === 'Client call and follow-ups' &&
            localDateKey(new Date(o.startedAt), ZONE) ===
              localDateKey(new Date(e.startedAt), ZONE),
        ),
    );
    if (billed && sent) billed.invoiceId = sent.id;
  }),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(
      await page.findByText(/Overlaps Checkout timeout fix on STINT-/),
    ).toBeVisible();
    await expect(
      page.getByRole('button', {
        name: 'Edit entry, Client call and follow-ups',
      }),
    ).toBeVisible();
  },
};

/** Work dated in a period already sent is billed nowhere, so it waits here
    with the invoice whose period it falls in. */
export const LateEntry: Story = {
  ...desktop,
  parameters: account((db) => {
    const northwind = new Set(
      db.projects.filter((p) => p.clientId === ids.northwind).map((p) => p.id),
    );
    const late = db.entries.find(
      (e) =>
        e.invoiceId == null &&
        e.endedAt &&
        e.isBillable &&
        e.projectId &&
        northwind.has(e.projectId),
    );
    if (!late) return;
    late.taskName = 'Forgot to log';
    late.startedAt = '2026-08-10T15:00:00.000Z';
    late.endedAt = '2026-08-10T17:30:00.000Z';
    late.durationSeconds = 9000;
  }),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(
      await page.findByText(/in STINT-0013's period, already sent/),
    ).toBeVisible();
    // Its row opens the entry, where it can be marked not billable.
    await expect(
      page.getAllByRole('button', { name: 'Edit entry, Forgot to log' }).length,
    ).toBeGreaterThan(0);
  },
};

/** Northwind on `schedule`, with its unbilled work before `from` billed
    elsewhere, so only the work from `from` on can be due. */
const northwindFrom = (
  schedule: Db['clients'][number]['billingSchedule'],
  from: string,
) =>
  account((db) => {
    const northwind = new Set(
      db.projects.filter((p) => p.clientId === ids.northwind).map((p) => p.id),
    );
    for (const c of db.clients)
      if (c.id === ids.northwind) c.billingSchedule = schedule;
    for (const e of db.entries)
      if (
        !e.invoiceId &&
        e.projectId &&
        northwind.has(e.projectId) &&
        e.startedAt < from
      )
        e.invoicedElsewhere = true;
  });

/** Northwind bills twice a month, and on September 17 its first half has
    ended with work in it and no invoice. The row opens New invoice for it. */
export const PeriodDue: Story = {
  ...desktop,
  parameters: northwindFrom({ period: 'semimonthly' }, '2026-09-01'),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(
      await page.findByText('Sep 1 – 15 ended with no invoice'),
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Create invoice, Northwind Trading' }),
    ).toHaveAttribute(
      'href',
      `/invoices/new?client=${ids.northwind}&from=2026-09-01&to=2026-09-15`,
    );
    await expect(
      page.getByRole('link', { name: 'Create invoice, Northwind Trading' }),
    ).not.toHaveAttribute('download');
  },
};

/** Billed monthly, a client's whole month is named, not its dates: with
    Meridian's August invoices voided and work left in August, August is
    due. */
export const PeriodDueMonthly: Story = {
  ...desktop,
  parameters: account((db) => {
    for (const c of db.clients)
      if (c.id === ids.meridian) c.billingSchedule = { period: 'monthly' };
    for (const i of db.invoices)
      if (i.clientId === ids.meridian && i.periodStart.startsWith('2026-08'))
        i.status = 'void';
    db.entries.push(
      entry(990, '2026-08-20', '09:00', 120, ids.pipeline, 'August audit'),
    );
  }),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(
      await page.findByText('August ended with no invoice'),
    ).toBeVisible();
  },
};

/** A period across a month's end names both months: billed every two weeks
    from August 27, the one that last ended is August 27 to September 9. */
export const PeriodDueAcrossMonths: Story = {
  ...desktop,
  parameters: northwindFrom(
    { period: 'biweekly', anchor: '2026-08-27' },
    '2026-08-27',
  ),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(
      await page.findByText('Aug 27 – Sep 9 ended with no invoice'),
    ).toBeVisible();
  },
};

/** Meridian's August invoices voided and work logged on the dates given,
    so nothing but that work is due for Meridian. */
const meridianWork = (
  schedule: Db['clients'][number]['billingSchedule'],
  ...dates: string[]
) =>
  account((db) => {
    for (const c of db.clients)
      if (c.id === ids.meridian) c.billingSchedule = schedule;
    for (const i of db.invoices)
      if (i.clientId === ids.meridian && i.periodStart.startsWith('2026-08'))
        i.status = 'void';
    db.entries.push(
      ...dates.map((date, n) =>
        entry(990 + n, date, '09:00', 120, ids.pipeline, 'Audit notes'),
      ),
    );
  });

/** Work across several ended periods is one row, saying how far back it
    goes rather than naming a period. */
export const PastDueSincePeriods: Story = {
  ...desktop,
  parameters: meridianWork({ period: 'monthly' }, '2026-07-10', '2026-08-20'),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const row = within(
      (await page.findByText('unbilled since Jul 10')).closest(
        '[data-tone]',
      ) as HTMLElement,
    );
    await expect(row.getByText('Meridian Labs')).toBeVisible();
    await expect(row.getByText('4h')).toBeVisible();
    await expect(
      row.getByRole('link', { name: 'Create invoice, Meridian Labs' }),
    ).toHaveAttribute(
      'href',
      `/invoices/new?client=${ids.meridian}&from=2026-07-01&to=2026-08-31`,
    );
  },
};

/** With no schedule, work waits a month before it is due. */
export const PastDueUnscheduled: Story = {
  ...desktop,
  parameters: meridianWork(null, '2026-07-10'),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(await page.findByText('unbilled since Jul 10')).toBeVisible();
  },
};

/** Billed elsewhere marks that work billed outside Stint; the row leaves
    on the server's answer. */
export const PastDueBilledElsewhere: Story = {
  ...desktop,
  parameters: meridianWork({ period: 'monthly' }, '2026-07-10', '2026-08-20'),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(await page.findByText('unbilled since Jul 10')).toBeVisible();
    await userEvent.click(
      page.getByRole('button', { name: 'Billed elsewhere, Meridian Labs' }),
    );
    await waitFor(() =>
      expect(page.queryByText('unbilled since Jul 10')).toBeNull(),
    );
  },
};

/** While the server decides, the button says so and the row stays. */
export const PastDueBilledElsewherePending: Story = {
  ...desktop,
  parameters: {
    ...meridianWork({ period: 'monthly' }, '2026-07-10', '2026-08-20'),
    ...stalled('markInvoicedElsewhere'),
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(await page.findByText('unbilled since Jul 10')).toBeVisible();
    await userEvent.click(
      page.getByRole('button', { name: 'Billed elsewhere, Meridian Labs' }),
    );
    await expect(
      await page.findByRole('button', { name: 'Marking…, Meridian Labs' }),
    ).toBeDisabled();
    await expect(page.getByText('unbilled since Jul 10')).toBeVisible();
  },
};

/** Below `xl` the dock is a band that sizes to its content, with no split. */
export const Band: Story = { ...tablet };

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
    // Work a month old with no invoice is past due to bill.
    for (const e of db.entries)
      if (!e.invoiceId && e.startedAt < '2026-08-18')
        e.invoicedElsewhere = true;
  }),
};

/** A day with nothing logged yet. */
export const EmptyDay: Story = { ...desktop, parameters: account('empty') };

/** Work with no project is assigned in place, one entry at a time. */
export const AssignProject: Story = {
  ...desktop,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    // Each entry is its own decision: a row and an action, never a count.
    const [assign] = await page.findAllByRole('button', {
      name: /^Assign project, /,
    });
    for (const task of ['Quick call with Priya', 'Research: carrier APIs'])
      await expect(
        page.getByRole('button', { name: `Assign project, ${task}` }),
      ).toBeVisible();
    await userEvent.click(assign as HTMLElement);
    await expectOpen(canvasElement, 'dialog');
  },
};

/** Today's entry named `task`, in the seeded account. */
const todays = (db: Db, task: string) =>
  db.entries.find(
    (e) =>
      e.taskName === task &&
      localDateKey(new Date(e.startedAt), ZONE) === localDateKey(db.now, ZONE),
  ) as Db['entries'][number];

/** A row is swatch, task and duration: at 286px the rest wrapped to three
    lines. Here the entry is billed, non-billable and in a project, and none
    of that is drawn; the editor holds it. */
export const CompactRow: Story = {
  ...desktop,
  parameters: account((db) => {
    Object.assign(todays(db, 'Filter panel and saved views'), {
      isBillable: false,
      invoiceId: db.invoices[0]?.id,
    });
  }),
  play: async ({ canvasElement }) => {
    const row = await within(canvasElement.ownerDocument.body).findByRole(
      'button',
      { name: /^Edit Filter panel and saved views / },
    );
    const at = within(row);
    await expect(at.getByText('Filter panel and saved views')).toBeVisible();
    await expect(at.getByText('2h 15m')).toBeVisible();
    await expect(at.queryByText('Non-billable')).toBeNull();
    await expect(at.queryByLabelText('Billed on an issued invoice')).toBeNull();
    await expect(at.queryByText('Warehouse dashboard')).toBeNull();
    await expect(row.textContent).not.toContain(' – ');
  },
};

/** The row drops fields only because a click on it still opens the editor. */
export const EditFromToday: Story = {
  ...desktop,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await page.findByRole('button', {
        name: /^Edit Pairing on the ingest job /,
      }),
    );
    await expectOpen(canvasElement, 'dialog');
  },
};

/** An entry with no name is named, never a blank block. */
export const UntitledEntry: Story = {
  ...desktop,
  parameters: account((db) => {
    todays(db, 'Pairing on the ingest job').taskName = '';
  }),
  play: async ({ canvasElement }) => {
    const block = await within(canvasElement.ownerDocument.body).findByRole(
      'button',
      { name: /^Edit Untitled / },
    );
    await expect(within(block).getByText('Untitled')).toBeVisible();
  },
};

/** The day scrolls inside Today, never the dock: the inbox holds its place,
    and a full one squeezes the day rather than pushing itself away. */
export const TodayScrolls: Story = {
  ...desktop,
  /* The frame's grid bounds the dock's height; in the bare column above it
     would grow to fit, and nothing would need to scroll. */
  decorators: [
    (Story) => (
      <div className="grid h-[600px]">
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const today = await page.findByRole('region', { name: "Today's entries" });
    await page.findByRole('heading', { name: 'Inbox' });
    await page.findAllByRole('button', { name: /^Edit Pairing/ });
    await waitFor(() => {
      const scroller = [...today.querySelectorAll<HTMLElement>('*')].find(
        (el) => getComputedStyle(el).overflowY === 'auto',
      );
      expect(scroller?.scrollHeight).toBeGreaterThan(
        scroller?.clientHeight ?? Infinity,
      );
    });
    const dock = page.getByRole('complementary', { name: 'At a glance' });
    await expect(dock.scrollHeight).toBeLessThanOrEqual(dock.clientHeight);
  },
};

/** On its way: one quiet word where it will be, and none of it until all of
 *  it has arrived. */
export const Loading: Story = {
  ...desktop,
  parameters: stalled('stats'),
  play: async ({ canvasElement }) => {
    const region = within(canvasElement.querySelector('aside') as HTMLElement);
    await expect(await region.findByRole('status')).toHaveTextContent(
      'Loading',
    );
  },
};
