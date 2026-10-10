/**
 * Where scripts get Supabase and Vercel keys: the Keychain for a hosted
 * secret, `supabase status` for the local stack. Never a file.
 */
import { execFileSync } from 'node:child_process';

/** A Keychain secret, or exit with the command that stores it. */
export function keychain(service, hint) {
  try {
    return execFileSync(
      'security',
      ['find-generic-password', '-s', service, '-w'],
      {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      },
    ).trim();
  } catch {
    console.error(`No ${service} in the Keychain. Add it once:

  security add-generic-password -s ${service} -a stint -w <value>

${hint}`);
    process.exit(1);
  }
}

/** The running local stack's URL and keys, or exit saying how to start it. */
export function localStack() {
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
      `\n  supabase status did not report the keys:\n  ${JSON.stringify(status)}\n`,
    );
    process.exit(1);
  }
  // `supabase status` reports 127.0.0.1; the repo speaks `localhost`
  // everywhere (`docs/local-dev.md`).
  return {
    url: API_URL.replace('127.0.0.1', 'localhost'),
    publishable: PUBLISHABLE_KEY,
    secret: SECRET_KEY,
  };
}
