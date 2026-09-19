import { useState } from 'react';
import { formatCompact, formatCurrency } from '@stint/core';
import { ChartColumn } from 'lucide-react';
import type { Stats } from '@/lib/client/api';
import { INTERNAL_SWATCH } from '@/lib/client/use-project-colors';
import { type Clients, INSET, Region, unratedNote } from './home-shell';
import { MIX_OPACITY } from './home-velocity';

type Unit = 'hours' | 'revenue';

type Entry = Stats['byProject']['byProject'][number];

/**
 * The same window Velocity reports, ranked by project instead of client.
 *
 * A name over its own bar, four of them. The panel already answers "who" as a
 * proportion and "what is owed" as rows, and a project name needs the long
 * axis: under a column it gets ~90px against names that run past twenty
 * characters, and every one of them truncates.
 *
 * The client is not drawn here. It would cost the name its line, and the hue
 * already carries it.
 *
 * The region always renders. One project draws one full-length bar and none
 * draws no bars at all — the footer still carries the window's real total,
 * which includes work filed under no project and is therefore the only figure
 * on screen that reconciles with the hours actually logged.
 */
export function ByProject({
  stats,
  clients,
}: {
  stats: Stats;
  clients: Clients;
}) {
  const [unit, setUnit] = useState<Unit>('hours');
  const b = stats.byProject;
  const revenue = unit === 'revenue';

  /* Re-sorted rather than re-fetched: one array arrives ordered by seconds,
     and the two modes rank differently. Copied first — `sort` mutates, and
     the array belongs to the query cache. */
  const rows = revenue
    ? [...b.byProject].sort((x, y) => y.amount - x.amount)
    : b.byProject;

  const size = (e: Entry) => (revenue ? e.amount : e.seconds);
  const figure = (e: Entry) =>
    revenue ? formatCurrency(e.amount, e.currency) : formatCompact(e.seconds);
  const total = (seconds: number, amount: number) =>
    revenue ? formatCurrency(amount, stats.currency) : formatCompact(seconds);

  /* Share of the longest, not of the total: the question is which project is
     biggest and by how much, and lengths as a share of the sum flatten four
     near-equal projects into four quarter-width stubs. */
  const peak = Math.max(...rows.map(size), 0);

  return (
    <Region
      title="By project"
      icon={ChartColumn}
      labelled
      action={<UnitToggle unit={unit} onChange={setUnit} />}
    >
      <div className={`${INSET} pt-1 pb-3`}>
        {rows.length > 0 ? (
          <div
            role="img"
            aria-label={rows
              .map((e) =>
                [
                  `${e.projectName} ${figure(e)}`,
                  revenue ? unratedNote(e.unratedCount) : null,
                ]
                  .filter(Boolean)
                  .join(' '),
              )
              .join(', ')}
          >
            {rows.map((e) => (
              <div key={e.projectId} className="py-1">
                {/* The name owns its line, so it never truncates at any length
                    the data has — a project name under a column had 92px and
                    every one of them cut. */}
                <div className="flex items-baseline gap-2.5">
                  <span className="min-w-0 flex-1 truncate type-support text-muted">
                    {e.projectName}
                  </span>
                  {/* Only in revenue mode: unrated work is missing from the
                      AMOUNT, and says nothing about the hours, which are
                      counted either way. */}
                  {revenue && unratedNote(e.unratedCount) ? (
                    <span className="flex-none type-meta text-subtle">
                      {unratedNote(e.unratedCount)}
                    </span>
                  ) : null}
                  <span className="flex-none type-meta text-primary">
                    {figure(e)}
                  </span>
                </div>
                {/* The label sits above the fill rather than on it: text
                    crossing a bar's end changes contrast mid-word. */}
                <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-surface-hover">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${peak > 0 ? (size(e) / peak) * 100 : 0}%`,
                      backgroundColor:
                        (e.clientId ? clients.get(e.clientId)?.color : null) ??
                        INTERNAL_SWATCH,
                      opacity: MIX_OPACITY,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {/* The window is abbreviated because Velocity names it in full
            directly above; spelled out here the line wraps at this width. */}
        <p className="mt-2.5 type-meta text-right text-subtle">
          {b.moreProjects > 0
            ? `+${total(b.tailSeconds, b.tailAmount)} across ${b.moreProjects} more · `
            : ''}
          {total(b.seconds, b.amount)} logged · {stats.velocity.months}mo
        </p>
      </div>
    </Region>
  );
}

/**
 * Two words and a divider, not a segmented control: the region's subject is
 * the bars, and a filled control in the header would be the heaviest thing in
 * it.
 *
 * `aria-pressed` rather than tabs — this switches the unit of one picture, it
 * does not swap the panel between two views.
 */
function UnitToggle({
  unit,
  onChange,
}: {
  unit: Unit;
  onChange: (unit: Unit) => void;
}) {
  return (
    <span className="flex items-center gap-0.5">
      <Option unit="hours" label="Hours" active={unit} onChange={onChange} />
      <span aria-hidden className="type-label text-subtle">
        /
      </span>
      <Option
        unit="revenue"
        label="Revenue"
        active={unit}
        onChange={onChange}
      />
    </span>
  );
}

function Option({
  unit,
  label,
  active,
  onChange,
}: {
  unit: Unit;
  label: string;
  active: Unit;
  onChange: (unit: Unit) => void;
}) {
  const on = unit === active;
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => onChange(unit)}
      className={`rounded-md px-2 py-1 type-label ${
        on ? 'bg-surface-elevated text-strong' : 'text-subtle hover:text-muted'
      }`}
    >
      {label}
    </button>
  );
}
