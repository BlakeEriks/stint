import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { localDateKey } from '@stint/core';
import { account } from '@/mocks/db';
import { type Db, entry, ids } from '@/mocks/fixtures';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { desktop, expectOpen, tablet } from '@/mocks/screen';
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
      page.getByRole('button', { name: 'Edit Client call and follow-ups' }),
    ).toBeVisible();
  },
};

/** Past three overlaps they are one row, so a flood of them buries nothing
    else. It expands in place to the pairs, longest first, each still
    opening its entry. */
export const OverlapRollup: Story = {
  ...desktop,
  parameters: account((db) => {
    const call = db.entries.find(
      (e) => e.taskName === 'Client call and follow-ups',
    ) as Db['entries'][number];
    const date = localDateKey(new Date(call.startedAt), ZONE);
    // Two more, inside a vendor call: four with the seeded two.
    db.entries.push(
      entry(9100, date, '19:00', 120, ids.rush, 'Vendor call'),
      entry(9101, date, '19:15', 20, ids.rush, 'Hotfix review'),
      entry(9102, date, '20:00', 45, ids.rush, 'Release notes'),
    );
  }),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const rollup = within(
      (await page.findByText('4 overlaps')).closest(
        '[data-tone]',
      ) as HTMLElement,
    );
    await expect(rollup.getByText('2h 28m')).toBeVisible();
    await expect(page.queryByText(/^Overlaps /)).toBeNull();

    const toggle = rollup.getByRole('button', { name: 'Show overlaps' });
    await userEvent.click(toggle);
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const pairs = page
      .getAllByText(/^Overlaps /)
      .map(
        (d) => d.closest('[data-tone]')?.querySelector('button')?.textContent,
      );
    await expect(pairs).toEqual([
      'Client call and follow-ups',
      'Release notes',
      'Research: carrier APIs',
      'Hotfix review',
    ]);
    await userEvent.click(
      page.getByRole('button', { name: 'Edit Release notes' }),
    );
    await expectOpen(canvasElement, 'dialog');
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
      name: /Assign a project/,
    });
    for (const task of ['Quick call with Priya', 'Research: carrier APIs'])
      await expect(
        page.getByRole('button', { name: `Assign a project to ${task}` }),
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
      { name: /^Edit Filter panel and saved views,/ },
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
        name: /^Edit Pairing on the ingest job,/,
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
      { name: /^Edit Untitled,/ },
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
