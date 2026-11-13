import type { Decorator } from '@storybook/nextjs-vite';
import { expect, waitFor, within } from 'storybook/test';
import { delay, http, type HttpResponseResolver } from 'msw';
import { AppShell } from '@/components/app-shell';
import { handlers } from './handlers';
import { fail } from './respond';
import { setDockFolded } from '@/lib/client/dock-fold';
import { STALLABLE, type Stallable } from './supabase';

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
export const macbook = { globals: { viewport: { value: 'macbook' } } };
export const macbook16 = { globals: { viewport: { value: 'macbook16' } } };
/** A story's `beforeEach`: the dock folded, and open again after. */
export const foldDock = () => {
  setDockFolded(true);
  return () => setDockFolded(false);
};
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

/**
 * These calls never answer, so a story shows a press still pending: each
 * endpoint is called once, and the preview judges the story with that many
 * requests still open. A `STALLABLE` key is a Supabase auth call, not
 * `/api/v1`.
 */
export function stalled(...keys: (keyof typeof handlers | Stallable)[]) {
  const isAuth = (key: string): key is Stallable =>
    (STALLABLE as readonly string[]).includes(key);
  const api = keys.filter((key) => !isAuth(key)) as (keyof typeof handlers)[];
  return {
    stalls: api.length,
    stallAuth: keys.filter(isAuth),
    msw: {
      handlers: Object.fromEntries(
        api.map((key) => {
          const { method, path } = handlers[key].info;
          const verb = String(method).toLowerCase() as 'get';
          return [key, http[verb](path, () => delay('infinite'))];
        }),
      ),
    },
  };
}

/**
 * `stalled()` for one endpoint whose other calls must still answer: the
 * request `held` picks never does, and the rest get the real answer through
 * msw's public `run()`.
 */
export function stalledWhen(
  key: keyof typeof handlers,
  held: (
    info: Parameters<HttpResponseResolver>[0],
  ) => boolean | Promise<boolean>,
) {
  const handler = handlers[key];
  const { method, path } = handler.info;
  const verb = String(method).toLowerCase() as 'get';
  return {
    stalls: 1,
    msw: {
      handlers: {
        [key]: http[verb](path, async (info) => {
          if (await held(info)) await delay('infinite');
          const { request, requestId } = info;
          return (await handler.run({ request, requestId }))?.response;
        }),
      },
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
