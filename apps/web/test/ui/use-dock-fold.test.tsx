import { describe, it, expect, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useDockFold } from '@/lib/client/use-dock-fold';

beforeEach(() => localStorage.clear());

describe('useDockFold', () => {
  it('is open until the user folds it', () => {
    const { result } = renderHook(() => useDockFold());
    expect(result.current.folded).toBe(false);
  });

  it('tells every reader, so the dock and its strip agree', () => {
    const dock = renderHook(() => useDockFold());
    const strip = renderHook(() => useDockFold());
    act(() => dock.result.current.setFolded(true));
    expect(strip.result.current.folded).toBe(true);
    act(() => strip.result.current.setFolded(false));
    expect(dock.result.current.folded).toBe(false);
  });

  it('keeps the choice for the next screen', () => {
    const first = renderHook(() => useDockFold());
    act(() => first.result.current.setFolded(true));
    first.unmount();
    expect(renderHook(() => useDockFold()).result.current.folded).toBe(true);
  });
});
