#!/usr/bin/env node
// tokens.json -> CSS custom properties, TS constants, Swift Color extension.
// One source, three clients, no drift.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderSwatches } from './swatches.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const tokens = JSON.parse(readFileSync(join(root, 'tokens.json'), 'utf8'));
const out = join(root, 'dist');
mkdirSync(out, { recursive: true });

const kebab = (s) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

/** Resolve "neutral.300" against the primitive tree; pass literal hex through. */
function resolve(ref) {
  if (ref.startsWith('#')) return ref;
  const [group, step] = ref.split('.');
  const hex = tokens.primitive[group]?.[step]?.hex;
  if (!hex) throw new Error(`Unresolvable token reference: ${ref}`);
  return hex;
}

const primitiveVars = () => {
  const lines = [];
  const prefix = {
    neutral: 'n',
    accent: 'a',
    lightNeutral: 'ln',
    project: 'proj',
    categorical: 'cat',
  };
  for (const [group, steps] of Object.entries(tokens.primitive)) {
    for (const [step, val] of Object.entries(steps)) {
      lines.push(`  --${prefix[group]}-${step}: ${val.hex};`);
    }
  }
  return lines.join('\n');
};

const semanticVars = (theme) =>
  Object.entries(tokens.semantic[theme])
    .map(([name, ref]) => `  --${name}: ${resolve(ref)};`)
    .join('\n');

/**
 * Shadows are composite CSS values, not color references, so they bypass
 * `resolve()` and are emitted verbatim. They are theme-aware for the same
 * reason colors are: the alpha that reads correctly on a near-black ground
 * looks like soot on a near-white one.
 */
/**
 * Elevation in @theme, so `shadow-card` is a real utility and a hand-written
 * box-shadow has nothing to hide behind.
 *
 * The theme key and the runtime var must differ: `--shadow-card:
 * var(--shadow-card)` inside @theme inline is a self-reference that resolves
 * to nothing and silently removes every shadow in the app. Hence the --tt-
 * prefix on the values the theme blocks declare.
 */
const elevationTheme = () =>
  Object.keys(tokens.elevation.dark)
    .map((k) => `  --${k}: var(--tt-${k});`)
    .join('\n');

const elevationVars = (theme) =>
  Object.entries(tokens.elevation[theme])
    .map(([name, value]) => `  --tt-${name}: ${value};`)
    .join('\n');

/* Motion carries no theme — a duration is the same in light and dark, so it
 * is emitted once in the root block rather than per palette. An easing keeps
 * its own --ease- prefix: `var(--ease-standard)` reads as what it is, where
 * `var(--motion-ease-standard)` reads as a duration. */
const motionVars = (indent) =>
  Object.entries(tokens.motion)
    .map(([name, value]) =>
      name.startsWith('ease-')
        ? `${indent}--${name}: ${value};`
        : `${indent}--motion-${name}: ${value};`,
    )
    .join('\n');

// ── CSS ────────────────────────────────────────────────────────────
// Dark is the primary theme: the bare :root carries it, so the
// un-stamped "system" state and an explicit dark choice both resolve.
//
// Semantic tokens are also registered in Tailwind's @theme, which turns each
// one into a utility (`bg-primary`, `text-muted`, `border-control`). That is
// what makes hardcoding a hex in a component impossible: there is a utility
// for every legitimate color and no utility for anything else.
// Tailwind reads `text-muted` as the utility prefix `text-` plus the theme
// key `muted`, so a token named `text-muted` must be registered as
// `--color-muted` or no utility is generated. Strip the redundant
// bg-/text-/border- prefix; everything else keeps its name.
const utilityKey = (name) =>
  name.replace(/^(bg|text|border)-/, (_, p) =>
    p === 'bg' ? 'surface-' : p === 'text' ? '' : 'edge-',
  );

const themeBlock = () =>
  Object.keys(tokens.semantic.dark)
    .map((name) => `  --color-${utilityKey(name)}: var(--${name});`)
    .join('\n');

/* Each scale role becomes a `@utility`, so `type-nav` sets family, size,
   weight, tracking, case and tabular-nums together and a component cannot
   apply half of a role. Sizes stay in px: the scale was derived at specific
   pixel sizes for legibility (Plex Mono's digits at 13px is a real
   constraint, not a preference), and rem would let a browser setting
   resize the timer hero out of its layout. */
