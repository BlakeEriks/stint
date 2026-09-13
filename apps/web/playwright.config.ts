import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests against the LOCAL Supabase stack.
 *
 * Deliberately separate from `pnpm test` (route handlers) and `pnpm test:ui`
 * (jsdom): neither can reach a browser, and a browser download must not
 * become a prerequisite for the unit suites.
 *
 * These need `pnpm dev:up` running. They do not start it — a test run that
 * boots Docker is slow enough that it stops being run, and the stack is
 * already up during development.
 *
 * **They sign in for real**, through Mailpit, because sign-in is the flow
 * most worth covering and stubbing it would test the stub.
 */
export default defineConfig({
  testDir: './e2e',
  // The suite shares one database and one seeded user, so parallel files
  // would sign each other out and truncate each other's data.
  workers: 1,
  fullyParallel: false,
  /**
   * **No retries, in CI either.**
   *
   * A flaky suite gets ignored, which is worse than not having one, so a
   * retry has always been a signal to investigate rather than a fix — this
   * just stops CI pretending otherwise.
   *
   * It is also most of the runtime when something breaks. A genuine failure
   * is a 30s timeout, and retrying turns two of those into four: the run that
   * prompted this took 4m40s against a healthy 2m33s, and every one of those
   * extra seconds was spent re-confirming a real regression. The failure it
   * was hiding — a strict-mode violation from the dock's Inbox — was
   * deterministic and reproduced first try locally.
   *
   * The trade is that a genuinely flaky test now goes red instead of
   * self-healing. That is the intent: the suite is ten tests and ~31s of
   * work, so re-running it by hand costs less than never being told.
   */
  retries: 0,
  reporter: process.env.CI ? 'github' : 'list',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3100',
    // localhost, never 127.0.0.1: they are different hosts to a browser, so
    // a session cookie set on one is invisible to the app served from the
    // other. The same trap the app itself has.
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        /* Taller than the 720px default. The account menu sits at the FOOT
           of the rail, so its dropdown opens against the bottom edge — on a
           CI runner Radix's popper placed it outside the viewport and the
           click never landed. Height is cheaper than teaching every test
           about scroll position. */
        viewport: { width: 1280, height: 900 },
        /* The app honours `prefers-reduced-motion` (the timer dot's pulse is
           `motion-safe:`), so asking for it removes Radix's open/close
           animations. That is the actual cause of the "element is not stable"
           timeout above, and it protects every future dropdown or dialog
           test rather than just the one that found it. */
        contextOptions: { reducedMotion: 'reduce' },
      },
    },
  ],
});
