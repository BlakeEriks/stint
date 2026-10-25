/**
 * Which backend a build talks to, from the variables `app.config.ts` reads
 * at build time (`docs/mobile.md`). The Supabase URLs and publishable keys
 * are public, the same values `apps/macos/bundle.sh` bakes in; RLS is what
 * protects the data.
 */
type TargetName = 'local' | 'preview' | 'prod';

export interface Target {
  name: TargetName;
  /** Shown beside the wordmark; null on production. */
  label: string | null;
  appName: string;
  /** The Android package and iOS bundle id, so each installs beside the others. */
  appId: string;
  appUrl: string;
  supabaseUrl: string;
  supabaseKey: string;
  /** A preview build's seeded account, signed in on launch. */
  preview: { email: string; password: string } | null;
}

type Env = Record<string, string | undefined>;

export function resolveTarget(env: Env): Target {
  const name = env.STINT_TARGET ?? 'local';
  if (name === 'local')
    return {
      name,
      label: 'Local',
      appName: 'Stint Local',
      appId: 'dev.stint.mobile.local',
      appUrl: env.STINT_APP_URL ?? 'http://localhost:3100',
      supabaseUrl: 'http://localhost:54321',
      supabaseKey: 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH',
      preview: null,
    };
  if (name === 'prod')
    return {
      name,
      label: null,
      appName: 'Stint',
      appId: 'dev.stint.mobile',
      appUrl: env.STINT_APP_URL ?? 'https://app.runstint.com',
      supabaseUrl: 'https://zwoceqydagxxmqoaqgbf.supabase.co',
      supabaseKey: 'sb_publishable_dpZCXx5Z71lOUznVCIleJA__YjyUk4e',
      preview: null,
    };
  if (name === 'preview') {
    const pr = required(env, 'STINT_PREVIEW_PR');
    if (!/^\d{1,6}$/.test(pr))
      throw new Error(`STINT_PREVIEW_PR must be a PR number, got "${pr}"`);
    return {
      name,
      label: `PR ${pr}`,
      appName: 'Stint Preview',
      appId: 'dev.stint.mobile.preview',
      appUrl: required(env, 'STINT_APP_URL'),
      supabaseUrl: 'https://aywejkegniljsljdzfrk.supabase.co',
      supabaseKey: 'sb_publishable_q79gV5KhfKg05hZMjWVHsg_SqL2HPTH',
      // The password is `LOCAL_PASSWORD` in scripts/seed-account.mjs.
      preview: { email: `pr-${pr}@preview.test`, password: 'devpassword123' },
    };
  }
  throw new Error(`Unknown STINT_TARGET "${name}": local, preview or prod`);
}

function required(env: Env, key: string): string {
  const value = env[key];
  if (!value) throw new Error(`A preview build needs ${key}`);
  return value;
}
