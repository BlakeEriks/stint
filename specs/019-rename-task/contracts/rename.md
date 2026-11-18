# Contract: `POST /api/v1/entries/task-names/rename`

Body: `{ from, to, projectId? }`. `from` and `to` are 1–500 characters and
not blank; `projectId` is a uuid.

`200 { renamed }`: how many entries changed.

`422 VALIDATION_FAILED`: a blank or missing name, a name over 500
characters, or a `projectId` that is not a uuid. Nothing changes.