const typeUtilities = () =>
  Object.entries(tokens.type.scale)
    .map(([name, t]) => {
      const lines = [
        `  font-family: var(--font-${t.family});`,
        `  font-size: ${t.size}px;`,
        `  font-weight: ${t.weight};`,
      ];
      if (t.tracking) lines.push(`  letter-spacing: ${t.tracking};`);
      /* A role may step up at a breakpoint. The hero is the only one today:
         30px would force a horizontal scroll on a narrow phone, and a
         component writing `sm:text-3xl` itself is the one-off this replaces. */
      if (t.sizeSm)
        lines.push(`  @media (width >= 40rem) { font-size: ${t.sizeSm}px; }`);
      if (t.uppercase) lines.push('  text-transform: uppercase;');
      if (t.tabular) lines.push('  font-variant-numeric: tabular-nums;');
      return `@utility type-${name} {\n${lines.join('\n')}\n}`;
    })
    .join('\n\n');

const css = `/* GENERATED from tokens.json — do not edit by hand. */
/* ${tokens.$meta.derivation} */

:root {
  /* primitives */
${primitiveVars()}

  /* semantic — DARK (primary) */
${semanticVars('dark')}
${elevationVars('dark')}

  --font-sans: ${tokens.type.fontFamily.sans};
  --font-mono: ${tokens.type.fontFamily.mono};

${Object.entries(tokens.space)
  .map(([k, v]) => `  --space-${k}: ${v}px;`)
  .join('\n')}
${Object.entries(tokens.radius)
  .map(([k, v]) => `  --radius-${k}: ${v}px;`)
  .join('\n')}

  /* Motion. Theme-independent: a duration does not change with the palette. */
${motionVars('  ')}

  /* The mark's geometry, in em so one definition serves every size it is
     set at. No color here — the mark takes one, via currentColor. */
${Object.entries(tokens.brand.mark)
  .map(
    ([k, v]) =>
      `  --mark-${kebab(k)}: ${k === 'boundRadius' ? `${v}px` : `${v}em`};`,
  )
  .join('\n')}
}

/* The app is DARK-first, so a light OS preference does not flip it — only an
   explicit [data-theme="light"] does. A viewer who has not chosen gets dark,
   which is the theme the palette was derived for. */
@media (prefers-color-scheme: light) {
  :root[data-theme="light"] {
${semanticVars('light')}
${elevationVars('light')}
  }
}

:root[data-theme="light"] {
${semanticVars('light')}
${elevationVars('light')}
}

:root[data-theme="dark"] {
${semanticVars('dark')}
${elevationVars('dark')}
}

/* Tailwind utilities for every semantic token, so bg-primary and
   text-muted exist and a hardcoded hex has no utility to hide behind.
   Declared LAST: @theme inline resolves var() at its own position, so the
   theme blocks above must already be in scope. */
@theme inline {
${themeBlock()}

${elevationTheme()}
}

/* One class per role in the type scale. Components name a ROLE
   (type-label), never a size: an arbitrary text-[11px] with its own
   tracking, spread across twenty files, is how a documented scale becomes
   fiction — which is what these replace. Adding a size means adding a role
   here, with a reason, not an arbitrary value at the call site. */
${typeUtilities()}

/* The bound that makes |Stint| a mark rather than a word. A drawn rule, not
   a \`|\` glyph: the pipe carries its own side bearings and sits on the text
   baseline, so it renders short of the cap height and too far from the
   letters. Sized in em off the mark's own font-size, and \`currentColor\` so
   one mark works on any ground. */
@utility mark-bound {
  display: inline-block;
  flex: none;
  width: var(--mark-bound-width);
  height: var(--mark-bound-height);
  margin-inline: var(--mark-bound-gap);
  border-radius: var(--mark-bound-radius);
  background: currentColor;
}
`;
writeFileSync(join(out, 'tokens.css'), css);

// ── TypeScript (Expo + web logic) ──────────────────────────────────
const themeObj = (theme) =>
  Object.entries(tokens.semantic[theme])
    .map(([name, ref]) => `    ${JSON.stringify(name)}: '${resolve(ref)}',`)
    .join('\n');

const ts = `// GENERATED from tokens.json — do not edit by hand.

export const theme = {
  dark: {
${themeObj('dark')}
  },
  light: {
${themeObj('light')}
  },
} as const;

export const projectColors = [
${Object.values(tokens.primitive.project)
  .map((p) => `  '${p.hex}',`)
  .join('\n')}
] as const;

export const categorical = [
${Object.values(tokens.primitive.categorical)
  .map((c) => `  '${c.hex}',`)
  .join('\n')}
] as const;

export const brand = ${JSON.stringify(tokens.brand, null, 2)} as const;

export const font = ${JSON.stringify(tokens.type.fontFamily, null, 2)} as const;
export const type = ${JSON.stringify(tokens.type.scale, null, 2)} as const;
export const space = ${JSON.stringify(tokens.space, null, 2)} as const;
export const radius = ${JSON.stringify(tokens.radius, null, 2)} as const;
export const motion = ${JSON.stringify(tokens.motion, null, 2)} as const;

export type ThemeName = keyof typeof theme;
export type ColorToken = keyof typeof theme.dark;
`;
writeFileSync(join(out, 'tokens.ts'), ts);

