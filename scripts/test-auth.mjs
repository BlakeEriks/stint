/**
 * Run the bearer-token test against the local Supabase stack.
 *
 * The test needs a real Auth server — a signed token that `getClaims()`
 * verifies — so unlike the other suites it cannot run against a bare
 * Postgres instance. This reads the keys `supabase start` printed rather
 * than taking them from a file, because the one file that holds them
 * (`apps/web/.env.development.local`) is gitignored and absent in CI.
 */
import { execFileSync, spawnSync } from 'node:child_process';

let status;
try {
  status = JSON.parse(
    execFileSync('npx', ['supabase', 'status', '-o', 'json'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }),
  );
} catch {
  console.error(
    '\n  The local Supabase stack is not running. Start it with `pnpm dev:up`.\n',
  );
  process.exit(1);
}

const { API_URL, PUBLISHABLE_KEY, SECRET_KEY } = status;
if (!API_URL || !PUBLISHABLE_KEY || !SECRET_KEY) {
  console.error(
    `\n  supabase status did not report the keys this test needs:\n  ${JSON.stringify(status)}\n`,
  );
  process.exit(1);
}

const { status: code } = spawnSync(
  'pnpm',
  ['--filter', '@stint/web', 'test:auth'],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      SUPABASE_URL: API_URL,
      SUPABASE_PUBLISHABLE_KEY: PUBLISHABLE_KEY,
      SUPABASE_SECRET_KEY: SECRET_KEY,
    },
  },
);
process.exit(code ?? 1);
