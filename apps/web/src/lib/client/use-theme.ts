'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * Two states, and deliberately no "System".
 *
 * Offering one would be a lie in this app. The palette is **dark-first**: the
 * token file keys its light block to an explicit `[data-theme="light"]`, so a
 * light OS preference does *not* flip the surfaces (see the comment above the
 * media query in `dist/tokens.css`, and `docs/design/deriving-colour.md`). A "System"
 * option would therefore resolve to dark for everyone, including the viewer
 * whose OS is set to light — a control that appears to do something and does
 * nothing.
 *
 * Dark remains the default for anyone who has not chosen, which is the same
 * behaviour as before this control existed.
 *
 * If the app ever wants to genuinely follow the OS, the change is in the
 * generator — emit the light palette under a bare `prefers-color-scheme`
 * query as well — and a third state can be added here honestly.
 */
export type Theme = 'light' | 'dark';

const KEY = 'stint.theme';

const isTheme = (v: unknown): v is Theme => v === 'light' || v === 'dark';

/** Read the stored choice. Private-mode reads can throw, so it is guarded. */
function stored(): Theme {
  try {
    const v = localStorage.getItem(KEY);
    return isTheme(v) ? v : 'dark';
  } catch {
    return 'dark';
  }
}

/**
 * Stamp `data-theme` and keep `color-scheme` in step with it.
 *
 * Both halves matter. The token file keys its light palette off
 * `:root[data-theme="light"]`, so the attribute is what repaints the app —
 * but `color-scheme` is what the *browser* reads for the surfaces we do not
 * paint: scrollbars, form-control chrome, the canvas behind an overscroll.
 * `globals.css` used to hardcode `color-scheme: dark` on `html`, which would
 * have left a light app with dark scrollbars.
 *
 * Dark stamps the attribute explicitly rather than removing it. Both produce
 * the dark palette, but stamping keeps the DOM saying what the user chose,
 * which is what the menu's checkmark reads back.
 */
function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.setAttribute('data-theme', theme);
  root.style.colorScheme = theme;
}

export function useTheme() {
  // Always 'dark' on the server and on first client render — the default, and
  // what the markup is rendered as. Reading localStorage in the initialiser
  // would render one value on the server and another on the client, which is
  // a hydration mismatch; the effect below corrects it after mount.
  const [theme, setThemeState] = useState<Theme>('dark');

  useEffect(() => setThemeState(stored()), []);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    applyTheme(next);
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // A private window can refuse writes. The choice still applies for this
      // session; it just will not survive a reload.
    }
  }, []);

  return { theme, setTheme };
}
