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
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
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
