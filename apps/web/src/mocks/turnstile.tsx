import { useEffect } from 'react';

/** Whether Cloudflare's script arrives; a story sets it in `beforeEach`. */
export const turnstile = { loads: true };

/**
 * Stands in for `src/components/turnstile.tsx` in Storybook, which would
 * load Cloudflare's script: a button that hands out a token, or, when the
 * script "never arrived", nothing but `onUnloaded`.
 * `.storybook/vite-mocks.mts` swaps it in.
 */
export function Turnstile({
  onToken,
  onUnloaded,
}: {
  siteKey: string;
  onToken: (token: string | null) => void;
  onUnloaded: () => void;
}) {
  useEffect(() => {
    if (!turnstile.loads) onUnloaded();
  }, [onUnloaded]);
  if (!turnstile.loads) return null;
  return (
    <button
      type="button"
      className="type-control text-muted"
      onClick={() => onToken('storybook-token')}
    >
      I’m not a bot
    </button>
  );
}
