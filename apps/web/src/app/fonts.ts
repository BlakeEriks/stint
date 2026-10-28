import localFont from 'next/font/local';

/* Shared by the root layout and Storybook's preview, so a story renders in
   the faces the app does. The faces are checked in, Fontsource's latin
   subset with its OFL beside them: `next/font/google` downloads them at
   build time, and a failed download fails the build. */

const sans = localFont({
  /* Every weight named in `type.scale`. Requesting one that is not loaded
     gets a synthesized face with no warning, so this list and the scale have
     to move together. */
  src: [
    { path: '../fonts/ibm-plex-sans-latin-400-normal.woff2', weight: '400' },
    { path: '../fonts/ibm-plex-sans-latin-500-normal.woff2', weight: '500' },
    { path: '../fonts/ibm-plex-sans-latin-600-normal.woff2', weight: '600' },
  ],
  /* Named as the tokens' `--font-sans` stack names it; otherwise
     `next/font/local` names the face after this constant. */
  declarations: [{ prop: 'font-family', value: "'IBM Plex Sans'" }],
  variable: '--font-plex-sans',
  display: 'swap',
});

const mono = localFont({
  src: [
    { path: '../fonts/ibm-plex-mono-latin-400-normal.woff2', weight: '400' },
    { path: '../fonts/ibm-plex-mono-latin-500-normal.woff2', weight: '500' },
    // Creative's invoice figures only.
    { path: '../fonts/ibm-plex-mono-latin-600-normal.woff2', weight: '600' },
  ],
  declarations: [{ prop: 'font-family', value: "'IBM Plex Mono'" }],
  variable: '--font-plex-mono',
  display: 'swap',
});

/* The invoice templates' faces, for the preview and its thumbnails. Not
   preloaded: a face downloads only on a screen that draws a template in it.
   The PDF embeds the same faces from `fonts/pdf/`. */
const outfit = localFont({
  src: [
    { path: '../fonts/outfit-latin-300-normal.woff2', weight: '300' },
    { path: '../fonts/outfit-latin-400-normal.woff2', weight: '400' },
    { path: '../fonts/outfit-latin-500-normal.woff2', weight: '500' },
    { path: '../fonts/outfit-latin-600-normal.woff2', weight: '600' },
  ],
  variable: '--font-outfit',
  display: 'swap',
  preload: false,
});

const garamond = localFont({
  src: [
    { path: '../fonts/eb-garamond-latin-400-normal.woff2', weight: '400' },
    {
      path: '../fonts/eb-garamond-latin-400-italic.woff2',
      weight: '400',
      style: 'italic',
    },
  ],
  variable: '--font-garamond',
  display: 'swap',
  preload: false,
});

const grotesk = localFont({
  src: [
    { path: '../fonts/space-grotesk-latin-400-normal.woff2', weight: '400' },
    { path: '../fonts/space-grotesk-latin-500-normal.woff2', weight: '500' },
    { path: '../fonts/space-grotesk-latin-700-normal.woff2', weight: '700' },
  ],
  variable: '--font-grotesk',
  display: 'swap',
  preload: false,
});

/** The class that defines every font variable, for `<html>`. */
export const fontVariables = [sans, mono, outfit, garamond, grotesk]
  .map((f) => f.variable)
  .join(' ');
