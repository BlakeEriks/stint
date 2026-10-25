import type { ExpoConfig } from 'expo/config';
import { resolveTarget } from './src/target.ts';

/**
 * One config for every backend (`docs/mobile.md`, Which backend). The
 * `STINT_*` variables pick it at build time; `src/config.ts` reads them back
 * from `extra.env`. Local and preview have their own name and id, so they
 * install beside the released app rather than over it.
 */
const env = {
  STINT_TARGET: process.env.STINT_TARGET,
  STINT_APP_URL: process.env.STINT_APP_URL,
  STINT_PREVIEW_PR: process.env.STINT_PREVIEW_PR,
};
const target = resolveTarget(env);

const config: ExpoConfig = {
  name: target.appName,
  slug: 'stint',
  scheme: 'stint',
  version: '0.1.0',
  orientation: 'portrait',
  userInterfaceStyle: 'automatic',
  ios: {
    bundleIdentifier: target.appId,
    supportsTablet: false,
    // The group a widget reads the session from (`storage.ts`).
    entitlements: {
      'keychain-access-groups': ['$(AppIdentifierPrefix)dev.stint.shared'],
    },
  },
  android: { package: target.appId },
  plugins: ['expo-secure-store', 'expo-font'],
  ...updates(),
  extra: {
    env,
    appleTeamId: process.env.APPLE_TEAM_ID,
    ...(process.env.EAS_PROJECT_ID
      ? { eas: { projectId: process.env.EAS_PROJECT_ID } }
      : {}),
  },
  ...(process.env.EXPO_OWNER ? { owner: process.env.EXPO_OWNER } : {}),
};

export default config;

/**
 * `mobile-preview.yml` publishes a push that changes no native code to the
 * PR's channel, with the same `STINT_*` values the build saw.
 */
function updates(): Pick<ExpoConfig, 'updates' | 'runtimeVersion'> {
  const projectId = process.env.EAS_PROJECT_ID;
  if (target.name !== 'preview' || !projectId)
    return { updates: { enabled: false } };
  return {
    updates: {
      url: `https://u.expo.dev/${projectId}`,
      // The update a push published loads on the next launch, not the one after.
      fallbackToCacheTimeout: 10_000,
    },
    runtimeVersion: { policy: 'fingerprint' },
  };
}
