import { describe, it, expect, beforeEach } from 'vitest';
import { setDockFolded } from '@/lib/client/dock-fold';
import { DOCK_FOLD_SCRIPT } from '@/lib/theme-script';

const html = document.documentElement;

beforeEach(() => {
  localStorage.clear();
  html.removeAttribute('data-dock-folded');
});

describe('the dock fold', () => {
  it('folds and unfolds the frame at once', () => {
    setDockFolded(true);
    expect(html.hasAttribute('data-dock-folded')).toBe(true);
    setDockFolded(false);
    expect(html.hasAttribute('data-dock-folded')).toBe(false);
  });

  it('is folded before paint on the next page load', () => {
    setDockFolded(true);
    html.removeAttribute('data-dock-folded');
    new Function(DOCK_FOLD_SCRIPT)();
    expect(html.hasAttribute('data-dock-folded')).toBe(true);
  });

  it('stays open on the next page load once unfolded', () => {
    setDockFolded(true);
    setDockFolded(false);
    new Function(DOCK_FOLD_SCRIPT)();
    expect(html.hasAttribute('data-dock-folded')).toBe(false);
  });
});
