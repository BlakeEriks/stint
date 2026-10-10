import { describe, it, expect } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useDialog } from '@/lib/client/use-dialog';

describe('useDialog', () => {
  it('keeps its subject through the close', () => {
    const { result } = renderHook(() => useDialog<string>());

    act(() => result.current.show('project-1'));
    expect(result.current).toMatchObject({ open: true, subject: 'project-1' });

    act(() => result.current.onOpenChange(false));
    expect(result.current).toMatchObject({
      open: false,
      subject: 'project-1',
    });
  });

  it('replaces its subject when it opens for another', () => {
    const { result } = renderHook(() => useDialog<string | undefined>());

    act(() => result.current.show('project-1'));
    act(() => result.current.onOpenChange(false));
    act(() => result.current.show(undefined));
    expect(result.current).toMatchObject({ open: true, subject: undefined });
  });
});
