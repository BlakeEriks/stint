import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTheme } from '@/lib/client/use-theme';

/**
 * "System" follows the OS, including when it switches while the app is open.
 * A regression here is silent: the app keeps whichever palette it last
 * stamped, which looks like a deliberate choice.
 */

let osLight = false;
const listeners = new Set<() => void>();

function osSwitches(light: boolean) {
  osLight = light;
  for (const l of listeners) l();
}

beforeEach(() => {
  localStorage.clear();
  listeners.clear();
  osLight = false;
  window.matchMedia = ((query: string) => ({
    get matches() {
      return query === '(prefers-color-scheme: light)' && osLight;
    },
    media: query,
    addEventListener: (_: string, l: () => void) => listeners.add(l),
    removeEventListener: (_: string, l: () => void) => listeners.delete(l),
  })) as unknown as typeof window.matchMedia;
});

const stamped = () => document.documentElement.getAttribute('data-theme');

describe('useTheme', () => {
  it('follows the OS while System is chosen', () => {
    osLight = true;
    const { result } = renderHook(() => useTheme());
    act(() => result.current.setTheme('system'));
    expect(stamped()).toBe('light');
    expect(localStorage.getItem('stint.theme')).toBe('system');

    act(() => osSwitches(false));
    expect(stamped()).toBe('dark');
  });

  it('stops following the OS once Light or Dark is chosen', () => {
    const { result } = renderHook(() => useTheme());
    act(() => result.current.setTheme('system'));
    act(() => result.current.setTheme('dark'));
    act(() => osSwitches(true));
    expect(stamped()).toBe('dark');
  });

  it('restores a stored System choice on mount', () => {
    localStorage.setItem('stint.theme', 'system');
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe('system');
  });
});
