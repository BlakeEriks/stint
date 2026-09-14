'use client';

import { useEffect } from 'react';

/**
 * The last resort: the root layout itself failed.
 *
 * This replaces the entire document — `global-error.tsx` renders its own
 * `<html>` and `<body>`, because the layout that would normally provide them
 * is the thing that broke. Nothing from the app is available: not the frame,
 * not the timer, and **not the design tokens**, since the stylesheet is
 * imported by the layout that is not rendering.
 *
 * So the styles here are inline and hardcoded, which is the one place in the
 * app that is allowed. Every hex is a copy of a token's dark value rather
 * than an invented grey, so it still looks like Stint — but none of them can
 * be `var(--color-…)`, because nothing defined those.
 *
 * Dark, unconditionally. The palette is dark-first and light applies only
 * under an explicit `[data-theme="light"]` that nothing is here to set.
 *
 * In practice this should never render: `(app)/error.tsx` catches anything a
 * screen throws while keeping the frame. Reaching here means the layout, the
 * providers, or the root itself failed.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('The app failed to render:', error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100dvh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          background: '#0A0B0E', // bg-recessed
          color: '#F9FAFD', // text-strong
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
        }}
      >
        <div style={{ maxWidth: '32rem' }}>
          {/* The wordmark, so the failure is still recognisably this app and
              not a blank browser error. One flat colour, as everywhere. */}
          <div
            style={{
              fontFamily:
                'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
              fontSize: '19px',
              fontWeight: 600,
              letterSpacing: '0.12em',
              marginBottom: '20px',
            }}
          >
            |Stint|
          </div>

          <h1 style={{ fontSize: '24px', fontWeight: 600, margin: '0 0 8px' }}>
            Stint didn't load
          </h1>
          <p
            style={{
              fontSize: '15px',
              lineHeight: 1.5,
              color: '#9299A6', // text-muted
              margin: '0 0 20px',
            }}
          >
            Something went wrong before the app could start. Your tracked time
            is stored on the server and is not affected.
          </p>

          <button
            type="button"
            onClick={reset}
            style={{
              fontFamily: 'inherit',
              fontSize: '14px',
              fontWeight: 500,
              padding: '10px 16px',
              borderRadius: '8px',
              border: '1px solid #393E48', // border-default
              background: '#202328', // bg-elevated
              color: '#F9FAFD', // text-strong
              cursor: 'pointer',
            }}
          >
            Try again
          </button>

          {error.digest ? (
            <p
              style={{
                fontFamily:
                  'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                fontSize: '11.5px',
                color: '#838A97', // text-subtle
                margin: '20px 0 0',
              }}
            >
              Reference {error.digest}
            </p>
          ) : null}
        </div>
      </body>
    </html>
  );
}
