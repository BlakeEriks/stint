import type { Metadata } from 'next';
import { IBM_Plex_Sans, IBM_Plex_Mono } from 'next/font/google';
import { SpeedInsights } from '@vercel/speed-insights/next';
import '@/styles/globals.css';

const sans = IBM_Plex_Sans({
  subsets: ['latin'],
  /* Every weight named in `type.scale`. Requesting one that is not loaded
     gets a synthesised face with no warning, so this list and the scale have
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

/* The landing page overrides both of these; the app's own screens inherit
   them. `template` keeps the product name on every in-app tab without each
   page repeating it. */
export const metadata: Metadata = {
  title: {
    default: 'Stint',
    template: '%s · Stint',
  },
  description: 'Time tracking for solo contractors.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${sans.variable} ${mono.variable}`}
      /* The script below deliberately mutates this element before React
         hydrates — that is the entire point of it — so `data-theme` and
         `color-scheme` will not match what the server rendered. Scoped to
         `<html>` itself and one level deep, so it silences exactly that and
         nothing inside the app. */
      suppressHydrationWarning
    >
      <head>
        {/* Applies the stored theme BEFORE first paint.

            The choice lives in localStorage, so the server cannot know it and
            the markup is always rendered dark, the default. Without this
            running blocking in <head>, a viewer who chose light gets a dark
            flash on every navigation — the repaint would otherwise wait for
            React to hydrate.

            It mutates `documentElement` only, which is why that element
            carries `suppressHydrationWarning` above: the attributes it stamps
            are exactly the ones the server did not render. */}
        <script
          // biome-ignore lint/security/noDangerouslySetInnerHtml: must run before paint
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('stint.theme');var d=document.documentElement;if(t==='light'||t==='dark'){d.setAttribute('data-theme',t);d.style.colorScheme=t}}catch(e){}})()`,
          }}
        />
      </head>
      {/* No shell here: the app's nav rail lives in `(app)/layout.tsx` and the
          landing page in `(marketing)` deliberately has none. Keeping one root
          layout — rather than a root layout per route group — is what lets a
          visitor move between the two without a full page reload. */}
      <body>
        {children}
        <SpeedInsights />
      </body>
    </html>
  );
}
