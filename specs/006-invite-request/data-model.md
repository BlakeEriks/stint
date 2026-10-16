# Data model: Ask for an invite

Nothing is stored in Stint.

## Invite request (held by Formspree)

| Field | Source | Rule |
| --- | --- | --- |
| `email` | The visitor | Required, a valid email (browser validation) |
| sent at | Formspree | Stamped by the service on receipt |

## Form state (client only)

`idle` → `sending` on a valid submit. `sending` → `sent` on a 2xx answer,
or → `failed` on any other answer or a network error. `failed` → `sending`
on the next submit. The address survives `failed`.
