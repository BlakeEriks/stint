import type { Decorator } from '@storybook/nextjs-vite';
import { expect, waitFor, within } from 'storybook/test';
import { http } from 'msw';
import { AppShell } from '@/components/app-shell';
import { handlers } from './handlers';
import { fail } from './respond';

/**
 * A route as the app renders it: inside the real frame, at its own path, so
 * the rail marks it and the back trail and filters read the URL they would.
 */
export function screen(pathname: string, query: Record<string, string> = {}) {
  const decorator: Decorator = (Story) => (
    <AppShell>
      <Story />
    </AppShell>
  );
  return {
    parameters: {
      layout: 'fullscreen',
      nextjs: { navigation: { pathname, query } },
    },
    decorators: [decorator],
  };
}

/** The a11y rules a story skips. Every other rule still fails the test. */
export const skipping = (...rules: string[]) => ({
  config: { rules: rules.map((id) => ({ id, enabled: false })) },
});

/* An open Radix menu or select hides the page behind it with `aria-hidden`
   while it traps focus, and axe reads the controls under it as focusable
   inside a hidden region. */
export const menuOpen = { a11y: skipping('aria-hidden-focus') };

/** The same route with a query, as a list's filter tabs set it. */
export const at = (pathname: string, query: Record<string, string>) => ({
  nextjs: { navigation: { pathname, query } },
});

export const phone = { globals: { viewport: { value: 'phone' } } };
export const tablet = { globals: { viewport: { value: 'tablet' } } };
export const laptop = { globals: { viewport: { value: 'laptop' } } };
export const desktop = { globals: { viewport: { value: 'desktop' } } };
export const wide = { globals: { viewport: { value: 'wide' } } };
export const light = {
  globals: { viewport: { value: 'desktop' }, theme: 'light' },
};

/** These endpoints answer 500, so a story shows what the screen does then. */
export function failing(...keys: (keyof typeof handlers)[]) {
  return {
    msw: {
      handlers: Object.fromEntries(
        keys.map((key) => {
          const { method, path } = handlers[key].info;
          const verb = String(method).toLowerCase() as 'get';
          return [key, http[verb](path, () => fail('INTERNAL'))];
        }),
      ),
    },
  };
}

/** The play's last step: a dialog or menu is open and has finished opening. */
export async function expectOpen(
  canvasElement: HTMLElement,
  role: 'dialog' | 'menu',
  name?: string,
) {
  const page = within(canvasElement.ownerDocument.body);
  await waitFor(async () =>
    expect(await page.findByRole(role, name ? { name } : {})).toBeVisible(),
  );
}
