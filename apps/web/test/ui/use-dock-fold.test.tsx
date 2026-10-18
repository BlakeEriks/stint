import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useDockFold } from '@/lib/client/use-dock-fold';

const at = { pathname: '/invoices/new' };
vi.mock('next/navigation', () => ({ usePathname: () => at.pathname }));

/** `XL` matches or not, and tells the hook when that changes. */
const media = {
  matches: true,
  listeners: new Set<() => void>(),
  set(matches: boolean) {
    this.matches = matches;
    for (const l of this.listeners) l();
  },
};
const original = window.matchMedia;

beforeEach(() => {
  at.pathname = '/invoices/new';
  media.matches = true;
  media.listeners.clear();
  window.matchMedia = ((query: string) => ({
    get matches() {
      return media.matches;
    },
    media: query,
    addEventListener: (_: string, l: () => void) => media.listeners.add(l),
    removeEventListener: (_: string, l: () => void) =>
      media.listeners.delete(l),
  })) as unknown as typeof window.matchMedia;
});

afterEach(() => {
  window.matchMedia = original;
});

describe('useDockFold', () => {
  it('opens a region, and closes it when set to nothing', () => {
    const { result } = renderHook(() => useDockFold());
    expect(result.current.open).toBeNull();
    act(() => result.current.setOpen('inbox'));
    expect(result.current.open).toBe('inbox');
    act(() => result.current.setOpen(null));
    expect(result.current.open).toBeNull();
  });

  it('holds one region at a time', () => {
    const { result } = renderHook(() => useDockFold());
    act(() => result.current.setOpen('inbox'));
    act(() => result.current.setOpen('today'));
    expect(result.current.open).toBe('today');
  });

  it('closes on navigation, and stays closed coming back', () => {
    const { result, rerender } = renderHook(() => useDockFold());
    act(() => result.current.setOpen('inbox'));
    at.pathname = '/invoices/abc';
    rerender();
    expect(result.current.open).toBeNull();
    at.pathname = '/invoices/new';
    rerender();
    expect(result.current.open).toBeNull();
  });

  it('closes below xl, where the strip gives way to the band', () => {
    const { result } = renderHook(() => useDockFold());
    act(() => result.current.setOpen('today'));
    act(() => media.set(false));
    expect(result.current.open).toBeNull();
    act(() => media.set(true));
    expect(result.current.open).toBeNull();
  });
});
