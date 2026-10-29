import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';

/* Crashes, and errors nothing caught, to Sentry. Only a production build
   carries a DSN (`app.config.ts`), so local and preview never report. */
const dsn = Constants.expoConfig?.extra?.sentryDsn as string | undefined;
if (dsn) Sentry.init({ dsn, environment: 'production' });

/** The Stint user id alone, as macOS sends it: no email or name. */
export function setCrashUser(id: string | null) {
  Sentry.setUser(id ? { id } : null);
}
