import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

afterEach(cleanup);

// Radix measures and positions its popper with APIs jsdom does not implement.
// Without these, DropdownMenu throws on open.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

globalThis.DOMRect ??= class {
  constructor(
    public x = 0,
    public y = 0,
    public width = 0,
    public height = 0,
  ) {}
  top = 0;
  left = 0;
  right = 0;
  bottom = 0;
  toJSON() {
    return this;
  }
  static fromRect(r?: DOMRectInit) {
    return new DOMRect(r?.x, r?.y, r?.width, r?.height);
  }
} as unknown as typeof DOMRect;

Element.prototype.scrollIntoView ??= vi.fn();
Element.prototype.hasPointerCapture ??= () => false;
Element.prototype.setPointerCapture ??= vi.fn();
Element.prototype.releasePointerCapture ??= vi.fn();
