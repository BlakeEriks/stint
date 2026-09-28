import { IBM_Plex_Sans, IBM_Plex_Mono } from 'next/font/google';

/* Shared by the root layout and Storybook's preview, so a story renders in
   the faces the app does. */

const sans = IBM_Plex_Sans({
  subsets: ['latin'],
  /* Every weight named in `type.scale`. Requesting one that is not loaded
     gets a synthesized face with no warning, so this list and the scale have
     to move together. */
  weight: ['400', '500', '600'],
  variable: '--font-plex-sans',
  display: 'swap',
});

const mono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-plex-mono',
  display: 'swap',
});

/** The class that defines both font variables, for `<html>`. */
export const fontVariables = `${sans.variable} ${mono.variable}`;
