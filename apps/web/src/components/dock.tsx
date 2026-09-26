'use client';

import { useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/client/api';
import { timeZone as tz, useTimer } from '@/lib/client/use-timer';
import {
  MAX_SPLIT,
  MIN_SPLIT,
  useDockSplit,
} from '@/lib/client/use-dock-split';
import { useMediaQuery } from '@/lib/client/use-media-query';
import { EntryList } from './entry-list';
import { Inbox } from './inbox';
import { keys } from '@/lib/client/query-keys';

/**
 * The frame's inbox column: furniture, always present and empty when there is
 * nothing. Present at every width — below `xl` it becomes a band beneath the
 * content rather than a side column.
 *
 * Painted onto the ground beside the panel, with no surface and no rule of
 * its own: the rows inside it carry the only fill, because a row you act on
 * is an object and the column holding them is not.
 */
export function Dock() {
  const timer = useTimer();
  const { data } = useQuery({
    queryKey: keys.stats(tz),
    queryFn: () => api.stats(tz),
  });
  const { data: projects } = useQuery({
    queryKey: keys.projects(),
    queryFn: () => api.projects(),
  });

  /* The split is only a thing at `xl`, where the dock is a fixed-height
     column. Below that it is a band that sizes to its content, so there is no
     height to divide and no handle to show. `useMediaQuery` rather than a
     Tailwind `xl:` because this changes BEHAVIOR, not just appearance. */
  const column = useRef<HTMLElement>(null);
  const wide = useMediaQuery('(width >= 80rem)');
  const { split, dragging, begin, nudge, reset } = useDockSplit(column);

  return (
    <aside
      ref={column}
      aria-label="At a glance"
      /* 286px, the mockup's width. The widest action strip is `Mark paid`
         beside `Download` at 190px, so this clears the only hard floor with
         room to spare. Today adapts to this width, never the reverse.

         At `xl` it spans BOTH grid rows. The timer bar is placed in the
         content column, so the third column's second row is otherwise the
         bar's height of empty ground — and Today is the region that can use
         it.

         The column itself does not scroll. It divides: each region scrolls
         inside its own share, so neither can push the other off. An inbox
         that scrolls away is an inbox you forget, and a calendar crushed to
         a sliver is one you cannot read.

         Where it divides is the user's, dragged on the handle between them
         and kept per device. */
      className="flex min-h-0 flex-none flex-col xl:col-start-3 xl:row-span-2 xl:row-start-1 xl:w-[286px]"
    >
      {/* Today has its own `/entries` query, so it waits on stats for nothing.

          The inbox takes its share and scrolls within it. `min-h-0` is what
          lets it shrink below its content so the scroller engages rather than
          the column growing.

          The basis is a MAXIMUM, not a size: `flex-shrink` is on, so an inbox
          with little in it gives the remainder to Today rather than holding
          empty ground. Dragging the handle sets the ceiling. */}
      {data ? (
        <div
          className="xl:min-h-0 xl:shrink xl:overflow-y-auto"
          style={wide ? { flexBasis: `${split * 100}%` } : undefined}
        >
          <Inbox stats={data} />
        </div>
      ) : null}

      {wide && data ? (
        <SplitHandle
          split={split}
          dragging={dragging}
          onPointerDown={begin}
          onNudge={nudge}
          onReset={reset}
        />
      ) : null}

      <EntryList
        compact
        grid
        projects={projects?.projects ?? []}
        todaySeconds={timer.todaySeconds}
        earnedToday={data?.earnedToday}
        currency={data?.currency}
        flush={wide && !!data}
      />
    </aside>
  );
}

/**
 * The divider between the inbox and Today, which is also the control that
 * moves it.
 *
 * It looks like the hairline it replaces and gains a grip only under the
 * pointer: the rule is structure, and a chrome-heavy handle sitting between
 * two regions all day would read as a third thing in a column that has room
 * for two.
 *
 * `slider` rather than `separator`: a focusable separator is a valid ARIA
 * window splitter, but it is also what `<hr>` is for, and `<hr>` is void — it
 * cannot hold the grip or take focus. A slider is what this behaves like
 * anyway: one value, moved with the arrows, bounded at both ends.
 *
 * Arrow keys move it, Home centers it, and a double-click does the same.
 */
function SplitHandle({
  split,
  dragging,
  onNudge,
  onReset,
  onPointerDown,
}: {
  split: number;
  dragging: boolean;
  onNudge: (delta: number) => void;
  onReset: () => void;
  /* Only the press: the window owns move and release, so the gesture is not
     lost when the pointer leaves this 13px strip. */
  onPointerDown: (e: React.PointerEvent) => void;
}) {
  const STEP = 0.05;

  return (
    <div
      role="slider"
      aria-label="Resize inbox and today"
      aria-orientation="vertical"
      aria-valuenow={Math.round(split * 100)}
      aria-valuemin={Math.round(MIN_SPLIT * 100)}
      aria-valuemax={Math.round(MAX_SPLIT * 100)}
      tabIndex={0}
      onKeyDown={(event) => {
        const keys: Record<string, () => void> = {
          ArrowUp: () => onNudge(-STEP),
          ArrowDown: () => onNudge(STEP),
          Home: onReset,
        };
        const act = keys[event.key];
        if (!act) return;
        event.preventDefault();
        act();
      }}
      onDoubleClick={onReset}
      onPointerDown={onPointerDown}
      /* `touch-none` so a drag on a trackpad or touchscreen moves the handle
         instead of scrolling the region under it. The tall padding is the
         hit area — the line itself is 1px, which is not a target. */
      className={`group relative my-1 flex-none cursor-row-resize touch-none py-1.5
                  focus-visible:ring-2 focus-visible:ring-edge-focus focus-visible:outline-none ${
                    dragging ? 'cursor-grabbing' : ''
                  }`}
    >
      <div
        className={`h-px w-full transition-colors ${
          dragging
            ? 'bg-edge-control'
            : 'bg-edge-subtle group-hover:bg-edge-control'
        }`}
      />
      {/* The grip: three dots centered on the rule, shown on hover or while
          dragging. It says the line moves without saying so permanently. */}
      <div
        aria-hidden
        className={`absolute inset-x-0 top-1/2 flex -translate-y-1/2 justify-center gap-[3px] transition-opacity ${
          dragging ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
        }`}
      >
        <span className="size-[3px] rounded-full bg-edge-control" />
        <span className="size-[3px] rounded-full bg-edge-control" />
        <span className="size-[3px] rounded-full bg-edge-control" />
      </div>
    </div>
  );
}
