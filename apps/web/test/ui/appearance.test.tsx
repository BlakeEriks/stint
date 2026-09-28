import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ReactNode } from 'react';
import { TimerBar } from '@/components/timer-bar';
import { Nav } from '@/components/nav';
import type { Project, Summary, TimeEntry } from '@/lib/client/api';

/* Nav mounts the account menu, which needs a router to leave on sign-out. */
vi.mock('next/navigation', () => ({
  usePathname: () => '/calendar',
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn(), push: vi.fn() }),
}));

/**
 * Appearance, not behavior.
 *
 * These pin the design rules in CLAUDE.md that would fail SILENTLY — a wrong
 * color pairing renders, a misspelled utility renders as nothing, and both
 * ship with a passing build. They are deliberately about *rules*, not about
 * class strings: asserting `toHaveClass('type-nav')` would restate the source
 * and fail on any edit, which is a change detector rather than a test.
 *
 * What is NOT possible here, and why there is no computed-style assertion:
 * jsdom cannot parse Tailwind 4's compiled output (`@layer`, `@property`,
 * `oklch()`, nested `@media`) and silently drops what it does not understand,
 * so `getComputedStyle` returns browser defaults — 16px and black — for every
 * one of our utilities. Verified directly; a computed-style suite here would
 * pass while proving nothing. Real rendered pixels need a browser.
 */

const TOKENS = JSON.parse(
  readFileSync(
    join(import.meta.dirname, '../../../../packages/design-tokens/tokens.json'),
    'utf8',
  ),
);

/** Every utility the token generator actually emits, so a typo is catchable. */
const REAL_UTILITIES = new Set<string>([
  ...Object.keys(TOKENS.type.scale).map((r) => `type-${r}`),
]);

const START = '2026-09-11T09:00:00.000Z';
const NOW = '2026-09-11T09:25:00.000Z';
const PROJECTS = [{ id: 'p1', name: 'Acme' }] as unknown as Project[];

function entry(over: Partial<TimeEntry> = {}): TimeEntry {
  return {
    id: 'e1',
    taskName: 'Writing',
    projectId: null,
    startedAt: START,
    endedAt: null,
    isBillable: true,
    durationSeconds: null,
    ...over,
  } as TimeEntry;
}

function summary(over: Partial<Summary> = {}): Summary {
  return {
    running: null,
    todaySeconds: 0,
    weekSeconds: 0,
    serverTime: NOW,
    ...over,
  };
}

function serve(data: Summary) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if ((init?.method ?? 'GET') !== 'GET') {
        return new Response(JSON.stringify(entry()), { status: 200 });
      }
      if (String(url).includes('/projects')) {
        return new Response(JSON.stringify({ projects: PROJECTS }), {
          status: 200,
        });
      }
      if (String(url).includes('/clients')) {
        return new Response(JSON.stringify({ clients: [] }), { status: 200 });
      }
      return new Response(JSON.stringify(data), { status: 200 });
    }),
  );
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

/** Every class on an element and its descendants. */
function classesIn(root: HTMLElement): string[] {
  return [root, ...root.querySelectorAll<HTMLElement>('*')].flatMap((el) =>
    Array.from(el.classList),
  );
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date(NOW));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('the readout carries the accent only while running', () => {
  it('gives the readout the accent while running', async () => {
    serve(summary({ running: entry() }));
    render(<TimerBar projects={PROJECTS} />, { wrapper });
    await waitFor(() => expect(screen.getByText(/25:00/)).toBeInTheDocument());

    const readout = screen.getByText(/25:00/);
    expect(readout.className).toContain('text-accent-default');
  });

  it('withholds the accent from the readout when stopped', async () => {
    serve(summary({ running: null }));
    render(<TimerBar projects={PROJECTS} />, { wrapper });
    await waitFor(() => expect(screen.getByText(/0:00/)).toBeInTheDocument());

    /* A stopped timer is not the primary action in progress, so the accent
       would be spent on nothing. This is the rule that keeps it meaningful. */
    expect(screen.getByText(/0:00/).className).not.toContain('accent');
  });
});

