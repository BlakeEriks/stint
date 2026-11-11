import { describe, it, expect, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { Turnstile } from '@/components/turnstile';

/** The script tag `Turnstile` appended, which jsdom never fetches. */
const script = () =>
  document.head.querySelector<HTMLScriptElement>(
    'script[src*="challenges.cloudflare.com"]',
  );

/* In this order: a script that failed is dropped, so the next mount
   appends a new one; one that loaded is kept for the rest of the file. */
describe('Turnstile', () => {
  it('reports a failure when the script never arrives', async () => {
    const onFailed = vi.fn();
    render(<Turnstile siteKey="k" onToken={vi.fn()} onFailed={onFailed} />);
    script()?.onerror?.(new Event('error'));
    await waitFor(() => expect(onFailed).toHaveBeenCalledOnce());
    script()?.remove();
  });

  it('reports a failure when the widget loads but cannot connect', async () => {
    const onToken = vi.fn();
    const onFailed = vi.fn();
    vi.stubGlobal('turnstile', {
      render: (_: HTMLElement, options: { 'error-callback': () => void }) => {
        options['error-callback']();
        return 'id';
      },
      remove: vi.fn(),
    });
    const { unmount } = render(
      <Turnstile siteKey="k" onToken={onToken} onFailed={onFailed} />,
    );
    script()?.onload?.(new Event('load'));
    await waitFor(() => expect(onFailed).toHaveBeenCalledOnce());
    expect(onToken).toHaveBeenCalledWith(null);
    unmount();
    vi.unstubAllGlobals();
  });
});