// ── Swift (macOS menu bar) ─────────────────────────────────────────
const camel = (s) => s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
const swiftWeights = {
  300: '.light',
  400: '.regular',
  500: '.medium',
  600: '.semibold',
  700: '.bold',
};
const swiftWeight = (w) => {
  const name = swiftWeights[w];
  if (!name) throw new Error(`No Font.Weight for numeric weight ${w}`);
  return name;
};
const swiftTheme = (theme) =>
  Object.entries(tokens.semantic[theme])
    .map(
      ([name, ref]) =>
        `        static let ${camel(name)} = Color(hex: "${resolve(ref)}")`,
    )
    .join('\n');

const swift = `// GENERATED from tokens.json — do not edit by hand.
import SwiftUI

public extension Color {
    init(hex: String) {
        let s = hex.hasPrefix("#") ? String(hex.dropFirst()) : hex
        let v = UInt64(s, radix: 16) ?? 0
        self.init(
            .sRGB,
            red:   Double((v >> 16) & 0xFF) / 255,
            green: Double((v >> 8) & 0xFF) / 255,
            blue:  Double(v & 0xFF) / 255,
            opacity: 1
        )
    }
}

public enum Tokens {
    public enum Dark {
${swiftTheme('dark')}
    }
    public enum Light {
${swiftTheme('light')}
    }
    public static let projectColors: [Color] = [
${Object.values(tokens.primitive.project)
  .map((p) => `        Color(hex: "${p.hex}"),`)
  .join('\n')}
    ]

    /// The mark's geometry, as multiples of its own font size. Mark.swift
    /// reads these rather than carrying its own numbers, so |Stint| is one
    /// drawing across the web app and this one.
    public enum Mark {
${Object.entries(tokens.brand.mark)
  .map(([k, v]) => `        public static let ${k}: CGFloat = ${v}`)
  .join('\n')}
    }

    /// The type scale. A view names a role; it never assembles one.
    public enum \`Type\` {
        public struct Role: Sendable {
            public let size: CGFloat
            public let weight: Font.Weight
            /// Points, not em: tokens.json states tracking in em because CSS
            /// letter-spacing does, and SwiftUI's .tracking() takes points.
            /// Pre-multiplied here so no caller has to know that.
            public let tracking: CGFloat
            public let uppercase: Bool
            public let tabular: Bool
            public let mono: Bool

            public var font: Font {
                mono
                    ? .system(size: size, weight: weight, design: .monospaced)
                    : .system(size: size, weight: weight)
            }

            /// The same role at another size. Tracking rescales with it,
            /// since the token states it as a ratio of the size.
            public func at(
                _ newSize: CGFloat,
                weight newWeight: Font.Weight? = nil,
                tracking em: CGFloat? = nil
            ) -> Role {
                Role(
                    size: newSize,
                    weight: newWeight ?? weight,
                    tracking: (em ?? (size == 0 ? 0 : tracking / size)) * newSize,
                    uppercase: uppercase,
                    tabular: tabular,
                    mono: mono
                )
            }
        }

${Object.entries(tokens.type.scale)
  .map(([name, t]) => {
    const em = t.tracking ? Number.parseFloat(t.tracking) : 0;
    const tracking = Number((em * t.size).toFixed(4));
    return (
      `        public static let ${camel(name)} = Role(\n` +
      `            size: ${t.size}, weight: ${swiftWeight(t.weight)}, tracking: ${tracking},\n` +
      `            uppercase: ${!!t.uppercase}, tabular: ${!!t.tabular}, mono: ${t.family === 'mono'}\n` +
      `        )`
    );
  })
  .join('\n')}
    }
}

/* Tokens.Type is unwritable in an expression: Swift reads any x.Type as the
 * metatype of x, and backticks do not escape it there. This is the name
 * call sites use. */
public typealias Typography = Tokens.\`Type\`
`;
writeFileSync(join(out, 'Tokens.swift'), swift);

