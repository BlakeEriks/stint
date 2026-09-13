// tokens.json -> dist/swatches.html. A visual reference that cannot go stale,
// because it is generated from the same source as tokens.css.
//
// This replaces a hand-built artifact whose neutral ramp silently drifted once
// derive-neutrals.mjs was re-run: a picture of the palette that is not built
// FROM the palette is wrong the moment a token moves, and nothing notices.
//
// Rendering only. Every value shown is read from tokens.json — no hex, curve
// or ratio is retyped here.
import { contrast } from './contrast.js';

const esc = (s) =>
  String(s).replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c],
  );

/** Readable ink for a swatch label, picked by measured contrast rather than
 *  by eye — the page must not commit the error it documents. */
const ink = (hex) => (contrast('#FFFFFF', hex) >= 4.5 ? '#FFFFFF' : '#000000');

const ramp = (steps) =>
  Object.entries(steps)
    .map(
      ([step, v]) =>
        `<div class="sw" style="background:${v.hex};color:${ink(v.hex)}">` +
        `<code class="k">${esc(step)}</code><code>${esc(v.hex)}</code></div>`,
    )
    .join('');

const chips = (steps) =>
  Object.entries(steps)
    .map(
      ([name, v]) =>
        `<span class="chip"><span class="dot" style="background:${v.hex}"></span>${esc(name)}</span>`,
    )
    .join('');

/** Semantic tokens for one theme, each shown on that theme's own ground —
 *  a swatch on the wrong background proves nothing about the pairing. */
const semantics = (tokens, resolve, theme) => {
  const bg = resolve(tokens.semantic[theme]['bg-base']);
  return Object.entries(tokens.semantic[theme])
    .map(([name, ref]) => {
      const hex = resolve(ref);
      return `<div class="sem" style="background:${bg}">
      <span class="bar" style="background:${hex}"></span>
      <span class="n" style="color:${ink(bg)}">${esc(name)}</span>
      <code class="h">${esc(hex)}</code>
    </div>`;
    })
    .join('');
};

/** The contract, measured at generation time. `assertions` must pass and
 *  `forbidden` must still FAIL — a forbidden pair that starts passing means
 *  the palette moved, which is why validate.js asserts the failure too. */
const contractRows = (tokens, resolve) => {
  const rows = tokens.contract.assertions.map((a) => {
    const ratio = contrast(resolve(a.fg), resolve(a.bg));
    const ok = ratio >= a.min;
    return `<tr>
      <td class="pair"><code>${esc(a.fg)}</code> on <code>${esc(a.bg)}</code></td>
      <td class="note">${esc(a.note ?? '')}</td>
      <td class="num">${ratio.toFixed(2)}</td>
      <td class="num">${a.min.toFixed(1)}</td>
      <td><span class="tag ${ok ? 'ok' : 'no'}">${ok ? 'Pass' : 'FAIL'}</span></td>
    </tr>`;
  });

  const forbidden = tokens.contract.forbidden.map((f) => {
    const ratio = contrast(resolve(f.fg), resolve(f.bg));
    const stillFails = ratio < 4.5;
    return `<tr>
      <td class="pair"><code>${esc(f.fg)}</code> on <code>${esc(f.bg)}</code></td>
      <td class="note">${esc(f.reason)}</td>
      <td class="num">${ratio.toFixed(2)}</td>
      <td class="num">4.5</td>
      <td><span class="tag ${stillFails ? 'no' : 'ok'}">${
        stillFails ? 'Forbidden' : 'DRIFTED'
      }</span></td>
    </tr>`;
  });

  return { rows: rows.join(''), forbidden: forbidden.join('') };
};

/** Each type role rendered in its own role, so the scale is legible as
 *  itself rather than as a table of numbers. */
