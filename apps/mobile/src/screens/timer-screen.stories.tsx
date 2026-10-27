import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { TimerScreen, type TimerScreenProps } from './timer-screen.tsx';

/* The seeded account's (`apps/web/src/mocks/fixtures.ts`): Northwind's
   blue, Meridian's violet, and Byrne Studio with no color. */
const NORTHWIND = '#6EA1E2';
const MERIDIAN = '#A390DC';

const projects: TimerScreenProps['projects'] = [
  {
    id: 'p-warehouse',
    name: 'Warehouse dashboard',
    clientName: 'Northwind Trading',
    color: NORTHWIND,
  },
  {
    id: 'p-rush',
    name: 'Rush: peak season fixes',
    clientName: 'Northwind Trading',
    color: NORTHWIND,
  },
  {
    id: 'p-pipeline',
    name: 'Data pipeline audit',
    clientName: 'Meridian Labs',
    color: MERIDIAN,
  },
  {
    id: 'p-brand',
    name: 'Brand site rebuild',
    clientName: 'Byrne Studio',
    color: null,
  },
];

const recent: TimerScreenProps['recent'] = [
  {
    taskName: 'Filter panel and saved views',
    projectId: 'p-warehouse',
    projectName: 'Warehouse dashboard',
    color: NORTHWIND,
  },
  {
    taskName: 'Pairing on the ingest job',
    projectId: 'p-pipeline',
    projectName: 'Data pipeline audit',
    color: MERIDIAN,
  },
  {
    taskName: 'Client call and follow-ups',
    projectId: 'p-rush',
    projectName: 'Rush: peak season fixes',
    color: NORTHWIND,
  },
  {
    taskName: 'Sprint planning',
    projectId: 'p-warehouse',
    projectName: 'Warehouse dashboard',
    color: NORTHWIND,
  },
  {
    taskName: 'Homepage hero layout',
    projectId: 'p-brand',
    projectName: 'Brand site rebuild',
    color: null,
  },
];

const running: TimerScreenProps['running'] = {
  taskName: 'Checkout timeout fix',
  projectName: 'Rush: peak season fixes',
  clientName: 'Northwind Trading',
  color: NORTHWIND,
  readout: '0:47:12',
};

const meta = {
  title: 'Phone/Timer',
  component: TimerScreen,
  args: {
    label: 'Local',
    today: '3h 30m',
    earned: '$493.75',
    recent,
    running: null,
    projects,
    defaultProjectId: 'p-rush',
    notice: null,
    onStart: fn(),
    onRecent: fn(),
    onStop: fn(),
    onSettings: fn(),
  },
} satisfies Meta<typeof TimerScreen>;
export default meta;
type Story = StoryObj<typeof meta>;

/** US1: stopped, the task field and picker in the dock; Start starts what was typed. */
export const Stopped: Story = {
  play: async ({ canvasElement, args }) => {
    const screen = within(canvasElement);
    await userEvent.type(
      screen.getByLabelText('Task'),
      'Carrier label retries',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Start timer' }));
    await expect(args.onStart).toHaveBeenCalledWith(
      'Carrier label retries',
      'p-rush',
    );
  },
};

/** US1: the picker chooses the project the next start goes to. */
export const PickProject: Story = {
  play: async ({ canvasElement, args }) => {
    const screen = within(canvasElement);
    await userEvent.click(screen.getByRole('button', { name: /^Project:/ }));
    const sheet = within(document.body);
    await userEvent.click(
      await sheet.findByRole('button', { name: /Data pipeline audit/ }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Start timer' }));
    await expect(args.onStart).toHaveBeenCalledWith('', 'p-pipeline');
  },
};

/** US1: running, the readout and Stop in the dock, no picker. */
export const Running: Story = {
  args: { running, today: '4h 17m', earned: '$647.15' },
  play: async ({ canvasElement, args }) => {
    const screen = within(canvasElement);
    await expect(screen.getByText('0:47:12')).toBeVisible();
    await expect(
      screen.queryByRole('button', { name: /^Project:/ }),
    ).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Stop timer' }));
    await expect(args.onStop).toHaveBeenCalled();
  },
};

/** US1: a Recent row starts that task on its project. */
export const StartRecent: Story = {
  play: async ({ canvasElement, args }) => {
    const screen = within(canvasElement);
    await userEvent.click(
      screen.getByRole('button', { name: 'Start Sprint planning' }),
    );
    await expect(args.onRecent).toHaveBeenCalledWith(recent[3]);
  },
};

/** US1: a refused start says why while the dock shows what is running. */
export const Refused: Story = {
  args: {
    running,
    notice: {
      tone: 'error',
      message: 'A timer is already running. Stop it before starting another.',
      onDismiss: fn(),
    },
  },
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement);
    await expect(screen.getByRole('alert')).toHaveTextContent(
      /already running/,
    );
  },
};

/** US2: offline keeps the session and says Stint can't be reached. */
export const Offline: Story = {
  args: {
    notice: {
      tone: 'offline',
      message: 'Can’t reach Stint. Check your internet connection.',
    },
  },
};

/** Notifications off: the pinned timer can't show, and the screen says so. */
export const NotificationsOff: Story = {
  args: {
    running,
    notice: {
      tone: 'warning',
      message: 'Notifications are off, so a running timer isn’t pinned.',
      action: { label: 'Turn on', onPress: fn() },
    },
  },
  play: async ({ canvasElement, args }) => {
    const screen = within(canvasElement);
    await expect(screen.getByRole('alert')).toHaveTextContent(/isn’t pinned/);
    await userEvent.click(screen.getByRole('button', { name: 'Turn on' }));
    await expect(args.notice?.action?.onPress).toHaveBeenCalled();
  },
};

/** US3: the first day, nothing tracked yet. */
export const FirstDay: Story = {
  args: { today: '0m', earned: '$0.00', recent: [], defaultProjectId: null },
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement);
    await expect(screen.getByText(/Tasks you track show here/)).toBeVisible();
    await expect(
      screen.getByRole('button', { name: 'Project: No project' }),
    ).toBeVisible();
  },
};

/** A task longer than the screen truncates; the readout never wraps. */
export const LongTaskName: Story = {
  args: {
    running: {
      ...running,
      taskName:
        'Reconciling the carrier label retries against the warehouse dashboard export',
    },
  },
};

/** FR-009: a preview build names its PR beside the wordmark. */
export const PreviewBuild: Story = {
  args: { label: 'PR 471' },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('PR 471')).toBeVisible();
  },
};
