import { join } from 'node:path';
import { Font } from '@react-pdf/renderer';

/*
 * The faces Modern, Classic and Creative print in, read from disk: a render
 * never fetches a font, so it cannot fail on the network. `next.config.ts`
 * traces this folder into the PDF route. Standard uses the PDF's built-in
 * Helvetica and Courier.
 */
const dir = join(process.cwd(), 'src/fonts/pdf');
const file = (name: string) => join(dir, `${name}.ttf`);

let registered = false;

export function registerFonts() {
  if (registered) return;
  registered = true;
  Font.register({
    family: 'Outfit',
    fonts: [300, 400, 500, 600].map((w) => ({
      src: file(`outfit-${w}`),
      fontWeight: w,
    })),
  });
  Font.register({
    family: 'EB Garamond',
    fonts: [
      { src: file('eb-garamond-400') },
      { src: file('eb-garamond-400-italic'), fontStyle: 'italic' },
    ],
  });
  Font.register({
    family: 'Space Grotesk',
    fonts: [400, 500, 700].map((w) => ({
      src: file(`space-grotesk-${w}`),
      fontWeight: w,
    })),
  });
  Font.register({
    family: 'IBM Plex Mono',
    fonts: [400, 500, 600].map((w) => ({
      src: file(`ibm-plex-mono-${w}`),
      fontWeight: w,
    })),
  });
}
