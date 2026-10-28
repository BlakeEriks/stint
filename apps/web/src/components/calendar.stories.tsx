import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { http } from 'msw';
import { addDays, localDateKey, localDateTimeToInstant } from '@stint/core';
import { account } from '@/mocks/db';
import { handlers } from '@/mocks/handlers';
import { envelopes, ok } from '@/mocks/respond';
import { ZONE } from '@/mocks/time.mts';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import {
  desktop,
  failing,
  light,
  phone,
  screen,
  tablet,
  wide,
  expectOpen,
  stalled,
} from '@/mocks/screen';
import { ZOOM_KEY } from '@/lib/client/use-zoom';
import { Calendar } from './calendar';

const meta = {
  title: 'Screens/Calendar',
  component: Calendar,
  ...screen('/calendar'),
} satisfies Meta<typeof Calendar>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The calendar alone, apart from the shell around it. */
const calendar = async (canvasElement: HTMLElement) =>
  within(await within(canvasElement.ownerDocument.body).findByRole('main'));

/** The week: seven columns, blocks in their client's color, a legend of
    what is on screen. */
export const Desktop: Story = {
  ...desktop,
  play: async ({ canvasElement }) => {
    const page = await calendar(canvasElement);
    // A block reads as its task.
    await page.findAllByText('Pairing on the ingest job');
    for (const day of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'])
      await expect(page.getByText(day, { exact: true })).toBeInTheDocument();
    /* The week never crops: one early entry would cost every column the
       same hours, so the grid keeps all 24 and scrolls instead. */
    for (const hour of ['00', '03', '06', '09', '12', '15', '18', '21'])
      await expect(
        page.getAllByText(hour, { exact: true })[0],
      ).toBeInTheDocument();
    // The week has time, so the line under the grid says nothing.
    await expect(page.queryByText(/Nothing logged this week/)).toBeNull();
    await expect(page.queryByRole('status')).toBeNull();
  },
};
/** At `2xl` the grid scrolls inside the card. The screen is a workspace:
    the dock folds to a strip, so the week takes the dock's room. */
export const Wide: Story = {
  ...wide,
  play: async ({ canvasElement }) => {
    await calendar(canvasElement);
    await expect(
      within(canvasElement.ownerDocument.body).queryByRole('complementary', {
        name: 'At a glance',
      }),
    ).toBeNull();
  },
};
export const Tablet: Story = { ...tablet };
/** Below `sm`, one day, cropped to the hours worked. */
export const Phone: Story = {
  ...phone,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    // The heading names the day on screen, not the month.
    await expect(
      await page.findByRole('heading', { name: 'Thu, Sep 17' }),
    ).toBeVisible();
    await expect(page.queryByText('September 2026')).toBeNull();
  },
};

/** The day on screen is empty while the week is not, and the line says so
    of the day. */
export const PhoneEmpty: Story = {
  ...phone,
  parameters: account((db) => {
    const today = localDateKey(db.now, ZONE);
    db.entries = db.entries.filter(
      (e) => localDateKey(new Date(e.startedAt), ZONE) !== today,
    );
  }),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(
      await page.findByText(/Nothing logged this day/),
    ).toBeVisible();
  },
};
export const Light: Story = { ...light };

/** A running block grows to now and refuses a drag. */
export const Running: Story = { ...desktop, parameters: account('running') };

/** Nothing logged: the grid still offers a time to click. */
export const Empty: Story = {
  ...desktop,
  parameters: account('empty'),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(
      await page.findByText(/Nothing logged this week/),
    ).toBeVisible();
  },
};

/** A block with no task name still reads as something. */
export const UntitledEntry: Story = {
  ...desktop,
  parameters: account((db) => {
    for (const e of db.entries)
      if (e.taskName === 'Pairing on the ingest job') e.taskName = '';
  }),
  play: async ({ canvasElement }) => {
    const page = await calendar(canvasElement);
    await expect(
      (await page.findAllByText('Untitled', { exact: true }))[0],
    ).toBeVisible();
  },
};

/** An entry past midnight is drawn on both days it touches, each column
    counting only its own part. */
