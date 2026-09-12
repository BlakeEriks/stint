import type { Metadata } from 'next';
import { IBM_Plex_Sans, IBM_Plex_Mono } from 'next/font/google';
import { Providers } from '@/components/providers';
import { Nav } from '@/components/nav';
import { SpeedInsights } from '@vercel/speed-insights/next';
import '@/styles/globals.css';

const sans = IBM_Plex_Sans({
  subsets: ['latin'],
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

export const metadata: Metadata = {
  title: 'Stint',
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
      <body>
        <Providers>
          {/* The rail and the content sit side by side, so the content area
              is a real column rather than the whole viewport with padding.
              `min-h-dvh` keeps the rail's border running the full height even
              on a short page. */}
          <div className="flex min-h-dvh flex-col sm:flex-row">
            <Nav />
            <div className="min-w-0 flex-1">{children}</div>
          </div>
        </Providers>
        <SpeedInsights />
      </body>
    </html>
  );
}
