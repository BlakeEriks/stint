# Research: rename a task name

## Where the match runs

- **Decision**: a SQL function, `security invoker`, one `update`.
- **Rationale**: PostgREST's `ilike` would read `%`, `_` and `\` in the
  user's `from` as wildcards, so `50% review` would rename other tasks.
- **Alternatives**: read the ids, then update by id: two round trips and a
  window between them.

## Matching

- **Decision**: case-insensitive, as `recent_task_names` dedupes.
- **Alternatives**: exact, which leaves case variants the suggestions hide;
  whitespace-insensitive, which the suggestions do not do.

## Telling other devices

- **Decision**: the function returns whether a running entry changed; the
  route calls `pushTimerChanged`, as `PATCH /entries/:id` does.