/* Also into the macOS app's own sources.
 *
 * SwiftPM has no way to consume a file from `dist/`, which is gitignored, and
 * a hand-copied palette is exactly the drift the token package exists to
 * prevent. Writing it here keeps `apps/macos` buildable from a fresh clone
 * while leaving `tokens.json` the only place a color is decided. The file is
 * committed and regenerated, like `dist/` would be if SwiftPM could read it. */
const macosTokens = join(
  import.meta.dirname,
  '../../../apps/macos/Sources/Stint/Tokens.swift',
);
if (existsSync(dirname(macosTokens))) writeFileSync(macosTokens, swift);

// ── Swatch page (visual reference) ─────────────────────────────────
// Built from the same tokens as everything above, so it cannot drift the way
// a hand-maintained palette page does. `resolve` is passed in rather than
// re-implemented, so a bad reference fails here exactly as it does elsewhere.
writeFileSync(join(out, 'swatches.html'), renderSwatches(tokens, resolve));

// ── Mockup stylesheet (docs/design) ────────────────────────────────
/* The design docs are static HTML opened straight from disk, so they cannot
 * import `dist/` (gitignored) or resolve a package specifier. Before this they
 * hand-copied a `:root` block with a "verbatim from tokens.css" comment, which
 * is the drift this package exists to prevent — and it fails silently, since a
 * stale hex renders perfectly and merely misrepresents the app.
 *
 * Committed for the same reason `Tokens.swift` is: the consumer cannot read
 * the gitignored output. Regenerated by `pnpm tokens` like everything else. */
const mockupVar = (theme) =>
  Object.entries(tokens.semantic[theme])
    .map(([name, ref]) => `    --${name}: ${resolve(ref)};`)
    .join('\n');

const mockup = `/* GENERATED from tokens.json — do not edit by hand. Run \`pnpm tokens\`. */
/* The palette for docs/design mockups. Token names are the RAW ones
   (--bg-primary, --text-muted, --border-subtle), not the Tailwind-stripped
   utilities the app uses — a mockup writes plain CSS, so there is no prefix
   collision to work around. */

:root {
${mockupVar('dark')}

${Object.entries(tokens.elevation.dark)
  .map(([k, v]) => `    --${k}: ${v};`)
  .join('\n')}

    --font-sans: ${tokens.type.fontFamily.sans};
    --font-mono: ${tokens.type.fontFamily.mono};

${motionVars('    ')}

${Object.entries(tokens.brand.mark)
  .map(
    ([k, v]) =>
      `    --mark-${kebab(k)}: ${k === 'boundRadius' ? `${v}px` : `${v}em`};`,
  )
  .join('\n')}

${Object.entries(tokens.primitive.project)
  .map(([step, p]) => `    --proj-${step}: ${p.hex};`)
  .join('\n')}

${Object.entries(tokens.primitive.categorical)
  .map(([step, p]) => `    --cat-${step}: ${p.hex};`)
  .join('\n')}
}

[data-theme="light"] {
${mockupVar('light')}

${Object.entries(tokens.elevation.light)
  .map(([k, v]) => `    --${k}: ${v};`)
  .join('\n')}
}

/* ── The type scale ────────────────────────────────────────────────
   One class per role, same as the app's @utility set. A mockup names a
   role (type-amount) and never assembles one, so a doc cannot invent a
   size the product does not have. */
${Object.entries(tokens.type.scale)
  .map(([name, t]) => {
    const lines = [
      `    font-family: var(--font-${t.family});`,
      `    font-size: ${t.size}px;`,
      `    font-weight: ${t.weight};`,
    ];
    if (t.tracking) lines.push(`    letter-spacing: ${t.tracking};`);
    if (t.sizeSm)
      lines.push(`    @media (width >= 40rem) { font-size: ${t.sizeSm}px; }`);
    if (t.uppercase) lines.push('    text-transform: uppercase;');
    if (t.tabular) lines.push('    font-variant-numeric: tabular-nums;');
    return `.type-${name} {\n${lines.join('\n')}\n}`;
  })
  .join('\n\n')}

/* ── The mark ──────────────────────────────────────────────────────
   \`|Stint|\` — one color, bounds included, inherited via currentColor.
   Set a font-size on .mark and everything scales from it. */
.mark {
    font-family: var(--font-mono);
    font-size: ${tokens.type.scale.wordmark.size}px;
    font-weight: ${tokens.type.scale.wordmark.weight};
    letter-spacing: ${tokens.type.scale.wordmark.tracking};
    display: inline-flex;
    align-items: center;
    white-space: nowrap;
}
.mark::before,
.mark::after {
    content: '';
    display: inline-block;
    flex: none;
    width: var(--mark-bound-width);
    height: var(--mark-bound-height);
    margin: 0 var(--mark-bound-gap);
    border-radius: var(--mark-bound-radius);
    background: currentColor;
}
`;
writeFileSync(join(out, 'mockup.css'), mockup);

