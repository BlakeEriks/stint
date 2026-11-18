# Quickstart: rename a task name

Signed in to local Stint, from the browser console:

```js
await fetch('/api/v1/entries/task-names/rename', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ from: 'Desing review', to: 'Design review' }),
}).then((r) => r.json());
```

It answers `{ renamed: n }`; Calendar shows every entry under the new name.
