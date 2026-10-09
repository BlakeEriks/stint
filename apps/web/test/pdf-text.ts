/**
 * The text a PDF draws on each page, with the height it is drawn at, so a
 * test can tell text on the page from text placed off it. Reads only what
 * react-pdf writes: Flate-compressed content streams of `cm`, `Tm` and `TJ`.
 */
import { inflateSync } from 'node:zlib';

type Matrix = [number, number, number, number, number, number];

const multiply = (
  [a, b, c, d, e, f]: Matrix,
  [g, h, i, j, k, l]: Matrix,
): Matrix => [
  a * g + b * i,
  a * h + b * j,
  c * g + d * i,
  c * h + d * j,
  e * g + f * i + k,
  e * h + f * j + l,
];

function contentStreams(pdf: Uint8Array): string[] {
  const bytes = Buffer.from(pdf);
  const raw = bytes.toString('latin1');
  const streams: string[] = [];
  for (const { index } of raw.matchAll(/\nstream\n/g)) {
    const start = index + '\nstream\n'.length;
    const end = raw.indexOf('\nendstream', start);
    const content = inflateSync(bytes.subarray(start, end)).toString('latin1');
    if (content.includes('BT')) streams.push(content);
  }
  return streams;
}

/** Each page's text runs, `y` measured up from the page's bottom edge. */
export function pdfText(
  pdf: Uint8Array,
): Array<Array<{ text: string; y: number }>> {
  return contentStreams(pdf).map((content) => {
    const runs: Array<{ text: string; y: number }> = [];
    const saved: Matrix[] = [];
    let ctm: Matrix = [1, 0, 0, 1, 0, 0];
    let tm: Matrix = [1, 0, 0, 1, 0, 0];
    let operands: number[] = [];
    for (const [, tj, number, op] of content.matchAll(
      /\[([^\]]*)\]\s*TJ|(-?[\d.]+)|([A-Za-z]+)/g,
    )) {
      if (tj !== undefined) {
        const text = [...tj.matchAll(/<([0-9a-f]*)>/g)]
          .map(([, hex]) => Buffer.from(hex ?? '', 'hex').toString('latin1'))
          .join('');
        runs.push({ text, y: multiply(tm, ctm)[5] });
      } else if (number !== undefined) {
        operands.push(Number(number));
      } else {
        if (op === 'q') saved.push(ctm);
        if (op === 'Q') ctm = saved.pop() ?? ctm;
        if (op === 'cm') ctm = multiply(operands as Matrix, ctm);
        if (op === 'Tm') tm = operands as Matrix;
        operands = [];
      }
    }
    return runs;
  });
}