describe('never white text on the accent', () => {
  /* Stop, not Start: the accent marks the one action a screen exists to
     complete, and while a timer runs that is stopping it. Start is neutral,
     so the accent appears once — on the running timer and the control that
     ends it. */
  it('pairs the accent button with text-on-accent, never a white token', async () => {
    serve(summary({ running: entry() }));
    render(<TimerBar projects={PROJECTS} />, { wrapper });
    const button = await screen.findByRole('button', { name: /stop timer/i });

    expect(button.className).toContain('bg-accent-default');
    /* White on #52FC43 is 1.37:1 — illegible, and the tempting mistake since
       neon green looks like it wants white. The token validator cannot catch
       this: it checks the palette, not which pair a component chose. */
    expect(button.className).toContain('text-on-accent');
    for (const wrong of ['text-white', 'text-strong', 'text-primary']) {
      expect(button.className).not.toContain(wrong);
    }
  });
});

describe('typography comes from the scale', () => {
  it('sets the timer readout with the timer role, not ad-hoc sizing', async () => {
    serve(summary({ running: entry() }));
    render(<TimerBar projects={PROJECTS} />, { wrapper });
    await waitFor(() => expect(screen.getByText(/25:00/)).toBeInTheDocument());

    const readout = screen.getByText(/25:00/);
    expect(readout.className).toContain('type-timer');
    /* The role owns family, size, weight, tracking and tabular-nums, so a
       component re-declaring any of them has diverged from the scale. */
    for (const part of ['font-mono', 'text-[', 'tracking-', 'tabular']) {
      expect(readout.className).not.toContain(part);
    }
  });

  it('uses only type roles that the generator actually emits', () => {
    serve(summary());
    const { container } = render(<Nav />, { wrapper });

    /* A misspelled role compiles to NO CSS, with no warning and exit 0 —
       the text renders at browser defaults and the build passes. */
    const used = classesIn(container).filter((c) => c.startsWith('type-'));
    expect(used.length).toBeGreaterThan(0);
    for (const c of used) expect(REAL_UTILITIES).toContain(c);
  });
});

describe('durations are tabular, always', () => {
  it('sets the readout in a role that carries tabular-nums', async () => {
    serve(summary({ running: entry() }));
    render(<TimerBar projects={PROJECTS} />, { wrapper });
    await waitFor(() => expect(screen.getByText(/25:00/)).toBeInTheDocument());

    const role = screen
      .getByText(/25:00/)
      .className.split(/\s+/)
      .find((c) => c.startsWith('type-'))!
      .replace('type-', '');

    /* A duration that is not tabular reflows as its digits change, which is
       the one thing a ticking clock must never do. */
    expect(TOKENS.type.scale[role].tabular).toBe(true);
    expect(TOKENS.type.scale[role].family).toBe('mono');
  });
});

describe('both themes define the same semantic tokens', () => {
  /* This is the silent failure the theme toggle introduced a path to.
     Tailwind 4 drops an unknown utility with no warning and exit 0 — the same
     silence that makes `detox` necessary — so a semantic token defined only
     under `dark` renders as *nothing* the moment a user switches to light.
     No error, no fallback, just an unstyled element on one theme only.

     Adding `bg-recessed` for the nav rail is exactly that shape of change,
     and it would have been easy to add to one block and not the other. */
  it('has no token present in one theme and missing from the other', () => {
    const dark = Object.keys(TOKENS.semantic.dark);
    const light = Object.keys(TOKENS.semantic.light);

    expect(light.filter((k) => !dark.includes(k))).toEqual([]);
    expect(dark.filter((k) => !light.includes(k))).toEqual([]);
  });

  it('defines the recessed surface the nav rail sits on', () => {
    /* Named directly because its absence is invisible: the rail would fall
       back to the body's own background and silently stop reading as
       recessed, which is the whole point of the token. */
    expect(TOKENS.semantic.dark['bg-recessed']).toBeTruthy();
    expect(TOKENS.semantic.light['bg-recessed']).toBeTruthy();
  });
});
