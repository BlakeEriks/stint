import type { ExpoConfig } from 'expo/config';
import { resolveIdentity } from './src/target.ts';

/**
 * One config for every backend (`docs/mobile.md`, Which backend). The
 * `STINT_*` variables pick it at build or update time; `src/config.ts` reads
 * them back from `extra.env`, and resolves the backend there, since one
 * preview build serves every PR. Local and preview have their own name and
 * id, so they install beside the released app rather than over it.
 */
const env = {
  STINT_TARGET: process.env.STINT_TARGET,
  STINT_APP_URL: process.env.STINT_APP_URL,
  STINT_PREVIEW_PR: process.env.STINT_PREVIEW_PR,
};
const target = resolveIdentity(env);
// Generated from the tokens (`packages/design-tokens/src/generate.js`).
const icon = `./assets/icon${target.name === 'prod' ? '' : '-dev'}.png`;

const config: ExpoConfig = {
  name: target.appName,
  slug: 'stint',
  scheme: 'stint',
  version: '0.1.0',
  orientation: 'portrait',
  userInterfaceStyle: 'automatic',
  icon,
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
    // Opaque, so it hides the adaptive icon's background layer.
    adaptiveIcon: { foregroundImage: icon },
    // Copied here by an EAS build hook (scripts/google-services.mjs).
    ...(target.push ? { googleServicesFile: './google-services.json' } : {}),
  },
  plugins: [
    'expo-secure-store',
    'expo-font',
    'expo-notifications',
    ...sentry(),
  ],
  ...updates(),
  extra: {
    env,
    push: target.push,
    sentryDsn: target.name === 'prod' ? process.env.SENTRY_DSN : undefined,
    appleTeamId: process.env.APPLE_TEAM_ID,
    ...(process.env.EAS_PROJECT_ID
      ? { eas: { projectId: process.env.EAS_PROJECT_ID } }
      : {}),
  },
  ...(process.env.EXPO_OWNER ? { owner: process.env.EXPO_OWNER } : {}),
};

export default config;

/**
 * The preview build is a development build: it opens a PR's update from the
 * QR on the PR (`mobile-preview.yml`). `extra` is out of its fingerprint
 * (`fingerprint.config.cjs`), so one build serves every PR.
 */
function updates(): Pick<ExpoConfig, 'updates' | 'runtimeVersion'> {
  const projectId = process.env.EAS_PROJECT_ID;
  if (target.name !== 'preview' || !projectId)
    return { updates: { enabled: false } };
  return {
    updates: { url: `https://u.expo.dev/${projectId}` },
    runtimeVersion: { policy: 'fingerprint' },
  };
}

/**
 * The build uploads source maps and debug symbols when EAS holds
 * `SENTRY_AUTH_TOKEN`; without it the build still passes, and stacks stay
 * minified.
 */
function sentry(): NonNullable<ExpoConfig['plugins']> {
  if (target.name !== 'prod') return [];
  return [
    [
      '@sentry/react-native',
      {
        organization: 'stint-i5',
        project: 'stint-mobile',
        disableAutoUpload: !process.env.SENTRY_AUTH_TOKEN,
      },
    ],
  ];
}
