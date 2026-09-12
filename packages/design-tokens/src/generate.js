#!/usr/bin/env node
// tokens.json -> CSS custom properties, TS constants, Swift Color extension.
// One source, three clients, no drift.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const tokens = JSON.parse(readFileSync(join(root, 'tokens.json'), 'utf8'));
const out = join(root, 'dist');
mkdirSync(out, { recursive: true });

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
 * Shadows are composite CSS values, not colour references, so they bypass
 * `resolve()` and are emitted verbatim. They are theme-aware for the same
 * reason colours are: the alpha that reads correctly on a near-black ground
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

export const font = ${JSON.stringify(tokens.type.fontFamily, null, 2)} as const;
export const type = ${JSON.stringify(tokens.type.scale, null, 2)} as const;
export const space = ${JSON.stringify(tokens.space, null, 2)} as const;
export const radius = ${JSON.stringify(tokens.radius, null, 2)} as const;

export type ThemeName = keyof typeof theme;
export type ColorToken = keyof typeof theme.dark;
`;
writeFileSync(join(out, 'tokens.ts'), ts);

// ── Swift (macOS menu bar) ─────────────────────────────────────────
const camel = (s) => s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
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
}
`;
writeFileSync(join(out, 'Tokens.swift'), swift);

console.log('generated: tokens.css, tokens.ts, Tokens.swift');
