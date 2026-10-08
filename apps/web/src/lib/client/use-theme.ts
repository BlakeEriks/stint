'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * Light, Dark, or System, which follows the OS.
 *
 * The palette is **dark-first**: the token file keys its light block to an
 * explicit `[data-theme="light"]`, so System is resolved here, to a stamped
 * `light` or `dark`, rather than left to `prefers-color-scheme` in the CSS
 * (`docs/design/deriving-color.md`). The pre-paint script in `app/layout.tsx`
 * resolves it the same way.
 *
 * Dark is the default for anyone who has not chosen.
 */
export type Theme = 'system' | 'light' | 'dark';

const KEY = 'stint.theme';
const OS_LIGHT = '(prefers-color-scheme: light)';

const isTheme = (v: unknown): v is Theme =>
  v === 'system' || v === 'light' || v === 'dark';

/** Read the stored choice. Private-mode reads can throw, so it is guarded. */
function stored(): Theme {
  try {
    const v = localStorage.getItem(KEY);
    return isTheme(v) ? v : 'dark';
  } catch {
    return 'dark';
  }
}

const resolve = (theme: Theme): 'light' | 'dark' =>
  theme === 'system'
    ? window.matchMedia(OS_LIGHT).matches
      ? 'light'
      : 'dark'
    : theme;

/**
 * Stamp `data-theme` and keep `color-scheme` in step with it.
 *
 * Both halves matter. The token file keys its light palette off
 * `:root[data-theme="light"]`, so the attribute repaints the app — while
 * `color-scheme` is what the *browser* reads for the surfaces we do not paint:
 * scrollbars, form-control chrome, the canvas behind an overscroll.
 */
function applyTheme(theme: Theme) {
  const root = document.documentElement;
  const resolved = resolve(theme);
  root.setAttribute('data-theme', resolved);
  root.style.colorScheme = resolved;
}

export function useTheme() {
  // Always 'dark' on the server and on first client render — the default, and
  // what the markup is rendered as. Reading localStorage in the initializer
  // would render one value on the server and another on the client, which is
  // a hydration mismatch; the effect below corrects it after mount.
  const [theme, setThemeState] = useState<Theme>('dark');

  useEffect(() => setThemeState(stored()), []);

  useEffect(() => {
    if (theme !== 'system') return;
    const os = window.matchMedia(OS_LIGHT);
    const follow = () => applyTheme('system');
    os.addEventListener('change', follow);
    return () => os.removeEventListener('change', follow);
  }, [theme]);

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
