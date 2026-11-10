'use client';

import { useEffect, useRef } from 'react';

/* Cloudflare's widget API (developers.cloudflare.com/turnstile), rendered
   explicitly so React owns when it mounts and goes. */
type Widget = {
  render: (
    el: HTMLElement,
    options: {
      sitekey: string;
      size: 'flexible';
      callback: (token: string) => void;
      'expired-callback': () => void;
      'error-callback': () => void;
    },
  ) => string;
  remove: (id: string) => void;
};

const SCRIPT =
  'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
let loading: Promise<Widget> | undefined;

function load(): Promise<Widget> {
  loading ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT;
    script.async = true;
    script.onload = () =>
      resolve((window as unknown as { turnstile: Widget }).turnstile);
    script.onerror = () => {
      loading = undefined;
      reject(new Error('Turnstile did not load'));
    };
    document.head.append(script);
  });
  return loading;
}

/**
 * The CAPTCHA in front of sign-in. A token is good for one request, so a
 * caller remounts this (a new `key`) for the next.
 * `onToken(null)` when the last one expired or the challenge failed, which
 * the widget explains itself; `onUnloaded` when the script never arrived,
 * which nothing on the page would.
 */
export function Turnstile({
  siteKey,
  onToken,
  onUnloaded,
}: {
  siteKey: string;
  onToken: (token: string | null) => void;
  onUnloaded: () => void;
}) {
  const el = useRef<HTMLDivElement>(null);
  const report = useRef(onToken);
  report.current = onToken;
  const unloaded = useRef(onUnloaded);
  unloaded.current = onUnloaded;

  useEffect(() => {
    let id: string | undefined;
    let gone = false;
    const none = () => report.current(null);
    load().then(
      (widget) => {
        if (gone || !el.current) return;
        id = widget.render(el.current, {
          sitekey: siteKey,
          size: 'flexible',
          callback: (token) => report.current(token),
          'expired-callback': none,
          'error-callback': none,
        });
      },
      () => {
        if (!gone) unloaded.current();
      },
    );
    return () => {
      gone = true;
      if (id) (window as unknown as { turnstile: Widget }).turnstile.remove(id);
    };
  }, [siteKey]);

  return <div ref={el} />;
}