/* Also into docs/design/screens/, for the same reason Tokens.swift is written
 * into apps/macos: the consumer opens a file from disk and cannot reach an
 * ignored dist/. */
const mockupDoc = join(
  import.meta.dirname,
  '../../../docs/design/screens/_mockup.css',
);
if (existsSync(dirname(mockupDoc))) writeFileSync(mockupDoc, mockup);

// ── Favicon (the mark, cropped to its first letter) ────────────────
/* `|S|` — the wordmark's bounds in the accent, the S in text-strong, on the
 * app's deepest ground. Written into apps/web/src/app/ because Next resolves
 * icon.svg by file convention and cannot read an ignored dist/, the same
 * reason Tokens.swift is written into apps/macos.
 *
 * The bounds and the colors are tokens. The S is a traced outline of IBM
 * Plex Mono Semibold rather than a <text> element: a favicon is rasterized
 * by the browser with no webfont loaded, so `font-family` there would fall
 * back to whatever monospace the OS has and the mark would differ per
 * machine. A path is the same drawing everywhere.
 *
 * Geometry is solved for a 32 viewBox so every edge is a whole pixel at 16,
 * which is the size that decides a favicon: the bounds are 2 units wide and
 * inset 4, landing on 1px at 16px instead of blurring across two. The S is
 * scaled so the space each side of it is `boundGap` of its own size, which
 * is what keeps this the same lockup as `mark-bound`.
 *
 * Fixed to the dark ground in both themes. A favicon sits on browser chrome,
 * not on the app's surface, so it cannot follow `prefers-color-scheme`
 * without going invisible against half the tab strips it lands in. */
const MARK_S_PATH =
  'M15.97 24.23Q13.91 24.23 12.47 23.53Q11.02 22.82 10.1 21.66L11.91 19.79Q12.8 20.81 13.83 21.3Q14.87 21.79 16.06 21.79Q17.43 21.79 18.16 21.18Q18.88 20.56 18.88 19.4Q18.88 18.44 18.34 17.95Q17.79 17.46 16.49 17.25L14.8 16.98Q12.59 16.59 11.66 15.37Q10.72 14.15 10.72 12.49Q10.72 10.21 12.2 8.99Q13.69 7.77 16.31 7.77Q18.18 7.77 19.53 8.36Q20.89 8.95 21.71 9.98L19.96 11.85Q19.32 11.1 18.43 10.65Q17.54 10.21 16.33 10.21Q13.73 10.21 13.73 12.35Q13.73 13.26 14.28 13.74Q14.83 14.22 16.15 14.45L17.81 14.75Q19.89 15.13 20.89 16.27Q21.9 17.41 21.9 19.19Q21.9 20.31 21.51 21.23Q21.12 22.16 20.37 22.83Q19.61 23.5 18.51 23.87Q17.4 24.23 15.97 24.23Z';

/* Snapped to even units so each edge halves onto a whole pixel at 16. The S
 * path above was traced against these values, so a mark ratio changed far
 * enough to move them leaves the letter at its old size — re-trace it from
 * the font rather than nudging the numbers here. */
const FAVICON_BOX = 32;
const boundW = 2;
const boundH = Math.round((tokens.brand.mark.boundHeight / 1.05) * 22);
const boundInset = 4;
const boundY = (FAVICON_BOX - boundH) / 2;

const bound = (x) =>
  `<rect x="${x}" y="${boundY}" width="${boundW}" height="${boundH}" rx="${boundW / 2}" fill="${resolve(tokens.semantic.dark['accent-default'])}"/>`;

const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${FAVICON_BOX} ${FAVICON_BOX}">
  <rect width="${FAVICON_BOX}" height="${FAVICON_BOX}" rx="${tokens.radius.xl - 3}" fill="${resolve(tokens.semantic.dark['bg-recessed'])}"/>
  ${bound(boundInset)}
  ${bound(FAVICON_BOX - boundInset - boundW)}
  <path d="${MARK_S_PATH}" fill="${resolve(tokens.semantic.dark['text-strong'])}"/>
</svg>
`;

const faviconOut = join(
  import.meta.dirname,
  '../../../apps/web/src/app/icon.svg',
);
if (existsSync(dirname(faviconOut))) writeFileSync(faviconOut, favicon);

console.log(
  'generated: tokens.css, tokens.ts, Tokens.swift, swatches.html, mockup.css, icon.svg',
);
