import { describe, it, expect, afterEach } from 'vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { useLeaveGuard } from '@/lib/client/use-leave-guard';

let leaving: string | null = null;
function Page({ changed, link }: { changed: boolean; link: ReactLink }) {
  leaving = useLeaveGuard(changed).leaving;
  return <a {...link}>go</a>;
}
type ReactLink = { href: string; target?: string; download?: boolean };

/* Whether a press on the link is held: `leaving` set and the click's
   default prevented, so `next/link` and the browser both stay put. */
function press(
  link: ReactLink,
  init: MouseEventInit = {},
  changed = true,
): { held: boolean; leaving: string | null } {
  leaving = null;
  const { getByText } = render(<Page changed={changed} link={link} />);
  let notPrevented = true;
  act(() => {
    notPrevented = fireEvent.click(getByText('go'), init);
  });
  return { held: !notPrevented, leaving };
}

afterEach(cleanup);

describe('useLeaveGuard', () => {
  it.each([
    ['a link to another page', { href: '/calendar' }, {}, true, '/calendar'],
    [
      'a link to this page with another query',
      { href: '/?client=c1#top' },
      {},
      true,
      '/?client=c1#top',
    ],
    ['an unchanged form', { href: '/calendar' }, {}, false, null],
    ['a link to this page', { href: window.location.pathname }, {}, true, null],
    ['another site', { href: 'https://example.com/' }, {}, true, null],
    ['a new tab', { href: '/calendar', target: '_blank' }, {}, true, null],
    ['a download', { href: '/a.pdf', download: true }, {}, true, null],
    ['a cmd-click', { href: '/calendar' }, { metaKey: true }, true, null],
    ['a middle click', { href: '/calendar' }, { button: 1 }, true, null],
  ] as const)('%s', (_, link, init, changed, want) => {
    const got = press(link, init, changed);
    expect(got).toEqual({ held: want !== null, leaving: want });
  });

  it('asks before unloading only while changed', () => {
    const unload = () => {
      const e = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(e);
      return e.defaultPrevented;
    };
    const { rerender } = render(<Page changed={false} link={{ href: '/' }} />);
    expect(unload()).toBe(false);
    rerender(<Page changed link={{ href: '/' }} />);
    expect(unload()).toBe(true);
  });
});
