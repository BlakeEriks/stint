import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests against the LOCAL Supabase stack, which must already be
 * running (`pnpm dev:up`). A test run that boots Docker is slow enough that
 * it stops being run.
 */
export default defineConfig({
  testDir: './e2e',
  // The suite shares one database and one seeded user, so parallel files
  // would sign each other out and truncate each other's data.
  workers: 1,
  fullyParallel: false,
  /* **No retries, in CI either.** A genuine failure is a 30s timeout, so
     retrying doubles the time before a real regression is reported. A flaky
     test going red is the intent. */
  retries: 0,
  reporter: process.env.CI ? 'github' : 'list',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: {
    // localhost, never 127.0.0.1: they are different hosts to a browser, so
    // a session cookie set on one is invisible to the app served from the
    // other.
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3100',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        /* No `channel`: Playwright then launches the headless SHELL (195MB)
           rather than the full 359MB browser, which nothing here needs. Hence
           CI's `--only-shell`. To check which launched, read the process path
           — `executablePath()` reports the default install regardless. */
        /* Taller than the 720px default. The account menu sits at the FOOT of
           the rail, so its dropdown opens against the bottom edge; on a CI
           runner Radix's popper placed it outside the viewport. */
        viewport: { width: 1280, height: 900 },
        /* The app honours `prefers-reduced-motion`, so asking for it removes
           Radix's open/close animations — the cause of "element is not
           stable" timeouts on any dropdown or dialog. */
        contextOptions: { reducedMotion: 'reduce' },
      },
    },
  ],
});
