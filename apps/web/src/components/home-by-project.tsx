import { useState } from 'react';
import { formatCompact, formatCurrency } from '@stint/core';
import { ChartColumn } from 'lucide-react';
import type { Stats } from '@/lib/client/api';
import { INTERNAL_SWATCH } from '@/lib/client/use-project-colors';
import { type Clients, Region } from './home-shell';
import { MIX_OPACITY } from './home-velocity';

type Unit = 'hours' | 'revenue';

type Entry = Stats['byProject']['byProject'][number];

/**
 * The same window Velocity reports, ranked by project instead of client.
 *
 * Columns, not a bar or a row list: four projects compared against each other
 * is a question about relative size, and the panel already answers "who" as a
 * proportion and "what is owed" as rows.
 *
 * The region always renders. One project draws one full-height bar and none
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

  /* Share of the tallest, not of the total: the question is which project is
     biggest and by how much, and heights as a share of the sum flatten four
     near-equal projects into four quarter-height stubs. */
  const peak = Math.max(...rows.map(size), 0);

  return (
    <Region
      title="By project"
      icon={ChartColumn}
      action={<UnitToggle unit={unit} onChange={setUnit} />}
    >
      <div className="px-5 pt-1 pb-3">
        {rows.length > 0 ? (
          <>
            {/* Fixed height, and every column fills it: a percentage resolves
                against a definite box, so on an auto-height row every bar
                computes to zero. */}
            <div
              className="flex h-[116px] items-end gap-2.5"
              role="img"
              aria-label={rows
                .map((e) => `${e.projectName} ${figure(e)}`)
                .join(', ')}
            >
              {rows.map((e) => (
                <div
                  key={e.projectId}
                  className="flex h-full min-w-0 flex-1 flex-col justify-end gap-1"
                >
                  <span className="truncate text-center type-meta tabular-nums text-muted">
                    {figure(e)}
                  </span>
                  <div
                    className="rounded-t-[4px]"
                    style={{
                      height: `${peak > 0 ? (size(e) / peak) * 100 : 0}%`,
                      backgroundColor:
                        (e.clientId ? clients.get(e.clientId)?.color : null) ??
                        INTERNAL_SWATCH,
                      opacity: MIX_OPACITY,
                    }}
                  />
                </div>
              ))}
            </div>

            {/* The line the columns stand on. Without it a short bar floats
                against the region's own ground with nothing to be short
                against. */}
            <div className="mt-2 h-px bg-edge-subtle" />

            <div className="mt-2 flex gap-2.5">
              {rows.map((e) => (
                <span key={e.projectId} className="min-w-0 flex-1 text-center">
                  <span className="block truncate type-support text-muted">
                    {e.projectName}
                  </span>
                  {e.clientName ? (
                    <span className="block truncate type-meta text-subtle">
                      {e.clientName}
                    </span>
                  ) : null}
                </span>
              ))}
            </div>
          </>
        ) : null}

        <p className="mt-2 type-meta tabular-nums text-right text-subtle">
          {b.moreProjects > 0
            ? `+${total(b.tailSeconds, b.tailAmount)} across ${b.moreProjects} more · `
            : ''}
          {total(b.seconds, b.amount)} logged · last {stats.velocity.months}{' '}
          months
        </p>
      </div>
    </Region>
  );
}

/**
 * Two words and a divider, not a segmented control: the region's subject is
 * the columns, and a filled control in the header would be the heaviest thing
 * in it.
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
