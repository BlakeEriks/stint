import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { theme } from '@stint/design-tokens';
import { ImageResponse } from 'next/og';
import { MarkOutline } from '@/components/mark-outline';

/* At the root, so every page inherits it; it reads no request, so the build
   renders it once. */

export const alt = 'Stint — time tracking and invoicing for solo contractors';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const color = theme.dark;
const MARK_SIZE = 128;

/* Satori reads TTF, not the woff2 the app serves; the PDF's copy of the
   same face is TTF. */
const face = () =>
  readFile(join(process.cwd(), 'src/fonts/pdf/ibm-plex-mono-500.ttf'));

export default async function Image() {
  const regular = await face();
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 48,
        background: color['bg-base'],
        fontFamily: 'IBM Plex Mono',
      }}
    >
      <MarkOutline
        size={MARK_SIZE}
        bounds={color.mark}
        name={color['text-strong']}
      />
      <div style={{ fontSize: 32, color: color['text-muted'] }}>
        Time tracking and invoicing for solo contractors.
      </div>
    </div>,
    {
      ...size,
      fonts: [{ name: 'IBM Plex Mono', data: regular, weight: 500 }],
    },
  );
}
