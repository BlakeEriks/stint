import { describe, it, expect, beforeEach } from 'vitest';
import { setDockFolded } from '@/lib/client/dock-fold';
import { DOCK_FOLD_SCRIPT } from '@/lib/theme-script';

const html = document.documentElement;

beforeEach(() => {
  localStorage.clear();
  html.removeAttribute('data-dock-folded');
});

describe('the dock fold', () => {
  it.each([true, false])(
    'is %s before paint on the next page load',
    (folded) => {
      setDockFolded(true);
      setDockFolded(folded);
      html.removeAttribute('data-dock-folded');
      new Function(DOCK_FOLD_SCRIPT)();
      expect(html.hasAttribute('data-dock-folded')).toBe(folded);
    },
  );
});
