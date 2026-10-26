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
  /* Named as the tokens' `--font-sans` stack names it, the stack that wins
     the cascade; otherwise `next/font/local` names the face after this
     constant. Turbopack still writes the constant's name into
     `--font-plex-sans`, so that variable no longer names the face. */
  declarations: [{ prop: 'font-family', value: "'IBM Plex Sans'" }],
  variable: '--font-plex-sans',
  display: 'swap',
});

const mono = localFont({
  src: [
    { path: '../fonts/ibm-plex-mono-latin-400-normal.woff2', weight: '400' },
    { path: '../fonts/ibm-plex-mono-latin-500-normal.woff2', weight: '500' },
  ],
  declarations: [{ prop: 'font-family', value: "'IBM Plex Mono'" }],
  variable: '--font-plex-mono',
  display: 'swap',
});

/** The class that defines both font variables, for `<html>`. */
export const fontVariables = `${sans.variable} ${mono.variable}`;