export const Overnight: Story = {
  ...desktop,
  parameters: account((db) => {
    const today = localDateKey(db.now, ZONE);
    const [first] = db.entries;
    if (!first) return;
    db.entries.push({
      ...first,
      id: '018f0000-0000-7000-8000-0000000000ee',
      taskName: 'Overnight deploy',
      startedAt: localDateTimeToInstant(
        addDays(today, -1),
        '23:00',
        ZONE,
      ).toISOString(),
      endedAt: localDateTimeToInstant(today, '01:00', ZONE).toISOString(),
      durationSeconds: 7200,
      invoiceId: null,
    });
  }),
  play: async ({ canvasElement }) => {
    const page = await calendar(canvasElement);
    const blocks = await page.findAllByRole('button', {
      name: /^Edit Overnight deploy/,
    });
    await expect(blocks).toHaveLength(2);
    // An hour each side of midnight: the second block ends at 01:00.
    const [before, after] = blocks.map((b) => b.getBoundingClientRect().height);
    await expect(after).toBeCloseTo(before ?? 0, 0);
  },
};

/* Held until the play has seen the loader, then answered: the story
   ends only once nothing is in flight. */
let answer = () => {};

/** The week has not arrived yet: one quiet word where the grid will be, and
 *  no empty grid that would read as a week with nothing in it. */
export const Loading: Story = {
  ...desktop,
  parameters: {
    msw: {
      handlers: {
        calendar: http.get(handlers.calendar.info.path, async () => {
          await new Promise<void>((done) => (answer = done));
          return ok(envelopes.calendar, { days: [] });
        }),
      },
    },
  },
  play: async ({ canvasElement }) => {
    const page = await calendar(canvasElement);
    await expect(await page.findByRole('status')).toHaveTextContent('Loading');
    await expect(page.queryByText('00', { exact: true })).toBeNull();
    answer();
  },
};

/** A failed fetch says so, rather than calling the week empty. */
export const Failed: Story = {
  ...desktop,
  parameters: failing('calendar'),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(
      await page.findByText('Could not load this. Try again.'),
    ).toBeVisible();
    await expect(page.queryByText(/Nothing logged/)).toBeNull();
  },
};

/** A block opens its entry in the editor. */
export const EditEntry: Story = {
  ...desktop,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const [block] = await page.findAllByRole('button', {
      name: /Pairing on the ingest job/,
    });
    await userEvent.click(block as HTMLElement);
    await expectOpen(canvasElement, 'dialog', 'Edit entry');
  },
};

/** The first column of the week, and the height `at` of the way down it. */
async function column(canvasElement: HTMLElement) {
  const page = await calendar(canvasElement);
  await page.findAllByRole('button', { name: /^Edit / });
  const [first] =
    canvasElement.ownerDocument.querySelectorAll<HTMLElement>('main .border-l');
  const el = first as HTMLElement;
  const box = el.getBoundingClientRect();
  return { el, x: box.left + 10, y: (at: number) => box.top + at * box.height };
}

/** Press at 02:00 and drag to 04:00, letting go when `release`. */
async function drawAcross(
  el: HTMLElement,
  clientX: number,
  y: (at: number) => number,
  release: boolean,
) {
  await userEvent.pointer([
    {
      target: el,
      coords: { clientX, clientY: y(2 / 24) },
      keys: '[MouseLeft>]',
    },
    { target: el, coords: { clientX, clientY: y(4 / 24) } },
    ...(release ? [{ target: el, keys: '[/MouseLeft]' }] : []),
  ]);
}

/** Pressing on empty grid and dragging draws the entry's range, snapped;
    nothing is written until the editor saves. Held mid-drag. */
export const Drawing: Story = {
  ...desktop,
  play: async ({ canvasElement }) => {
    // 02:00 to 04:00, hours the seed leaves empty.
    const { el, x, y } = await column(canvasElement);
    await drawAcross(el, x, y, false);
    const ghost = el.querySelector('[data-drawing]');
    await expect(ghost).not.toBeNull();
    await expect(ghost).toHaveTextContent(/2:00 AM–4:00 AM/);
  },
};

