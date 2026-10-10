# Contract: `POST /api/v1/feedback`

Requires a session.

## Request: `CreateFeedback` (`@stint/schema`)

```json
{
  "id": "0192f0c4-…",
  "message": "The Northwind invoice total looks $150 short…",
  "screen": "/invoices/0192…",
  "client": "web",
  "appVersion": "0.1.0-alpha.3"
}
```

| Field | Rule |
| --- | --- |
| `id` | A UUID |
| `message` | Trimmed, 1–2,000 characters |
| `screen` | 1–200 characters, starting with `/` |
| `client` | `"web"` or `"macos"` |
| `appVersion` | 1–64 characters |

## Responses

| Status | When | Body |
| --- | --- | --- |
| `201` | Stored | `{ "id": "…" }` |
| `200` | The same `id` was already stored by this user (a retry) | `{ "id": "…" }` |
| `422` | Fails the schema: empty or too long, for example | The standard validation error |
| `401` | No session | The standard auth error |
