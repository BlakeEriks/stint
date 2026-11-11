// `|Stint|™` and the favicon's `|S|` as outlines: the lockup `mark-bound` and
// `mark-tm` set in CSS, traced from IBM Plex Mono 600 for the surfaces that
// load no webfont.

import { join } from 'node:path';
import * as fontkit from 'fontkit';

const FONT = join(
  import.meta.dirname,
  '../../../apps/web/src/fonts/pdf/ibm-plex-mono-600.ttf',
);

/* A pill's cap as two quarter circles in cubics. */
const K = 0.5523;

/** Units are thousandths of the mark's font size, y down. */
function pill(x, top, w, h) {
  const r = w / 2;
  const k = r * K;
  const y1 = top + r;
  const y2 = top + h - r;
  const cx = x + r;
  return [
    ['M', x, y1],
    ['C', x, y1 - k, cx - k, top, cx, top],
    ['C', cx + k, top, x + w, y1 - k, x + w, y1],
    ['L', x + w, y2],
    ['C', x + w, y2 + k, cx + k, top + h, cx, top + h],
    ['C', cx - k, top + h, x, y2 + k, x, y2],
    ['Z'],
  ];
}

const OPS = {
  moveTo: 'M',
  lineTo: 'L',
  quadraticCurveTo: 'Q',
  bezierCurveTo: 'C',
  closePath: 'Z',
};

/** A glyph at pen `x`, baseline `y`, scaled by `s`, flipped to y down. */
function glyph(g, x, y, s) {
  return g.path.commands.map(({ command, args }) => {
    const pts = [];
    for (let i = 0; i < args.length; i += 2)
      pts.push(x + args[i] * s, y - args[i + 1] * s);
    return [OPS[command], ...pts];
  });
}

/**
 * Lays the mark out as the CSS does: a flex row centered on one line, the
 * bounds `boundGap` either side, the name tracked after every letter, the ™
 * at `tmSize` lifted `tmRise`. The text's baseline sits where a centered
 * line box puts it, half of ascent less descent below the center.
 */
export function markOutline(mark, trackingEm) {
  const font = fontkit.openSync(FONT);
  const u = 1000 / font.unitsPerEm;
  const baseline = ((font.ascent + font.descent) / 2) * u;
  const bw = mark.boundWidth * 1000;
  const bh = mark.boundHeight * 1000;
  const gap = mark.boundGap * 1000;
  const tracking = trackingEm * 1000;

  const bounds = [...pill(0, -bh / 2, bw, bh)];
  const name = [];
  let pen = bw + gap;
  for (const ch of 'Stint') {
    const g = font.glyphForCodePoint(ch.codePointAt(0));
    name.push(...glyph(g, pen, baseline, u));
    pen += g.advanceWidth * u + tracking;
  }
  pen += gap;
  bounds.push(...pill(pen, -bh / 2, bw, bh));
  pen += bw + gap;
  const tmGlyph = font.glyphForCodePoint(0x2122);
  const tm = glyph(
    tmGlyph,
    pen,
    baseline * mark.tmSize - mark.tmRise * 1000,
    u * mark.tmSize,
  );

  const layers = { bounds, name, tm };
  const all = Object.values(layers).flat();
  const ys = all.flatMap((c) => c.slice(1).filter((_, i) => i % 2 === 1));
  const top = Math.min(...ys);
  const height = Math.max(...ys) - top;
  const width = Math.max(
    ...all.flatMap((c) => c.slice(1).filter((_, i) => i % 2 === 0)),
  );
  const round = (n) => Math.round(n * 10) / 10;
  for (const layer of Object.values(layers))
    for (const c of layer)
      for (let i = 1; i < c.length; i++)
        c[i] = round(i % 2 === 0 ? c[i] - top : c[i]);
  return { width: round(width), height: round(height), layers };
}

/**
 * One letter of the mark between bounds `room` apart, as the favicon's `|S|`
 * sets it: sized so its ink plus `boundGap` of its size each side fills the
 * room, the ink centered on (`cx`, `cy`), y down, to two decimals.
 */
export function letterOutline(ch, mark, room, cx, cy) {
  const font = fontkit.openSync(FONT);
  const g = font.glyphForCodePoint(ch.codePointAt(0));
  const { minX, maxX, minY, maxY } = g.bbox;
  const s = room / (maxX - minX + 2 * mark.boundGap * font.unitsPerEm);
  const round = (n) => Math.round(n * 100) / 100;
  return glyph(
    g,
    cx - ((minX + maxX) / 2) * s,
    cy + ((minY + maxY) / 2) * s,
    s,
  ).map(([op, ...n]) => [op, ...n.map(round)]);
}

/** SVG path data, which Android's `pathData` also reads. */
export const pathData = (layer) =>
  layer.map(([op, ...n]) => op + n.join(' ')).join('');

const SWIFT = {
  M: (x, y) => `p.move(to: pt(${x}, ${y}))`,
  L: (x, y) => `p.addLine(to: pt(${x}, ${y}))`,
  Q: (cx, cy, x, y) =>
    `p.addQuadCurve(to: pt(${x}, ${y}), control: pt(${cx}, ${cy}))`,
  C: (ax, ay, bx, by, x, y) =>
    `p.addCurve(to: pt(${x}, ${y}), control1: pt(${ax}, ${ay}), control2: pt(${bx}, ${by}))`,
  Z: () => 'p.closeSubpath()',
};

/** SwiftUI statements that draw `layer` into `p`, through `pt`. */
export const swiftPath = (layer, indent) =>
  layer.map(([op, ...n]) => indent + SWIFT[op](...n)).join('\n');
