import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { brand, theme, type } from '@stint/design-tokens';
import { ImageResponse } from 'next/og';

/* At the root, so every page inherits it; it reads no request, so the build
   renders it once. */

export const alt = 'Stint — time tracking and invoicing for solo contractors';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const color = theme.dark;
const mark = brand.mark;
const MARK_SIZE = 128;

/* Satori reads TTF, not the woff2 the app serves; the PDF's copies of the
   same faces are TTF. */
const face = (weight: 500 | 600) =>
  readFile(join(process.cwd(), `src/fonts/pdf/ibm-plex-mono-${weight}.ttf`));

function Bound() {
  return (
    <div
      style={{
        width: mark.boundWidth * MARK_SIZE,
        height: mark.boundHeight * MARK_SIZE,
        margin: `0 ${mark.boundGap * MARK_SIZE}px`,
        borderRadius: mark.boundRadius,
        background: color['text-strong'],
      }}
    />
  );
}

export default async function Image() {
  const [regular, bold] = await Promise.all([face(500), face(600)]);
  const tmSize = mark.tmSize * MARK_SIZE;
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
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          fontSize: MARK_SIZE,
          fontWeight: type.wordmark.weight,
          letterSpacing: type.wordmark.tracking,
          color: color['text-strong'],
        }}
      >
        <Bound />
        <span>Stint</span>
        <Bound />
        <span
          style={{
            fontSize: tmSize,
            lineHeight: 1,
            letterSpacing: 0,
            transform: `translateY(-${mark.tmRise * MARK_SIZE}px)`,
          }}
        >
          ™
        </span>
      </div>
      <div style={{ fontSize: 32, color: color['text-muted'] }}>
        Time tracking and invoicing for solo contractors.
      </div>
    </div>,
    {
      ...size,
      fonts: [
        { name: 'IBM Plex Mono', data: regular, weight: 500 },
        { name: 'IBM Plex Mono', data: bold, weight: 600 },
      ],
    },
  );
}
