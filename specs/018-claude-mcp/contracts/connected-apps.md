# Contract: `/api/v1/connected-apps`

`GET /api/v1/connected-apps`

```json
{ "apps": [{ "clientId": "uuid", "name": "Claude Code", "grantedAt": "ISO" }] }
```

`DELETE /api/v1/connected-apps/:clientId` → `204`. Unknown client → `404
ENTRY_NOT_FOUND`.

A connected app's own token is refused here, as everywhere outside the
tools.
