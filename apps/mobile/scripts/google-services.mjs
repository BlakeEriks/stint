// EAS's `eas-build-pre-install` hook: puts Firebase's config where
// `app.config.ts` names it, from the EAS file variable GOOGLE_SERVICES_JSON
// (`docs/mobile.md`, Push). Pre-install, since EAS runs prebuild, which reads
// the file, before the post-install hook. Before install there are no
// packages, so this imports none. A build without the file would have no FCM,
// so it stops.
import { copyFileSync } from 'node:fs';
import { resolveIdentity } from '../src/target.ts';

if (resolveIdentity(process.env).push) {
  const from = process.env.GOOGLE_SERVICES_JSON;
  if (!from) {
    console.error(
      'GOOGLE_SERVICES_JSON is not set for this EAS environment: see docs/mobile.md, Push.',
    );
    process.exit(1);
  }
  copyFileSync(from, new URL('../google-services.json', import.meta.url));
}
