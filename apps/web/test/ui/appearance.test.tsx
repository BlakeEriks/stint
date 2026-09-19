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
 * Appearance, not behaviour.
 *
 * These pin the design rules in CLAUDE.md that would fail SILENTLY — a wrong
 * colour pairing renders, a misspelled utility renders as nothing, and both
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
    exceedsThreshold: false,
    maxTimerHours: 8,
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

describe('the accent marks the running timer, and nothing else', () => {
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

  it('turns the readout to warning, not accent, past the threshold', async () => {
    /* `exceedsThreshold` from the server is NOT what drives this: the client
       recomputes it from elapsed time against maxTimerHours, so the warning
       appears with no server involvement. A fixture that only sets the flag
       renders green and proves nothing. */
    serve(
      summary({
        running: entry({ startedAt: '2026-09-10T09:00:00.000Z' }),
        maxTimerHours: 8,
      }),
    );
    render(<TimerBar projects={PROJECTS} />, { wrapper });
    const readout = await screen.findByText(/24:25:00/);
    expect(readout.className).toContain('text-warning');
    /* A runaway timer is a problem, not the primary action. Leaving it green
       would say "this is fine" in the one case it is not. */
    expect(readout.className).not.toContain('accent');
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

describe('the default button is neutral', () => {
  it('does not spend the accent on a button that merely exists', async () => {
    const { Button } = await import('@/components/ui/button');
    const { container } = render(<Button>Add client</Button>);
    const button = container.querySelector('button')!;

    /* Before this, every page with a primary action rendered green while the
       nav rail's running timer was also green — two accent meanings in view,
       which is the thing the accent rule exists to prevent. Opting in with
       `variant="accent"` is now a decision. */
    expect(button.className).not.toContain('accent');
  });

  it('still offers the accent explicitly', async () => {
    const { Button } = await import('@/components/ui/button');
    const { container } = render(<Button variant="accent">Start</Button>);
    const button = container.querySelector('button')!;
    expect(button.className).toContain('bg-accent-default');
    expect(button.className).toContain('text-on-accent');
  });
});

describe('focus rings are neutral', () => {
  it('never spends the accent on a focus ring in the timer', async () => {
    serve(summary({ running: null }));
    const { container } = render(<TimerBar projects={PROJECTS} />, { wrapper });
    await screen.findByRole('button', { name: /start timer/i });

    /* A focus ring is constant and involuntary; spending the accent there
       drowns the one signal it exists for. */
    const rings = classesIn(container).filter(
      (c) => c.includes('ring-') || c.includes('focus'),
    );
    /* Without this the filter returning nothing would pass vacuously: a class
       rename, or the control ceasing to render, would read as compliance. */
    expect(rings.length).toBeGreaterThan(0);
    expect(rings.some((c) => c.includes('accent'))).toBe(false);
  });
});

describe('the frame is a flat ground with one panel on it', () => {
  it('paints the rail onto the ground rather than giving it a surface', () => {
    serve(summary());
    const { container } = render(<Nav />, { wrapper });
    const rail = container.querySelector('nav')!;

    /* The rail, the header and the dock are painted straight onto
       `bg-surface-base`, so the only edge in the frame belongs to the panel.
       A surface here would put a second plane under the pill and the marker,
       which are what the active section is read by now. */
    expect(rail.className).not.toMatch(/\bbg-surface-/);
    /* And no rule beside or beneath it: the border is what the pill replaced,
       and re-adding one puts the old gridline back without the old fill. */
    expect(rail.className).not.toMatch(/\bborder/);
  });

  it('marks the active section with a pill and a marker, not a raised card', () => {
    serve(summary());
    render(<Nav />, { wrapper });
    // `usePathname` is stubbed to /calendar, so this is the active one.
    const active = screen.getByRole('link', { name: 'Calendar' });

    expect(active).toHaveAttribute('aria-current', 'page');
    /* Translucent, so the ground reads through it — at full opacity it would
       be a second opaque plane in a frame that has one. */
    expect(active.className).toContain('bg-surface-elevated/55');
    /* The marker is a `::before`, which jsdom will not compute; its presence
       as a utility is what is checkable here, and it is the half of the
       treatment that survives a translucent fill on a busy ground. */
    expect(active.className).toContain('before:bg-edge-control');
    /* No shadow: on a flat ground a raised pill would be the second floating
       object, and the panel is the only one. */
    expect(active.className).not.toContain('shadow');
  });

  it('gives the timer bar a quiet fill, no shadow and no border', async () => {
    serve(summary({ running: null }));
    const { container } = render(<TimerBar projects={PROJECTS} />, { wrapper });
    await screen.findByRole('button', { name: /start timer/i });
    const bar = container.querySelector('section[aria-label="Timer"]')!;

    /* At `xl` the bar sits under the panel at the panel's width. Opaque it
       would read as a second panel competing with the one being read, and a
       shadow or a border would give the frame a second edge. */
    expect(bar.className).toContain('bg-surface-primary/55');
    expect(bar.className).not.toContain('shadow');
    expect(bar.className).not.toMatch(/\bborder/);
    /* `bg-surface-recessed` is the plane the bar used to sit on, and it has
       left the frame entirely — nothing in it is deeper than the ground. */
    expect(bar.className).not.toContain('recessed');
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

describe('the surface ramp is ordered, and far enough apart to see', () => {
  /* The app read flat because `bg-base` and `bg-primary` were ΔL 0.0046
     apart — a card with no edge of its own, leaving `shadow-card` to carry
     all the depth against a ground it could barely darken.

     Judged in OKLCH ΔL, NOT WCAG contrast. WCAG is compressive near black and
     reported that near-invisible pair as 1.03:1 against the fixed pair's
     1.16:1 — a difference that reads as trivial while the perceptual gap is
     14x larger. Using the wrong instrument is what let this ship. */
  const L = (ref: string) => {
    /* A semantic token points at a primitive as "group.step". If one ever
       stops doing that, fail here saying so rather than reading `undefined`
       off the ramp and comparing NaNs — which sorts as equal and would let
       the ordering assertion below pass on a broken reference. */
    const [group, step] = ref.split('.');
    const value = group && step ? TOKENS.primitive[group]?.[step] : undefined;
    if (!value) throw new Error(`${ref} does not name a primitive`);
    return value.oklch[0] as number;
  };

  /* The four painted planes, furthest to nearest. Depth increases toward what
     is being read — and in BOTH themes that means lightness rises, because the
     nearest plane is the lightest either way: a near-black card on a blacker
     frame, or a white card on a grey one.

     Light is not the mirror of dark here, which is the tempting assumption and
     is wrong. What inverts is where the ink goes (light text darkens to gain
     contrast, dark text brightens), not which end of the frame is lightest. */
  const PLANES = [
    'bg-recessed',
    'bg-base',
    'bg-primary',
    'bg-elevated',
  ] as const;

  it.each(['dark', 'light'] as const)(
    '%s: the frame rises monotonically to the card',
    (theme) => {
      const ramp = PLANES.map((k) => L(TOKENS.semantic[theme][k]));
      expect(ramp).toEqual([...ramp].sort((a, b) => a - b));
    },
  );

  it.each(['dark', 'light'] as const)(
    '%s: separates a card from the ground it floats on',
    (theme) => {
      /* `bg-elevated` is the card surface — panels across the app (timer bar,
         home cards, calendar, settings, the lists) sit on it, not on
         `bg-primary`. Asserting the pair the components actually use, because
         a gap proved between two tokens nobody renders proves nothing. */
      const base = L(TOKENS.semantic[theme]['bg-base']);
      const card = L(TOKENS.semantic[theme]['bg-elevated']);

      /* Dark spends 0.105 here and light 0.044 — light needs less because
         perceptual distance compresses toward white and its shadow does more
         of the work. Both floors sit far above the 0.0046 that caused the
         original flatness, so an incremental re-flattening of either trips it. */
      expect(Math.abs(card - base)).toBeGreaterThan(0.04);
    },
  );

  it.each(['dark', 'light'] as const)(
    '%s: hover and active are distinct from the card and from each other',
    (theme) => {
      /* These are painted ON a card, so they must differ from it visibly and
         differ from each other. They were once derived on the ink curve, which
         put them BELOW the card the moment the surfaces moved — a hover state
         that vanished into the thing you were pointing at.

         Direction is not asserted: dark lightens on hover, light darkens, and
         both read correctly. What must hold is that all three are separable. */
      const card = L(TOKENS.semantic[theme]['bg-elevated']);
      const hover = L(TOKENS.semantic[theme]['bg-hover']);
      const active = L(TOKENS.semantic[theme]['bg-active']);

      expect(Math.abs(hover - card)).toBeGreaterThan(0.015);
      expect(Math.abs(active - hover)).toBeGreaterThan(0.015);
      /* Active is the further move of the two, in whichever direction the
         theme goes — otherwise pressing something would undo the hover. */
      expect(Math.abs(active - card)).toBeGreaterThan(Math.abs(hover - card));
    },
  );
});
