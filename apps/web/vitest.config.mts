import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { storybookNextJsPlugin } from '@storybook/nextjs-vite/vite-plugin';
import { playwright } from '@vitest/browser-playwright';

/**
 * Component tests only, in two projects:
 *
 * - `ui`: behaviour tests in jsdom.
 * - `stories`: every Storybook story rendered in real Chromium, with its
 *   accessibility check. Storybook's own Vitest addon supports Vitest 4 at
 *   most, so the stories run through its portable-stories API instead.
 *
 * The route and RLS suites run under `node --test` against real Postgres and
 * are deliberately left there — this config never picks them up.
 */
export default defineConfig({
  test: {
    projects: [
      {
        plugins: [react()],
        // Resolves the `@/` alias from tsconfig.json natively.
        resolve: { tsconfigPaths: true },
        test: {
          name: 'ui',
          environment: 'jsdom',
          globals: true,
          setupFiles: ['./test/ui/setup.ts'],
          include: ['test/ui/**/*.test.tsx'],
        },
      },
      {
        plugins: [storybookNextJsPlugin()],
        // MSW's worker, served as Storybook serves it.
        publicDir: '.storybook/public',
        // The a11y addon fails a test on a violation only in a standalone
        // Vitest run; otherwise it just reports to Storybook's UI.
        define: { 'import.meta.env.VITEST_STORYBOOK': '"false"' },
        /* Scan every story before the run. A dependency found mid-run makes
           Vite re-bundle and reload, and every test already importing the
           old bundle fails with "Failed to fetch dynamically imported
           module". */
        optimizeDeps: {
          entries: ['src/**/*.stories.tsx', '.storybook/preview.tsx'],
        },
        test: {
          name: 'stories',
          include: ['test/stories/**/*.test.tsx'],
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser: 'chromium' }],
          },
        },
      },
    ],
  },
});
