import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

/**
 * Component tests only.
 *
 * The route and RLS suites run under `node --test` against real Postgres and
 * are deliberately left there — this config never picks them up.
 */
export default defineConfig({
  plugins: [react()],
  // Resolves the `@/` alias from tsconfig.json natively.
  resolve: { tsconfigPaths: true },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./test/ui/setup.ts'],
    include: ['test/ui/**/*.test.tsx'],
  },
});