const typeRows = (tokens) =>
  Object.entries(tokens.type.scale)
    .map(([name, t]) => {
      const css = [
        `font-family:var(--font-${t.family})`,
        `font-size:${t.size}px`,
        `font-weight:${t.weight}`,
        t.tracking ? `letter-spacing:${t.tracking}` : '',
        t.uppercase ? 'text-transform:uppercase' : '',
        t.tabular ? 'font-variant-numeric:tabular-nums' : '',
      ]
        .filter(Boolean)
        .join(';');
      const spec = `${t.family} ${t.size}/${t.weight}${
        t.tracking ? ` ${t.tracking}` : ''
      }${t.tabular ? ' tabular' : ''}`;
      const demo = t.tabular ? '1:47:22' : `type-${name}`;
      return `<div class="typerow">
      <span class="spec"><b>type-${esc(name)}</b>${esc(spec)}</span>
      <span class="demo" style="${css}">${esc(demo)}</span>
    </div>`;
    })
    .join('');

export function renderSwatches(tokens, resolve) {
  const m = tokens.$meta;
  const { rows, forbidden } = contractRows(tokens, resolve);
  const d = tokens.semantic.dark;
  const bg = resolve(d['bg-base']);
  const surface = resolve(d['bg-primary']);
  const text = resolve(d['text-primary']);
  const muted = resolve(d['text-muted']);
  const edge = resolve(d['border-subtle']);

  return `<!doctype html>
<html lang="en" data-theme="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Stint — design tokens</title>
<style>
  :root{color-scheme:dark}
  *{box-sizing:border-box}
  body{margin:0;background:${bg};color:${text};
    font-family:${tokens.type.fontFamily.sans};font-size:15px;line-height:1.6}
  .wrap{max-width:1080px;margin:0 auto;padding:48px 24px 96px}
  h1{font-size:32px;font-weight:600;letter-spacing:-.02em;margin:0 0 12px}
  h2{font-family:${tokens.type.fontFamily.mono};font-size:11px;font-weight:500;
    letter-spacing:.16em;text-transform:uppercase;color:${muted};
    margin:0 0 16px;padding-bottom:10px;border-bottom:1px solid ${edge}}
  section{margin-bottom:56px}
  .lede{color:${muted};max-width:64ch;margin:0 0 20px}
  .meta{display:flex;flex-wrap:wrap;gap:8px 24px;margin:20px 0 0;
    font-family:${tokens.type.fontFamily.mono};font-size:11.5px;color:${muted}}
  .meta b{color:${text};font-weight:500}
  code{font-family:${tokens.type.fontFamily.mono};font-size:.88em}
  .ramp{display:grid;grid-template-columns:repeat(12,1fr);
    border:1px solid ${edge};border-radius:8px;overflow:hidden}
  .ramp.acc{grid-template-columns:repeat(8,1fr)}
  .sw{aspect-ratio:1/1.5;display:flex;flex-direction:column;
    justify-content:flex-end;padding:7px 6px;min-width:0}
  .sw code{font-size:9px;display:block;line-height:1.45;white-space:nowrap;
    overflow:hidden}
  .sw .k{opacity:.7}
  .chips{display:flex;flex-wrap:wrap;gap:9px}
  .chip{display:inline-flex;align-items:center;gap:7px;padding:5px 11px 5px 8px;
    background:${surface};border:1px solid ${edge};border-radius:999px;font-size:13px}
  .dot{width:8px;height:8px;border-radius:50%;flex:none}
  .semgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:10px}
  .sem{border:1px solid ${edge};border-radius:8px;padding:12px 13px}
  .sem .bar{display:block;height:3px;border-radius:2px;margin-bottom:10px}
  .sem .n{font-size:13px;display:block}
  .sem .h{font-size:11px;color:${muted}}
  .tw{overflow-x:auto;border:1px solid ${edge};border-radius:8px}
  table{border-collapse:collapse;width:100%;font-size:13px;min-width:640px}
  th{font-family:${tokens.type.fontFamily.mono};font-size:10px;letter-spacing:.1em;
    text-transform:uppercase;color:${muted};text-align:left;font-weight:500;
    padding:11px 14px;border-bottom:1px solid ${edge};background:${surface};white-space:nowrap}
  td{padding:9px 14px;border-bottom:1px solid ${edge};color:${muted};vertical-align:middle}
  tr:last-child td{border-bottom:0}
  td.pair{color:${text};white-space:nowrap}
  td.note{font-size:12px}
  td.num{font-family:${tokens.type.fontFamily.mono};font-variant-numeric:tabular-nums;
    color:${text};text-align:right;white-space:nowrap}
  .tag{font-family:${tokens.type.fontFamily.mono};font-size:9.5px;letter-spacing:.06em;
    padding:2px 7px;border-radius:3px;white-space:nowrap;text-transform:uppercase;
    font-weight:500;border:1px solid currentColor}
  .ok{color:${resolve(d.success ?? 'accent.300')}}
  .no{color:${resolve(d.danger ?? 'accent.300')}}
  .typerow{display:flex;align-items:baseline;gap:20px;padding:13px 0;
    border-bottom:1px solid ${edge}}
  .typerow:last-child{border-bottom:0}
  .typerow .spec{font-family:${tokens.type.fontFamily.mono};font-size:10.5px;
    color:${muted};flex:none;width:170px;line-height:1.5}
  .typerow .spec b{color:${text};font-weight:500;display:block}
  .typerow .demo{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  footer{margin-top:64px;padding-top:24px;border-top:1px solid ${edge};
    font-family:${tokens.type.fontFamily.mono};font-size:11px;color:${muted}}
  @media(max-width:720px){
    .ramp{grid-template-columns:repeat(6,1fr)}
    .ramp.acc{grid-template-columns:repeat(4,1fr)}
    .typerow{flex-direction:column;align-items:flex-start;gap:5px}
    .typerow .spec{width:auto}
  }
</style>
</head>
<body>
<div class="wrap">

<header style="border-bottom:1px solid ${edge};padding-bottom:28px;margin-bottom:48px">
  <h1>Design tokens</h1>
  <p class="lede">Generated from <code>tokens.json</code>. Every hex, ratio and
  curve below is read from the token file at build time — if this page and the
  app disagree, this page is not the one that is wrong.</p>
  <div class="meta">
    <span>accent <b>h${esc(m.accentHue)}</b></span>
    <span>neutral <b>h${esc(m.neutralHue)}</b></span>
    <span>separation <b>${esc(m.hueSeparation)}°</b></span>
    <span>theme <b>dark-first</b></span>
  </div>
</header>

<section>
  <h2>Neutral ramp</h2>
  <p class="lede"><code>${esc(m.neutralCurve)}</code></p>
  <div class="ramp">${ramp(tokens.primitive.neutral)}</div>
</section>

<section>
  <h2>Accent ramp</h2>
  <div class="ramp acc">${ramp(tokens.primitive.accent)}</div>
</section>

<section>
  <h2>Light neutrals</h2>
  <p class="lede"><code>${esc(m.lightCurve)}</code></p>
  <div class="ramp">${ramp(tokens.primitive.lightNeutral)}</div>
</section>

<section>
  <h2>Project colors</h2>
  <div class="chips">${chips(tokens.primitive.project)}</div>
</section>

<section>
  <h2>Categorical</h2>
  <div class="chips">${chips(tokens.primitive.categorical)}</div>
</section>

<section>
  <h2>Semantic — dark</h2>
  <div class="semgrid">${semantics(tokens, resolve, 'dark')}</div>
</section>

<section>
  <h2>Semantic — light</h2>
  <div class="semgrid">${semantics(tokens, resolve, 'light')}</div>
</section>

<section>
  <h2>Contrast contract</h2>
  <p class="lede">Measured at generation. These same pairings are asserted by
  <code>validate.js</code> in CI, so a token change that breaks one fails the
  build rather than reaching this page.</p>
  <div class="tw"><table>
    <thead><tr><th>Pairing</th><th>Note</th><th style="text-align:right">Ratio</th>
    <th style="text-align:right">Min</th><th>Result</th></tr></thead>
    <tbody>${rows}</tbody>
  </table></div>
</section>

<section>
  <h2>Forbidden pairings</h2>
  <p class="lede">Kept and measured on purpose. These must keep FAILING — one
  that starts passing means the palette moved underneath the contract.</p>
  <div class="tw"><table>
    <thead><tr><th>Pairing</th><th>Reason</th><th style="text-align:right">Ratio</th>
    <th style="text-align:right">AA</th><th>State</th></tr></thead>
    <tbody>${forbidden}</tbody>
  </table></div>
</section>

<section>
  <h2>Type scale</h2>
  ${typeRows(tokens)}
</section>

<footer>${esc(m.derivation)}</footer>

</div>
</body>
</html>
`;
}
