// OKLCH -> sRGB via Ottosson's matrices, with binary-search gamut mapping.
const f = (x) => (x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055);
const fi = (x) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4);

export function oklchToRgb(L, C, hDeg) {
  const h = (hDeg * Math.PI) / 180,
    a = C * Math.cos(h),
    b = C * Math.sin(h);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ ** 3,
    m = m_ ** 3,
    s = s_ ** 3;
  return [
    +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}
const inGamut = ([r, g, b]) =>
  [r, g, b].every((v) => v >= -1e-4 && v <= 1 + 1e-4);

/** Reduce chroma until the colour fits sRGB, keeping L and hue exact. */
export function gamutMap(L, C, h) {
  if (inGamut(oklchToRgb(L, C, h))) return C;
  let lo = 0,
    hi = C;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (inGamut(oklchToRgb(L, mid, h))) lo = mid;
    else hi = mid;
  }
  return lo;
}
export function hex(L, C, h) {
  const c = gamutMap(L, C, h);
  const [r, g, b] = oklchToRgb(L, c, h).map((v) =>
    Math.round(Math.max(0, Math.min(1, f(v))) * 255),
  );
  return (
    '#' +
    [r, g, b].map((v) => v.toString(16).padStart(2, '0').toUpperCase()).join('')
  );
}
/**
 * sRGB hex -> [L, C, h]. The exact inverse of `oklchToRgb`.
 *
 * Exists to AUDIT, not to author: it is how a hand-picked hex gets measured
 * against the ladder a generator would have produced. Never round-trip a
 * colour through here and keep the result — the source of truth is the L, C
 * and h that generated it.
 */
export function rgbToOklch(hx) {
  const [r, g, b] = [1, 3, 5].map((i) =>
    fi(parseInt(hx.slice(i, i + 2), 16) / 255),
  );
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const h = (Math.atan2(B, A) * 180) / Math.PI;
  return [L, Math.hypot(A, B), h < 0 ? h + 360 : h];
}

export const relLum = (hx) => {
  const [r, g, b] = [1, 3, 5].map((i) =>
    fi(parseInt(hx.slice(i, i + 2), 16) / 255),
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
export const contrast = (a, b) => {
  const [x, y] = [relLum(a), relLum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};
