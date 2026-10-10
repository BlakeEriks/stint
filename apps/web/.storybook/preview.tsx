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
   not while it still reads "Loading…". `stalls` is how many a story leaves
   unanswered on purpose (`stalled()` in `src/mocks/screen.tsx`). */
let inFlight = 0;
let stalls = 0;
const settled = new Set<() => void>();
function track(delta: number) {
  inFlight += delta;
  if (inFlight > stalls) return;
  for (const done of settled) done();
  settled.clear();
}
const idle = () =>
  new Promise<void>((done) => {
    if (inFlight <= stalls) done();
    else settled.add(done);
  });
const frame = () => new Promise((done) => requestAnimationFrame(done));
/* A region reads `aria-busy` from a debounced change until its answer lands,
   so it is busy before its request starts. A story that stalls a request
   leaves its region busy on purpose. */
const busy = () =>
  stalls === 0 && document.querySelector('[aria-busy="true"]') !== null;
/* Twice: a response often starts the request that depends on it. */
async function quiet() {
  for (let i = 0; i < 2; i++) {
    await idle();
    while (busy()) await frame();
    await idle();
    await frame();
    await frame();
  }
}
/* Well inside the test's 15s, so a screen that never settles fails its own
   story saying why. A test that times out instead leaves its screen mounted,
   and every story after it fails on what it left behind. */
const SETTLE_LIMIT_MS = 5000;
async function settle() {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const limit = new Promise<never>((_, fail) => {
    timer = setTimeout(() => {
      const region = busy() ? ', a region still aria-busy' : '';
      fail(
        new Error(
          `Not settled after ${SETTLE_LIMIT_MS}ms: ${inFlight} requests in flight, ${stalls} stalled on purpose${region}`,
        ),
      );
    }, SETTLE_LIMIT_MS);
  });
  try {
    await Promise.race([quiet(), limit]);
  } finally {
    clearTimeout(timer);
  }
}

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
      await worker.start({
        onUnhandledRequest: 'error',
        quiet: true,
        serviceWorker: { url: './mockServiceWorker.js' },
      });
      return worker;
    }),
    // A play awaits `loaded.settle()` where a loading render reads like the
    // empty one, so it judges the answer and not the wait.
    async () => ({ settle }),
  ],
  /* Every story starts from the same account at the same instant: the clock
     is pinned, the fake account rebuilt, and the stores that outlive a
     render emptied. `parameters.now` and `parameters.db` choose otherwise. */
  beforeEach: ({ parameters }) => {
    inFlight = 0;
    stalls = (parameters.stalls as number | undefined) ?? 0;
    problems.length = 0;
    const now = new Date(parameters.now ?? NOW);
    MockDate.set(now);
    resetDb(now, parameters.db as Scenario | undefined);
    resetBackTrail();
    localStorage.clear();
    return () => MockDate.reset();
  },
  afterEach: async () => {
    await settle();
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
