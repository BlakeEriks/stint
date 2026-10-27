# API: push devices

## `POST /api/v1/push-devices`

Body: `{ "token": string, "platform": "android" }`. Registers the caller's
phone. `204`, the same when the token is already registered. `422` for a
missing token or another platform.

## `DELETE /api/v1/push-devices`

Body: `{ "token": string }`. Removes it from the caller's devices. `204`,
the same when it was never registered.

## The push

FCM HTTP v1, `POST https://fcm.googleapis.com/v1/projects/<project>/messages:send`:

```json
{ "message": { "token": "<token>", "data": { "kind": "timer" },
  "android": { "priority": "HIGH", "collapse_key": "timer" } } }
```

Sent after any response that changes the running timer: `POST
/timer/start` (201), `POST /timer/stop` (200), `PATCH /timer/current`
(200), `PATCH /entries/:id` when the entry is or was running, `DELETE
/entries/:id` when it was running.
