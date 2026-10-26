// EAS's `eas-build-post-install` hook: puts Firebase's config where
// `app.config.ts` names it, from the EAS file variable GOOGLE_SERVICES_JSON
// (`docs/mobile.md`, Push). A build without it would have no FCM, so it stops.
import { copyFileSync } from 'node:fs';

if ((process.env.STINT_TARGET ?? 'local') !== 'local') {
  const from = process.env.GOOGLE_SERVICES_JSON;
  if (!from) {
    console.error(
      'GOOGLE_SERVICES_JSON is not set for this EAS environment: see docs/mobile.md, Push.',
    );
    process.exit(1);
  }
  copyFileSync(from, new URL('../google-services.json', import.meta.url));
}
