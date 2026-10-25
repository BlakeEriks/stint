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
/* Firebase's config for the app id, an EAS file variable (`docs/mobile.md`,
   Push). Without it the build has no FCM and the phone never registers. */
const googleServices = process.env.GOOGLE_SERVICES_JSON;

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
  android: {
    package: target.appId,
    ...(googleServices ? { googleServicesFile: googleServices } : {}),
  },
  plugins: ['expo-secure-store', 'expo-font', 'expo-notifications'],
  // Every build talks to the backend it was built for; nothing updates it over the air.
  updates: { enabled: false },
  extra: {
    env,
    push: Boolean(googleServices),
    appleTeamId: process.env.APPLE_TEAM_ID,
    ...(process.env.EAS_PROJECT_ID
      ? { eas: { projectId: process.env.EAS_PROJECT_ID } }
      : {}),
  },
  ...(process.env.EXPO_OWNER ? { owner: process.env.EXPO_OWNER } : {}),
};

export default config;
