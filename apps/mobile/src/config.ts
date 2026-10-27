import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { resolveTarget } from './target.ts';

/** This build's backend, as `app.config.ts` resolved it. */
export const target = resolveTarget(
  (Constants.expoConfig?.extra?.env as Record<string, string>) ?? {},
);

/* The local web render asks its own origin, which Metro proxies to the web
   server (`metro.config.cjs`), so the page needs no CORS from Next. */
export const origin =
  Platform.OS === 'web' && target.name === 'local' ? '' : target.appUrl;
