import type { Preview } from '@storybook/nextjs-vite';
import MockDate from 'mockdate';
import { setupWorker } from 'msw/browser';
import { mswLoader } from 'msw-storybook-addon/csf3';
import { useEffect } from 'react';
import { fontVariables } from '@/app/fonts';
import { resetBackTrail } from '@/components/back-link';
import { Providers } from '@/components/providers';
import { resetDb, type Scenario } from '@/mocks/db';
import { handlers } from '@/mocks/handlers';
import { problems } from '@/mocks/respond';
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
      // A handler that throws never ends its request, so it is ended here.
      worker.events.on('unhandledException', ({ request, error }) => {
        problems.push(`${request.method} ${request.url} threw: ${error}`);
        track(-1);
      });
      // Fonts and modules pass through unhandled by design; the API may not.
      worker.events.on('request:unhandled', ({ request }) => {
        if (new URL(request.url).pathname.startsWith('/api/'))
          problems.push(`Nothing handles ${request.method} ${request.url}`);
      });
      await worker.start({ onUnhandledRequest: 'error', quiet: true });
      return worker;
    }),
  ],
  /* Every story starts from the same account at the same instant: the clock
     is pinned, the fake account rebuilt, and the stores that outlive a
     render emptied. `parameters.now` and `parameters.db` choose otherwise. */
  beforeEach: ({ parameters }) => {
    inFlight = 0;
    problems.length = 0;
    const now = new Date(parameters.now ?? NOW);
    MockDate.set(now);
    resetDb(now, parameters.db as Scenario | undefined);
    resetBackTrail();
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
    /* The fake server answers a problem with a 500, which a screen draws as
       its error state and would pass. The story fails instead. */
    if (problems.length) throw new Error(problems.join('\n'));
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
    // One width inside each arrangement the frame changes between, at `sm`,
    // `lg`, `xl` and `2xl`.
    viewport: {
      options: {
        phone: { name: 'Phone', styles: { width: '390px', height: '844px' } },
        tablet: {
          name: 'Tablet',
          styles: { width: '768px', height: '1024px' },
        },
        // The rail beside the content, the dock still a band below it.
        laptop: {
          name: 'Laptop',
          styles: { width: '1100px', height: '800px' },
        },
        desktop: {
          name: 'Desktop',
          styles: { width: '1280px', height: '800px' },
        },
        // Past `2xl`: the app becomes a bounded card on the recessed plane.
        wide: { name: 'Wide', styles: { width: '1600px', height: '1000px' } },
      },
    },
    a11y: { test: 'error' },
  },
};

export default preview;
