# Suggest a task name from prior ones

`docs/tasks.md:319`. Mockup: `docs/design/screens/task-suggest.html`.

## The shape

```
GET /api/v1/entries/task-names?projectId=…&limit=…
  └─ recent_task_names(p_user_id, p_project_id, p_limit)   ← new SQL function
       └─ time_entries + new index

TaskSuggest (web) ─┬─ timer bar, idle field only
                   └─ entry dialog, Task field
```

## Surfaces

Per `docs/architecture.md:13-15`.

| Surface | This feature |
| --- | --- |
| Web | **Ships now** — timer bar idle field, entry dialog Task field. |
| macOS | **Deferred.** The panel already solves name reuse with `EntryRow` restart (`ContentView.swift:307-341`), and a second mechanism in a 320pt panel is not worth its height. Integration point if revisited: a `private struct` envelope + wrapper over `request` in `API.swift:191`, `private(set) var suggestions` on `TimerModel` loaded in `refresh()` under the `try?` convention (`TimerModel.swift:160`), and a `VStack` of `EntryRow`-shaped buttons below the idle field. **`menubar.html:791-803` must gain an endpoint row before that lands.** |
| Expo | Does not exist on disk. Inherits the endpoint when it does. |

The endpoint is built once and every client inherits it; only the surface
multiplies.

## Phases

### 1. Migration — `supabase/migrations/00000000000011_recent_task_names.sql`

**Prove against a throwaway Postgres before writing anything above it.**

Index: no existing one serves this. `entries_user_started_idx (user_id,
started_at desc)` gets recency but not `task_name`; `entries_unbilled_idx` is
partial on `invoice_id is null`, which excludes the most-repeated work.

```sql
create index entries_task_name_idx
  on time_entries (user_id, project_id, started_at desc)
  include (task_name)
  where task_name <> '';
```

Function in the `unbilled_by_client` house style (`00000000000010:34-48`) —
`security invoker`, `set search_path = public, pg_temp`, and the
`revoke`/`grant` pair at `:141-142`:

```sql
create or replace function recent_task_names(
  p_user_id uuid, p_project_id uuid default null, p_limit integer default 8
)
returns table (task_name text, project_id uuid, last_used_at timestamptz)
language sql stable security invoker
set search_path = public, pg_temp
as $$
  select task_name, project_id, last_used_at from (
    select distinct on (lower(t.task_name))
           t.task_name, t.project_id, t.started_at as last_used_at
    from time_entries t
    where t.user_id = p_user_id and t.task_name <> ''
    order by lower(t.task_name),
             coalesce(t.project_id = p_project_id, false) desc,
             t.started_at desc
  ) d
  order by coalesce(d.project_id = p_project_id, false) desc,
           d.last_used_at desc
  limit p_limit;
$$;
```

`coalesce` is load-bearing: a bare `t.project_id = p_project_id` is NULL for an
entry with no project, and NULLs sort **first** under `DESC`, so internal work
outranked the selected project's own names. Verified on a throwaway.

Verify: `pnpm verify:db`

### 2. Schema — `packages/schema/src/index.ts`

Beside `ListEntriesQuery` (`:157`). It does **not** copy that schema's
`'none'` literal: there the argument filters, here it ranks, so "no project"
and "no preference" are one request and a second spelling would only invite a
difference nobody intended.

```ts
export const TaskNamesQuery = z.object({
  projectId: uuid.optional(),   // a ranking preference, not a filter
  limit: z.coerce.number().int().min(1).max(20).default(8),
});
export const TaskNameSuggestion = z.object({
  taskName: z.string(),
  projectId: z.uuid().nullable(),
  lastUsedAt: z.iso.datetime(),
});
```

`TaskNameSuggestion` goes in the trailing `export type` block (`:607-624`);
query schemas do not.

Verify: `pnpm verify:static`

### 3. Route — `apps/web/src/app/api/v1/entries/task-names/route.ts`

Template is `projects/route.ts:11-23`. Needs `userId` for `p_user_id`, as
`clients/route.ts:12` does. RPC output is cast at the call site like
`stats/route.ts:138` — `columns<Row>()` does not apply, there is no select list.

The converter goes in `rows.ts` (it renames three fields, and `rows.ts` is the
only snake↔camel boundary).

Test in `apps/web/test/routes.test.ts`: dedupes by case, excludes the empty
name, excludes another user's rows, project preference ranks first,
`limit` honoured, 422 on a bad `limit`, 422 on a non-uuid `projectId`. `shim.mjs:178`
already supports `.rpc` positionally.

Verify: `pnpm verify:db`

### 4. Client data layer

