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
  // A flaky suite gets ignored, which is worse than not having one — so a
  // retry locally is a signal to investigate, not a fix.
  retries: process.env.CI ? 1 : 0,
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
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
