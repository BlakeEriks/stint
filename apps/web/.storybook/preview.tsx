import type { Preview } from '@storybook/nextjs-vite';
import MockDate from 'mockdate';
import { setupWorker } from 'msw/browser';
import { mswLoader } from 'msw-storybook-addon/csf3';
import { useEffect } from 'react';
import { fontVariables } from '@/app/fonts';
import { resetBackTrail } from '@/components/back-link';
import { Providers } from '@/components/providers';
import { resetAdjustingEntry } from '@/lib/client/use-runaway';
import { resetDb, type Scenario } from '@/mocks/db';
import { handlers } from '@/mocks/handlers';
import { NOW } from '@/mocks/time.mts';
import '@/styles/globals.css';

/* Requests in flight, so a story is judged once its screen has loaded and
   not while it still reads "Loading…". */
let inFlight = 0;
const settled = new Set<() => void>();
function track(delta: number) {
  inFlight += delta;
  if (inFlight === 0) for (const done of settled) done();
}
const idle = () =>
  new Promise<void>((done) => {
    if (inFlight === 0) return done();
    settled.add(done);
  }).then(() => settled.clear());
const frame = () => new Promise((done) => requestAnimationFrame(done));

const preview: Preview = {
  /* Components read the server from MSW: `src/mocks/handlers.ts` answers all
     of `/api/v1`, a story replaces one handler by its key, and anything
     unhandled fails loudly rather than reaching a real server. */
  loaders: [
    mswLoader(async () => {
      const worker = setupWorker();
      worker.events.on('request:start', () => track(1));
      worker.events.on('request:end', () => track(-1));
      await worker.start({ onUnhandledRequest: 'error', quiet: true });
      return worker;
    }),
  ],
  /* Every story starts from the same account at the same instant: the clock
     is pinned, the fake account rebuilt, and the stores that outlive a
     render emptied. `parameters.now` and `parameters.db` choose otherwise. */
  beforeEach: ({ parameters }) => {
    const now = new Date(parameters.now ?? NOW);
    MockDate.set(now);
    resetDb(now, parameters.db as Scenario | undefined);
    resetBackTrail();
    resetAdjustingEntry();
    localStorage.clear();
    return () => MockDate.reset();
  },
  afterEach: async () => {
    // Twice: a response often starts the request that depends on it.
    for (let i = 0; i < 2; i++) {
      await idle();
      await frame();
      await frame();
    }
    /* Every declared face, loaded outright: under `display: swap` text paints
       in the fallback first, and `fonts.ready` resolves before a face that
       has not started loading. */
    await Promise.all([...document.fonts].map((face) => face.load()));
  },
  decorators: [
    (Story, { globals }) => {
      // What layout.tsx does for the app: font variables and the theme on
      // <html>, so tokens and `color-scheme` resolve as they do there.
      useEffect(() => {
        const html = document.documentElement;
        html.classList.add(...fontVariables.split(' '));
        html.setAttribute('data-theme', globals.theme);
        html.style.colorScheme = globals.theme;
      }, [globals.theme]);
      // No retry: an error story shows its error now, not a second later.
      return (
        <Providers retry={false}>
          <Story />
        </Providers>
      );
    },
  ],
  globalTypes: {
    theme: {
      description: 'Theme',
      toolbar: { icon: 'mirror', items: ['dark', 'light'], dynamicTitle: true },
    },
  },
  initialGlobals: { theme: 'dark' },
  parameters: {
    layout: 'padded',
    nextjs: { appDirectory: true },
    msw: { handlers },
    // The widths the app's layout changes at: below `sm`, `md`, and `xl`.
    viewport: {
      options: {
        phone: { name: 'Phone', styles: { width: '390px', height: '844px' } },
        tablet: {
          name: 'Tablet',
          styles: { width: '768px', height: '1024px' },
        },
        desktop: {
          name: 'Desktop',
          styles: { width: '1280px', height: '800px' },
        },
      },
    },
    a11y: { test: 'error' },
  },
};

export default preview;
