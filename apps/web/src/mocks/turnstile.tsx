import { useEffect } from 'react';

/** Whether the check works; a story sets it in `beforeEach`. */
export const turnstile = { loads: true };

/**
 * Stands in for `src/components/turnstile.tsx` in Storybook, which would
 * load Cloudflare's script: a button that hands out a token, or, when the
 * check "failed", nothing but `onFailed`.
 * `.storybook/vite-mocks.mts` swaps it in.
 */
export function Turnstile({
  onToken,
  onFailed,
}: {
  siteKey: string;
  onToken: (token: string | null) => void;
  onFailed: () => void;
}) {
  useEffect(() => {
    if (!turnstile.loads) onFailed();
  }, [onFailed]);
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
