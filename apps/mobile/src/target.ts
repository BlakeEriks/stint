/**
 * Which backend a build talks to, from the variables `app.config.ts` reads
 * at build time (`docs/mobile.md`). The Supabase URLs and publishable keys
 * are public, the same values `apps/macos/bundle.sh` bakes in; RLS is what
 * protects the data.
 */
type TargetName = 'local' | 'preview' | 'prod';

/** What the native build is: a preview build serves every PR, so it needs none. */
export interface Identity {
  name: TargetName;
  appName: string;
  /** The Android package and iOS bundle id, so each installs beside the others. */
  appId: string;
  /** Built with Firebase, so it registers for timer pushes (`docs/mobile.md`, Push). */
  push: boolean;
}

export interface Target extends Identity {
  /** Shown beside the wordmark; null on production. */
  label: string | null;
  appUrl: string;
  supabaseUrl: string;
  supabaseKey: string;
  /** A preview's seeded account, signed in on launch. */
  preview: { email: string; password: string } | null;
}

type Env = Record<string, string | undefined>;

const identities: Record<TargetName, Identity> = {
  local: {
    name: 'local',
    appName: 'Stint Local',
    appId: 'dev.stint.mobile.local',
    push: false,
  },
  preview: {
    name: 'preview',
    appName: 'Stint Preview',
    appId: 'dev.stint.mobile.preview',
    push: true,
  },
  prod: {
    name: 'prod',
    appName: 'Stint',
    appId: 'dev.stint.mobile',
    push: true,
  },
};

export function resolveIdentity(env: Env): Identity {
  const name = env.STINT_TARGET ?? 'local';
  if (!Object.hasOwn(identities, name))
    throw new Error(`Unknown STINT_TARGET "${name}": local, preview or prod`);
  return identities[name as TargetName];
}

/**
 * `devServer`: the Metro that served a native local build's JS, as
 * `host:port`, or a tunnel's host. That build asks Metro for the API and
 * sign-in, which `metro.config.cjs` passes to the web server and Supabase,
 * so a phone on the LAN or EAS Simulator reaches the builder's stack.
 */
export function resolveTarget(env: Env, devServer?: string): Target {
  const identity = resolveIdentity(env);
  const { name } = identity;
  if (name === 'local' && devServer) {
    const metro = `${/:\d+$/.test(devServer) ? 'http' : 'https'}://${devServer}`;
    return { ...resolveTarget(env), appUrl: metro, supabaseUrl: metro };
  }
  if (name === 'local')
    return {
      ...identity,
      label: 'Local',
      appUrl: env.STINT_APP_URL ?? 'http://localhost:3100',
      supabaseUrl: 'http://localhost:54321',
      supabaseKey: 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH',
      preview: null,
    };
  if (name === 'prod')
    return {
      ...identity,
      label: null,
      appUrl: env.STINT_APP_URL ?? 'https://app.runstint.com',
      supabaseUrl: 'https://zwoceqydagxxmqoaqgbf.supabase.co',
      supabaseKey: 'sb_publishable_dpZCXx5Z71lOUznVCIleJA__YjyUk4e',
      preview: null,
    };
  const pr = required(env, 'STINT_PREVIEW_PR');
  if (!/^\d{1,6}$/.test(pr))
    throw new Error(`STINT_PREVIEW_PR must be a PR number, got "${pr}"`);
  return {
    ...identity,
    label: `PR ${pr}`,
    appUrl: required(env, 'STINT_APP_URL'),
    supabaseUrl: 'https://aywejkegniljsljdzfrk.supabase.co',
    supabaseKey: 'sb_publishable_q79gV5KhfKg05hZMjWVHsg_SqL2HPTH',
    // The password is `LOCAL_PASSWORD` in scripts/seed-account.mjs.
    preview: { email: `pr-${pr}@preview.test`, password: 'devpassword123' },
  };
}

function required(env: Env, key: string): string {
  const value = env[key];
  if (!value) throw new Error(`A preview needs ${key}`);
  return value;
}