/** Released, the drawn range opens the editor on those times. */
export const DrawnOpensEditor: Story = {
  ...desktop,
  play: async ({ canvasElement }) => {
    const { el, x, y } = await column(canvasElement);
    await drawAcross(el, x, y, true);
    await expectOpen(canvasElement, 'dialog', 'Add entry');
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.getByLabelText('Start')).toHaveValue('02:00');
    await expect(page.getByLabelText('End')).toHaveValue('04:00');
  },
};

/** A 15-minute block: each end's target reaches past the edge rather than
    into the block, so the two never meet and the middle still moves it. */
export const ShortBlock: Story = {
  ...desktop,
  parameters: account((db) => {
    const [first] = db.entries;
    if (!first) return;
    const today = localDateKey(db.now, ZONE);
    db.entries.push({
      ...first,
      id: '018f0000-0000-7000-8000-0000000000ef',
      taskName: 'Quick call',
      startedAt: localDateTimeToInstant(today, '06:00', ZONE).toISOString(),
      endedAt: localDateTimeToInstant(today, '06:15', ZONE).toISOString(),
      durationSeconds: 900,
      invoiceId: null,
    });
  }),
  play: async ({ canvasElement }) => {
    const page = await calendar(canvasElement);
    const block = await page.findByRole('button', { name: /^Edit Quick call/ });
    await userEvent.hover(block);
    const [start, end] = [...block.querySelectorAll('.cursor-ns-resize')].map(
      (h) => h.getBoundingClientRect(),
    );
    const box = block.getBoundingClientRect();
    await expect(start?.top).toBeLessThan(box.top);
    await expect(end?.bottom).toBeGreaterThan(box.bottom);
    // Room left between the two ends for the move.
    await expect((end?.top ?? 0) - (start?.bottom ?? 0)).toBeGreaterThan(0);
  },
};

/** Zoomed all the way in: an hour is 176px, and every hour is labeled. */
export const ZoomedIn: Story = {
  ...desktop,
  beforeEach: () => localStorage.setItem(ZOOM_KEY, '176'),
  play: async ({ canvasElement }) => {
    const page = await calendar(canvasElement);
    await expect(
      (await page.findAllByText('01', { exact: true }))[0],
    ).toBeInTheDocument();
  },
};

/** Zoomed all the way out: an hour is 22px, labeled every six. */
export const ZoomedOut: Story = {
  ...desktop,
  beforeEach: () => localStorage.setItem(ZOOM_KEY, '22'),
  play: async ({ canvasElement }) => {
    const page = await calendar(canvasElement);
    await page.findAllByText('06', { exact: true });
    await expect(page.queryByText('03', { exact: true })).toBeNull();
  },
};

/** A pinch over the grid zooms it, and the browser's page zoom is refused. */
export const Pinch: Story = {
  ...desktop,
  play: async ({ canvasElement }) => {
    const { el, x, y } = await column(canvasElement);
    const before = el.getBoundingClientRect().height;
    const pinch = new WheelEvent('wheel', {
      deltaY: -100,
      ctrlKey: true,
      clientX: x,
      clientY: y(0.5),
      bubbles: true,
      cancelable: true,
    });
    el.dispatchEvent(pinch);
    await expect(pinch.defaultPrevented).toBe(true);
    await waitFor(() =>
      expect(el.getBoundingClientRect().height).toBeGreaterThan(before),
    );
  },
};

/** Saved and not yet answered: the editor has closed, and the drawn entry
    is on the grid at once, faded as a dropped drag is until the server
    answers. */
export const DrawnSaving: Story = {
  ...desktop,
  parameters: stalled('createEntry'),
  play: async ({ canvasElement }) => {
    const { el, x, y } = await column(canvasElement);
    await drawAcross(el, x, y, true);
    await expectOpen(canvasElement, 'dialog', 'Add entry');
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.type(page.getByLabelText('Task'), 'Drawn work');
    await userEvent.click(page.getByRole('button', { name: 'Add entry' }));
    const block = (await page.findByText(/^Drawn work, .*, saving$/)).closest(
      '[aria-busy="true"]',
    );
    await expect(block).not.toBeNull();
    await expect(el.contains(block)).toBe(true);
    await expect(page.queryByRole('dialog')).toBeNull();
    await expect(getComputedStyle(block as Element).opacity).toBe('0.7');
  },
};
