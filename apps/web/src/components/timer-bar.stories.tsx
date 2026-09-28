import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { HttpResponse, http } from 'msw';
import { expect, userEvent, within } from 'storybook/test';
import type { Client, Project, TimeEntry } from '@/lib/client/api';
import { TimerBar } from './timer-bar';

const northwind = '01900000-0000-7000-8000-000000000001';
const acme = '01900000-0000-7000-8000-000000000002';

const clients: Client[] = [
  { id: northwind, name: 'Northwind Studio', color: '#6EA1E2' },
  { id: acme, name: 'Acme Corp', color: '#42B59A' },
].map((c) => ({
  ...c,
  email: null,
  address: null,
  hourlyRate: 150,
  taxRate: 0,
  currency: 'USD',
  paymentProfileId: null,
  archivedAt: null,
}));

const website = '01900000-0000-7000-8000-000000000011';

const projects: Project[] = [
  {
    id: website,
    clientId: northwind,
    name: 'Website redesign',
  },
  {
    id: '01900000-0000-7000-8000-000000000012',
    clientId: acme,
    name: 'Mobile app',
  },
  { id: '01900000-0000-7000-8000-000000000013', clientId: null, name: 'Admin' },
].map((p) => ({
  ...p,
  hourlyRate: null,
  isBillableDefault: p.clientId !== null,
  archivedAt: null,
}));

const entry = (
  taskName: string,
  projectId: string | null,
  startedAt: Date,
): TimeEntry => ({
  id: crypto.randomUUID(),
  projectId,
  taskName,
  startedAt: startedAt.toISOString(),
  endedAt: null,
  isBillable: true,
  rateOverride: null,
  invoiceId: null,
  durationSeconds: null,
  durationOk: false,
});

/**
 * The server the bar talks to, in memory: Start, Stop and Rename work when
 * clicked, and a reload puts the story back where it began.
 */
function server(state: 'idle' | 'running') {
  let running: TimeEntry | null =
    state === 'running'
      ? entry(
          'Homepage hero layout',
          website,
          new Date(Date.now() - 84 * 60_000),
        )
      : null;

  return [
    http.get('/api/v1/summary', () =>
      HttpResponse.json({
        running,
        todaySeconds: 5 * 3600,
        weekSeconds: 22 * 3600,
        exceedsThreshold: false,
        maxTimerHours: 8,
        serverTime: new Date().toISOString(),
      }),
    ),
    http.get('/api/v1/projects', () => HttpResponse.json({ projects })),
    http.get('/api/v1/clients', () => HttpResponse.json({ clients })),
    http.get('/api/v1/entries/task-names', () =>
      HttpResponse.json({
        taskNames: [
          {
            taskName: 'Homepage hero layout',
            projectId: website,
            lastUsedAt: new Date().toISOString(),
          },
          {
            taskName: 'Sprint planning',
            projectId: null,
            lastUsedAt: new Date().toISOString(),
          },
        ],
      }),
    ),
    http.post('/api/v1/timer/start', async ({ request }) => {
      const body = (await request.json()) as {
        taskName: string;
        projectId?: string | null;
      };
      running = entry(body.taskName, body.projectId ?? null, new Date());
      return HttpResponse.json(running);
    }),
    http.post('/api/v1/timer/stop', () => {
      const stopped = { ...running, endedAt: new Date().toISOString() };
      running = null;
      return HttpResponse.json(stopped);
    }),
    http.patch('/api/v1/timer/current', async ({ request }) => {
      if (running)
        running = {
          ...running,
          ...((await request.json()) as Partial<TimeEntry>),
        };
      return HttpResponse.json(running);
    }),
  ];
}

const meta = {
  component: TimerBar,
  args: { projects },
  parameters: { layout: 'fullscreen' },
  // Docked to the bottom of the frame, as the app places it.
  decorators: [
    (Story) => (
      <div className="flex h-screen flex-col justify-end p-3">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof TimerBar>;

export default meta;
type Story = StoryObj<typeof meta>;

const idle = { parameters: { msw: server('idle') } };
const running = { parameters: { msw: server('running') } };
const phone = { globals: { viewport: { value: 'phone' } } };
const tablet = { globals: { viewport: { value: 'tablet' } } };
const desktop = { globals: { viewport: { value: 'desktop' } } };

/** Below `sm` the idle bar wraps: the task field takes its own row. */
export const IdlePhone: Story = { ...idle, ...phone };
export const IdleTablet: Story = { ...idle, ...tablet };
export const IdleDesktop: Story = { ...idle, ...desktop };

/** Below `sm` the project pill is dropped so the running bar never wraps. */
export const RunningPhone: Story = { ...running, ...phone };
export const RunningTablet: Story = { ...running, ...tablet };
export const RunningDesktop: Story = { ...running, ...desktop };

/** The pencil is the only way to rename, and it opens the name for editing. */
export const Rename: Story = {
  ...running,
  ...desktop,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      await canvas.findByRole('button', { name: 'Rename task' }),
    );
    const field = canvas.getByRole('textbox', { name: 'Task name' });
    await expect(field).toHaveFocus();
    await expect(field).toHaveValue('Homepage hero layout');
  },
};
