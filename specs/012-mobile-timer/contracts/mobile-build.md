# Contract: what a build is told

`app.config.ts` reads these at build time and passes them to the app as
`extra`. Nothing else configures a build.

| Variable | local | preview | prod |
| --- | --- | --- | --- |
| `STINT_TARGET` | `local` (default) | `preview` | `prod` |
| `STINT_APP_URL` | `http://localhost:3000` unless set | the PR's Vercel origin | `https://app.runstint.com` |
| `STINT_PREVIEW_PR` | — | the PR number | — |
| `STINT_VERCEL_BYPASS` | — | Vercel's protection bypass | — |

| Target | App name | Android package / iOS bundle id | Supabase |
| --- | --- | --- | --- |
| local | Stint Local | `dev.stint.mobile.local` | `http://localhost:54321` |
| preview | Stint Preview | `dev.stint.mobile.preview` | `stint-test` |
| prod | Stint | `dev.stint.mobile` | production |

A preview build signs in on launch as `pr-<n>@preview.test` with the seed
password, as `pnpm try-mac` does, and sends the bypass on every request.
The Supabase URLs and publishable keys are the public values
`apps/macos/bundle.sh` uses.

EAS profiles in `eas.json`: `preview` (Android APK, internal distribution)
and `production` (store builds). `mobile-preview.yml` fills the preview
profile's `env` on the runner before it builds.
