import { theme, type ColorToken, type as scale } from '@stint/design-tokens';
import type { TextStyle } from 'react-native';
import { useColorScheme } from 'react-native';

/**
 * The design system on React Native: the same generated tokens the web and
 * macOS read (`packages/design-tokens`), so the three cannot drift. Never
 * write a hex or a font size in a screen; take a color from `useColors()`
 * and text from `text(role)`.
 */
export type Colors = Record<ColorToken, string>;

export function useColors(): Colors {
  return theme[useColorScheme() === 'light' ? 'light' : 'dark'];
}

export type TypeRole = keyof typeof scale;

/** The family each weight is loaded under (`fonts.ts`): Android picks no weight of a custom font. */
const FAMILY = {
  sans: {
    400: 'IBMPlexSans_400Regular',
    500: 'IBMPlexSans_500Medium',
    600: 'IBMPlexSans_600SemiBold',
  },
  mono: {
    400: 'IBMPlexMono_400Regular',
    500: 'IBMPlexMono_500Medium',
    600: 'IBMPlexMono_600SemiBold',
  },
} as const;

/** A type role from the scale, as a React Native text style. */
export function text(role: TypeRole): TextStyle {
  const r = scale[role] as {
    family: 'sans' | 'mono';
    size: number;
    weight: 400 | 500 | 600;
    tracking?: string;
    tabular?: boolean;
    uppercase?: boolean;
  };
  return {
    fontFamily: FAMILY[r.family][r.weight],
    fontSize: r.size,
    // `em` in the tokens; React Native takes points.
    letterSpacing: r.tracking ? Number.parseFloat(r.tracking) * r.size : 0,
    ...(r.tabular ? { fontVariant: ['tabular-nums'] } : {}),
    ...(r.uppercase ? { textTransform: 'uppercase' } : {}),
  };
}