`query-keys.ts` — options-object form (`:28-29`):

```ts
taskNames: (opts?: { projectId?: string | null }) =>
  opts ? (['task-names', opts] as const) : (['task-names'] as const),
```

Add `keys.taskNames()` to `invalidateEntryData` (`:43-49`) — starting a timer
or saving an entry mints a name.

`api.ts` — follow `projects` (`:223-229`): defaulted options object,
`URLSearchParams`, `q.size > 0` guard, envelope return type.

`staleTime: 60_000`, above the 10s default in `providers.tsx`.

Verify: `pnpm verify:static`

### 5. `TaskSuggest` — `apps/web/src/components/task-suggest.tsx`

**Renders the caller's input, does not own it.** A render prop, so the timer
bar keeps its two-row phone classes and the dialog keeps `Input`.

**Not Radix.** `DropdownMenu` moves focus into its content and is modal —
anchored to a text input that kills typing. The mechanism is `role="combobox"`
on the input plus a `role="listbox"` that never receives focus:
`aria-activedescendant` names the highlighted row, and rows use
`onMouseDown={e => e.preventDefault()}` so a click does not blur.

**Bypasses `Listing`**, which `web-ui.md` otherwise requires. Loading and
failure render nothing at all — a suggestion is an accelerator, and a failure
panel flashing over the timer bar reports a problem the user did not ask
about. Add the exception to `web-ui.md` so the next reader does not "fix" it.

Filtering is the client's over the array it holds; **ranking is the server's**
and is never re-sorted, or a row moves under the cursor.

**A `Kbd` primitive comes with this** — `components/ui/kbd.tsx`, the first
keycap in the app. `components.html` has no such shape, so it gets a row there.
It is a bordered `bg-surface-base` box with the glyph in `type-badge`; no new
tokens. It renders on the highlighted row only, so it is on screen exactly
while it is true, and on hover as well as arrow so a mouse user learns the key
without reaching back for the mouse.

Hint one key and no more. Arrows are found by pressing them and Escape is
universal; four hints under a text field is a manual.

Verify: `pnpm verify:static`

### 6. Wiring

**Timer bar** (`timer-bar.tsx:116-128`) — idle input only. The rename field at
`:209` gets no list: renaming a running timer is a correction to one entry.

Two hazards:
- The input is a flex *item* with `order-last min-w-0 flex-1 basis-full`. A
  `relative` wrapper takes those classes; the input becomes `w-full`.
- The bar is docked bottom (`:68`), so the list opens **upward**.
- `aria-label="Task name"` is shared with the rename field; `getByLabelText`
  works only because they never render together. Do not add a third.

Trim `draft` before starting (`:48` sends it raw; the dialog trims at `:150`).
A chosen suggestion must match the stored name exactly or it dedupes as a
second row.

**Entry dialog** (`entry-dialog.tsx:223-233`) — suppress entirely when
`locked` (`:196-198`).

**Test stub**: `timer-bar.test.tsx:47-67` returns the Summary payload for every
GET. Branch on `path` in `serve()` — one change covers all 14 call sites.

Verify: `pnpm verify:static && pnpm test:e2e`

## What must not regress

- **A suggestion is never an autofill.** The field keeps what is typed;
  only choosing a row writes.
- **Enter with nothing highlighted starts the timer**, as it does today. The
  list opens with no selection — which is also why no keycap shows until a row
  is highlighted.
- **Enter is the only accept key.** Not Left arrow: the input has a cursor and
  Left moves it, which is how a typo gets fixed mid-word. Tab closes the list
  and never chooses — tabbing out of a field should not fill it.
- **The project fills an empty field and never overwrites a chosen one.** A
  fill is a convenience; an overwrite re-bills work to another client without
  the project control being touched.
- Rate resolution, invoice line grouping and the one-running-timer index are
  untouched.

## Out of scope

- The macOS panel and the rename field (above).
- Fuzzy matching. Substring only; ranking is recency and project.
- Deleting or editing a suggestion.

## Docs

| File | Change |
| --- | --- |
| `docs/api.md` | A `## Views` row; bump `:15` to **37 of 37**. |
| `.claude/rules/web-ui.md` | The `Listing` exception. |
| `docs/design/screens/components.html` | A row for `Kbd`. |
| `docs/design/screens/task-suggest.html` | Written. The menu bar panel is drawn and badged **Not built** — the drawing is what the deferred work would start from, and the badge is what stops it reading as shipped. |
| `docs/tasks.md` | **Replace** lines 319-340 with a macOS-only line: the endpoint exists, the panel is drawn in `task-suggest.html`, and the open question is whether it earns its height beside the restart list. |
