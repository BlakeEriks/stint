/**
 * Run the bearer-token test against the local Supabase stack.
 *
 * The test needs a real Auth server — a signed token that `getClaims()`
 * verifies — so unlike the other suites it cannot run against a bare
 * Postgres instance. This reads the keys `supabase start` printed rather
 * than taking them from a file, because the one file that holds them
 * (`apps/web/.env.development.local`) is gitignored and absent in CI.
 */
import { spawnSync } from 'node:child_process';
import { localStack } from './keys.mjs';

const { url, publishable, secret } = localStack();

const { status: code } = spawnSync(
  'pnpm',
  ['--filter', '@stint/web', 'test:auth'],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      SUPABASE_URL: url,
      SUPABASE_PUBLISHABLE_KEY: publishable,
      SUPABASE_SECRET_KEY: secret,
    },
  },
);
process.exit(code ?? 1);
